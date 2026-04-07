import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { askLegalCopilot } from "../services/legal-copilot.service.js";

const router = Router();

// POST /api/v1/legal/copilot/ask — ask a contextual question about a worker
router.post("/v1/legal/copilot/ask", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { workerId, question } = req.body as { workerId?: string; question?: string };
    if (!workerId) return res.status(400).json({ error: "workerId is required" });
    if (!question || question.trim().length < 3) return res.status(400).json({ error: "question is required" });

    const result = await askLegalCopilot(workerId, req.tenantId!, question.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Copilot failed" });
  }
});

export default router;
