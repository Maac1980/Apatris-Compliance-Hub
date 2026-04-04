import { query, execute } from "./db.js";

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorEmail: string;
  action: "UPDATE_WORKER" | "CREATE_WORKER" | "UPLOAD_DOCUMENT" | "DELETE_WORKER" | "PAYROLL_COMMIT" | "ADMIN_LOGIN" | "SEND_NOTIFICATION" | "DOCUMENT_CHANGE" | "ADMIN_CREATE" | "ADMIN_UPDATE" | "ADMIN_DELETE" | "COORDINATOR_CREATE" | "COORDINATOR_UPDATE" | "COORDINATOR_DELETE" | "CONTRACT_CREATE" | "POA_CREATE" | "POA_DELETE" | "INVOICE_CREATE" | "INVOICE_UPDATE" | "INVOICE_SEND" | "INVOICE_DELETE" | "DOCUMENT_CREATE" | "DOCUMENT_UPDATE" | "DOCUMENT_DELETE" | "GDPR_EXPORT";
  workerId: string;
  workerName: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  note?: string;
}

export function appendAuditLog(entry: Omit<AuditEntry, "id">): void {
  execute(
    `INSERT INTO audit_logs (ts, action, actor, actor_email, worker_id, worker_name, changes, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      entry.timestamp,
      entry.action,
      entry.actor,
      entry.actorEmail,
      entry.workerId ?? null,
      entry.workerName ?? null,
      entry.changes ? JSON.stringify(entry.changes) : null,
      entry.note ?? null,
    ]
  ).catch((e) => console.error("[audit-log] DB write failed:", (e as Error).message));
}

export async function getAuditLog(limit = 200, action?: string, actor?: string): Promise<AuditEntry[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (action) { params.push(action); conditions.push(`action = $${params.length}`); }
  if (actor)  { params.push(`%${actor}%`); conditions.push(`actor ILIKE $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const rows = await query<Record<string, unknown>>(
    `SELECT id, ts, action, actor, actor_email, worker_id, worker_name, changes, note
     FROM audit_logs ${where} ORDER BY ts DESC LIMIT $${params.length}`,
    params
  );

  return rows.map((r) => ({
    id: String(r["id"]),
    timestamp: String(r["ts"]),
    actor: String(r["actor"] ?? ""),
    actorEmail: String(r["actor_email"] ?? ""),
    action: r["action"] as AuditEntry["action"],
    workerId: String(r["worker_id"] ?? ""),
    workerName: String(r["worker_name"] ?? ""),
    changes: r["changes"] ? (r["changes"] as Record<string, { from: unknown; to: unknown }>) : undefined,
    note: r["note"] ? String(r["note"]) : undefined,
  }));
}
