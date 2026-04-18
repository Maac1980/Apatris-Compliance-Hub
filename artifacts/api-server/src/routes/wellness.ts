import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";

const router = Router();

const EMP_ZUS_RATE = 0.1126;
const EMPL_ZUS_RATE = 0.2048;
const HEALTH_RATE = 0.09;
const TAX_RATE = 0.12;
const EST_LIVING_COST_PLN = 2500; // estimated monthly living cost

function calcWellness(gross: number, advances: number, housingCost: number) {
  const empZus = gross * EMP_ZUS_RATE;
  const healthBase = gross - empZus;
  const health = healthBase * HEALTH_RATE;
  const taxBase = Math.max(0, Math.round(healthBase * 0.8));
  const tax = Math.max(0, Math.round(taxBase * TAX_RATE));
  const net = Math.max(0, gross - empZus - health - tax);
  const zusTotal = gross * EMP_ZUS_RATE + gross * EMPL_ZUS_RATE;
  const savings = Math.max(0, net - advances - housingCost - EST_LIVING_COST_PLN);
  const savingsRate = net > 0 ? savings / net : 0;

  // Score components
  const savingsScore = Math.min(30, Math.round(savingsRate * 100));
  const advanceScore = advances === 0 ? 20 : advances < net * 0.1 ? 15 : advances < net * 0.3 ? 10 : 0;
  const zusScore = 20; // assume up to date if on payroll
  const incomeScore = gross > 0 ? 20 : 0;
  const deductionScore = advances === 0 && housingCost === 0 ? 10 : housingCost === 0 ? 5 : 0;

  return {
    gross: r2(gross), net: r2(net), zusContributions: r2(zusTotal), taxPaid: r2(tax + health),
    advances: r2(advances), housingCost: r2(housingCost), estimatedSavings: r2(savings),
    score: Math.min(100, savingsScore + advanceScore + zusScore + incomeScore + deductionScore),
    breakdown: { savings: { score: savingsScore, max: 30 }, advances: { score: advanceScore, max: 20 }, zus: { score: zusScore, max: 20 }, income: { score: incomeScore, max: 20 }, deductions: { score: deductionScore, max: 10 } },
  };
}

function r2(n: number): number { return Math.round(n * 100) / 100; }

// POST /api/wellness/calculate
router.post("/wellness/calculate", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();

    await execute("DELETE FROM financial_wellness WHERE tenant_id = $1 AND month = $2 AND year = $3", [tenantId, m, y]);

    const dbRows = await fetchAllWorkers(tenantId);
    const workers = dbRows.map((r) => mapRowToWorker(r));
    let calculated = 0;

    for (const w of workers) {
      const gross = (w.hourlyRate ?? 0) * (w.monthlyHours ?? 0);
      if (gross <= 0) continue;

      // Get advances
      const adv = await queryOne<Record<string, any>>(
        "SELECT COALESCE(SUM(amount_requested), 0) AS total FROM salary_advances WHERE worker_id = $1 AND tenant_id = $2 AND status = 'approved' AND deduction_month = $3 AND deduction_year = $4",
        [w.id, tenantId, m, y]);
      const advances = Number(adv?.total ?? 0);

      // Get housing cost
      const housing = await queryOne<Record<string, any>>(
        "SELECT COALESCE(cost_per_month, 0) AS cost FROM worker_housing WHERE worker_id = $1 AND status = 'active' LIMIT 1", [w.id]);
      const housingCost = Number(housing?.cost ?? 0);

      const result = calcWellness(gross, advances, housingCost);

      await execute(
        `INSERT INTO financial_wellness (tenant_id, worker_id, worker_name, month, year, gross_salary, net_salary, zus_contributions, tax_paid, advances_taken, housing_cost, estimated_savings, wellness_score, breakdown)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [tenantId, w.id, w.name, m, y, result.gross, result.net, result.zusContributions, result.taxPaid, result.advances, result.housingCost, result.estimatedSavings, result.score, JSON.stringify(result.breakdown)]);
      calculated++;
    }

    res.json({ calculated, month: m, year: y });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/wellness/scores
router.get("/wellness/scores", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT DISTINCT ON (worker_id) * FROM financial_wellness WHERE tenant_id = $1 ORDER BY worker_id, year DESC, month DESC`,
      [req.tenantId!]);
    res.json({ scores: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/wellness/worker/:workerId
router.get("/wellness/worker/:workerId", requireAuth, async (req, res) => {
  try {
    const latest = await queryOne("SELECT * FROM financial_wellness WHERE worker_id = $1 AND tenant_id = $2 ORDER BY year DESC, month DESC LIMIT 1", [req.params.workerId, req.tenantId!]);
    if (!latest) return res.status(404).json({ error: "No wellness data — run calculation first" });

    // Earned wage access — estimate earned so far this month
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const earnedSoFar = r2(Number((latest as any).gross_salary) * (dayOfMonth / daysInMonth));

    res.json({ wellness: latest, earnedSoFar, dayOfMonth, daysInMonth });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/wellness/summary
router.get("/wellness/summary", requireAuth, async (req, res) => {
  try {
    const stats = await queryOne<Record<string, any>>(
      `SELECT COUNT(*) AS total, ROUND(AVG(wellness_score)::numeric, 1) AS avg_score,
        COUNT(*) FILTER (WHERE wellness_score < 30) AS at_risk,
        COUNT(*) FILTER (WHERE wellness_score >= 70) AS healthy
       FROM (SELECT DISTINCT ON (worker_id) wellness_score FROM financial_wellness WHERE tenant_id = $1 ORDER BY worker_id, year DESC, month DESC) sub`,
      [req.tenantId!]);
    res.json({ total: Number(stats?.total ?? 0), avgScore: Number(stats?.avg_score ?? 0), atRisk: Number(stats?.at_risk ?? 0), healthy: Number(stats?.healthy ?? 0) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
