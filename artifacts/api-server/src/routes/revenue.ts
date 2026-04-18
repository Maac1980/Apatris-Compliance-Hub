import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";

const router = Router();

const HOURS_PER_MONTH = 160;

// GET /api/revenue/forecast — 6 month forward projection
router.get("/revenue/forecast", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const dbRows = await fetchAllWorkers(tenantId);
    const workers = dbRows.map((r) => mapRowToWorker(r));

    // Active workers with rates
    const activeWorkers = workers.filter(w => (w.hourlyRate ?? 0) > 0 && (w.monthlyHours ?? 0) > 0);
    const avgRate = activeWorkers.length > 0 ? activeWorkers.reduce((s, w) => s + (w.hourlyRate ?? 0), 0) / activeWorkers.length : 0;

    // Bench workers
    const benchCount = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS count FROM bench_entries WHERE tenant_id = $1 AND status = 'available'", [tenantId]
    );
    const bench = Number(benchCount?.count ?? 0);

    // Active CRM deals
    const deals = await query<Record<string, any>>(
      "SELECT COALESCE(SUM(value_eur), 0) AS total, COUNT(*) AS count FROM crm_deals WHERE tenant_id = $1 AND stage = 'Active'", [tenantId]
    );
    const activeContracts = Number(deals[0]?.count ?? 0);
    const dealValue = Number(deals[0]?.total ?? 0);

    // Contracts ending soon (revenue at risk)
    const endingSoon = workers.filter(w => {
      if (!w.contractEndDate) return false;
      const days = Math.ceil((new Date(w.contractEndDate).getTime() - Date.now()) / 86_400_000);
      return days > 0 && days <= 60;
    });
    const revenueAtRisk = endingSoon.reduce((s, w) => s + (w.hourlyRate ?? 0) * HOURS_PER_MONTH, 0);

    // Project 6 months
    const now = new Date();
    const forecast = [];
    for (let i = 0; i < 6; i++) {
      const m = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const month = m.getMonth() + 1;
      const year = m.getFullYear();

      // Workers whose contracts end before this month
      const stillActive = activeWorkers.filter(w => {
        if (!w.contractEndDate) return true;
        return new Date(w.contractEndDate) >= m;
      });

      const workerRevenue = stillActive.reduce((s, w) => s + (w.hourlyRate ?? 0) * (w.monthlyHours ?? HOURS_PER_MONTH), 0);
      const benchGap = bench * avgRate * HOURS_PER_MONTH * (i === 0 ? 1 : Math.max(0, 1 - i * 0.15)); // bench reduces over time

      forecast.push({
        month, year,
        label: `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month - 1]} ${year}`,
        projectedRevenue: Math.round(workerRevenue),
        benchGap: Math.round(benchGap),
        netProjected: Math.round(workerRevenue - benchGap),
        activeWorkers: stillActive.length,
        benchWorkers: bench,
        avgRate: Math.round(avgRate * 100) / 100,
        revenueAtRisk: i < 2 ? Math.round(revenueAtRisk * (1 - i * 0.5)) : 0,
      });
    }

    res.json({ forecast, activeContracts, dealValue });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/revenue/actual — actual vs projected
router.get("/revenue/actual", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId!;

    // Actual revenue from paid invoices by month
    const invoices = await query<Record<string, any>>(
      `SELECT month_year, SUM(COALESCE(amount_gross, total, 0)::numeric) AS total
       FROM invoices WHERE tenant_id = $1 AND status = 'paid' AND month_year IS NOT NULL
       GROUP BY month_year ORDER BY month_year DESC LIMIT 6`, [tenantId]
    );

    // Outstanding
    const outstanding = await queryOne<Record<string, any>>(
      `SELECT SUM(COALESCE(amount_gross, total, 0)::numeric) AS total
       FROM invoices WHERE tenant_id = $1 AND status IN ('sent', 'draft')`, [tenantId]
    );

    res.json({
      actual: invoices.map(i => ({ monthYear: i.month_year, revenue: Number(i.total) })),
      outstanding: Number(outstanding?.total ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/revenue/summary
router.get("/revenue/summary", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const dbRows = await fetchAllWorkers(tenantId);
    const workers = dbRows.map((r) => mapRowToWorker(r));
    const active = workers.filter(w => (w.hourlyRate ?? 0) > 0 && (w.monthlyHours ?? 0) > 0);

    const currentMonthRevenue = active.reduce((s, w) => s + (w.hourlyRate ?? 0) * (w.monthlyHours ?? HOURS_PER_MONTH), 0);

    // Top clients by deal value
    const topClients = await query<Record<string, any>>(
      `SELECT c.company_name, SUM(d.value_eur) AS total_value, SUM(d.workers_needed) AS total_workers
       FROM crm_deals d JOIN crm_companies c ON c.id = d.company_id
       WHERE d.tenant_id = $1 AND d.stage = 'Active'
       GROUP BY c.company_name ORDER BY total_value DESC LIMIT 5`, [tenantId]
    );

    const benchCount = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS count FROM bench_entries WHERE tenant_id = $1 AND status = 'available'", [tenantId]
    );

    res.json({
      currentMonth: Math.round(currentMonthRevenue),
      activeWorkers: active.length,
      benchWorkers: Number(benchCount?.count ?? 0),
      sixMonthProjected: Math.round(currentMonthRevenue * 5.5), // slight decline factor
      topClients: topClients.map(c => ({ name: c.company_name, value: Number(c.total_value), workers: Number(c.total_workers) })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
