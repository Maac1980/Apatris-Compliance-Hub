import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";
import { getDefaultTenantId } from "../lib/tenant.js";

const router = Router();

async function runFraudScan(tenantId: string) {
  // Clear old active alerts
  await execute("DELETE FROM fraud_alerts WHERE tenant_id = $1 AND status = 'active'", [tenantId]);
  let found = 0;
  let highCount = 0;

  // 1. Ghost workers — on payroll with no check-ins for 14+ days
  const ghosts = await query<Record<string, any>>(
    `SELECT w.id, w.full_name FROM workers w WHERE w.tenant_id = $1
     AND w.hourly_rate > 0 AND w.monthly_hours > 0
     AND NOT EXISTS (SELECT 1 FROM voice_checkins vc WHERE vc.worker_id = w.id AND vc.timestamp >= NOW() - INTERVAL '14 days')`,
    [tenantId]
  );
  for (const g of ghosts) {
    await execute(
      `INSERT INTO fraud_alerts (tenant_id, alert_type, severity, description, worker_id, worker_name, evidence)
       VALUES ($1,'ghost_worker','high',$2,$3,$4,$5)`,
      [tenantId, `${g.full_name} on payroll with no check-ins for 14+ days`, g.id, g.full_name, JSON.stringify({ lastActivity: "No check-ins found in last 14 days", hourlyRate: "Active payroll" })]
    );
    found++; highCount++;
  }

  // 2. Duplicate PESEL — group by hash column (pesel ciphertext varies per row even for same plaintext)
  const dupPesel = await query<Record<string, any>>(
    `SELECT pesel_hash, COUNT(*) AS cnt, array_agg(full_name) AS names FROM workers WHERE tenant_id = $1 AND pesel_hash IS NOT NULL GROUP BY pesel_hash HAVING COUNT(*) > 1`,
    [tenantId]
  );
  for (const d of dupPesel) {
    await execute(
      `INSERT INTO fraud_alerts (tenant_id, alert_type, severity, description, evidence)
       VALUES ($1,'duplicate_document','critical',$2,$3)`,
      [tenantId, `Duplicate PESEL detected on ${d.cnt} workers: ${d.names.join(", ")}`, JSON.stringify({ pesel_hash: d.pesel_hash, workers: d.names, count: Number(d.cnt) })]
    );
    found++; highCount++;
  }

  // 3. Duplicate IBAN — group by hash column
  const dupIban = await query<Record<string, any>>(
    `SELECT iban_hash, COUNT(*) AS cnt, array_agg(full_name) AS names FROM workers WHERE tenant_id = $1 AND iban_hash IS NOT NULL GROUP BY iban_hash HAVING COUNT(*) > 1`,
    [tenantId]
  );
  for (const d of dupIban) {
    await execute(
      `INSERT INTO fraud_alerts (tenant_id, alert_type, severity, description, evidence)
       VALUES ($1,'duplicate_bank','critical',$2,$3)`,
      [tenantId, `Duplicate IBAN detected on ${d.cnt} workers: ${d.names.join(", ")}`, JSON.stringify({ iban_hash: d.iban_hash, workers: d.names, count: Number(d.cnt) })]
    );
    found++; highCount++;
  }

  // 4. Advance abuse — 3+ advance requests in 60 days
  const advAbuse = await query<Record<string, any>>(
    `SELECT worker_id, worker_name, COUNT(*) AS cnt FROM salary_advances WHERE tenant_id = $1 AND requested_at >= NOW() - INTERVAL '60 days' GROUP BY worker_id, worker_name HAVING COUNT(*) >= 3`,
    [tenantId]
  );
  for (const a of advAbuse) {
    await execute(
      `INSERT INTO fraud_alerts (tenant_id, alert_type, severity, description, worker_id, worker_name, evidence)
       VALUES ($1,'advance_abuse','medium',$2,$3,$4,$5)`,
      [tenantId, `${a.worker_name} made ${a.cnt} advance requests in 60 days`, a.worker_id, a.worker_name, JSON.stringify({ requests: Number(a.cnt), period: "60 days" })]
    );
    found++;
  }

  // 5. Payroll anomaly — check if any worker rate is 30%+ above average
  const avgRate = await queryOne<Record<string, any>>(
    "SELECT AVG(hourly_rate) AS avg FROM workers WHERE tenant_id = $1 AND hourly_rate > 0", [tenantId]
  );
  if (avgRate) {
    const threshold = Number(avgRate.avg) * 1.3;
    const spikes = await query<Record<string, any>>(
      "SELECT id, full_name, hourly_rate FROM workers WHERE tenant_id = $1 AND hourly_rate > $2",
      [tenantId, threshold]
    );
    for (const s of spikes) {
      await execute(
        `INSERT INTO fraud_alerts (tenant_id, alert_type, severity, description, worker_id, worker_name, evidence)
         VALUES ($1,'payroll_anomaly','medium',$2,$3,$4,$5)`,
        [tenantId, `${s.full_name} rate ${s.hourly_rate} is 30%+ above average ${Number(avgRate.avg).toFixed(2)}`, s.id, s.full_name, JSON.stringify({ rate: Number(s.hourly_rate), average: Number(avgRate.avg).toFixed(2), threshold: threshold.toFixed(2) })]
      );
      found++;
    }
  }

  // WhatsApp alert for high/critical
  if (highCount > 0) {
    try {
      const admins = await query<Record<string, any>>(
        "SELECT phone, full_name AS name FROM admins WHERE tenant_id = $1 AND phone IS NOT NULL LIMIT 2", [tenantId]
      );
      for (const a of admins) {
        if (a.phone) {
          await sendWhatsAppAlert({ to: a.phone, workerName: a.name, workerI: "system",
            permitType: `FRAUD ALERT: ${highCount} HIGH/CRITICAL fraud alerts detected. Check dashboard immediately.`,
            daysRemaining: 0, tenantId });
        }
      }
    } catch { /* non-blocking */ }
  }

  console.log(`[Fraud] Scan: ${found} alerts, ${highCount} high/critical.`);
  return { scanned: true, alertsFound: found, highCritical: highCount };
}

// POST /api/fraud/scan
router.post("/fraud/scan", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try { res.json(await runFraudScan(req.tenantId!)); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Scan failed" }); }
});

// GET /api/fraud/alerts
router.get("/fraud/alerts", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM fraud_alerts WHERE tenant_id = $1 AND status = 'active' ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, detected_at DESC",
      [req.tenantId!]
    );
    res.json({ alerts: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// PATCH /api/fraud/alerts/:id/resolve
router.patch("/fraud/alerts/:id/resolve", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { resolution } = req.body as { resolution?: string };
    const row = await queryOne(
      "UPDATE fraud_alerts SET status = 'resolved', resolution = $1, resolved_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *",
      [resolution || "resolved", req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ alert: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/fraud/summary
router.get("/fraud/summary", requireAuth, async (req, res) => {
  try {
    const byType = await query<Record<string, any>>(
      "SELECT alert_type, severity, COUNT(*) AS count FROM fraud_alerts WHERE tenant_id = $1 AND status = 'active' GROUP BY alert_type, severity",
      [req.tenantId!]
    );
    const resolved = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS count FROM fraud_alerts WHERE tenant_id = $1 AND status = 'resolved'", [req.tenantId!]
    );
    const total = byType.reduce((s, r) => s + Number(r.count), 0);
    const critical = byType.filter(r => r.severity === "critical").reduce((s, r) => s + Number(r.count), 0);
    res.json({ alerts: byType, totalActive: total, critical, resolved: Number(resolved?.count ?? 0) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export { runFraudScan };
export default router;
