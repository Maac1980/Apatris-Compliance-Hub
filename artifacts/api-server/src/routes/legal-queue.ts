import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { getLegalQueue } from "../services/legal-queue.service.js";

const router = Router();

// GET /api/v1/legal/queue — prioritized execution queue
router.get("/v1/legal/queue", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const queue = await getLegalQueue(req.tenantId!);
    res.json(queue);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch legal queue" });
  }
});

export default router;
