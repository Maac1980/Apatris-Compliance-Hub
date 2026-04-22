/**
 * Voyage AI embedding wrapper for Apatris Vector RAG.
 *
 * Single-function async helper that mirrors the shape of callClaudeWithSchema
 * (src/lib/claude-schema.ts): typed opts interface, raw fetch, AbortSignal,
 * no new runtime dependencies.
 *
 * Design rationale: VECTOR-RAG-AUDIT-1G1-2026-04-21.md §3 (Voyage
 * voyage-multilingual-2 provider choice, Polish-first + Anthropic partner).
 *
 * Phase 1 scope: this module is standalone. No service is wired yet.
 * scripts/backfill-embeddings.ts exercises it against legal_knowledge only.
 *
 * Inline vs async queue trade-off:
 *   At current volume (~12 legal_knowledge rows; ~few rejections/day),
 *   inline fire-and-forget is fine. When embedding volume becomes triggered
 *   by webhooks (e.g., document_intake OCR pipeline), swap the caller to
 *   enqueue via pg-boss or a lightweight in-process job queue. The wrapper
 *   itself does NOT need to change — only its caller site.
 *
 * Swap-point when that day comes:
 *   current:  await callVoyageEmbed({...})           // blocks INSERT path
 *   future:   await jobQueue.enqueue("embed", {...}) // returns immediately
 */

import { createHash } from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────────

export interface VoyageEmbedCall {
  /** Voyage API key. Caller validates presence. */
  apiKey: string;
  /** Model name. Defaults from env VOYAGE_MODEL or "voyage-multilingual-2". */
  model?: string;
  /** Input text(s) to embed. Single string or array for batch. */
  input: string | string[];
  /** "document" for stored content, "query" for retrieval queries. */
  inputType?: "document" | "query";
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal;
}

export interface VoyageEmbedResult {
  /** One embedding vector per input (same order). */
  embeddings: number[][];
  /** Model actually used (echoed from API). */
  model: string;
  /** Tokens consumed (from API usage block). */
  totalTokens: number;
  /** Cache hits (local dedup by SHA-256 content hash). */
  cacheHits: number;
}

// ── Module state ─────────────────────────────────────────────────────────

const VOYAGE_MODEL_DEFAULT = "voyage-multilingual-2";
// Future: when voyage-law-2 supports Polish, swap via `VOYAGE_MODEL` env var.
// Rows already embedded with the old model retain their `embedding_model`
// column value; backfill re-embeds them on next run when the env-configured
// model differs from the stored one.

// In-memory content-hash dedup cache. Scope: process-lifetime. A shared
// content string (e.g., re-running backfill on the same legal_knowledge row)
// short-circuits to the cached vector instead of re-billing Voyage.
const embeddingCache = new Map<string, number[]>();

// Log-only cost counter. Phase 1 does not enforce a hard cap; Phase 2 can
// wire this into a daily ceiling if we see unexpected call volume.
let totalCallsThisSession = 0;
let totalTokensThisSession = 0;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function resolveModel(opts: VoyageEmbedCall): string {
  return opts.model ?? process.env.VOYAGE_MODEL ?? VOYAGE_MODEL_DEFAULT;
}

// ── Main ─────────────────────────────────────────────────────────────────

export async function callVoyageEmbed(opts: VoyageEmbedCall): Promise<VoyageEmbedResult> {
  const model = resolveModel(opts);
  const inputs = Array.isArray(opts.input) ? opts.input : [opts.input];

  // Cache lookup: if every input has a cached embedding, return without
  // hitting Voyage at all.
  const cacheKeys = inputs.map((txt) => `${model}::${sha256(txt)}`);
  const cached = cacheKeys.map((k) => embeddingCache.get(k));
  if (cached.every((v) => v !== undefined)) {
    return {
      embeddings: cached as number[][],
      model,
      totalTokens: 0,
      cacheHits: inputs.length,
    };
  }

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: inputs,
      input_type: opts.inputType ?? "document",
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const bodyPreview = await res.text().catch(() => "<unreadable>");
    throw new Error(`Voyage API error ${res.status}: ${bodyPreview.slice(0, 300)}`);
  }

  const data = await res.json() as {
    data?: Array<{ embedding?: unknown; index?: number }>;
    model?: string;
    usage?: { total_tokens?: number };
  };

  const dataArr = Array.isArray(data.data) ? data.data : [];
  if (dataArr.length !== inputs.length) {
    throw new Error(
      `Voyage returned ${dataArr.length} embeddings for ${inputs.length} inputs`,
    );
  }

  const embeddings: number[][] = [];
  for (let i = 0; i < dataArr.length; i++) {
    const v = dataArr[i]?.embedding;
    if (!Array.isArray(v) || v.some((n) => typeof n !== "number")) {
      throw new Error(`Voyage returned non-numeric embedding at index ${i}`);
    }
    embeddings.push(v as number[]);
    embeddingCache.set(cacheKeys[i]!, v as number[]);
  }

  const totalTokens = data.usage?.total_tokens ?? 0;
  totalCallsThisSession++;
  totalTokensThisSession += totalTokens;
  if (totalCallsThisSession % 100 === 0) {
    console.log(
      `[voyage] cost-counter: calls=${totalCallsThisSession} tokens=${totalTokensThisSession}`,
    );
  }

  return {
    embeddings,
    model: data.model ?? model,
    totalTokens,
    cacheHits: 0,
  };
}

// ── Test hooks (internal) ────────────────────────────────────────────────

export function _resetEmbeddingCacheForTests(): void {
  embeddingCache.clear();
  totalCallsThisSession = 0;
  totalTokensThisSession = 0;
}
