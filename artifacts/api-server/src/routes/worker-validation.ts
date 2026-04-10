/**
 * Worker Cross-System Validation API
 *
 * GET /api/v1/workers/:id/validate — run full consistency check
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { validateWorker } from "../services/worker-validation.service.js";

const router = Router();

router.get("/v1/workers/:id/validate", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"), async (req, res) => {
  try {
    const result = await validateWorker(req.params.id, req.tenantId!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Validation failed" });
  }
});

export default router;
