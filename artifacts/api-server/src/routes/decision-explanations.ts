/**
 * Decision Explanation Routes — generate structured explanations
 * from existing system outputs. Read-only interpretation layer.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  explainLegalBriefDecision,
  explainCaseDecision,
  explainReadinessDecision,
  explainRegulatoryDecision,
} from "../services/decision-explanation.service.js";

const router = Router();
const VIEW = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"];

// POST /api/v1/decision-explanations/legal-brief
router.post("/v1/decision-explanations/legal-brief", requireAuth, requireRole(...VIEW), async (req, res) => {
  try {
    const explanation = explainLegalBriefDecision(req.body);
    res.json({ explanation });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate explanation" });
  }
});

// POST /api/v1/decision-explanations/case
router.post("/v1/decision-explanations/case", requireAuth, requireRole(...VIEW), async (req, res) => {
  try {
    const explanation = explainCaseDecision(req.body);
    res.json({ explanation });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate explanation" });
  }
});

// POST /api/v1/decision-explanations/readiness
router.post("/v1/decision-explanations/readiness", requireAuth, requireRole(...VIEW), async (req, res) => {
  try {
    const explanation = explainReadinessDecision(req.body);
    res.json({ explanation });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate explanation" });
  }
});

// POST /api/v1/decision-explanations/regulatory
router.post("/v1/decision-explanations/regulatory", requireAuth, requireRole(...VIEW), async (req, res) => {
  try {
    const explanation = explainRegulatoryDecision(req.body);
    res.json({ explanation });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate explanation" });
  }
});

export default router;
