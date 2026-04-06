import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { explainCase, getExplanationHistory, type ExplanationAudience } from "../services/legal-ai-explanation.service.js";

const router = Router();

const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

// POST /api/v1/legal/explain — generate a new explanation
router.post("/v1/legal/explain", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { workerId, audience } = req.body as { workerId?: string; audience?: string };
    if (!workerId) return res.status(400).json({ error: "workerId is required" });
    if (!audience || !["internal", "worker"].includes(audience)) {
      return res.status(400).json({ error: "audience must be 'internal' or 'worker'" });
    }

    const result = await explainCase({
      workerId,
      tenantId: req.tenantId!,
      audience: audience as ExplanationAudience,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate explanation" });
  }
});

// GET /api/v1/legal/explain/:workerId — get explanation history
router.get("/v1/legal/explain/:workerId", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const audience = (req.query.audience as string) || undefined;
    if (audience && !["internal", "worker"].includes(audience)) {
      return res.status(400).json({ error: "audience must be 'internal' or 'worker'" });
    }
    const history = await getExplanationHistory(
      req.params.workerId as string,
      req.tenantId!,
      audience as ExplanationAudience | undefined,
    );
    res.json({ history, count: history.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch explanation history" });
  }
});

export default router;
