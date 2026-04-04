import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { createHash } from "crypto";

const router = Router();

function generateHash(workerId: string, name: string): string {
  return createHash("sha256").update(`${workerId}-${name}-${Date.now()}-apatris`).digest("hex").slice(0, 16);
}

// POST /api/identity/issue/:workerId
router.post("/identity/issue/:workerId", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const worker = await queryOne<Record<string, any>>(
      "SELECT * FROM workers WHERE id = $1 AND tenant_id = $2", [req.params.workerId, req.tenantId!]
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    // Revoke existing
    await execute("UPDATE worker_identities SET status = 'revoked' WHERE worker_id = $1 AND tenant_id = $2 AND status = 'active'",
      [req.params.workerId, req.tenantId!]);

    const hash = generateHash(worker.id, worker.full_name);
    const baseUrl = process.env.APP_URL || "https://apatris-api.fly.dev";
    const qrUrl = `${baseUrl}/api/identity/verify/${hash}`;

    // Gather certifications
    const certs: Array<{ name: string; expiry: string | null }> = [];
    if (worker.trc_expiry) certs.push({ name: "TRC (Karta Pobytu)", expiry: worker.trc_expiry });
    if (worker.passport_expiry) certs.push({ name: "Passport", expiry: worker.passport_expiry });
    if (worker.bhp_expiry) certs.push({ name: "BHP Safety Certificate", expiry: worker.bhp_expiry });
    if (worker.work_permit_expiry) certs.push({ name: "Work Permit", expiry: worker.work_permit_expiry });
    if (worker.medical_exam_expiry) certs.push({ name: "Medical Examination", expiry: worker.medical_exam_expiry });

    // Gather work history from check-ins
    const sites = await query<Record<string, any>>(
      "SELECT DISTINCT site FROM voice_checkins WHERE worker_id = $1 AND site IS NOT NULL LIMIT 10", [req.params.workerId]
    );
    const workHistory = sites.map(s => ({ site: s.site, role: worker.specialization }));

    // Get trust score
    const trust = await queryOne<Record<string, any>>(
      "SELECT score FROM trust_scores WHERE worker_id = $1 ORDER BY calculated_at DESC LIMIT 1", [req.params.workerId]
    );
    const trustScore = Number(trust?.score ?? 50);
    const trustLevel = trustScore >= 90 ? "platinum" : trustScore >= 75 ? "gold" : trustScore >= 50 ? "silver" : "bronze";

    // Compliance status
    const now = new Date();
    const expired = [worker.trc_expiry, worker.passport_expiry, worker.bhp_expiry, worker.work_permit_expiry].filter(d => d && new Date(d) < now);
    const complianceStatus = expired.length > 0 ? "non-compliant" : "compliant";

    const expiresAt = new Date(Date.now() + 365 * 86_400_000).toISOString();
    const verifiedBy = (req as any).user?.email || "admin";

    const row = await queryOne(
      `INSERT INTO worker_identities (tenant_id, worker_id, identity_hash, certifications, work_history, trust_score, trust_level, compliance_status, expires_at, verified_by, qr_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.tenantId!, req.params.workerId, hash, JSON.stringify(certs), JSON.stringify(workHistory), trustScore, trustLevel, complianceStatus, expiresAt, verifiedBy, qrUrl]
    );

    res.status(201).json({ identity: row, verifyUrl: qrUrl });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/identity/:workerId
router.get("/identity/:workerId", requireAuth, async (req, res) => {
  try {
    const row = await queryOne<Record<string, any>>(
      "SELECT wi.*, w.full_name, w.specialization, w.assigned_site, w.phone, w.email FROM worker_identities wi JOIN workers w ON w.id = wi.worker_id WHERE wi.worker_id = $1 AND wi.tenant_id = $2 AND wi.status = 'active' ORDER BY wi.issued_at DESC LIMIT 1",
      [req.params.workerId, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "No active identity — issue one first" });
    res.json({ identity: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/identity/verify/:hash — PUBLIC endpoint
router.get("/identity/verify/:hash", async (req, res) => {
  try {
    const identity = await queryOne<Record<string, any>>(
      "SELECT wi.*, w.full_name, w.specialization, w.assigned_site FROM worker_identities wi JOIN workers w ON w.id = wi.worker_id WHERE wi.identity_hash = $1 AND wi.status = 'active'",
      [req.params.hash]
    );
    if (!identity) return res.status(404).send(`<!DOCTYPE html><html><body style="background:#0f172a;color:#fff;font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;"><h1 style="color:#C41E18;">Identity Not Found</h1><p>This credential has been revoked or does not exist.</p></div></body></html>`);

    const certs = typeof identity.certifications === "string" ? JSON.parse(identity.certifications) : (identity.certifications || []);
    const history = typeof identity.work_history === "string" ? JSON.parse(identity.work_history) : (identity.work_history || []);
    const tierColors: Record<string, string> = { platinum: "#e2e8f0", gold: "#B8860B", silver: "#94a3b8", bronze: "#cd7f32" };
    const tierColor = tierColors[identity.trust_level] || "#94a3b8";

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verified Worker — Apatris</title>
<style>body{margin:0;background:#0f172a;color:#e2e8f0;font-family:Arial;} .card{max-width:420px;margin:20px auto;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;}
.header{background:#C41E18;padding:20px;text-align:center;} .header h1{margin:0;font-size:18px;} .header p{margin:4px 0 0;opacity:0.8;font-size:11px;letter-spacing:2px;}
.body{padding:20px;} .field{margin:8px 0;} .label{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;} .value{font-size:14px;font-weight:700;}
.badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;} .certs{margin-top:12px;}
.cert{background:#0f172a;padding:8px 12px;border-radius:8px;margin:4px 0;display:flex;justify-content:space-between;font-size:12px;}
.footer{text-align:center;padding:12px;background:#0f172a;font-size:9px;color:#475569;}</style></head>
<body><div class="card">
<div class="header"><h1>✓ VERIFIED WORKER</h1><p>APATRIS PORTABLE IDENTITY</p></div>
<div class="body">
  <div class="field"><div class="label">Name</div><div class="value">${identity.full_name}</div></div>
  <div class="field"><div class="label">Specialisation</div><div class="value">${identity.specialization || "—"}</div></div>
  <div class="field"><div class="label">Current Site</div><div class="value">${identity.assigned_site || "—"}</div></div>
  <div style="display:flex;gap:8px;margin:12px 0;">
    <div class="badge" style="background:${tierColor}20;color:${tierColor};border:1px solid ${tierColor}40;">${(identity.trust_level || "").toUpperCase()} · ${identity.trust_score}/100</div>
    <div class="badge" style="background:${identity.compliance_status === "compliant" ? "#22c55e20" : "#ef444420"};color:${identity.compliance_status === "compliant" ? "#22c55e" : "#ef4444"};border:1px solid ${identity.compliance_status === "compliant" ? "#22c55e40" : "#ef444440"};">${identity.compliance_status === "compliant" ? "COMPLIANT" : "NON-COMPLIANT"}</div>
  </div>
  <div class="certs"><div class="label" style="margin-bottom:6px;">Verified Certifications</div>
    ${certs.map((c: any) => `<div class="cert"><span>${c.name}</span><span style="color:#94a3b8;">${c.expiry ? new Date(c.expiry).toLocaleDateString("en-GB") : "—"}</span></div>`).join("")}
  </div>
  ${history.length > 0 ? `<div style="margin-top:12px;"><div class="label" style="margin-bottom:6px;">Work History</div>${history.map((h: any) => `<div class="cert"><span>${h.site}</span><span style="color:#94a3b8;">${h.role || ""}</span></div>`).join("")}</div>` : ""}
  <div style="margin-top:12px;text-align:center;"><div class="label">Issued</div><div style="font-size:11px;color:#64748b;">${new Date(identity.issued_at).toLocaleDateString("en-GB")} · Verified by ${identity.verified_by}</div></div>
</div>
<div class="footer">Apatris Sp. z o.o. · NIP: 5252828706 · Hash: ${identity.identity_hash}</div>
</div></body></html>`);
  } catch (err) { res.status(500).send("Error loading identity"); }
});

// POST /api/identity/revoke/:workerId
router.post("/identity/revoke/:workerId", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    await execute("UPDATE worker_identities SET status = 'revoked' WHERE worker_id = $1 AND tenant_id = $2 AND status = 'active'",
      [req.params.workerId, req.tenantId!]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/identity/all — all issued identities
router.get("/identity/all", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT wi.*, w.full_name, w.specialization FROM worker_identities wi JOIN workers w ON w.id = wi.worker_id
       WHERE wi.tenant_id = $1 AND wi.status = 'active' ORDER BY wi.issued_at DESC`, [req.tenantId!]
    );
    res.json({ identities: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
