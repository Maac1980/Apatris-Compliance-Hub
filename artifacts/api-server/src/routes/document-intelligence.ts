/**
 * Document Intelligence Routes — structured document extraction.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  extractStructuredDocumentData,
  getFieldDefinitions,
  type DocumentType,
} from "../services/document-intelligence.service.js";

const router = Router();
const VIEW = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"];

// POST /api/v1/document-intelligence/extract
router.post("/v1/document-intelligence/extract", requireAuth, requireRole(...VIEW), async (req, res) => {
  try {
    const { fileName, documentType } = req.body as { fileName?: string; documentType?: DocumentType };
    if (!fileName) return res.status(400).json({ error: "fileName is required" });

    const result = extractStructuredDocumentData({ fileName, documentType });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Extraction failed" });
  }
});

// GET /api/v1/document-intelligence/fields/:type
router.get("/v1/document-intelligence/fields/:type", requireAuth, async (req, res) => {
  const docType = (req.params.type ?? "UNKNOWN").toUpperCase() as DocumentType;
  const fields = getFieldDefinitions(docType);
  res.json({ document_type: docType, fields });
});

export default router;
