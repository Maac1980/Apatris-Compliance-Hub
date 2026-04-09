import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { getSystemHealth } from "../services/system-health.service.js";

const router = Router();

router.get("/v1/system/health", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const health = await getSystemHealth(req.tenantId!);
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
