import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

const EU_API_STATUS = { available: false, endpoint: "https://esspass.eu/api/v1", message: "Awaiting EU ESSPASS API launch — manual entry mode active" };

router.get("/esspass/records", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT e.*, w.full_name AS worker_name_live, w.assigned_site FROM esspass_records e
       LEFT JOIN workers w ON w.id = e.worker_id WHERE e.tenant_id = $1 ORDER BY e.valid_until ASC NULLS LAST`, [req.tenantId!]);
    res.json({ records: rows, apiStatus: EU_API_STATUS });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/esspass/records", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.workerId || !b.workerName) return res.status(400).json({ error: "workerId and workerName required" });

    // Link A1 certificate if exists
    let a1Ref = b.a1CertificateRef ?? null;
    if (!a1Ref) {
      const a1 = await queryOne<Record<string, any>>(
        "SELECT application_ref FROM immigration_permits WHERE worker_id = $1 AND permit_type = 'A1' AND status = 'active' ORDER BY expiry_date DESC LIMIT 1", [b.workerId]);
      if (a1) a1Ref = a1.application_ref;
    }

    const row = await queryOne(
      `INSERT INTO esspass_records (tenant_id, worker_id, worker_name, esspass_id, social_security_country, a1_certificate_ref, valid_from, valid_until, verification_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.tenantId!, b.workerId, b.workerName, b.esspassId ?? null, b.socialSecurityCountry || "PL", a1Ref, b.validFrom ?? null, b.validUntil ?? null, b.esspassId ? "verified" : "pending"]);
    res.status(201).json({ record: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/esspass/verify/:workerId", requireAuth, async (req, res) => {
  try {
    if (EU_API_STATUS.available) {
      // Future: call EU ESSPASS API
      return res.json({ verified: false, message: "EU API integration pending" });
    }

    // Manual verification — mark as verified with timestamp
    const row = await queryOne(
      "UPDATE esspass_records SET verification_status = 'verified', last_verified = NOW() WHERE worker_id = $1 AND tenant_id = $2 AND verification_status != 'expired' RETURNING *",
      [req.params.workerId, req.tenantId!]);
    if (!row) return res.status(404).json({ error: "No ESSPASS record found" });
    res.json({ record: row, message: "Manually verified. Auto-verification activates when EU API launches." });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/esspass/summary", requireAuth, async (req, res) => {
  try {
    const stats = await queryOne<Record<string, any>>(
      `SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE verification_status = 'verified') AS verified,
        COUNT(*) FILTER (WHERE verification_status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE verification_status = 'expired' OR (valid_until IS NOT NULL AND valid_until < CURRENT_DATE)) AS expired,
        COUNT(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 60) AS expiring_soon
       FROM esspass_records WHERE tenant_id = $1`, [req.tenantId!]);
    res.json({
      total: Number(stats?.total ?? 0), verified: Number(stats?.verified ?? 0),
      pending: Number(stats?.pending ?? 0), expired: Number(stats?.expired ?? 0),
      expiringSoon: Number(stats?.expiring_soon ?? 0), apiAvailable: EU_API_STATUS.available,
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/esspass/sync", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  if (!EU_API_STATUS.available) return res.json({ synced: false, message: EU_API_STATUS.message });
  // Future: batch sync all workers with EU ESSPASS API
  res.json({ synced: false, message: "API sync will be available when EU ESSPASS portal launches" });
});

export default router;
