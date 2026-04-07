import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { getWorkerActions, executeAction, executePackage } from "../services/action-engine.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

// GET /api/v1/actions/worker/:id — get all actions for a worker
router.get("/v1/actions/worker/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const result = await getWorkerActions(req.params.id as string, req.tenantId!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/actions/execute — execute a single action
router.post("/v1/actions/execute", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { workerId, actionId } = req.body as { workerId?: string; actionId?: string };
    if (!workerId || !actionId) return res.status(400).json({ error: "workerId and actionId required" });
    const result = await executeAction(workerId, req.tenantId!, actionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/actions/package/execute — execute all actions in a package
router.post("/v1/actions/package/execute", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { workerId, packageId } = req.body as { workerId?: string; packageId?: string };
    if (!workerId || !packageId) return res.status(400).json({ error: "workerId and packageId required" });
    const result = await executePackage(workerId, req.tenantId!, packageId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
