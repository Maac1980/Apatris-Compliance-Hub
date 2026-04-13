import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  generateDocumentForStage, getDraftDocuments, getAllGeneratedDocs, getDocsByCaseId,
  approveDocument, rejectDocument, updateDocumentContent, markDocumentSent, getReviewQueueStats,
} from "../services/case-doc-generator.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

// GET /api/v1/vault/docs/queue — pending drafts for review
router.get("/v1/vault/docs/queue", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const docs = await getDraftDocuments(req.tenantId!);
    res.json({ docs, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/vault/docs/stats — review queue stats
router.get("/v1/vault/docs/stats", requireAuth, async (req, res) => {
  try {
    const stats = await getReviewQueueStats(req.tenantId!);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/vault/docs — all generated docs
router.get("/v1/vault/docs", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const docs = await getAllGeneratedDocs(req.tenantId!, limit);
    res.json({ docs, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/vault/docs/case/:caseId — docs for a specific case
router.get("/v1/vault/docs/case/:caseId", requireAuth, async (req, res) => {
  try {
    const docs = await getDocsByCaseId(req.params.caseId as string, req.tenantId!);
    res.json({ docs, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/docs/generate — manually trigger document generation
router.post("/v1/vault/docs/generate", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { caseId, stage } = req.body as { caseId?: string; stage?: string };
    if (!caseId || !stage) return res.status(400).json({ error: "caseId and stage required" });
    const doc = await generateDocumentForStage(caseId, req.tenantId!, stage);
    if (!doc) return res.status(404).json({ error: "No document template for this stage" });
    res.status(201).json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/docs/:id/approve
router.post("/v1/vault/docs/:id/approve", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { notes } = req.body as { notes?: string };
    const doc = await approveDocument(req.params.id as string, req.tenantId!, (req as any).user?.email || "unknown", notes);
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/docs/:id/reject
router.post("/v1/vault/docs/:id/reject", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { notes } = req.body as { notes?: string };
    if (!notes) return res.status(400).json({ error: "rejection notes required" });
    const doc = await rejectDocument(req.params.id as string, req.tenantId!, (req as any).user?.email || "unknown", notes);
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/v1/vault/docs/:id — edit document content
router.patch("/v1/vault/docs/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { contentPl, contentEn } = req.body as { contentPl?: string; contentEn?: string };
    if (!contentPl || !contentEn) return res.status(400).json({ error: "contentPl and contentEn required" });
    const doc = await updateDocumentContent(req.params.id as string, req.tenantId!, contentPl, contentEn);
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/docs/:id/send — mark as sent
router.post("/v1/vault/docs/:id/send", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { sentTo } = req.body as { sentTo?: string };
    if (!sentTo) return res.status(400).json({ error: "sentTo required" });
    const doc = await markDocumentSent(req.params.id as string, req.tenantId!, sentTo);
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
