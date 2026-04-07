import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { extractEvidenceFacts, getExtractionResult } from "../services/legal-evidence-ocr.service.js";
import { queryOne } from "../lib/db.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/v1/legal/evidence/:id/extract — run OCR on an existing evidence record
router.post("/v1/legal/evidence/:id/extract", requireAuth, requireRole("Admin", "Executive", "LegalHead"), upload.single("file"), async (req, res) => {
  try {
    const evidenceId = req.params.id as string;

    // Verify evidence exists
    const evidence = await queryOne<any>(
      "SELECT id, tenant_id FROM legal_evidence WHERE id = $1",
      [evidenceId]
    );
    if (!evidence) return res.status(404).json({ error: "Evidence record not found" });

    // File can come from multipart upload or already be stored
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: "File upload required. Send as multipart with field name 'file'." });
    }

    const result = await extractEvidenceFacts(file.buffer, file.mimetype, evidenceId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Extraction failed" });
  }
});

// GET /api/v1/legal/evidence/:id/extraction — get extraction results
router.get("/v1/legal/evidence/:id/extraction", requireAuth, async (req, res) => {
  try {
    const result = await getExtractionResult(req.params.id as string);
    if (!result) return res.status(404).json({ error: "Evidence not found" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch extraction" });
  }
});

export default router;
