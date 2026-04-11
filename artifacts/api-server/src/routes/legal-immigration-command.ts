/**
 * Legal Immigration Command — lightweight aggregator for the unified page.
 * Pulls from existing services/tables. No business logic lives here.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne } from "../lib/db.js";

const router = Router();
const VIEW = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"];

// GET /api/v1/legal-immigration/overview — top-level metrics
router.get("/v1/legal-immigration/overview", requireAuth, requireRole(...VIEW), async (req, res) => {
  const t = req.tenantId!;
  const soon30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  try {
    const [
      totalWorkers, blockedWorkers, expiringTRC, expiredTRC,
      expiringPassports, expiringWorkPermits,
      activeCases, rejectedCases, pendingAppeals,
      overdueDeadlines, approachingDeadlines,
      pendingReviews, overdueReviews,
      trcTotal, trcDraft, trcSubmitted, trcRejected,
    ] = await Promise.all([
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id=$1", [t])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id=$1 AND (trc_expiry < NOW() OR work_permit_expiry < NOW())", [t])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id=$1 AND trc_expiry BETWEEN NOW() AND $2::date", [t, soon30])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id=$1 AND trc_expiry < NOW()", [t])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id=$1 AND passport_expiry BETWEEN NOW() AND $2::date", [t, soon30])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id=$1 AND work_permit_expiry BETWEEN NOW() AND $2::date", [t, soon30])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id=$1 AND status IN ('NEW','PENDING')", [t])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id=$1 AND status='REJECTED'", [t])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id=$1 AND case_type='APPEAL' AND status IN ('NEW','PENDING')", [t])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id=$1 AND appeal_deadline < NOW() AND status IN ('NEW','PENDING')", [t])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id=$1 AND appeal_deadline BETWEEN NOW() AND NOW()+INTERVAL '7 days' AND status IN ('NEW','PENDING')", [t])),
      Ntry(queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_review_tasks WHERE task_status IN ('PENDING','IN_REVIEW')")),
      Ntry(queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_review_tasks WHERE task_status='PENDING' AND due_date < NOW()")),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM trc_cases WHERE tenant_id=$1", [t])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM trc_cases WHERE tenant_id=$1 AND status='draft'", [t])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM trc_cases WHERE tenant_id=$1 AND status='submitted'", [t])),
      N(queryOne<any>("SELECT COUNT(*)::int as c FROM trc_cases WHERE tenant_id=$1 AND status='rejected'", [t])),
    ]);

    // Bottlenecks
    const bottlenecks: Array<{ issue: string; severity: string; count: number; link: string }> = [];
    if (blockedWorkers > 0) bottlenecks.push({ issue: "Workers with expired permits", severity: "CRITICAL", count: blockedWorkers, link: "#workers-legal" });
    if (overdueDeadlines > 0) bottlenecks.push({ issue: "Missed appeal deadlines", severity: "CRITICAL", count: overdueDeadlines, link: "#appeals" });
    if (overdueReviews > 0) bottlenecks.push({ issue: "Overdue legal reviews", severity: "HIGH", count: overdueReviews, link: "#queue" });
    if (expiredTRC > 0) bottlenecks.push({ issue: "Expired TRC permits", severity: "CRITICAL", count: expiredTRC, link: "#trc" });
    if (rejectedCases > 0) bottlenecks.push({ issue: "Rejected cases pending action", severity: "HIGH", count: rejectedCases, link: "#appeals" });
    if (trcDraft > 0) bottlenecks.push({ issue: "TRC applications in draft", severity: "MEDIUM", count: trcDraft, link: "#trc" });

    // Top actions
    const topActions: Array<{ action: string; urgency: string; count: number; tab: string }> = [];
    if (blockedWorkers > 0) topActions.push({ action: "Resolve blocked workers", urgency: "CRITICAL", count: blockedWorkers, tab: "workers-legal" });
    if (overdueDeadlines > 0) topActions.push({ action: "Handle overdue appeal deadlines", urgency: "CRITICAL", count: overdueDeadlines, tab: "appeals" });
    if (approachingDeadlines > 0) topActions.push({ action: "File appeals before deadline", urgency: "HIGH", count: approachingDeadlines, tab: "appeals" });
    if (expiringTRC > 0) topActions.push({ action: "Start TRC renewal process", urgency: "HIGH", count: expiringTRC, tab: "trc" });
    if (pendingReviews > 0) topActions.push({ action: "Complete pending legal reviews", urgency: "MEDIUM", count: pendingReviews, tab: "queue" });

    res.json({
      metrics: {
        totalWorkers, blockedWorkers, expiringTRC, expiredTRC,
        expiringPassports, expiringWorkPermits,
        activeCases, rejectedCases, pendingAppeals,
        overdueDeadlines, approachingDeadlines,
        pendingReviews, overdueReviews,
        trc: { total: trcTotal, draft: trcDraft, submitted: trcSubmitted, rejected: trcRejected },
      },
      bottlenecks, topActions,
      computedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/legal-immigration/workers — worker legal status list
router.get("/v1/legal-immigration/workers", requireAuth, requireRole(...VIEW), async (req, res) => {
  const t = req.tenantId!;
  try {
    const rows = await query<any>(
      `SELECT w.id, w.full_name, w.nationality, w.specialization, w.assigned_site,
              w.trc_expiry, w.passport_expiry, w.work_permit_expiry, w.bhp_expiry,
              w.contract_end_date, w.medical_exam_expiry, w.oswiadczenie_expiry,
              w.compliance_status,
              (SELECT COUNT(*) FROM legal_cases lc WHERE lc.worker_id = w.id AND lc.status IN ('NEW','PENDING'))::int AS active_cases,
              (SELECT COUNT(*) FROM legal_cases lc WHERE lc.worker_id = w.id AND lc.status = 'REJECTED')::int AS rejected_cases
       FROM workers w WHERE w.tenant_id = $1
       ORDER BY
         CASE WHEN w.trc_expiry < NOW() THEN 0 WHEN w.trc_expiry < NOW() + INTERVAL '30 days' THEN 1 ELSE 2 END,
         w.trc_expiry ASC NULLS LAST
       LIMIT 300`, [t]
    );
    res.json({ workers: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/legal-immigration/client-view — grouped by employer
router.get("/v1/legal-immigration/client-view", requireAuth, requireRole(...VIEW), async (req, res) => {
  const t = req.tenantId!;
  try {
    const rows = await query<any>(
      `SELECT
         COALESCE(w.assigned_site, 'Unassigned') AS employer,
         COUNT(*)::int AS total_workers,
         COUNT(*) FILTER (WHERE w.trc_expiry < NOW() OR w.work_permit_expiry < NOW())::int AS blocked,
         COUNT(*) FILTER (WHERE w.trc_expiry BETWEEN NOW() AND NOW() + INTERVAL '30 days')::int AS expiring,
         COUNT(*) FILTER (WHERE w.trc_expiry > NOW() + INTERVAL '30 days' OR w.trc_expiry IS NULL)::int AS ok
       FROM workers w WHERE w.tenant_id = $1
       GROUP BY COALESCE(w.assigned_site, 'Unassigned')
       ORDER BY blocked DESC, expiring DESC`, [t]
    );
    res.json({ clients: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

function N(p: Promise<any>): Promise<number> {
  return p.then(r => Number(r?.c ?? 0));
}

async function Ntry(p: Promise<any>): Promise<number> {
  try { return await N(p); } catch { return 0; }
}

export default router;
