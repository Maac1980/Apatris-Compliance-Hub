import { query, execute } from "./db.js";

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorEmail: string;
  action: "UPDATE_WORKER" | "CREATE_WORKER" | "UPLOAD_DOCUMENT" | "DELETE_WORKER" | "PAYROLL_COMMIT" | "ADMIN_LOGIN" | "SEND_NOTIFICATION" | "DOCUMENT_CHANGE" | "ADMIN_CREATE" | "ADMIN_UPDATE" | "ADMIN_DELETE" | "COORDINATOR_CREATE" | "COORDINATOR_UPDATE" | "COORDINATOR_DELETE" | "CONTRACT_CREATE" | "POA_CREATE" | "POA_DELETE" | "INVOICE_CREATE" | "INVOICE_UPDATE" | "INVOICE_SEND" | "INVOICE_DELETE" | "DOCUMENT_CREATE" | "DOCUMENT_UPDATE" | "DOCUMENT_DELETE" | "GDPR_EXPORT" | "DATA_EXPORT" | "PLAINTEXT_PII_VIEWED" | "PLAINTEXT_PII_ACCESS_DENIED";
  workerId: string;
  workerName: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  note?: string;
}

// PII sanitizer (PC-3 conservative: PESEL + IBAN only, NO passport pattern).
// Decision (R3): scrub note + JSON-stringified changes. Other fields are enum/UUID/email,
// won't contain PII patterns. Trade-off: over-redacts random 11-digit numbers in audit
// notes (Test 15c documents this — acceptable in audit-log context).
const PESEL_RX = /\b\d{11}\b/g;
const IBAN_PL_RX = /\bPL\s?\d{2,4}(?:\s?\d{4}){5,6}\b/g;
const REDACTED = "[encrypted]";

export function sanitizePiiFromAuditText(input: string | null | undefined): string | null {
  if (input == null) return null;
  return input.replace(IBAN_PL_RX, REDACTED).replace(PESEL_RX, REDACTED);
}

// Merge the optional structured `changes` diff into the `note` text column.
// Post-2026-04-20 schema-fix (P0-2): the audit_logs table has no `changes`
// column, so structured diffs are stored as a `| changes={...}` suffix on
// note. HistoryPage.tsx renders the note column directly — the diff is now
// visible there instead of being silently dropped.
function composeNote(note: string | null, changesJson: string | null): string | null {
  if (note && changesJson) return `${note} | changes=${changesJson}`;
  if (note) return note;
  if (changesJson) return `changes=${changesJson}`;
  return null;
}

export function appendAuditLog(entry: Omit<AuditEntry, "id">): void {
  const sanitizedNote = sanitizePiiFromAuditText(entry.note ?? null);
  const sanitizedChanges = entry.changes
    ? sanitizePiiFromAuditText(JSON.stringify(entry.changes))
    : null;
  execute(
    `INSERT INTO audit_logs (timestamp, action, actor, actor_email, worker_id, worker_name, note)
     VALUES (COALESCE(NULLIF($1, '')::timestamptz, NOW()), $2, $3, $4, $5, $6, $7)`,
    [
      entry.timestamp,
      entry.action,
      entry.actor,
      entry.actorEmail,
      entry.workerId ?? null,
      entry.workerName ?? null,
      composeNote(sanitizedNote, sanitizedChanges),
    ]
  ).catch((e) => {
    // Audit log write failures must not break the business operation, but
    // they must be loudly visible — silent failure is how this bug survived.
    const err = e as Error;
    console.error(
      `[audit-log] DB write FAILED action=${entry.action} actor=${entry.actor ?? "—"} worker=${entry.workerId ?? "—"}: ${err.message}`
    );
  });
}

export async function getAuditLog(limit = 200, action?: string, actor?: string): Promise<AuditEntry[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (action) { params.push(action); conditions.push(`action = $${params.length}`); }
  if (actor)  { params.push(`%${actor}%`); conditions.push(`actor ILIKE $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const rows = await query<Record<string, unknown>>(
    `SELECT id, timestamp, action, actor, actor_email, worker_id, worker_name, note
     FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT $${params.length}`,
    params
  );

  return rows.map((r) => ({
    id: String(r["id"]),
    timestamp: String(r["timestamp"]),
    actor: String(r["actor"] ?? ""),
    actorEmail: String(r["actor_email"] ?? ""),
    action: r["action"] as AuditEntry["action"],
    workerId: String(r["worker_id"] ?? ""),
    workerName: String(r["worker_name"] ?? ""),
    // Structured diff is now embedded in `note` as `| changes={...}` suffix;
    // this column no longer exists in the schema (P0-2 fix, 2026-04-20).
    changes: undefined,
    note: r["note"] ? String(r["note"]) : undefined,
  }));
}
