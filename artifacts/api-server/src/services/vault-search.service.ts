/**
 * Vault Search Service — unified full-text search across all legal content.
 *
 * Searches: workers, legal_cases, case_notebook_entries, legal_knowledge,
 *           kg_nodes, document_intake
 *
 * Returns grouped results with relevance scoring.
 */

import { query } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type ResultCategory = "worker" | "case" | "notebook" | "kb_article" | "graph_node" | "document";

export interface SearchResult {
  id: string;
  category: ResultCategory;
  title: string;
  snippet: string;
  relevance: number;
  metadata: Record<string, any>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  byCategory: Record<ResultCategory, number>;
  queryMs: number;
}

// ═══ SEARCH ════════════════════════════════════════════════════════════════

export async function vaultSearch(
  tenantId: string,
  searchQuery: string,
  limit: number = 30,
): Promise<SearchResponse> {
  const start = Date.now();
  const terms = searchQuery.trim().split(/\s+/).filter(w => w.length > 1);
  if (terms.length === 0) return { results: [], total: 0, byCategory: {} as any, queryMs: 0 };

  const ilike = `%${terms.join("%")}%`;
  const tsQuery = terms.filter(w => w.length > 2).map(w => w.replace(/[^a-zA-Z0-9żźćńółęąśŻŹĆŃÓŁĘĄŚ]/g, "")).filter(Boolean).join(" & ");

  const allResults: SearchResult[] = [];

  // 1. Workers — name, PESEL, passport
  try {
    const workers = await query<any>(
      `SELECT id, first_name, last_name, nationality, specialization, pesel,
              COALESCE(trc_expiry::text, '') AS trc_exp, COALESCE(work_permit_expiry::text, '') AS wp_exp
       FROM workers WHERE tenant_id = $1
       AND (first_name || ' ' || last_name || ' ' || COALESCE(pesel,'') || ' ' || COALESCE(passport_number,'') || ' ' || COALESCE(nationality,'')) ILIKE $2
       LIMIT 10`,
      [tenantId, ilike]
    );
    for (const w of workers) {
      allResults.push({
        id: w.id, category: "worker",
        title: `${w.first_name} ${w.last_name}`,
        snippet: [w.nationality, w.specialization, w.trc_exp ? `TRC: ${w.trc_exp}` : null].filter(Boolean).join(" · "),
        relevance: 90, metadata: { workerId: w.id },
      });
    }
  } catch { /* table may not exist */ }

  // 2. Legal cases — notes, next_action, case_type
  try {
    const cases = await query<any>(
      `SELECT c.id, c.case_type, c.status, c.next_action, c.notes, c.blocker_type,
              w.first_name || ' ' || w.last_name AS worker_name
       FROM legal_cases c JOIN workers w ON c.worker_id = w.id
       WHERE c.tenant_id = $1
       AND (c.case_type || ' ' || COALESCE(c.notes,'') || ' ' || COALESCE(c.next_action,'') || ' ' || w.first_name || ' ' || w.last_name) ILIKE $2
       LIMIT 10`,
      [tenantId, ilike]
    );
    for (const c of cases) {
      allResults.push({
        id: c.id, category: "case",
        title: `${c.case_type} Case — ${c.worker_name}`,
        snippet: `${c.status}${c.blocker_type === "HARD" ? " [BLOCKED]" : ""} · ${c.next_action ?? ""}`.slice(0, 120),
        relevance: 85, metadata: { caseId: c.id, status: c.status },
      });
    }
  } catch { /* table may not exist */ }

  // 3. Case notebook entries — full-text via tsvector
  if (tsQuery) {
    try {
      const entries = await query<any>(
        `SELECT n.id, n.title, n.content, n.entry_type, n.case_id, n.created_at,
                ts_rank(to_tsvector('english', n.title || ' ' || n.content), to_tsquery('english', $2)) AS rank
         FROM case_notebook_entries n
         WHERE n.tenant_id = $1 AND to_tsvector('english', n.title || ' ' || n.content) @@ to_tsquery('english', $2)
         ORDER BY rank DESC LIMIT 10`,
        [tenantId, tsQuery]
      );
      for (const e of entries) {
        allResults.push({
          id: e.id, category: "notebook",
          title: e.title,
          snippet: e.content.slice(0, 120),
          relevance: 70 + (e.rank * 20),
          metadata: { caseId: e.case_id, entryType: e.entry_type },
        });
      }
    } catch { /* table may not exist */ }
  }

  // 4. Legal knowledge base articles
  try {
    const articles = await query<any>(
      `SELECT id, title, content, category, source_name
       FROM legal_knowledge WHERE tenant_id = $1
       AND (title || ' ' || content || ' ' || category) ILIKE $2
       LIMIT 10`,
      [tenantId, ilike]
    );
    for (const a of articles) {
      allResults.push({
        id: a.id, category: "kb_article",
        title: a.title,
        snippet: a.content.slice(0, 120),
        relevance: 75, metadata: { category: a.category, source: a.source_name },
      });
    }
  } catch { /* table may not exist */ }

  // 5. Knowledge graph nodes
  try {
    const nodes = await query<any>(
      `SELECT id, node_type, label, properties
       FROM kg_nodes WHERE tenant_id = $1
       AND (label || ' ' || COALESCE(properties::text,'')) ILIKE $2
       LIMIT 10`,
      [tenantId, ilike]
    );
    for (const n of nodes) {
      allResults.push({
        id: n.id, category: "graph_node",
        title: `${n.node_type}: ${n.label}`,
        snippet: JSON.stringify(n.properties).slice(0, 100),
        relevance: 60, metadata: { nodeType: n.node_type },
      });
    }
  } catch { /* table may not exist */ }

  // 6. Document intakes
  try {
    const docs = await query<any>(
      `SELECT id, document_type, file_name, status, ai_confidence,
              COALESCE(identity_json::text,'') || ' ' || COALESCE(classification_json::text,'') AS search_text
       FROM document_intake WHERE tenant_id = $1
       AND (COALESCE(file_name,'') || ' ' || COALESCE(document_type,'') || ' ' || COALESCE(identity_json::text,'')) ILIKE $2
       LIMIT 10`,
      [tenantId, ilike]
    );
    for (const d of docs) {
      allResults.push({
        id: d.id, category: "document",
        title: `${d.document_type ?? "Document"}: ${d.file_name ?? "Uploaded"}`,
        snippet: `Status: ${d.status} · Confidence: ${d.ai_confidence ?? "—"}%`,
        relevance: 65, metadata: { status: d.status, docType: d.document_type },
      });
    }
  } catch { /* table may not exist */ }

  // Sort by relevance
  allResults.sort((a, b) => b.relevance - a.relevance);
  const results = allResults.slice(0, limit);

  // Count by category
  const byCategory: Record<string, number> = {};
  for (const r of allResults) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;

  return {
    results,
    total: allResults.length,
    byCategory: byCategory as Record<ResultCategory, number>,
    queryMs: Date.now() - start,
  };
}
