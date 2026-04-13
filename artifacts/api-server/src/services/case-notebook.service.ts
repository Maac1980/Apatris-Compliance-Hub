/**
 * Case Notebook Service — running narrative per legal case.
 *
 * Every case gets an automatic chronological log:
 *  - Status changes (auto)
 *  - Document attachments (document)
 *  - AI insights (ai_insight)
 *  - Alerts / SLA breaches (alert)
 *  - Manual lawyer notes (manual)
 *
 * Entries auto-link to kg_nodes for graph connectivity.
 * Full-text searchable via PostgreSQL tsvector.
 */

import { query, queryOne, execute } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type EntryType = "auto" | "manual" | "document" | "status_change" | "alert" | "ai_insight";

export interface NotebookEntry {
  id: string;
  case_id: string;
  tenant_id: string;
  entry_type: EntryType;
  title: string;
  content: string;
  linked_node_ids: string[];
  linked_document_id: string | null;
  metadata: Record<string, any>;
  author: string | null;
  created_at: string;
}

// ═══ CREATE ENTRIES ════════════════════════════════════════════════════════

export async function addNotebookEntry(
  caseId: string,
  tenantId: string,
  entryType: EntryType,
  title: string,
  content: string,
  opts: {
    linkedNodeIds?: string[];
    linkedDocumentId?: string;
    metadata?: Record<string, any>;
    author?: string;
  } = {},
): Promise<NotebookEntry> {
  const row = await queryOne<NotebookEntry>(
    `INSERT INTO case_notebook_entries (case_id, tenant_id, entry_type, title, content, linked_node_ids, linked_document_id, metadata, author)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      caseId, tenantId, entryType, title, content,
      opts.linkedNodeIds ?? [],
      opts.linkedDocumentId ?? null,
      JSON.stringify(opts.metadata ?? {}),
      opts.author ?? null,
    ]
  );
  if (!row) throw new Error("Failed to create notebook entry");
  return row;
}

// ═══ AUTO-ENTRY HELPERS (called from other services) ═══════════════════

export async function logStatusChange(
  caseId: string,
  tenantId: string,
  oldStatus: string,
  newStatus: string,
  actor?: string,
): Promise<void> {
  await addNotebookEntry(caseId, tenantId, "status_change",
    `Status: ${oldStatus} → ${newStatus}`,
    `Case moved from ${oldStatus} to ${newStatus}.${newStatus === "DEFECT_NOTICE" ? " Defect notice received — response required within 14 days." : ""}${newStatus === "APPROVED" ? " Application approved." : ""}${newStatus === "REJECTED" ? " Application rejected — 14-day appeal window opened." : ""}`,
    { author: actor, metadata: { from: oldStatus, to: newStatus } }
  );
}

export async function logDocumentAttached(
  caseId: string,
  tenantId: string,
  documentType: string,
  documentLabel: string,
  intakeId?: string,
  kgNodeId?: string,
): Promise<void> {
  await addNotebookEntry(caseId, tenantId, "document",
    `Document: ${documentType}`,
    `${documentLabel} attached to case via ${intakeId ? "AI intake" : "manual upload"}.`,
    {
      linkedNodeIds: kgNodeId ? [kgNodeId] : [],
      linkedDocumentId: intakeId,
      metadata: { documentType, intakeId },
    }
  );
}

export async function logAiInsight(
  caseId: string,
  tenantId: string,
  insight: string,
  source: string,
): Promise<void> {
  await addNotebookEntry(caseId, tenantId, "ai_insight",
    `AI Insight: ${source}`,
    insight,
    { metadata: { source } }
  );
}

export async function logAlert(
  caseId: string,
  tenantId: string,
  alertType: string,
  message: string,
): Promise<void> {
  await addNotebookEntry(caseId, tenantId, "alert",
    `Alert: ${alertType}`,
    message,
    { metadata: { alertType } }
  );
}

// ═══ READ ENTRIES ══════════════════════════════════════════════════════════

export async function getNotebookEntries(
  caseId: string,
  tenantId: string,
): Promise<NotebookEntry[]> {
  return query<NotebookEntry>(
    "SELECT * FROM case_notebook_entries WHERE case_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
    [caseId, tenantId]
  );
}

export async function getRecentEntriesAcrossCases(
  tenantId: string,
  limit: number = 50,
): Promise<(NotebookEntry & { case_type?: string; worker_name?: string })[]> {
  return query(
    `SELECT n.*, c.case_type, w.first_name || ' ' || w.last_name AS worker_name
     FROM case_notebook_entries n
     JOIN legal_cases c ON n.case_id = c.id
     JOIN workers w ON c.worker_id = w.id
     WHERE n.tenant_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );
}

export async function searchNotebook(
  tenantId: string,
  searchQuery: string,
  limit: number = 20,
): Promise<NotebookEntry[]> {
  const tsQuery = searchQuery.split(/\s+/).filter(w => w.length > 2).join(" & ");
  if (!tsQuery) return [];
  return query<NotebookEntry>(
    `SELECT *, ts_rank(to_tsvector('english', title || ' ' || content), to_tsquery('english', $2)) AS rank
     FROM case_notebook_entries
     WHERE tenant_id = $1 AND to_tsvector('english', title || ' ' || content) @@ to_tsquery('english', $2)
     ORDER BY rank DESC
     LIMIT $3`,
    [tenantId, tsQuery, limit]
  );
}
