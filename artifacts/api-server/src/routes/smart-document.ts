import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../lib/auth-middleware.js";
import { processSmartDocument } from "../services/smart-document.service.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// POST /api/v1/smart-document/process — drop any document, get structured extraction + worker match
router.post("/v1/smart-document/process", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "File required" });
    const result = await processSmartDocument(file.buffer, file.mimetype, req.tenantId!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Processing failed" });
  }
});

export default router;
