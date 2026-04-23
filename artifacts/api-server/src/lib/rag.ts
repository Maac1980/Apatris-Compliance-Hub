/**
 * Retrieval-Augmented Generation (RAG) over Apatris embedded corpora.
 *
 * Four retrieval types (see VECTOR-RAG-AUDIT-1G1-2026-04-21.md §4):
 *   Type A — retrieveSimilarRejections:   rejection_analyses (rejection narratives)
 *   Type B — retrieveRelevantArticles:    legal_knowledge (KB articles)      ← only type with real data in Phase 2
 *   Type C — retrieveAppealTemplates:     case_generated_docs (approved appeals)
 *   Type D — retrieveSimilarWorkers:      workers (profile composite)
 *
 * Phase 2 scope: this library is standalone. NO service is wired. Service
 * integration happens per-consumer in Phase 3 (Legal Brief Pipeline,
 * Legal Copilot, Case Doc Generator, Knowledge Graph).
 *
 * Cold-start safety: every function runs an index-backed COUNT check before
 * calling Voyage. If the target table has 0 embedded rows, we return
 * confidence="none" immediately — no Voyage spend, no wasted SQL.
 *
 * Every function returns the same shape:
 *   { results, confidence: "high" | "low" | "none", reason, topSimilarity }
 * Errors (Voyage outage, DB failure) do NOT throw — they surface as
 * confidence="none" with a reason string, so callers can fall back to
 * Perplexity or attribute-filter paths without try/catch ceremony.
 */

import { callVoyageEmbed } from "./embeddings.js";
import { query } from "./db.js";

// Similarity thresholds — empirical basis:
// 1 matched pair measured on 2026-04-22 staging smoke:
// "Article 108" (TRC continuity) vs "UPO" (digital proof of legal stay) = 0.56
// Structurally distinct concepts (Art 108 vs ZUS) = 0.22
// Observed spread 0.22-0.56 on voyage-multilingual-2 + short Polish legal text.
// TODO(Phase 4): revisit after 100+ real queries across Phase 3 service wiring.
// Per-type tuning may be needed (Type B vs A vs C vs D may have different signal strengths).
const SIMILARITY_HIGH = 0.5;
const SIMILARITY_LOW = 0.35;

// Top-K defaults per retrieval type — callers override via RetrievalOpts.topK.
const DEFAULT_TOPK_REJECTIONS = 5;
const DEFAULT_TOPK_ARTICLES = 10;
const DEFAULT_TOPK_TEMPLATES = 3;
const DEFAULT_TOPK_WORKERS = 5;

// ── Types ────────────────────────────────────────────────────────────────

export type RetrievalConfidence = "high" | "low" | "none";

export interface RetrievalResult<T> {
  results: T[];
  confidence: RetrievalConfidence;
  reason: string;
  topSimilarity: number;
}

export interface RetrievalOpts {
  topK?: number;
  minSimilarity?: number;
  tenantId?: string;
  abortSignal?: AbortSignal;
}

export interface SimilarRejection {
  id: string;
  anonymizedText: string;
  category: string;
  appealPossible: boolean;
  confidenceScore: number | null;
  legalCaseId: string | null;
  similarity: number;
}

export interface RelevantArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  sourceName: string | null;
  sourceUrl: string | null;
  tags: string[];
  similarity: number;
}

export interface AppealTemplate {
  id: string;
  anonymizedContent: string;
  title: string;
  docType: string;
  legalBasis: string[];
  status: "APPROVED" | "SENT";
  similarity: number;
}

export interface SimilarWorkerProfileInput {
  nationality?: string;
  specialization?: string;
  caseType?: string;
  voivodeship?: string;
}

export interface SimilarWorker {
  workerId: string;
  nationality: string | null;
  specialization: string | null;
  /** Null when the query is cross-tenant (tenantId not supplied) — PII strip. */
  fullName: string | null;
  similarity: number;
}

// ── Shared helpers ───────────────────────────────────────────────────────

// No query-time embedding cache in Phase 2.
// Rationale: query text varies more than document text (users rephrase,
// case-specific context), expected cache hit rate is low, and an LRU map
// adds complexity without clear benefit until we see real query volume.
// Revisit in Phase 4 if Voyage query-side cost becomes material (threshold: ~$10/mo).
export async function embedQueryText(
  text: string,
  opts?: { signal?: AbortSignal },
): Promise<number[] | null> {
  const apiKey = process.env.APATRIS_VOYAGE_API_KEY;
  if (!apiKey) return null;
  try {
    const result = await callVoyageEmbed({
      apiKey,
      input: text,
      inputType: "query",
      signal: opts?.signal,
    });
    const vec = result.embeddings[0];
    return vec && vec.length === 1024 ? vec : null;
  } catch {
    return null;
  }
}

function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

async function countEmbedded(table: string, embedCol: string): Promise<number> {
  try {
    const rows = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${embedCol} IS NOT NULL`,
    );
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

function scoreConfidence(
  results: Array<{ similarity: number }>,
  minSimOverride: number | undefined,
): { confidence: RetrievalConfidence; reason: string; topSim: number } {
  if (results.length === 0) {
    return { confidence: "none", reason: "no hits above distance threshold", topSim: 0 };
  }
  const top = results[0]!.similarity;
  const effectiveHigh = Math.max(SIMILARITY_HIGH, minSimOverride ?? 0);

  if (results.length >= 3 && top >= effectiveHigh) {
    return {
      confidence: "high",
      reason: `${results.length} hits, top similarity ${top.toFixed(3)}`,
      topSim: top,
    };
  }
  if (top >= SIMILARITY_LOW) {
    return {
      confidence: "low",
      reason: `${results.length} hits, top similarity ${top.toFixed(3)} below high threshold ${effectiveHigh.toFixed(2)}`,
      topSim: top,
    };
  }
  return {
    confidence: "none",
    reason: `top similarity ${top.toFixed(3)} below low threshold ${SIMILARITY_LOW}`,
    topSim: top,
  };
}

export function composeProfileString(input: SimilarWorkerProfileInput): string {
  const parts: string[] = [];
  if (input.nationality) parts.push(input.nationality);
  if (input.specialization) parts.push(input.specialization);
  if (input.caseType) parts.push(`case type: ${input.caseType}`);
  if (input.voivodeship) parts.push(`voivodeship: ${input.voivodeship}`);
  return parts.join(", ");
}

// ── Type A — Similar Rejections ──────────────────────────────────────────

export async function retrieveSimilarRejections(
  queryText: string,
  opts?: RetrievalOpts,
): Promise<RetrievalResult<SimilarRejection>> {
  const topK = opts?.topK ?? DEFAULT_TOPK_REJECTIONS;
  const tenantId = opts?.tenantId ?? null;

  const count = await countEmbedded("rejection_analyses", "embedding");
  if (count === 0) {
    return { results: [], confidence: "none", reason: "rejection_analyses index empty", topSimilarity: 0 };
  }

  const vec = await embedQueryText(queryText, { signal: opts?.abortSignal });
  if (!vec) {
    return { results: [], confidence: "none", reason: "voyage api unavailable or key missing", topSimilarity: 0 };
  }

  const vLit = vectorLiteral(vec);
  const params: unknown[] = [vLit];
  let sql = `SELECT id, anonymized_text, category, appeal_possible, confidence_score, legal_case_id,
                    1 - (embedding <=> $1::vector) AS similarity
               FROM rejection_analyses
              WHERE embedding IS NOT NULL`;
  if (tenantId) {
    params.push(tenantId);
    sql += ` AND tenant_id = $${params.length}`;
  }
  params.push(topK);
  sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length}`;

  type Row = {
    id: string; anonymized_text: string | null; category: string;
    appeal_possible: boolean; confidence_score: string | number | null;
    legal_case_id: string | null; similarity: string | number;
  };
  let rows: Row[];
  try {
    rows = await query<Row>(sql, params);
  } catch (e) {
    return { results: [], confidence: "none", reason: `db error: ${(e as Error).message}`, topSimilarity: 0 };
  }

  const results: SimilarRejection[] = rows.map((r) => ({
    id: r.id,
    anonymizedText: r.anonymized_text ?? "",
    category: r.category,
    appealPossible: Boolean(r.appeal_possible),
    confidenceScore: r.confidence_score != null ? Number(r.confidence_score) : null,
    legalCaseId: r.legal_case_id,
    similarity: Number(r.similarity),
  }));

  const { confidence, reason, topSim } = scoreConfidence(results, opts?.minSimilarity);
  return { results, confidence, reason, topSimilarity: topSim };
}

// ── Type B — Relevant Articles ───────────────────────────────────────────

export async function retrieveRelevantArticles(
  queryText: string,
  opts?: RetrievalOpts,
): Promise<RetrievalResult<RelevantArticle>> {
  const topK = opts?.topK ?? DEFAULT_TOPK_ARTICLES;

  const count = await countEmbedded("legal_knowledge", "embedding");
  if (count === 0) {
    return { results: [], confidence: "none", reason: "legal_knowledge index empty", topSimilarity: 0 };
  }

  const vec = await embedQueryText(queryText, { signal: opts?.abortSignal });
  if (!vec) {
    return { results: [], confidence: "none", reason: "voyage api unavailable or key missing", topSimilarity: 0 };
  }

  const vLit = vectorLiteral(vec);
  // Type B: KB is shared across tenants by design. No tenant filter by default.
  type Row = {
    id: string; title: string; content: string; category: string;
    source_name: string | null; source_url: string | null;
    tags: string[] | string | null; similarity: string | number;
  };
  let rows: Row[];
  try {
    rows = await query<Row>(
      `SELECT id, title, content, category, source_name, source_url, tags,
              1 - (embedding <=> $1::vector) AS similarity
         FROM legal_knowledge
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2`,
      [vLit, topK],
    );
  } catch (e) {
    return { results: [], confidence: "none", reason: `db error: ${(e as Error).message}`, topSimilarity: 0 };
  }

  const results: RelevantArticle[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    category: r.category,
    sourceName: r.source_name,
    sourceUrl: r.source_url,
    tags: Array.isArray(r.tags) ? r.tags : (typeof r.tags === "string" ? safeParseArray(r.tags) : []),
    similarity: Number(r.similarity),
  }));

  const { confidence, reason, topSim } = scoreConfidence(results, opts?.minSimilarity);
  return { results, confidence, reason, topSimilarity: topSim };
}

function safeParseArray(s: string): string[] {
  try {
    const p = JSON.parse(s);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

// ── Type C — Successful Appeal Templates ─────────────────────────────────

export async function retrieveAppealTemplates(
  rejectionText: string,
  opts?: RetrievalOpts,
): Promise<RetrievalResult<AppealTemplate>> {
  const topK = opts?.topK ?? DEFAULT_TOPK_TEMPLATES;
  const tenantId = opts?.tenantId ?? null;

  const count = await countEmbedded("case_generated_docs", "embedding");
  if (count === 0) {
    return { results: [], confidence: "none", reason: "case_generated_docs index empty", topSimilarity: 0 };
  }

  const vec = await embedQueryText(rejectionText, { signal: opts?.abortSignal });
  if (!vec) {
    return { results: [], confidence: "none", reason: "voyage api unavailable or key missing", topSimilarity: 0 };
  }

  const vLit = vectorLiteral(vec);
  const params: unknown[] = [vLit];
  // Hard-filter to successful outcomes — Type C is "how have we beaten this before?"
  let sql = `SELECT id, anonymized_content, title, doc_type, legal_basis, status,
                    1 - (embedding <=> $1::vector) AS similarity
               FROM case_generated_docs
              WHERE embedding IS NOT NULL
                AND status IN ('APPROVED','SENT')`;
  if (tenantId) {
    params.push(tenantId);
    sql += ` AND tenant_id = $${params.length}`;
  }
  params.push(topK);
  sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length}`;

  type Row = {
    id: string; anonymized_content: string | null; title: string;
    doc_type: string; legal_basis: string[] | null;
    status: "APPROVED" | "SENT"; similarity: string | number;
  };
  let rows: Row[];
  try {
    rows = await query<Row>(sql, params);
  } catch (e) {
    return { results: [], confidence: "none", reason: `db error: ${(e as Error).message}`, topSimilarity: 0 };
  }

  const results: AppealTemplate[] = rows.map((r) => ({
    id: r.id,
    anonymizedContent: r.anonymized_content ?? "",
    title: r.title,
    docType: r.doc_type,
    legalBasis: Array.isArray(r.legal_basis) ? r.legal_basis : [],
    status: r.status,
    similarity: Number(r.similarity),
  }));

  const { confidence, reason, topSim } = scoreConfidence(results, opts?.minSimilarity);
  return { results, confidence, reason, topSimilarity: topSim };
}

// ── Type D — Similar Workers ─────────────────────────────────────────────

// LIMITATION: Short profile strings (e.g., "Polish welder") provide limited
// semantic surface for cosine similarity. Type D in Phase 2 is vector-only.
// Phase 3 callers SHOULD combine this with attribute-equality pre-filter
// (hybrid retrieval): filter workers by case_type/nationality first, then
// rerank the candidates by vector similarity. See existing pattern in
// knowledge-graph.service.ts::findSimilarCases for reference.
export async function retrieveSimilarWorkers(
  profileInput: SimilarWorkerProfileInput,
  opts?: RetrievalOpts,
): Promise<RetrievalResult<SimilarWorker>> {
  const topK = opts?.topK ?? DEFAULT_TOPK_WORKERS;
  const tenantId = opts?.tenantId ?? null;

  const count = await countEmbedded("workers", "profile_embedding");
  if (count === 0) {
    return { results: [], confidence: "none", reason: "workers profile index empty", topSimilarity: 0 };
  }

  const profileText = composeProfileString(profileInput);
  if (!profileText) {
    return { results: [], confidence: "none", reason: "no profile fields provided", topSimilarity: 0 };
  }

  const vec = await embedQueryText(profileText, { signal: opts?.abortSignal });
  if (!vec) {
    return { results: [], confidence: "none", reason: "voyage api unavailable or key missing", topSimilarity: 0 };
  }

  const vLit = vectorLiteral(vec);
  const params: unknown[] = [vLit];
  let sql = `SELECT id, full_name, nationality, specialization,
                    1 - (profile_embedding <=> $1::vector) AS similarity
               FROM workers
              WHERE profile_embedding IS NOT NULL`;
  if (tenantId) {
    params.push(tenantId);
    sql += ` AND tenant_id = $${params.length}`;
  }
  params.push(topK);
  sql += ` ORDER BY profile_embedding <=> $1::vector LIMIT $${params.length}`;

  type Row = {
    id: string; full_name: string | null;
    nationality: string | null; specialization: string | null;
    similarity: string | number;
  };
  let rows: Row[];
  try {
    rows = await query<Row>(sql, params);
  } catch (e) {
    return { results: [], confidence: "none", reason: `db error: ${(e as Error).message}`, topSimilarity: 0 };
  }

  const results: SimilarWorker[] = rows.map((r) => ({
    workerId: r.id,
    nationality: r.nationality,
    specialization: r.specialization,
    // Cross-tenant query (no tenantId) → strip name per defense-in-depth pattern.
    fullName: tenantId ? r.full_name : null,
    similarity: Number(r.similarity),
  }));

  const { confidence, reason, topSim } = scoreConfidence(results, opts?.minSimilarity);
  return { results, confidence, reason, topSimilarity: topSim };
}
