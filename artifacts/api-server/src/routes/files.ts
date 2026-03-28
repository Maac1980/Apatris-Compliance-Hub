import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { getFile, LOCAL_UPLOAD_DIR } from "../lib/file-storage.js";
import path from "path";
import fs from "fs";

const router = Router();

// GET /api/files/:key(*) — serve a stored file (local mode)
router.get("/files/*", requireAuth, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params[0] || "");
    if (!key) return res.status(400).json({ error: "File key required" });

    // Security: prevent path traversal
    const resolved = path.resolve(LOCAL_UPLOAD_DIR, key);
    if (!resolved.startsWith(LOCAL_UPLOAD_DIR)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const buffer = await getFile(key);
    if (!buffer) return res.status(404).json({ error: "File not found" });

    // Guess content type from extension
    const ext = path.extname(key).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };

    res.setHeader("Content-Type", mimeTypes[ext] ?? "application/octet-stream");
    res.setHeader("Content-Length", buffer.length.toString());
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "File retrieval failed" });
  }
});

export default router;
