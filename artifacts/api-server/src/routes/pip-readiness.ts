import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { calculatePIPReadiness } from "../services/pip-readiness.service.js";
import { generateComplianceSummary } from "../services/ai/index.js";

const router = Router();

// GET /api/pip-readiness — calculate PIP inspection readiness score
router.get("/pip-readiness", requireAuth, async (req, res) => {
  try {
    const result = await calculatePIPReadiness(req.tenantId!);

    // Optionally enhance with AI summary
    let aiSummary = null;
    try {
      aiSummary = await generateComplianceSummary({
        score: result.score,
        riskLevel: result.riskLevel,
        expiredCount: result.counts.expired,
        criticalCount: result.counts.critical,
        warningCount: result.counts.warning,
        missingCount: result.counts.missing,
        topRisks: result.topRisks.map(r => r.description),
        totalWorkers: result.totalWorkers,
      });
    } catch { /* AI is optional */ }

    res.json({
      ...result,
      aiSummary: aiSummary ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to calculate PIP readiness" });
  }
});

export default router;
