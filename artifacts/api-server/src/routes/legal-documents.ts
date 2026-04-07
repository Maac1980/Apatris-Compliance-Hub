import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  generateDocument, getDocumentsByWorker, getDocument, approveDocument,
  suggestDocuments, type TemplateType,
} from "../services/legal-document.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];
const VALID_TYPES: TemplateType[] = ["TRC_APPLICATION", "POWER_OF_ATTORNEY", "COVER_LETTER", "WORK_PERMIT_A", "APPEAL", "COMPLAINT", "FILE_INSPECTION"];

// GET /api/v1/legal/documents/suggest/:workerId — auto-suggest documents
router.get("/v1/legal/documents/suggest/:workerId", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const suggestions = await suggestDocuments(req.params.id as string ?? req.params.workerId as string, req.tenantId!);
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/legal/documents/generate — generate a document from template
router.post("/v1/legal/documents/generate", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { workerId, templateType, legalCaseId, language, overrides } = req.body as {
      workerId?: string; templateType?: string; legalCaseId?: string; language?: string; overrides?: Record<string, string>;
    };
    if (!workerId) return res.status(400).json({ error: "workerId required" });
    if (!templateType || !VALID_TYPES.includes(templateType as TemplateType)) {
      return res.status(400).json({ error: `templateType must be: ${VALID_TYPES.join(", ")}` });
    }

    const doc = await generateDocument({
      workerId, tenantId: req.tenantId!, templateType: templateType as TemplateType,
      legalCaseId, language, overrides,
      createdBy: (req as any).adminEmail ?? "system",
    });
    res.status(201).json({ document: doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate document" });
  }
});

// GET /api/v1/legal/documents/worker/:workerId — list worker's documents
router.get("/v1/legal/documents/worker/:workerId", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const docs = await getDocumentsByWorker(req.params.workerId as string, req.tenantId!);
    res.json({ documents: docs, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/legal/documents/:id — get single document with HTML
router.get("/v1/legal/documents/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const doc = await getDocument(req.params.id as string, req.tenantId!);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json({ document: doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/legal/documents/:id/html — render HTML for print/preview
router.get("/v1/legal/documents/:id/html", requireAuth, async (req, res) => {
  try {
    const doc = await getDocument(req.params.id as string, req.tenantId!);
    if (!doc || !doc.rendered_html) return res.status(404).json({ error: "Not found" });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(doc.rendered_html);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/legal/documents/:id/approve — approve document
router.post("/v1/legal/documents/:id/approve", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const approvedBy = (req as any).adminEmail ?? "system";
    const doc = await approveDocument(req.params.id as string, req.tenantId!, approvedBy);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json({ document: doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
