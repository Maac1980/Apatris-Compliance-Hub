/**
 * Worker Files — working documents per worker + action logging.
 *
 * POST   /api/workers/:id/files — upload file
 * GET    /api/workers/:id/files — list files
 * DELETE /api/workers/:id/files/:fileId — delete file
 * PATCH  /api/workers/:id/files/:fileId — update metadata
 * PATCH  /api/workers/:id/files/:fileId/status — update status
 * POST   /api/workers/:id/doc-log — log a document action
 * GET    /api/workers/:id/doc-log — get action log for worker
 */

import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { storeFile, deleteFile, getFileUrl } from "../lib/file-storage.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const FILE_ROLES = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"];

const VALID_DOC_TYPES = [
  "passport", "permit", "filing_proof", "upo", "mos",
  "rejection_letter", "insurance", "bank_statement",
  "contract", "certificate", "supporting", "miscellaneous",
];

const VALID_STATUSES = ["uploaded", "draft", "generated", "reviewed", "sent"];

// ── Helper: log document action ─────────────────────────────────────────
async function logDocAction(tenantId: string, workerId: string | null, documentId: string | null, documentType: string | null, action: string, actor: string, metadata?: any) {
  try {
    await execute(
      `INSERT INTO document_action_log (tenant_id, worker_id, document_id, document_type, action, actor, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, workerId, documentId, documentType, action, actor, metadata ? JSON.stringify(metadata) : null]
    );
  } catch { /* logging must never break the main flow */ }
}

// POST /api/workers/:id/files — upload file
router.post("/workers/:id/files", requireAuth, requireRole(...FILE_ROLES), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { docType, notes, tags, caseId } = req.body as {
      docType?: string; notes?: string; tags?: string; caseId?: string;
    };
    const resolvedType = VALID_DOC_TYPES.includes(docType ?? "") ? docType : "miscellaneous";

    const stored = await storeFile({
      tenantId: req.tenantId!,
      category: "worker-files",
      fileName: req.file.originalname,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });

    const row = await queryOne<any>(
      `INSERT INTO worker_files (tenant_id, worker_id, case_id, file_key, file_name, file_size, mime_type, doc_type, status, notes, tags, source, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'uploaded',$9,$10,'uploaded',$11) RETURNING *`,
      [req.tenantId, req.params.id, caseId ?? null, stored.key, req.file.originalname,
       req.file.size, req.file.mimetype, resolvedType, notes ?? null, tags ?? null,
       req.user?.name ?? "unknown"]
    );

    await logDocAction(req.tenantId!, req.params.id, row!.id, resolvedType!, "DOCUMENT_UPLOADED", req.user?.name ?? "unknown", { fileName: req.file.originalname, fileSize: req.file.size });

    res.status(201).json({ ...row, url: stored.url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

// GET /api/workers/:id/files — list worker's files
router.get("/workers/:id/files", requireAuth, async (req, res) => {
  try {
    const rows = await query<any>(
      "SELECT * FROM worker_files WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [req.params.id, req.tenantId]
    );
    const files = rows.map((r: any) => ({ ...r, url: getFileUrl(r.file_key) }));
    res.json({ files, count: files.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/workers/:id/files/:fileId — update metadata
router.patch("/workers/:id/files/:fileId", requireAuth, requireRole(...FILE_ROLES), async (req, res) => {
  try {
    const { notes, tags, docType, caseId } = req.body as {
      notes?: string; tags?: string; docType?: string; caseId?: string;
    };
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (notes !== undefined) { updates.push(`notes = $${idx++}`); values.push(notes); }
    if (tags !== undefined) { updates.push(`tags = $${idx++}`); values.push(tags); }
    if (docType && VALID_DOC_TYPES.includes(docType)) { updates.push(`doc_type = $${idx++}`); values.push(docType); }
    if (caseId !== undefined) { updates.push(`case_id = $${idx++}`); values.push(caseId || null); }

    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    values.push(req.params.fileId, req.params.id, req.tenantId);
    const row = await queryOne<any>(
      `UPDATE worker_files SET ${updates.join(", ")} WHERE id = $${idx} AND worker_id = $${idx + 1} AND tenant_id = $${idx + 2} RETURNING *`,
      values
    );
    if (!row) return res.status(404).json({ error: "File not found" });
    res.json({ ...row, url: getFileUrl(row.file_key) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/workers/:id/files/:fileId/status — update document status
router.patch("/workers/:id/files/:fileId/status", requireAuth, requireRole(...FILE_ROLES), async (req, res) => {
  try {
    const { status } = req.body as { status?: string };
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    const row = await queryOne<any>(
      "UPDATE worker_files SET status = $1 WHERE id = $2 AND worker_id = $3 AND tenant_id = $4 RETURNING *",
      [status, req.params.fileId, req.params.id, req.tenantId]
    );
    if (!row) return res.status(404).json({ error: "File not found" });
    await logDocAction(req.tenantId!, req.params.id, req.params.fileId, row.doc_type, `STATUS_CHANGED_TO_${status.toUpperCase()}`, req.user?.name ?? "unknown");
    res.json({ ...row, url: getFileUrl(row.file_key) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// DELETE /api/workers/:id/files/:fileId — delete file
router.delete("/workers/:id/files/:fileId", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const file = await queryOne<any>(
      "SELECT * FROM worker_files WHERE id = $1 AND worker_id = $2 AND tenant_id = $3",
      [req.params.fileId, req.params.id, req.tenantId]
    );
    if (!file) return res.status(404).json({ error: "File not found" });

    await deleteFile(file.file_key);
    await execute("DELETE FROM worker_files WHERE id = $1", [req.params.fileId]);
    await logDocAction(req.tenantId!, req.params.id, req.params.fileId, file.doc_type, "DOCUMENT_DELETED", req.user?.name ?? "unknown", { fileName: file.file_name });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/workers/:id/doc-log — log a document action (generic)
router.post("/workers/:id/doc-log", requireAuth, async (req, res) => {
  try {
    const { documentId, documentType, action, metadata } = req.body as {
      documentId?: string; documentType?: string; action?: string; metadata?: any;
    };
    if (!action) return res.status(400).json({ error: "action is required" });

    await logDocAction(req.tenantId!, req.params.id, documentId ?? null, documentType ?? null, action, req.user?.name ?? "unknown", metadata);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/workers/:id/doc-log — get action log for worker
router.get("/workers/:id/doc-log", requireAuth, async (req, res) => {
  try {
    const rows = await query<any>(
      "SELECT * FROM document_action_log WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 100",
      [req.params.id, req.tenantId]
    );
    res.json({ logs: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
