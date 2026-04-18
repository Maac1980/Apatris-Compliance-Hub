import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";
import { getDefaultTenantId } from "../lib/tenant.js";

const router = Router();

async function calculateTrustScore(worker: any, tenantId: string) {
  const now = new Date();
  const breakdown: Record<string, { score: number; max: number; details: string }> = {};

  // 1. Compliance (25 pts) — all docs valid, no expired
  let compScore = 25;
  const checks = [worker.trcExpiry, worker.passportExpiry, worker.bhpExpiry, worker.workPermitExpiry, worker.medicalExamExpiry, worker.contractEndDate];
  let expiredCount = 0;
  let warningCount = 0;
  for (const d of checks) {
    if (!d) continue;
    const days = Math.ceil((new Date(d).getTime() - now.getTime()) / 86_400_000);
    if (days < 0) { expiredCount++; compScore -= 8; }
    else if (days < 30) { warningCount++; compScore -= 3; }
  }
  compScore = Math.max(0, compScore);
  breakdown.compliance = { score: compScore, max: 25, details: `${expiredCount} expired, ${warningCount} warning` };

  // 2. Attendance (20 pts) — check-in consistency
  let attScore = 15; // base
  try {
    const checkins = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS count FROM voice_checkins WHERE worker_id = $1 AND tenant_id = $2 AND timestamp >= NOW() - INTERVAL '30 days'",
      [worker.id, tenantId]
    );
    const count = Number(checkins?.count ?? 0);
    if (count >= 20) attScore = 20;
    else if (count >= 10) attScore = 15;
    else if (count >= 5) attScore = 10;
    else attScore = 5;
  } catch { /* table may not exist */ }
  breakdown.attendance = { score: attScore, max: 20, details: `Based on 30-day check-in frequency` };

  // 3. Mood stability (10 pts)
  let moodScore = 7; // default
  try {
    const mood = await queryOne<Record<string, any>>(
      "SELECT ROUND(AVG(score)::numeric, 1) AS avg, COUNT(*) AS count FROM mood_entries WHERE worker_id = $1 AND tenant_id = $2 AND submitted_at >= NOW() - INTERVAL '60 days'",
      [worker.id, tenantId]
    );
    const avg = Number(mood?.avg ?? 3);
    const entries = Number(mood?.count ?? 0);
    if (entries >= 4 && avg >= 4) moodScore = 10;
    else if (entries >= 2 && avg >= 3) moodScore = 7;
    else if (avg < 2.5) moodScore = 3;
  } catch { /* table may not exist */ }
  breakdown.mood = { score: moodScore, max: 10, details: `Mood stability over 60 days` };

  // 4. Contract history (20 pts)
  let contractScore = 15; // base
  try {
    const contracts = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'signed' OR status = 'completed') AS completed FROM contracts WHERE worker_id = $1 AND tenant_id = $2",
      [worker.id, tenantId]
    );
    const total = Number(contracts?.total ?? 0);
    const completed = Number(contracts?.completed ?? 0);
    if (total > 0 && completed === total) contractScore = 20;
    else if (total > 0 && completed >= total * 0.8) contractScore = 15;
    else if (total > 0) contractScore = 10;
  } catch { /* table may not exist */ }
  breakdown.contracts = { score: contractScore, max: 20, details: `Contract completion rate` };

  // 5. Onboarding (10 pts)
  let onbScore = 5; // default
  try {
    const onb = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'completed') AS done FROM onboarding_checklists WHERE worker_id = $1 AND tenant_id = $2",
      [worker.id, tenantId]
    );
    const total = Number(onb?.total ?? 0);
    const done = Number(onb?.done ?? 0);
    if (total > 0 && done === total) onbScore = 10;
    else if (total > 0) onbScore = Math.round((done / total) * 10);
  } catch { /* table may not exist */ }
  breakdown.onboarding = { score: onbScore, max: 10, details: `Onboarding checklist completion` };

  // 6. Payroll (15 pts)
  let payScore = 12; // base
  try {
    const advances = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS count FROM salary_advances WHERE worker_id = $1 AND tenant_id = $2 AND status != 'rejected'",
      [worker.id, tenantId]
    );
    const advCount = Number(advances?.count ?? 0);
    if (advCount === 0) payScore = 15;
    else if (advCount <= 2) payScore = 10;
    else payScore = 5;
  } catch { /* table may not exist */ }
  breakdown.payroll = { score: payScore, max: 15, details: `${payScore === 15 ? "No" : "Some"} advance requests` };

  const totalScore = Math.min(100, compScore + attScore + moodScore + contractScore + onbScore + payScore);
  return { score: totalScore, breakdown };
}

// POST /api/trust/calculate/:workerId
router.post("/trust/calculate/:workerId", requireAuth, async (req, res) => {
  try {
    const dbRows = await fetchAllWorkers(req.tenantId!);
    const workers = dbRows.map((r) => mapRowToWorker(r));
    const worker = workers.find(w => w.id === req.params.workerId);
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const { score, breakdown } = await calculateTrustScore(worker, req.tenantId!);

    // Get version
    const latest = await queryOne<Record<string, any>>(
      "SELECT version FROM trust_scores WHERE worker_id = $1 AND tenant_id = $2 ORDER BY calculated_at DESC LIMIT 1",
      [worker.id, req.tenantId!]
    );
    const version = (Number(latest?.version ?? 0)) + 1;

    const row = await queryOne(
      `INSERT INTO trust_scores (tenant_id, worker_id, worker_name, score, breakdown, version)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.tenantId!, worker.id, worker.name, score, JSON.stringify(breakdown), version]
    );
    res.json({ trustScore: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/trust/calculate-all
router.post("/trust/calculate-all", requireAuth, async (req, res) => {
  try {
    const result = await runTrustScoreCalculation(req.tenantId!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

async function runTrustScoreCalculation(tenantId: string) {
  const dbRows = await fetchAllWorkers(tenantId);
  const workers = dbRows.map((r) => mapRowToWorker(r));
  let calculated = 0;

  for (const w of workers) {
    const { score, breakdown } = await calculateTrustScore(w, tenantId);
    const latest = await queryOne<Record<string, any>>(
      "SELECT version FROM trust_scores WHERE worker_id = $1 AND tenant_id = $2 ORDER BY calculated_at DESC LIMIT 1",
      [w.id, tenantId]
    );
    const version = (Number(latest?.version ?? 0)) + 1;
    await execute(
      `INSERT INTO trust_scores (tenant_id, worker_id, worker_name, score, breakdown, version) VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenantId, w.id, w.name, score, JSON.stringify(breakdown), version]
    );
    calculated++;
  }
  console.log(`[Trust] Calculated scores for ${calculated} workers.`);
  return { calculated };
}

// GET /api/trust/scores — latest score per worker
router.get("/trust/scores", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT DISTINCT ON (worker_id) * FROM trust_scores
       WHERE tenant_id = $1 ORDER BY worker_id, calculated_at DESC`,
      [req.tenantId!]
    );
    res.json({ scores: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/trust/scores/:workerId/history
router.get("/trust/scores/:workerId/history", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM trust_scores WHERE worker_id = $1 AND tenant_id = $2 ORDER BY calculated_at DESC LIMIT 52",
      [req.params.workerId, req.tenantId!]
    );
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export { runTrustScoreCalculation };
export default router;
