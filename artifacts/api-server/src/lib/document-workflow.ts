import { query, queryOne, execute } from "./db.js";
import { logGdprAction } from "./gdpr.js";
import { storeFile, getFileUrl } from "./file-storage.js";

export type WorkflowStatus = "uploaded" | "under_review" | "approved" | "rejected" | "expired" | "resubmit_requested";

export interface DocumentWorkflow {
  id: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  documentType: string;
  status: WorkflowStatus;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  expiryDate: string | null;
  uploadedBy: string;
  uploadedAt: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  rejectionReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: any): DocumentWorkflow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workerId: row.worker_id,
    workerName: row.worker_name,
    documentType: row.document_type,
    status: row.status,
    filePath: row.file_path,
    fileName: row.file_name,
    fileSize: row.file_size ? Number(row.file_size) : null,
    mimeType: row.mime_type,
    expiryDate: row.expiry_date ? new Date(row.expiry_date).toISOString().split("T")[0] : null,
    uploadedBy: row.uploaded_by,
    uploadedAt: new Date(row.uploaded_at).toISOString(),
    reviewerName: row.reviewer_name,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    reviewComment: row.review_comment,
    rejectionReason: row.rejection_reason,
    version: Number(row.version ?? 1),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// ── Upload a document ──────────────────────────────────────────────────────

export async function uploadDocument(params: {
  tenantId: string;
  workerId: string;
  workerName: string;
  documentType: string;
  expiryDate?: string;
  uploadedBy: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<DocumentWorkflow> {
  // Store file via S3/local abstraction
  const stored = await storeFile({
    tenantId: params.tenantId,
    category: "documents",
    fileName: params.fileName,
    buffer: params.fileBuffer,
    mimeType: params.mimeType,
  });
  const filePath = stored.key;

  // Check if there's a previous version
  const existing = await queryOne<{ id: string; version: number }>(
    `SELECT id, version FROM document_workflows
     WHERE worker_id = $1 AND tenant_id = $2 AND document_type = $3 AND status != 'rejected'
     ORDER BY version DESC LIMIT 1`,
    [params.workerId, params.tenantId, params.documentType]
  );

  const version = existing ? existing.version + 1 : 1;

  const row = await queryOne(
    `INSERT INTO document_workflows
     (tenant_id, worker_id, worker_name, document_type, status, file_path, file_name, file_size, mime_type, expiry_date, uploaded_by, version, previous_version_id)
     VALUES ($1, $2, $3, $4, 'uploaded', $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      params.tenantId, params.workerId, params.workerName, params.documentType,
      filePath, params.fileName, params.fileBuffer.length, params.mimeType,
      params.expiryDate ?? null, params.uploadedBy, version, existing?.id ?? null,
    ]
  );

  return mapRow(row!);
}

// ── Submit for review ──────────────────────────────────────────────────────

export async function submitForReview(docId: string, tenantId: string): Promise<DocumentWorkflow> {
  const row = await queryOne(
    `UPDATE document_workflows SET status = 'under_review', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'uploaded'
     RETURNING *`,
    [docId, tenantId]
  );
  if (!row) throw new Error("Document not found or not in 'uploaded' status");
  return mapRow(row);
}

// ── Approve ────────────────────────────────────────────────────────────────

export async function approveDocument(params: {
  docId: string;
  tenantId: string;
  reviewerName: string;
  comment?: string;
}): Promise<DocumentWorkflow> {
  const row = await queryOne(
    `UPDATE document_workflows
     SET status = 'approved', reviewer_name = $3, reviewed_at = NOW(), review_comment = $4, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status IN ('uploaded', 'under_review')
     RETURNING *`,
    [params.docId, params.tenantId, params.reviewerName, params.comment ?? null]
  );
  if (!row) throw new Error("Document not found or not in reviewable status");
  return mapRow(row);
}

// ── Reject ─────────────────────────────────────────────────────────────────

export async function rejectDocument(params: {
  docId: string;
  tenantId: string;
  reviewerName: string;
  reason: string;
}): Promise<DocumentWorkflow> {
  const row = await queryOne(
    `UPDATE document_workflows
     SET status = 'rejected', reviewer_name = $3, reviewed_at = NOW(), rejection_reason = $4, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status IN ('uploaded', 'under_review')
     RETURNING *`,
    [params.docId, params.tenantId, params.reviewerName, params.reason]
  );
  if (!row) throw new Error("Document not found or not in reviewable status");
  return mapRow(row);
}

// ── Request resubmission ───────────────────────────────────────────────────

export async function requestResubmission(params: {
  docId: string;
  tenantId: string;
  reviewerName: string;
  reason: string;
}): Promise<DocumentWorkflow> {
  const row = await queryOne(
    `UPDATE document_workflows
     SET status = 'resubmit_requested', reviewer_name = $3, reviewed_at = NOW(), rejection_reason = $4, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status IN ('uploaded', 'under_review')
     RETURNING *`,
    [params.docId, params.tenantId, params.reviewerName, params.reason]
  );
  if (!row) throw new Error("Document not found or not in reviewable status");
  return mapRow(row);
}

// ── Query functions ────────────────────────────────────────────────────────

export async function getWorkflowsByWorker(workerId: string, tenantId: string): Promise<DocumentWorkflow[]> {
  const rows = await query(
    `SELECT * FROM document_workflows WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
    [workerId, tenantId]
  );
  return rows.map(mapRow);
}

export async function getWorkflowById(docId: string, tenantId: string): Promise<DocumentWorkflow | null> {
  const row = await queryOne(
    "SELECT * FROM document_workflows WHERE id = $1 AND tenant_id = $2",
    [docId, tenantId]
  );
  return row ? mapRow(row) : null;
}

export async function getPendingReviews(tenantId: string): Promise<DocumentWorkflow[]> {
  const rows = await query(
    `SELECT * FROM document_workflows WHERE tenant_id = $1 AND status IN ('uploaded', 'under_review')
     ORDER BY uploaded_at ASC`,
    [tenantId]
  );
  return rows.map(mapRow);
}

export async function getWorkflowStats(tenantId: string): Promise<Record<string, number>> {
  const rows = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text as count FROM document_workflows WHERE tenant_id = $1 GROUP BY status`,
    [tenantId]
  );
  const stats: Record<string, number> = { uploaded: 0, under_review: 0, approved: 0, rejected: 0, resubmit_requested: 0 };
  for (const r of rows) stats[r.status] = parseInt(r.count, 10);
  return stats;
}

export async function getExpiringDocuments(tenantId: string, daysAhead = 60): Promise<DocumentWorkflow[]> {
  const rows = await query(
    `SELECT * FROM document_workflows
     WHERE tenant_id = $1 AND status = 'approved' AND expiry_date IS NOT NULL
     AND expiry_date <= CURRENT_DATE + $2 * INTERVAL '1 day'
     ORDER BY expiry_date ASC`,
    [tenantId, daysAhead]
  );
  return rows.map(mapRow);
}
