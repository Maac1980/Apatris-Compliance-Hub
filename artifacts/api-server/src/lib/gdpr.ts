import { query, queryOne, execute } from "./db.js";

// ── Consent Types ──────────────────────────────────────────────────────────
export const CONSENT_TYPES = [
  "data_processing",        // Basic processing of personal data (required)
  "document_storage",       // Storage of identity documents
  "gps_tracking",           // GPS location tracking on sites
  "biometric_data",         // Facial recognition / fingerprint
  "payroll_processing",     // Processing financial/payroll data
  "cross_border_transfer",  // Transfer of data to other EU countries
  "marketing_communications", // Non-essential communications
] as const;

export type ConsentType = typeof CONSENT_TYPES[number];

// ── Consent Records ────────────────────────────────────────────────────────

export interface ConsentRecord {
  id: string;
  workerId: string;
  workerName: string;
  consentType: string;
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  version: string;
  createdAt: string;
}

export async function getWorkerConsents(workerId: string, tenantId: string): Promise<ConsentRecord[]> {
  const rows = await query(
    `SELECT * FROM consent_records WHERE worker_id = $1 AND tenant_id = $2 ORDER BY consent_type, created_at DESC`,
    [workerId, tenantId]
  );
  return rows.map(mapConsentRow);
}

export async function grantConsent(params: {
  tenantId: string;
  workerId: string;
  workerName: string;
  consentType: string;
  ipAddress?: string;
  userAgent?: string;
  version?: string;
}): Promise<ConsentRecord> {
  // Revoke any existing consent of this type first
  await execute(
    `UPDATE consent_records SET revoked_at = NOW()
     WHERE worker_id = $1 AND tenant_id = $2 AND consent_type = $3 AND revoked_at IS NULL`,
    [params.workerId, params.tenantId, params.consentType]
  );

  const row = await queryOne(
    `INSERT INTO consent_records (tenant_id, worker_id, worker_name, consent_type, granted, granted_at, ip_address, user_agent, version)
     VALUES ($1, $2, $3, $4, TRUE, NOW(), $5, $6, $7)
     RETURNING *`,
    [params.tenantId, params.workerId, params.workerName, params.consentType,
     params.ipAddress ?? null, params.userAgent ?? null, params.version ?? "1.0"]
  );
  return mapConsentRow(row!);
}

export async function revokeConsent(params: {
  tenantId: string;
  workerId: string;
  consentType: string;
}): Promise<void> {
  await execute(
    `UPDATE consent_records SET revoked_at = NOW(), granted = FALSE
     WHERE worker_id = $1 AND tenant_id = $2 AND consent_type = $3 AND revoked_at IS NULL`,
    [params.workerId, params.tenantId, params.consentType]
  );
}

function mapConsentRow(row: any): ConsentRecord {
  return {
    id: row.id,
    workerId: row.worker_id,
    workerName: row.worker_name,
    consentType: row.consent_type,
    granted: row.granted,
    grantedAt: row.granted_at ? new Date(row.granted_at).toISOString() : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    version: row.version,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ── GDPR Audit Log ─────────────────────────────────────────────────────────

export async function logGdprAction(params: {
  tenantId: string;
  action: string;        // "DATA_ACCESS" | "DATA_EXPORT" | "DATA_DELETION" | "CONSENT_GRANTED" | "CONSENT_REVOKED"
  targetType: string;    // "worker" | "document" | "payroll"
  targetId?: string;
  targetName?: string;
  performedBy: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await execute(
    `INSERT INTO gdpr_log (tenant_id, action, target_type, target_id, target_name, performed_by, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [params.tenantId, params.action, params.targetType, params.targetId ?? null,
     params.targetName ?? null, params.performedBy, params.details ? JSON.stringify(params.details) : null]
  );
}

export async function getGdprLog(tenantId: string, limit = 100): Promise<any[]> {
  return query(
    `SELECT * FROM gdpr_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit]
  );
}

// ── Right to Erasure (Article 17) ──────────────────────────────────────────

export async function eraseWorkerData(workerId: string, tenantId: string, performedBy: string): Promise<{
  tablesAffected: string[];
  recordsDeleted: number;
}> {
  const tablesAffected: string[] = [];
  let recordsDeleted = 0;

  // Get worker name for the log before deletion
  const worker = await queryOne<{ full_name: string }>(
    "SELECT full_name FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  const workerName = worker?.full_name ?? "Unknown";

  // 1. Delete documents
  const docs = await query("DELETE FROM documents WHERE worker_id = $1 AND tenant_id = $2 RETURNING id", [workerId, tenantId]);
  if (docs.length > 0) { tablesAffected.push("documents"); recordsDeleted += docs.length; }

  // 2. Delete consent records
  const consents = await query("DELETE FROM consent_records WHERE worker_id = $1 AND tenant_id = $2 RETURNING id", [workerId, tenantId]);
  if (consents.length > 0) { tablesAffected.push("consent_records"); recordsDeleted += consents.length; }

  // 3. Anonymize hours_log (keep hours data but remove name)
  await execute(
    "UPDATE hours_log SET worker_name = 'REDACTED' WHERE worker_name = $1",
    [workerName]
  );
  tablesAffected.push("hours_log");

  // 4. Anonymize payroll_snapshots (keep financial data but remove name/PII)
  await execute(
    "UPDATE payroll_snapshots SET worker_name = 'REDACTED', worker_id = NULL WHERE worker_id = $1",
    [workerId]
  );
  tablesAffected.push("payroll_snapshots");

  // 5. Anonymize notification_log
  await execute(
    "UPDATE notification_log SET worker_name = 'REDACTED' WHERE worker_name = $1",
    [workerName]
  );
  tablesAffected.push("notification_log");

  // 6. Delete the worker record itself (cascade will handle remaining FKs)
  const deleted = await query("DELETE FROM workers WHERE id = $1 AND tenant_id = $2 RETURNING id", [workerId, tenantId]);
  if (deleted.length > 0) { tablesAffected.push("workers"); recordsDeleted += 1; }

  // 7. Log the erasure action
  await logGdprAction({
    tenantId,
    action: "DATA_DELETION",
    targetType: "worker",
    targetId: workerId,
    targetName: workerName,
    performedBy,
    details: { tablesAffected, recordsDeleted, reason: "Right to erasure (GDPR Article 17)" },
  });

  return { tablesAffected, recordsDeleted };
}

// ── Data Subject Access Request (Article 15) ───────────────────────────────

export async function exportWorkerData(workerId: string, tenantId: string, performedBy: string): Promise<Record<string, unknown>> {
  // Collect all data about this worker
  const worker = await queryOne("SELECT * FROM workers WHERE id = $1 AND tenant_id = $2", [workerId, tenantId]);
  if (!worker) throw new Error("Worker not found");

  const workerName = (worker as any).full_name;

  const documents = await query("SELECT * FROM documents WHERE worker_id = $1 AND tenant_id = $2", [workerId, tenantId]);
  const consents = await query("SELECT * FROM consent_records WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at", [workerId, tenantId]);
  const hours = await query("SELECT * FROM hours_log WHERE worker_name = $1 ORDER BY month DESC", [workerName]);
  const payroll = await query("SELECT * FROM payroll_snapshots WHERE worker_id = $1 ORDER BY month DESC", [workerId]);

  // Log this data export
  await logGdprAction({
    tenantId,
    action: "DATA_EXPORT",
    targetType: "worker",
    targetId: workerId,
    targetName: workerName,
    performedBy,
    details: { reason: "Data Subject Access Request (GDPR Article 15)" },
  });

  return {
    exportedAt: new Date().toISOString(),
    dataSubject: worker,
    documents,
    consentHistory: consents,
    hoursLog: hours,
    payrollHistory: payroll,
  };
}

// ── Data Retention Auto-Purge ──────────────────────────────────────────────

export async function purgeExpiredData(tenantId: string, retentionDays: number): Promise<{ purgedWorkers: number }> {
  // Find workers whose last activity is older than retention period
  // and who have no valid (non-expired) documents
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const expiredWorkers = await query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM workers
     WHERE tenant_id = $1 AND updated_at < $2
     AND NOT EXISTS (
       SELECT 1 FROM documents d WHERE d.worker_id = workers.id AND d.expiry_date > CURRENT_DATE
     )`,
    [tenantId, cutoff]
  );

  for (const w of expiredWorkers) {
    await eraseWorkerData(w.id, tenantId, "system:data-retention");
  }

  if (expiredWorkers.length > 0) {
    await logGdprAction({
      tenantId,
      action: "DATA_RETENTION_PURGE",
      targetType: "batch",
      performedBy: "system:data-retention",
      details: { purgedCount: expiredWorkers.length, retentionDays, cutoffDate: cutoff },
    });
  }

  return { purgedWorkers: expiredWorkers.length };
}
