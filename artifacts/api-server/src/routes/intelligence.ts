import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { getIntelligenceOverview, getRejectionPatterns, getVoivodeshipInsights } from "../services/cross-worker-intelligence.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

router.get("/v1/intelligence/overview", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try { res.json(await getIntelligenceOverview(req.tenantId!)); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/intelligence/rejections", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try { res.json({ insights: await getRejectionPatterns(req.tenantId!) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/intelligence/voivodeships", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try { res.json({ insights: await getVoivodeshipInsights(req.tenantId!) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
