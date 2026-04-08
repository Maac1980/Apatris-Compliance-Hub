import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { getWorkerRiskForecast, getRiskOverview } from "../services/predictive-risk.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

// GET /api/v1/risk/worker/:id — individual worker risk forecast
router.get("/v1/risk/worker/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const forecast = await getWorkerRiskForecast(req.params.id as string, req.tenantId!);
    res.json(forecast);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/risk/overview — global risk dashboard
router.get("/v1/risk/overview", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const overview = await getRiskOverview(req.tenantId!);
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
