import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";
import { getDefaultTenantId } from "../lib/tenant.js";

const router = Router();

const COUNTRY_SYSTEMS: Record<string, { system: string; portal: string; docs: string[]; maxMonths: number }> = {
  BE: { system: "Limosa Declaration", portal: "limosa.be", docs: ["A1 certificate", "Limosa-1 form", "Worker passport copy", "Employment contract", "Posting agreement"], maxMonths: 12 },
  NL: { system: "WagwEU Notification", portal: "postedworkers.nl", docs: ["A1 certificate", "WagwEU registration", "Worker passport copy", "Employment contract", "Dutch contact person details"], maxMonths: 12 },
  PL: { system: "PIP State Labour Inspectorate", portal: "pip.gov.pl", docs: ["A1 certificate (if from abroad)", "Worker passport", "Work permit or TRC", "Employment contract", "BHP certificate"], maxMonths: 12 },
  LT: { system: "VDI Labour Inspectorate", portal: "vdi.lt", docs: ["A1 certificate", "Worker passport copy", "Employment contract", "Posting notification form", "Health insurance proof"], maxMonths: 12 },
  SK: { system: "NIP Labour Inspectorate", portal: "nip.sk", docs: ["A1 certificate", "Worker passport copy", "Employment contract", "Posting notification", "Accommodation details"], maxMonths: 12 },
  CZ: { system: "SÚIP Labour Inspectorate", portal: "suip.cz", docs: ["A1 certificate", "Worker passport copy", "Employment contract", "Posting notification form", "Employee card (non-EU)"], maxMonths: 12 },
  RO: { system: "ITM Labour Inspectorate", portal: "inspectiamuncii.ro", docs: ["A1 certificate", "Worker passport copy", "Employment contract", "Posting notification to ITM", "Health insurance"], maxMonths: 12 },
};

// GET /api/posted-workers/requirements/:country
router.get("/posted-workers/requirements/:country", requireAuth, async (req, res) => {
  const code = req.params.country.toUpperCase();
  const info = COUNTRY_SYSTEMS[code];
  if (!info) return res.status(404).json({ error: "Country not supported" });
  res.json({ country: code, ...info });
});

// GET /api/posted-workers/notifications
router.get("/posted-workers/notifications", requireAuth, async (req, res) => {
  try {
    const { country, status } = req.query as Record<string, string>;
    let sql = "SELECT * FROM posted_worker_notifications WHERE tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (country) { params.push(country); sql += ` AND host_country = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    sql += " ORDER BY CASE status WHEN 'draft' THEN 1 WHEN 'submitted' THEN 2 ELSE 3 END, start_date DESC";
    res.json({ notifications: await query(sql, params) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/posted-workers/notifications
router.post("/posted-workers/notifications", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.hostCountry || !b.workerId || !b.workerName) return res.status(400).json({ error: "hostCountry, workerId, workerName required" });
    const code = b.hostCountry.toUpperCase();
    const info = COUNTRY_SYSTEMS[code];
    const row = await queryOne(
      `INSERT INTO posted_worker_notifications (tenant_id, worker_id, worker_name, company_id, company_name, host_country, start_date, end_date, role_type, notification_system, required_documents, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.tenantId!, b.workerId, b.workerName, b.companyId ?? null, b.companyName ?? null, code,
       b.startDate ?? null, b.endDate ?? null, b.roleType ?? null,
       info?.system || "Unknown", JSON.stringify(info?.docs || []), b.notes ?? null]);
    res.status(201).json({ notification: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// PATCH /api/posted-workers/notifications/:id
router.patch("/posted-workers/notifications/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const b = req.body as Record<string, unknown>;
    const fm: Record<string, string> = { status: "status", notificationRef: "notification_ref", startDate: "start_date", endDate: "end_date", notes: "notes" };
    const sets: string[] = []; const vals: unknown[] = []; let idx = 1;
    for (const [k, c] of Object.entries(fm)) { if (b[k] !== undefined) { sets.push(`${c} = $${idx++}`); vals.push(b[k]); } }
    if (b.status === "submitted") sets.push("submitted_at = NOW()");
    if (!sets.length) return res.status(400).json({ error: "No fields" });
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(`UPDATE posted_worker_notifications SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, vals);
    res.json({ notification: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/posted-workers/notifications/:id/submit
router.post("/posted-workers/notifications/:id/submit", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const row = await queryOne<Record<string, any>>(
      "UPDATE posted_worker_notifications SET status = 'submitted', submitted_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *",
      [req.params.id, req.tenantId!]);
    if (!row) return res.status(404).json({ error: "Not found" });
    const info = COUNTRY_SYSTEMS[row.host_country];
    res.json({ notification: row, portalUrl: info?.portal ? `https://www.${info.portal}` : null, message: `Submit to ${info?.system || row.host_country} portal` });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/posted-workers/summary
router.get("/posted-workers/summary", requireAuth, async (req, res) => {
  try {
    const byCountry = await query<Record<string, any>>(
      "SELECT host_country, status, COUNT(*) AS count FROM posted_worker_notifications WHERE tenant_id = $1 GROUP BY host_country, status", [req.tenantId!]
    );
    const total = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'draft') AS drafts, COUNT(*) FILTER (WHERE status = 'submitted') AS submitted, COUNT(*) FILTER (WHERE end_date <= CURRENT_DATE + 30 AND status IN ('submitted','confirmed')) AS expiring FROM posted_worker_notifications WHERE tenant_id = $1", [req.tenantId!]
    );
    res.json({ byCountry, total: Number(total?.total ?? 0), drafts: Number(total?.drafts ?? 0), submitted: Number(total?.submitted ?? 0), expiring: Number(total?.expiring ?? 0) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Expiry alert — export for cron
export async function runPostingExpiryAlerts(): Promise<void> {
  try {
    const tenantId = getDefaultTenantId();
    if (!tenantId) return;
    const expiring = await query<Record<string, any>>(
      "SELECT * FROM posted_worker_notifications WHERE tenant_id = $1 AND end_date = CURRENT_DATE + 30 AND status IN ('submitted','confirmed')", [tenantId]);
    for (const n of expiring) {
      const admins = await query<Record<string, any>>("SELECT phone, full_name AS name FROM admins WHERE tenant_id = $1 AND phone IS NOT NULL LIMIT 2", [tenantId]);
      for (const a of admins) {
        if (a.phone) await sendWhatsAppAlert({ to: a.phone, workerName: a.name, workerI: n.worker_id,
          permitType: `POSTING EXPIRY: ${n.worker_name}'s ${n.notification_system} notification for ${n.host_country} expires in 30 days. Ref: ${n.notification_ref || "pending"}.`,
          daysRemaining: 30, tenantId });
      }
    }
    if (expiring.length > 0) console.log(`[Posted] Alerted for ${expiring.length} expiring notifications.`);
  } catch (err) { console.error("[Posted] Expiry alert failed:", err); }
}

export default router;
