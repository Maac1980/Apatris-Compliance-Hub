import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

router.get("/frameworks", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT fa.*, (SELECT COUNT(*) FROM rate_cards rc WHERE rc.agreement_id = fa.id) AS rate_card_count
       FROM framework_agreements fa WHERE fa.tenant_id = $1 ORDER BY fa.created_at DESC`, [req.tenantId!]);
    res.json({ agreements: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/frameworks", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.agreementName) return res.status(400).json({ error: "agreementName required" });
    const row = await queryOne(
      `INSERT INTO framework_agreements (tenant_id, company_id, company_name, agreement_name, start_date, end_date, roles_covered, sla_terms, guarantee_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.tenantId!, b.companyId ?? null, b.companyName ?? null, b.agreementName,
       b.startDate || new Date().toISOString().slice(0, 10), b.endDate || new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
       JSON.stringify(b.rolesCovered || []), b.slaTerms ?? null, b.guaranteeTerms ?? null]);
    // Add rate cards
    if (b.rateCards?.length) {
      for (const rc of b.rateCards) {
        await execute(`INSERT INTO rate_cards (agreement_id, role_type, country, rate_per_hour, currency, minimum_hours, overtime_rate) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [(row as any).id, rc.roleType, rc.country || "PL", rc.ratePerHour || 0, rc.currency || "EUR", rc.minimumHours || 160, rc.overtimeRate || 0]);
      }
    }
    res.status(201).json({ agreement: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/frameworks/:id", requireAuth, async (req, res) => {
  try {
    const fa = await queryOne("SELECT * FROM framework_agreements WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    if (!fa) return res.status(404).json({ error: "Not found" });
    const cards = await query("SELECT * FROM rate_cards WHERE agreement_id = $1 ORDER BY role_type", [req.params.id]);
    res.json({ agreement: fa, rateCards: cards });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.patch("/frameworks/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const b = req.body as Record<string, unknown>;
    const fm: Record<string, string> = { agreementName: "agreement_name", startDate: "start_date", endDate: "end_date", slaTerms: "sla_terms", guaranteeTerms: "guarantee_terms", status: "status" };
    const sets: string[] = []; const vals: unknown[] = []; let idx = 1;
    for (const [k, c] of Object.entries(fm)) { if (b[k] !== undefined) { sets.push(`${c} = $${idx++}`); vals.push(b[k]); } }
    if (b.status === "signed") sets.push("signed_at = NOW()");
    if (!sets.length) return res.status(400).json({ error: "No fields" });
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(`UPDATE framework_agreements SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, vals);
    res.json({ agreement: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/frameworks/generate — AI generates framework agreement
router.post("/frameworks/generate", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { companyId } = req.body as { companyId?: string };
    if (!companyId) return res.status(400).json({ error: "companyId required" });

    const company = await queryOne<Record<string, any>>("SELECT * FROM crm_companies WHERE id = $1", [companyId]);
    if (!company) return res.status(404).json({ error: "Company not found" });

    const deals = await query<Record<string, any>>("SELECT * FROM crm_deals WHERE company_id = $1 AND stage = 'Active'", [companyId]);
    const roles = deals.map(d => d.role_type).filter(Boolean);
    const totalValue = deals.reduce((s, d) => s + Number(d.value_eur), 0);

    // Generate rate cards from deals
    const rateCards = deals.map(d => ({ roleType: d.role_type, country: "EU", ratePerHour: Number(d.value_eur) / (Number(d.workers_needed) * 160) || 30, currency: "EUR", minimumHours: 160, overtimeRate: 0 }));

    let agreementHtml = generateFrameworkHtml(company, roles, rateCards, totalValue);

    // AI enhancement
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 1024,
          system: `You are a staffing industry legal expert. Generate SLA terms and guarantee terms for a framework agreement. Return ONLY JSON: { "slaTerms": "string", "guaranteeTerms": "string", "paymentTerms": "string" }`,
          messages: [{ role: "user", content: `Framework agreement for ${company.company_name} (${company.country}). Roles: ${roles.join(", ")}. Annual value: €${totalValue}. Generate professional SLA, guarantee, and payment terms.` }],
        });
        const content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
        const parsed = JSON.parse(content);
        agreementHtml = generateFrameworkHtml(company, roles, rateCards, totalValue, parsed);
      } catch { /* use template */ }
    }

    const name = `Framework Agreement — ${company.company_name} ${new Date().getFullYear()}`;
    const row = await queryOne(
      `INSERT INTO framework_agreements (tenant_id, company_id, company_name, agreement_name, start_date, end_date, roles_covered, agreement_html)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,CURRENT_DATE + 365,$5,$6) RETURNING *`,
      [req.tenantId!, companyId, company.company_name, name, JSON.stringify(roles), agreementHtml]);

    for (const rc of rateCards) {
      await execute(`INSERT INTO rate_cards (agreement_id, role_type, country, rate_per_hour, currency, minimum_hours) VALUES ($1,$2,$3,$4,$5,$6)`,
        [(row as any).id, rc.roleType, rc.country, Math.round(rc.ratePerHour * 100) / 100, rc.currency, rc.minimumHours]);
    }

    res.status(201).json({ agreement: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/frameworks/:id/download
router.get("/frameworks/:id/download", requireAuth, async (req, res) => {
  try {
    const fa = await queryOne<Record<string, any>>("SELECT * FROM framework_agreements WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    if (!fa) return res.status(404).json({ error: "Not found" });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Framework_${fa.company_name?.replace(/ /g, "_")}.html"`);
    res.send(fa.agreement_html || "<p>No agreement generated</p>");
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

function generateFrameworkHtml(company: any, roles: string[], rateCards: any[], totalValue: number, aiTerms?: any): string {
  const rateRows = rateCards.map(rc => `<tr><td style="padding:8px 12px;border-bottom:1px solid #1e293b;">${rc.roleType}</td><td style="padding:8px 12px;border-bottom:1px solid #1e293b;">${rc.country}</td><td style="padding:8px 12px;border-bottom:1px solid #1e293b;font-family:monospace;font-weight:bold;">€${rc.ratePerHour.toFixed(2)}/h</td><td style="padding:8px 12px;border-bottom:1px solid #1e293b;">${rc.minimumHours}h</td></tr>`).join("");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>
body{font-family:'Times New Roman',serif;max-width:700px;margin:0 auto;padding:40px;line-height:1.6;color:#1a1a1a;}
h1{text-align:center;color:#C41E18;font-size:18pt;} h2{font-size:13pt;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:24px;}
.header{text-align:center;border-bottom:2px solid #C41E18;padding-bottom:16px;margin-bottom:24px;}
.logo{font-size:20pt;font-weight:900;color:#C41E18;letter-spacing:2px;}
table{width:100%;border-collapse:collapse;margin:12px 0;} th{background:#f8f8f8;text-align:left;padding:8px 12px;font-size:10pt;border-bottom:2px solid #ccc;}
.sig{margin-top:60px;display:flex;gap:40px;} .sig>div{flex:1;text-align:center;border-top:1px solid #333;padding-top:8px;font-size:10pt;}
.footer{margin-top:40px;text-align:center;font-size:8pt;color:#999;}</style></head><body>
<div class="header"><div class="logo">APATRIS</div><div style="font-size:9pt;color:#888;">Framework Staffing Agreement</div></div>
<h1>Framework Agreement</h1>
<p style="text-align:center;">Between <strong>Apatris Sp. z o.o.</strong> (NIP: 5252828706) and <strong>${company.company_name}</strong>${company.nip ? ` (${company.nip})` : ""}</p>
<p style="text-align:center;font-size:10pt;color:#666;">Effective: ${new Date().toLocaleDateString("en-GB")} — ${new Date(Date.now() + 365 * 86_400_000).toLocaleDateString("en-GB")}</p>

<h2>1. Rate Cards</h2>
<table><tr><th>Role</th><th>Country</th><th>Rate</th><th>Min Hours</th></tr>${rateRows}</table>
<p>Estimated annual contract value: <strong>€${totalValue.toLocaleString()}</strong></p>

<h2>2. Service Level Agreement</h2>
<p>${aiTerms?.slaTerms || "Apatris guarantees deployment of qualified workers within 48 hours of confirmed request. All workers will hold valid certifications, work permits, and A1 certificates as required. Response time for urgent requests: 24 hours."}</p>

<h2>3. Compliance Guarantee</h2>
<p>${aiTerms?.guaranteeTerms || "Apatris provides a full compliance guarantee covering all posted workers. In the event of a compliance failure resulting in a fine, Apatris will cover the fine amount up to the agreed coverage limit. Zero compliance failure target."}</p>

<h2>4. Payment Terms</h2>
<p>${aiTerms?.paymentTerms || "Invoices issued monthly on the 1st. Payment due within 14 days. VAT 23% applied where applicable. Late payment interest: 1.5% per month."}</p>

<h2>5. GDPR Data Processing</h2>
<p>Both parties agree to process personal data in accordance with EU Regulation 2016/679 (GDPR) and Polish RODO requirements. A separate Data Processing Agreement (DPA) is annexed to this framework.</p>

<h2>6. Termination</h2>
<p>Either party may terminate this agreement with 90 days written notice. Immediate termination is permitted in cases of material breach.</p>

<div class="sig"><div>Apatris Sp. z o.o.<br/><span style="font-size:8pt;color:#888;">Provider</span></div><div>${company.company_name}<br/><span style="font-size:8pt;color:#888;">Client</span></div></div>
<div class="footer">Apatris Sp. z o.o. · NIP: 5252828706 · ul. Chłodna 51, 00-867 Warszawa</div>
</body></html>`;
}

export default router;
