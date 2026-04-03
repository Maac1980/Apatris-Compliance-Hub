import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";
import { getDefaultTenantId } from "../lib/tenant.js";

const router = Router();

async function analyseChurnSignals(worker: any, tenantId: string) {
  const signals: Array<{ signal: string; weight: number; detail: string }> = [];
  let probability = 0;

  // 1. Mood declining 3+ weeks
  try {
    const moods = await query<Record<string, any>>(
      "SELECT score, week_number FROM mood_entries WHERE worker_id = $1 AND tenant_id = $2 ORDER BY year DESC, week_number DESC LIMIT 4",
      [worker.id, tenantId]
    );
    if (moods.length >= 3) {
      const scores = moods.map(m => Number(m.score));
      const declining = scores[0] < scores[1] && scores[1] < scores[2];
      if (declining) { signals.push({ signal: "mood_declining", weight: 20, detail: `Mood declining 3 weeks: ${scores.slice(0, 3).reverse().join(" → ")}` }); probability += 20; }
    }
    // Mood below 2 for 2+ weeks
    const lowMoods = moods.filter(m => Number(m.score) <= 2);
    if (lowMoods.length >= 2) { signals.push({ signal: "mood_low", weight: 25, detail: `Mood score ≤2 for ${lowMoods.length} weeks` }); probability += 25; }
  } catch { /* table may not exist */ }

  // 2. No check-ins for 3+ days
  try {
    const lastCheckin = await queryOne<Record<string, any>>(
      "SELECT timestamp FROM voice_checkins WHERE worker_id = $1 AND tenant_id = $2 ORDER BY timestamp DESC LIMIT 1",
      [worker.id, tenantId]
    );
    if (lastCheckin?.timestamp) {
      const daysSince = Math.ceil((Date.now() - new Date(lastCheckin.timestamp).getTime()) / 86_400_000);
      if (daysSince >= 3) { signals.push({ signal: "no_checkins", weight: 15, detail: `No check-in for ${daysSince} days` }); probability += 15; }
    }
  } catch { /* table may not exist */ }

  // 3. Advance requests increasing
  try {
    const advances = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS count FROM salary_advances WHERE worker_id = $1 AND tenant_id = $2 AND requested_at >= NOW() - INTERVAL '60 days'",
      [worker.id, tenantId]
    );
    if (Number(advances?.count ?? 0) >= 3) { signals.push({ signal: "advances_increasing", weight: 10, detail: `${advances?.count} advance requests in 60 days` }); probability += 10; }
  } catch { /* table may not exist */ }

  // 4. Contract ending within 30 days, no renewal
  const contractEnd = worker.contractEndDate;
  if (contractEnd) {
    const daysToEnd = Math.ceil((new Date(contractEnd).getTime() - Date.now()) / 86_400_000);
    if (daysToEnd > 0 && daysToEnd <= 30) { signals.push({ signal: "contract_ending", weight: 20, detail: `Contract ends in ${daysToEnd} days` }); probability += 20; }
  }

  // 5. Bench time increasing
  try {
    const bench = await queryOne<Record<string, any>>(
      "SELECT available_from FROM bench_entries WHERE worker_id = $1 AND tenant_id = $2 AND status = 'available' LIMIT 1",
      [worker.id, tenantId]
    );
    if (bench?.available_from) {
      const benchDays = Math.ceil((Date.now() - new Date(bench.available_from).getTime()) / 86_400_000);
      if (benchDays >= 7) { signals.push({ signal: "bench_time", weight: 15, detail: `On bench for ${benchDays} days` }); probability += 15; }
    }
  } catch { /* table may not exist */ }

  // 6. Trust score dropping
  try {
    const trustHistory = await query<Record<string, any>>(
      "SELECT score FROM trust_scores WHERE worker_id = $1 AND tenant_id = $2 ORDER BY calculated_at DESC LIMIT 3",
      [worker.id, tenantId]
    );
    if (trustHistory.length >= 2) {
      const latest = Number(trustHistory[0].score);
      const prev = Number(trustHistory[1].score);
      if (latest < prev - 10) { signals.push({ signal: "trust_dropping", weight: 15, detail: `Trust score dropped from ${prev} to ${latest}` }); probability += 15; }
    }
  } catch { /* table may not exist */ }

  probability = Math.min(100, probability);
  const riskLevel = probability >= 70 ? "critical" : probability >= 45 ? "high" : probability >= 20 ? "medium" : "low";

  // Recommended action
  let action = "Monitor — no immediate action needed";
  if (riskLevel === "critical") action = "Urgent: Schedule 1-on-1 meeting with worker. Consider salary review or site transfer.";
  else if (riskLevel === "high") action = "Schedule check-in with coordinator. Review contract renewal and mood feedback.";
  else if (riskLevel === "medium") action = "Monitor mood and attendance. Consider proactive engagement.";

  const predictedLeave = riskLevel === "critical" ? new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
    : riskLevel === "high" ? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) : null;

  return { probability, riskLevel, signals, action, predictedLeave };
}

async function runChurnScan(tenantId: string) {
  await execute("DELETE FROM churn_predictions WHERE tenant_id = $1 AND status = 'active'", [tenantId]);

  const dbRows = await fetchAllWorkers(tenantId);
  const workers = dbRows.map(mapRowToWorker);
  let total = 0, criticalCount = 0;

  for (const w of workers) {
    const result = await analyseChurnSignals(w, tenantId);
    if (result.signals.length === 0) continue;

    await execute(
      `INSERT INTO churn_predictions (tenant_id, worker_id, worker_name, churn_probability, risk_level, signals, recommended_action, predicted_leave_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, w.id, w.name, result.probability, result.riskLevel, JSON.stringify(result.signals), result.action, result.predictedLeave]
    );
    total++;
    if (result.riskLevel === "critical") criticalCount++;
  }

  // WhatsApp alert for critical
  if (criticalCount > 0) {
    try {
      const coords = await query<Record<string, any>>(
        "SELECT phone, name FROM site_coordinators WHERE tenant_id = $1 LIMIT 3", [tenantId]
      );
      for (const c of coords) {
        if (c.phone) {
          await sendWhatsAppAlert({
            to: c.phone, workerName: c.name, workerI: "system",
            permitType: `CHURN ALERT: ${criticalCount} workers at CRITICAL risk of leaving. Immediate action required.`,
            daysRemaining: 0, tenantId,
          });
        }
      }
    } catch { /* non-blocking */ }
  }

  console.log(`[Churn] Scan: ${total} at risk, ${criticalCount} critical.`);
  return { scanned: workers.length, atRisk: total, critical: criticalCount };
}

// POST /api/churn/scan
router.post("/churn/scan", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try { res.json(await runChurnScan(req.tenantId!)); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/churn/predictions
router.get("/churn/predictions", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM churn_predictions WHERE tenant_id = $1 AND status = 'active' ORDER BY churn_probability DESC",
      [req.tenantId!]
    );
    res.json({ predictions: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// PATCH /api/churn/predictions/:id/resolve
router.patch("/churn/predictions/:id/resolve", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      "UPDATE churn_predictions SET status = 'resolved', resolved_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ prediction: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/churn/summary
router.get("/churn/summary", requireAuth, async (req, res) => {
  try {
    const rows = await query<Record<string, any>>(
      `SELECT risk_level, COUNT(*) AS count FROM churn_predictions WHERE tenant_id = $1 AND status = 'active' GROUP BY risk_level`,
      [req.tenantId!]
    );
    const summary: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const r of rows) summary[r.risk_level] = Number(r.count);
    const total = Object.values(summary).reduce((s, n) => s + n, 0);
    res.json({ ...summary, total });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export { runChurnScan };
export default router;
