import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  classifyRejection, generateRejectionDraft,
  getAnalysesByWorker, getAnalysisById,
} from "../services/rejection-intelligence.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

// POST /api/v1/legal/rejections/analyze — classify a rejection
router.post("/v1/legal/rejections/analyze", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { workerId, caseId, rejectionText } = req.body as {
      workerId?: string; caseId?: string; rejectionText?: string;
    };
    if (!workerId) return res.status(400).json({ error: "workerId is required" });
    if (!rejectionText || rejectionText.trim().length < 5) {
      return res.status(400).json({ error: "rejectionText is required (min 5 chars)" });
    }

    const result = await classifyRejection({
      workerId, caseId, rejectionText, tenantId: req.tenantId!,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to analyze rejection" });
  }
});

// GET /api/v1/legal/rejections/:workerId — list analyses for a worker
router.get("/v1/legal/rejections/:workerId", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const analyses = await getAnalysesByWorker(req.params.workerId as string, req.tenantId!);
    res.json({ analyses, count: analyses.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch analyses" });
  }
});

// GET /api/v1/legal/rejections/analysis/:id — get single analysis
router.get("/v1/legal/rejections/analysis/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const analysis = await getAnalysisById(req.params.id as string, req.tenantId!);
    if (!analysis) return res.status(404).json({ error: "Analysis not found" });
    res.json({ analysis });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch analysis" });
  }
});

// POST /api/v1/legal/rejections/draft — generate internal draft from analysis
router.post("/v1/legal/rejections/draft", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { workerId, analysisId } = req.body as { workerId?: string; analysisId?: string };
    if (!workerId || !analysisId) {
      return res.status(400).json({ error: "workerId and analysisId are required" });
    }
    const draft = await generateRejectionDraft(workerId, analysisId, req.tenantId!);
    res.status(201).json(draft);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate draft" });
  }
});

export default router;
