import { query, queryOne, execute } from "./db.js";

export type ComplianceStatus = "GREEN" | "YELLOW" | "RED" | "EXPIRED";

export interface DocumentRecord {
  id: string;
  workerName: string;
  workerId: string;
  documentType: string;
  issueDate: string;
  expiryDate: string;
  daysUntilExpiry: number;
  status: ComplianceStatus;
}

function computeStatus(expiryDate: string): { daysUntilExpiry: number; status: ComplianceStatus } {
  if (!expiryDate) return { daysUntilExpiry: -999, status: "EXPIRED" };
  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime())) return { daysUntilExpiry: -999, status: "EXPIRED" };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  const days = Math.round((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  let status: ComplianceStatus;
  if (days < 0) status = "EXPIRED";
  else if (days <= 30) status = "RED";
  else if (days <= 60) status = "YELLOW";
  else status = "GREEN";
  return { daysUntilExpiry: days, status };
}

function mapRow(row: any): DocumentRecord {
  const expiryDate = row.expiry_date ? new Date(row.expiry_date).toISOString().split("T")[0] : "";
  const { daysUntilExpiry, status } = computeStatus(expiryDate);
  return {
    id: row.id,
    workerName: row.worker_name,
    workerId: row.worker_id ?? "",
    documentType: row.document_type,
    issueDate: row.issue_date ? new Date(row.issue_date).toISOString().split("T")[0] : "",
    expiryDate,
    daysUntilExpiry,
    status,
  };
}

export async function fetchDocuments(tenantId: string): Promise<DocumentRecord[]> {
  const rows = await query("SELECT * FROM documents WHERE tenant_id = $1 ORDER BY expiry_date ASC", [tenantId]);
  return rows.map(mapRow);
}

/** Validate that expiry date is not before issue date */
function validateDateOrder(issueDate?: string | null, expiryDate?: string | null): void {
  if (issueDate && expiryDate) {
    const issue = new Date(issueDate);
    const expiry = new Date(expiryDate);
    if (!isNaN(issue.getTime()) && !isNaN(expiry.getTime()) && expiry < issue) {
      throw new Error(`Expiry date (${expiryDate}) cannot be before issue date (${issueDate}).`);
    }
  }
}

export async function createDocument(fields: {
  workerName: string;
  workerId?: string;
  documentType: string;
  issueDate?: string;
  expiryDate: string;
}, tenantId: string): Promise<DocumentRecord> {
  validateDateOrder(fields.issueDate, fields.expiryDate);
  const row = await queryOne(
    `INSERT INTO documents (tenant_id, worker_name, worker_id, document_type, issue_date, expiry_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      tenantId,
      fields.workerName,
      fields.workerId ?? "",
      fields.documentType,
      fields.issueDate ?? null,
      fields.expiryDate,
    ]
  );
  return mapRow(row);
}

export async function updateDocument(
  id: string,
  fields: Partial<{ workerName: string; workerId: string; documentType: string; issueDate: string; expiryDate: string }>,
  tenantId: string
): Promise<DocumentRecord> {
  // If updating dates, validate the pair (fetch existing if only one date is changing)
  if (fields.issueDate !== undefined || fields.expiryDate !== undefined) {
    const existing = await queryOne<{ issue_date: string | null; expiry_date: string | null }>(
      "SELECT issue_date, expiry_date FROM documents WHERE id = $1 AND tenant_id = $2",
      [id, tenantId]
    );
    const finalIssue = fields.issueDate !== undefined ? fields.issueDate : (existing?.issue_date ?? null);
    const finalExpiry = fields.expiryDate !== undefined ? fields.expiryDate : (existing?.expiry_date ?? null);
    validateDateOrder(finalIssue, finalExpiry);
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (fields.workerName !== undefined) { setClauses.push(`worker_name = $${idx++}`); params.push(fields.workerName); }
  if (fields.workerId !== undefined) { setClauses.push(`worker_id = $${idx++}`); params.push(fields.workerId); }
  if (fields.documentType !== undefined) { setClauses.push(`document_type = $${idx++}`); params.push(fields.documentType); }
  if (fields.issueDate !== undefined) { setClauses.push(`issue_date = $${idx++}`); params.push(fields.issueDate || null); }
  if (fields.expiryDate !== undefined) { setClauses.push(`expiry_date = $${idx++}`); params.push(fields.expiryDate); }

  if (setClauses.length === 0) {
    const row = await queryOne("SELECT * FROM documents WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
    if (!row) throw new Error("Document not found");
    return mapRow(row);
  }

  params.push(id);
  const idIdx = idx;
  idx++;
  params.push(tenantId);
  const row = await queryOne(
    `UPDATE documents SET ${setClauses.join(", ")} WHERE id = $${idIdx} AND tenant_id = $${idx} RETURNING *`,
    params
  );
  if (!row) throw new Error("Document not found");
  return mapRow(row);
}

export async function deleteDocument(id: string, tenantId: string): Promise<void> {
  await execute("DELETE FROM documents WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
}
