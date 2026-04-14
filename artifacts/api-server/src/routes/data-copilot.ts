import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { askCopilot } from "../services/data-copilot.service.js";
import { execute } from "../lib/db.js";

const router = Router();

// POST /api/v1/copilot/ask — natural language query to real data
router.post("/v1/copilot/ask", requireAuth, async (req, res) => {
  try {
    const { question } = req.body as { question?: string };
    if (!question?.trim()) return res.status(400).json({ error: "question required" });

    const result = await askCopilot(question, req.tenantId!);

    // Log query for analytics
    try {
      await execute(
        "INSERT INTO legal_queries (tenant_id, user_id, question, answer, sources_used, language) VALUES ($1,$2,$3,$4,$5,'en')",
        [req.tenantId!, (req as any).user?.email ?? "unknown", question, result.answer.slice(0, 2000), JSON.stringify({ dataSource: result.dataSource })]
      );
    } catch { /* non-blocking */ }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
