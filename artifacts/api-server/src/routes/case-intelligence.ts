/**
 * Case Intelligence API
 *
 * POST /api/v1/case-intelligence/:workerId/analyze — run full case analysis
 * GET  /api/v1/case-intelligence/:workerId/latest — get most recent analysis
 * POST /api/v1/case-intelligence/batch — run across all active cases
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { analyzeCaseIntelligence } from "../services/case-intelligence.service.js";
import { query } from "../lib/db.js";

const router = Router();
const ROLES = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"];
const ADMIN_ROLES = ["Admin", "Executive", "LegalHead"];

router.post("/v1/case-intelligence/:workerId/analyze", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    const result = await analyzeCaseIntelligence(req.params.workerId as string, req.tenantId!);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Analysis failed" });
  }
});

router.get("/v1/case-intelligence/:workerId/latest", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    const result = await analyzeCaseIntelligence(req.params.workerId as string, req.tenantId!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/case-intelligence/batch — run across all workers with active cases
router.post("/v1/case-intelligence/batch", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const workers = await query<{ id: string }>(
      `SELECT DISTINCT w.id FROM workers w
       INNER JOIN legal_cases lc ON lc.worker_id = w.id AND lc.tenant_id = $1
         AND lc.status NOT IN ('APPROVED','CLOSED','resolved')
       WHERE (w.tenant_id = $1 OR w.tenant_id IS NULL)
         AND (w.worker_status IS NULL OR w.worker_status != 'Archived')
       LIMIT 200`,
      [tenantId],
    );

    let notReady = 0, inProgress = 0, readyForSubmission = 0, criticalRisks = 0;
    const topActions: Array<{ workerId: string; workerName: string; action: string; priority: number }> = [];
    const breakdown: Array<{ workerId: string; workerName: string; readiness: string; completeness: number; riskLevel: string; topAction: string }> = [];

    for (const { id } of workers) {
      try {
        const r = await analyzeCaseIntelligence(id, tenantId);
        if (r.readiness === "NOT_READY") notReady++;
        else if (r.readiness === "IN_PROGRESS") inProgress++;
        else readyForSubmission++;

        const crit = r.risks.filter((rk: any) => rk.severity === "CRITICAL").length;
        criticalRisks += crit;

        if (r.nextActions[0]) {
          topActions.push({ workerId: id, workerName: r.workerName, action: r.nextActions[0].action, priority: r.nextActions[0].priority });
        }

        breakdown.push({
          workerId: id, workerName: r.workerName,
          readiness: r.readiness, completeness: r.completenessScore,
          riskLevel: r.overallRiskLevel, topAction: r.nextActions[0]?.action ?? "None",
        });
      } catch { /* skip */ }
    }

    topActions.sort((a, b) => a.priority - b.priority);
    breakdown.sort((a, b) => a.completeness - b.completeness);

    res.json({
      batch: {
        totalWorkers: workers.length,
        notReady, inProgress, readyForSubmission, criticalRisks,
        topActions: topActions.slice(0, 20),
        workerBreakdown: breakdown.slice(0, 50),
        computedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Batch failed" });
  }
});

export default router;
