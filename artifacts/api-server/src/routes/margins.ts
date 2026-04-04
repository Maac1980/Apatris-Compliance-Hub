import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";

const router = Router();

const EMPLOYER_ZUS_RATE = 0.2048;
const DEFAULT_ADMIN_COST_PER_WORKER = 150; // EUR/month

// POST /api/margins/calculate
router.post("/margins/calculate", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { month, year } = req.body as { month?: number; year?: number };
    const m = month || new Date().getMonth() + 1;
    const y = year || new Date().getFullYear();

    await execute("DELETE FROM margin_analysis WHERE tenant_id = $1 AND month = $2 AND year = $3", [tenantId, m, y]);

    const dbRows = await fetchAllWorkers(tenantId);
    const workers = dbRows.map(mapRowToWorker);
    let calculated = 0;

    // Get active deals with company info
    const deals = await query<Record<string, any>>(
      `SELECT d.company_id, c.company_name, d.value_eur, d.workers_needed FROM crm_deals d
       JOIN crm_companies c ON c.id = d.company_id WHERE d.tenant_id = $1 AND d.stage = 'Active'`, [tenantId]
    );

    // Revenue per worker per company (deal value / workers_needed)
    for (const deal of deals) {
      const revenuePerWorker = Number(deal.workers_needed) > 0 ? Number(deal.value_eur) / Number(deal.workers_needed) : 0;

      // Find workers assigned to this company's sites
      const assignedWorkers = workers.filter(w => (w.hourlyRate ?? 0) > 0).slice(0, Number(deal.workers_needed));

      for (const w of assignedWorkers) {
        const gross = (w.hourlyRate ?? 0) * (w.monthlyHours ?? 160);
        const workerCost = gross + gross * EMPLOYER_ZUS_RATE;

        // Housing cost
        const housing = await queryOne<Record<string, any>>(
          `SELECT wh.cost_per_month FROM worker_housing wh WHERE wh.worker_id = $1 AND wh.status = 'active' LIMIT 1`, [w.id]
        );
        const housingCost = Number(housing?.cost_per_month ?? 0);
        const adminCost = DEFAULT_ADMIN_COST_PER_WORKER;

        const totalCost = workerCost + housingCost + adminCost;
        const margin = revenuePerWorker - totalCost;
        const marginPct = revenuePerWorker > 0 ? (margin / revenuePerWorker) * 100 : 0;

        const flag = marginPct < 0 ? "losing_money" : marginPct < 5 ? "critical" : marginPct < 15 ? "warning" : "healthy";

        await execute(
          `INSERT INTO margin_analysis (tenant_id, company_id, company_name, worker_id, worker_name, month, year, revenue, worker_cost, housing_cost, admin_cost, gross_margin, gross_margin_pct, flag)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [tenantId, deal.company_id, deal.company_name, w.id, w.name, m, y, r2(revenuePerWorker), r2(workerCost), r2(housingCost), r2(adminCost), r2(margin), r2(marginPct), flag]
        );
        calculated++;
      }
    }

    res.json({ calculated, month: m, year: y });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/margins
router.get("/margins", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM margin_analysis WHERE tenant_id = $1 ORDER BY gross_margin_pct ASC", [req.tenantId!]
    );
    res.json({ margins: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/margins/summary
router.get("/margins/summary", requireAuth, async (req, res) => {
  try {
    const stats = await queryOne<Record<string, any>>(
      `SELECT COUNT(*) AS total, COALESCE(AVG(gross_margin_pct), 0) AS avg_margin,
        COUNT(*) FILTER (WHERE flag = 'losing_money') AS losing,
        COUNT(*) FILTER (WHERE flag = 'critical') AS critical,
        COUNT(*) FILTER (WHERE flag = 'warning') AS warning,
        COUNT(*) FILTER (WHERE flag = 'healthy') AS healthy,
        COALESCE(SUM(gross_margin), 0) AS total_margin,
        COALESCE(SUM(revenue), 0) AS total_revenue
       FROM margin_analysis WHERE tenant_id = $1`, [req.tenantId!]
    );

    // Best and worst clients
    const best = await query<Record<string, any>>(
      `SELECT company_name, ROUND(AVG(gross_margin_pct)::numeric, 1) AS avg_margin FROM margin_analysis WHERE tenant_id = $1 AND company_name IS NOT NULL GROUP BY company_name ORDER BY avg_margin DESC LIMIT 3`, [req.tenantId!]
    );
    const worst = await query<Record<string, any>>(
      `SELECT company_name, ROUND(AVG(gross_margin_pct)::numeric, 1) AS avg_margin FROM margin_analysis WHERE tenant_id = $1 AND company_name IS NOT NULL GROUP BY company_name ORDER BY avg_margin ASC LIMIT 3`, [req.tenantId!]
    );

    res.json({
      total: Number(stats?.total ?? 0), avgMargin: Number(Number(stats?.avg_margin ?? 0).toFixed(1)),
      losing: Number(stats?.losing ?? 0), critical: Number(stats?.critical ?? 0),
      warning: Number(stats?.warning ?? 0), healthy: Number(stats?.healthy ?? 0),
      totalMargin: Number(stats?.total_margin ?? 0), totalRevenue: Number(stats?.total_revenue ?? 0),
      bestClients: best.map(b => ({ name: b.company_name, margin: Number(b.avg_margin) })),
      worstClients: worst.map(w => ({ name: w.company_name, margin: Number(w.avg_margin) })),
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/margins/worker/:workerId
router.get("/margins/worker/:workerId", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM margin_analysis WHERE worker_id = $1 AND tenant_id = $2 ORDER BY year DESC, month DESC", [req.params.workerId, req.tenantId!]);
    res.json({ margins: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/margins/client/:companyId
router.get("/margins/client/:companyId", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM margin_analysis WHERE company_id = $1 AND tenant_id = $2 ORDER BY gross_margin_pct ASC", [req.params.companyId, req.tenantId!]);
    res.json({ margins: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

function r2(n: number): number { return Math.round(n * 100) / 100; }

export default router;
