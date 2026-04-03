import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

const CONTRACT_TYPES = ["Umowa Zlecenie", "Umowa o Pracę", "B2B"];

// POST /api/contracts/generate — AI generates contract
router.post("/contracts/generate", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { workerId, companyId, contractType, hourlyRate, monthlySalary, position, scope, startDate, endDate } = req.body as Record<string, any>;
    if (!workerId || !contractType) return res.status(400).json({ error: "workerId and contractType required" });
    if (!CONTRACT_TYPES.includes(contractType)) return res.status(400).json({ error: `contractType must be: ${CONTRACT_TYPES.join(", ")}` });

    // Fetch worker data
    const worker = await queryOne<Record<string, any>>(
      "SELECT * FROM workers WHERE id = $1", [workerId]
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    // Fetch company data
    let company: Record<string, any> | null = null;
    if (companyId) {
      company = await queryOne<Record<string, any>>(
        "SELECT * FROM crm_companies WHERE id = $1", [companyId]
      );
    }

    const workerName = worker.full_name || "Worker";
    const companyName = company?.company_name || "Apatris Sp. z o.o.";
    const companyNip = company?.nip || "5252828706";
    const today = new Date().toISOString().slice(0, 10);

    // Contract data object
    const contractData: Record<string, any> = {
      contractType, workerName, workerPesel: worker.pesel || "", workerIban: worker.iban || "",
      workerPhone: worker.phone || "", workerEmail: worker.email || "",
      companyName, companyNip, companyAddress: company?.contact_email ? `Contact: ${company.contact_email}` : "ul. Chłodna 51, 00-867 Warszawa",
      hourlyRate: hourlyRate || worker.hourly_rate || 0,
      monthlySalary: monthlySalary || 0, position: position || worker.specialization || "",
      scope: scope || "", startDate: startDate || today, endDate: endDate || "",
      generatedDate: today,
    };

    // Use AI to generate full contract text
    let contractHtml = generateContractHtml(contractData);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: `You are a Polish labor law expert. Generate specific contract clauses for the given contract type. Return ONLY valid JSON: { "preamble": "string", "scopeOfWork": "string", "paymentTerms": "string", "obligations": "string", "termination": "string", "rodoClause": "string", "zusClause": "string", "additionalClauses": "string" }. Write in Polish legal language.`,
          messages: [{
            role: "user",
            content: `Generate clauses for ${contractType}:
Worker: ${workerName}, PESEL: ${worker.pesel || "N/A"}, Position: ${position || worker.specialization || "Pracownik"}
Company: ${companyName}, NIP: ${companyNip}
Rate: ${hourlyRate || worker.hourly_rate || 0} PLN/h, Start: ${startDate || today}${endDate ? ", End: " + endDate : ""}
Scope: ${scope || "General duties as assigned"}`,
          }],
        });
        const content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
        const clauses = JSON.parse(content);
        contractData.aiClauses = clauses;
        contractHtml = generateContractHtml(contractData);
      } catch (err) {
        console.warn("[ContractGen] AI clause generation failed, using template:", err instanceof Error ? err.message : err);
      }
    }

    const row = await queryOne(
      `INSERT INTO generated_contracts (tenant_id, worker_id, worker_name, company_id, company_name, contract_type, contract_data, contract_html, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft') RETURNING *`,
      [req.tenantId!, workerId, workerName, companyId ?? null, companyName, contractType,
       JSON.stringify(contractData), contractHtml]
    );

    res.status(201).json({ contract: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Generation failed" });
  }
});

// GET /api/contracts/generated — list generated contracts
router.get("/contracts/generated", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM generated_contracts WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId!]
    );
    res.json({ contracts: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/contracts/generated/:id — single contract
router.get("/contracts/generated/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      "SELECT * FROM generated_contracts WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ contract: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/contracts/generated/:id/download — download as HTML (printable PDF)
router.get("/contracts/generated/:id/download", requireAuth, async (req, res) => {
  try {
    const row = await queryOne<Record<string, any>>(
      "SELECT * FROM generated_contracts WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Not found" });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${row.contract_type.replace(/ /g, "_")}_${row.worker_name.replace(/ /g, "_")}.html"`);
    res.send(row.contract_html);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/contracts/generated/:id/send — send for certified signature
router.post("/contracts/generated/:id/send", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const contract = await queryOne<Record<string, any>>(
      "SELECT * FROM generated_contracts WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!contract) return res.status(404).json({ error: "Not found" });

    const data = typeof contract.contract_data === "string" ? JSON.parse(contract.contract_data) : contract.contract_data;

    // Create certified signature request
    const envelopeId = `ENV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baseUrl = process.env.APP_URL || "https://apatris-api.fly.dev";
    const signingUrl = `${baseUrl}/api/signatures/certified/${envelopeId}/sign`;

    await execute(
      `INSERT INTO certified_signatures (tenant_id, contract_id, worker_id, worker_name, worker_email, provider, envelope_id, status, sent_at, signing_url)
       VALUES ($1, $2, $3, $4, $5, 'apatris', $6, 'sent', NOW(), $7)`,
      [req.tenantId!, req.params.id, contract.worker_id, contract.worker_name, data.workerEmail || "", envelopeId, signingUrl]
    );

    await execute(
      "UPDATE generated_contracts SET status = 'sent_for_signature' WHERE id = $1",
      [req.params.id]
    );

    // WhatsApp notify worker
    if (data.workerPhone || contract.worker_id) {
      try {
        const { sendWhatsAppAlert } = await import("../lib/whatsapp.js");
        const worker = await queryOne<Record<string, any>>("SELECT phone FROM workers WHERE id = $1", [contract.worker_id]);
        if (worker?.phone) {
          await sendWhatsAppAlert({
            to: worker.phone, workerName: contract.worker_name, workerI: contract.worker_id,
            permitType: `Your ${contract.contract_type} contract is ready for signature: ${signingUrl}`,
            daysRemaining: 0, tenantId: req.tenantId!,
          });
        }
      } catch { /* non-blocking */ }
    }

    res.json({ sent: true, signingUrl });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Send failed" });
  }
});

function generateContractHtml(d: Record<string, any>): string {
  const clauses = d.aiClauses || {};
  const isZlecenie = d.contractType === "Umowa Zlecenie";
  const isPrace = d.contractType === "Umowa o Pracę";
  const isB2B = d.contractType === "B2B";

  return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8">
<style>
@page{margin:2cm;} body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.6;color:#1a1a1a;max-width:700px;margin:0 auto;padding:40px;}
h1{font-size:16pt;text-align:center;margin-bottom:4px;color:#C41E18;} h2{font-size:13pt;margin-top:24px;border-bottom:1px solid #ccc;padding-bottom:4px;}
.header{text-align:center;border-bottom:2px solid #C41E18;padding-bottom:16px;margin-bottom:24px;}
.logo{font-size:20pt;font-weight:900;color:#C41E18;letter-spacing:2px;} .subtitle{font-size:9pt;color:#666;letter-spacing:3px;text-transform:uppercase;}
.parties{display:flex;gap:40px;margin:16px 0;} .party{flex:1;background:#f8f8f8;padding:12px;border-radius:6px;border:1px solid #e0e0e0;}
.party-label{font-size:9pt;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;}
.field{margin:4px 0;} .field-label{font-size:9pt;color:#666;} .field-value{font-weight:bold;}
.clause{margin:8px 0;text-align:justify;} .signature-block{margin-top:60px;display:flex;gap:40px;}
.sig{flex:1;text-align:center;border-top:1px solid #333;padding-top:8px;font-size:10pt;}
.footer{margin-top:40px;text-align:center;font-size:8pt;color:#999;border-top:1px solid #eee;padding-top:12px;}
.rodo{background:#f0f7ff;border:1px solid #d0e0f0;padding:12px;border-radius:6px;margin-top:16px;font-size:10pt;}
</style></head><body>
<div class="header">
  <div class="logo">APATRIS</div>
  <div class="subtitle">Outsourcing & Certified Welders</div>
  <div style="font-size:9pt;color:#888;margin-top:4px;">Apatris Sp. z o.o. · NIP: 5252828706 · ul. Chłodna 51, 00-867 Warszawa</div>
</div>

<h1>${d.contractType}</h1>
<p style="text-align:center;font-size:10pt;color:#666;">Zawarta w dniu ${d.generatedDate} w Warszawie</p>

<div class="parties">
  <div class="party">
    <div class="party-label">Zleceniodawca / Pracodawca</div>
    <div class="field"><span class="field-value">${d.companyName}</span></div>
    <div class="field"><span class="field-label">NIP:</span> ${d.companyNip}</div>
    <div class="field"><span class="field-label">Adres:</span> ${d.companyAddress}</div>
  </div>
  <div class="party">
    <div class="party-label">${isB2B ? "Wykonawca" : "Zleceniobiorca / Pracownik"}</div>
    <div class="field"><span class="field-value">${d.workerName}</span></div>
    ${d.workerPesel ? `<div class="field"><span class="field-label">PESEL:</span> ${d.workerPesel}</div>` : ""}
    ${d.workerIban ? `<div class="field"><span class="field-label">IBAN:</span> ${d.workerIban}</div>` : ""}
  </div>
</div>

${clauses.preamble ? `<h2>§1. Preambuła</h2><p class="clause">${clauses.preamble}</p>` : ""}

<h2>§${clauses.preamble ? "2" : "1"}. Przedmiot ${isZlecenie ? "Zlecenia" : isPrace ? "Umowy" : "Współpracy"}</h2>
<p class="clause">${clauses.scopeOfWork || (d.scope || `${d.position || "Wykonywanie prac zgodnie z zakresem obowiązków"}`)}</p>
${d.position ? `<p class="clause"><strong>Stanowisko:</strong> ${d.position}</p>` : ""}
<p class="clause"><strong>Data rozpoczęcia:</strong> ${d.startDate}${d.endDate ? ` — <strong>Data zakończenia:</strong> ${d.endDate}` : ""}</p>

<h2>§${clauses.preamble ? "3" : "2"}. Wynagrodzenie</h2>
<p class="clause">${clauses.paymentTerms || (isZlecenie
  ? `Stawka godzinowa: <strong>${d.hourlyRate} PLN/h</strong> brutto. Wypłata na podstawie ewidencji godzin, do 10. dnia następnego miesiąca.`
  : isPrace
  ? `Wynagrodzenie miesięczne: <strong>${d.monthlySalary || d.hourlyRate * 160} PLN</strong> brutto. Wypłata do ostatniego dnia roboczego miesiąca.`
  : `Wynagrodzenie na podstawie faktury VAT wystawionej przez Wykonawcę. Termin płatności: 14 dni od daty otrzymania faktury.`)}</p>

<h2>§${clauses.preamble ? "4" : "3"}. Obowiązki stron</h2>
<p class="clause">${clauses.obligations || "Strony zobowiązują się do wykonywania swoich obowiązków zgodnie z obowiązującymi przepisami prawa polskiego, w szczególności Kodeksu Pracy oraz przepisów BHP."}</p>

${isPrace ? `<h2>§${clauses.preamble ? "5" : "4"}. Czas pracy</h2>
<p class="clause">Wymiar czasu pracy: pełny etat (40 godzin tygodniowo). Okres wypowiedzenia zgodnie z art. 36 Kodeksu Pracy.</p>` : ""}

<h2>§${clauses.preamble ? (isPrace ? "6" : "5") : (isPrace ? "5" : "4")}. Rozwiązanie umowy</h2>
<p class="clause">${clauses.termination || (isZlecenie
  ? "Każda ze stron może wypowiedzieć umowę z zachowaniem 14-dniowego okresu wypowiedzenia."
  : isPrace
  ? "Rozwiązanie umowy następuje zgodnie z przepisami Kodeksu Pracy, z zachowaniem obowiązujących okresów wypowiedzenia."
  : "Każda ze stron może rozwiązać umowę z zachowaniem 30-dniowego okresu wypowiedzenia.")}</p>

<h2>Składki ZUS</h2>
<p class="clause">${clauses.zusClause || (isZlecenie
  ? "Zleceniodawca odprowadza składki na ubezpieczenie społeczne (emerytalne, rentowe) i zdrowotne zgodnie z obowiązującymi przepisami ustawy o systemie ubezpieczeń społecznych."
  : isPrace
  ? "Pracodawca odprowadza pełne składki ZUS (emerytalne, rentowe, chorobowe, wypadkowe, zdrowotne, FP, FGŚP) zgodnie z obowiązującymi przepisami."
  : "Wykonawca jako przedsiębiorca samodzielnie odprowadza składki ZUS.")}</p>

<div class="rodo">
<strong>Klauzula RODO</strong><br/>
${clauses.rodoClause || "Administratorem danych osobowych jest " + d.companyName + " (NIP: " + d.companyNip + "). Dane osobowe przetwarzane są w celu realizacji niniejszej umowy, na podstawie art. 6 ust. 1 lit. b) Rozporządzenia Parlamentu Europejskiego i Rady (UE) 2016/679 (RODO). Pracownik/Zleceniobiorca ma prawo dostępu do swoich danych, ich sprostowania, usunięcia, ograniczenia przetwarzania oraz przenoszenia danych."}
</div>

${clauses.additionalClauses ? `<h2>Postanowienia dodatkowe</h2><p class="clause">${clauses.additionalClauses}</p>` : ""}

<div class="signature-block">
  <div class="sig">${d.companyName}<br/><span style="font-size:8pt;color:#888;">Zleceniodawca / Pracodawca</span></div>
  <div class="sig">${d.workerName}<br/><span style="font-size:8pt;color:#888;">${isB2B ? "Wykonawca" : "Zleceniobiorca / Pracownik"}</span></div>
</div>

<div class="footer">
  Dokument wygenerowany automatycznie przez system Apatris · ${d.generatedDate} · Apatris Sp. z o.o. · NIP: 5252828706
</div>
</body></html>`;
}

export default router;
