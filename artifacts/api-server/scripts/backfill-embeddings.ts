/**
 * One-shot embedding backfill for Apatris Vector RAG (staging + prod).
 *
 * Phase 1 scope: legal_knowledge ONLY. Public-law content, no PII, safest
 * target to prove the wrapper + schema + end-to-end flow against real
 * Voyage API before any service is wired.
 *
 * Phase 1.5 (future): rejection_analyses + case_generated_docs (PII tables,
 * anonymize-before-embed), then workers (profile_embedding). Skeleton hooks
 * below marked "Phase 1.5" — do not uncomment without an audit update.
 *
 * Mirrors scripts/backfill-pii.ts pattern: FLY_APP_NAME guard, --dry-run/
 * --live flags, pool error intercept, warm-up query, per-row transaction
 * with retry-once, summary block, audit_logs insert.
 *
 * Usage (inside a Fly Apatris machine, via `fly ssh console`):
 *   node /app/artifacts/api-server/dist/scripts/backfill-embeddings.cjs --dry-run
 *   node /app/artifacts/api-server/dist/scripts/backfill-embeddings.cjs --live
 *
 * Safety:
 *   - Refuses to run unless FLY_APP_NAME ∈ { "apatris-api-staging", "apatris-api" }
 *   - Requires --dry-run OR --live (no default write behavior)
 *   - Requires APATRIS_VOYAGE_API_KEY in the environment
 *   - Per-row transaction via withTransaction
 *   - Idempotent: rows with matching content_hash + model skip embedding
 */

// Startup check BEFORE any DB connection is attempted (per Phase A Addition 2).
if (!process.env.APATRIS_VOYAGE_API_KEY) {
  console.error("[backfill-embeddings] APATRIS_VOYAGE_API_KEY not set. Aborting.");
  console.error("Set it via: fly secrets set APATRIS_VOYAGE_API_KEY=... --app apatris-api-staging");
  process.exit(1);
}

import { createHash } from "node:crypto";
import { pool, query, withTransaction } from "../src/lib/db.js";
import { callVoyageEmbed } from "../src/lib/embeddings.js";

// Intercept pg pool 'error' events so a dropped Neon socket mid-script
// does NOT crash the process. Same hardening pattern as backfill-pii.ts.
pool.on("error", (err) => {
  console.warn(`[backfill-embeddings] pg pool client error (intercepted): ${err.message}`);
});

interface KbRow {
  id: string;
  title: string;
  content: string;
  embedded_at: string | null;
  embedding_model: string | null;
  content_hash: string | null;
}

function parseArgs(): { dryRun: boolean; live: boolean } {
  const argv = process.argv.slice(2);
  return { dryRun: argv.includes("--dry-run"), live: argv.includes("--live") };
}

function assertKnownApp(): void {
  const flyApp = process.env.FLY_APP_NAME ?? "";
  const allowed = new Set(["apatris-api-staging", "apatris-api"]);
  if (!allowed.has(flyApp)) {
    console.error(
      `[backfill-embeddings] REFUSING TO RUN: FLY_APP_NAME="${flyApp}" (expected one of: ${[...allowed].join(", ")}).`,
    );
    process.exit(2);
  }
  console.log(`[backfill-embeddings] FLY_APP_NAME=${flyApp} — safety check OK.`);
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function composeEmbedSubject(row: KbRow): string {
  return `${row.title}\n\n${row.content}`;
}

async function main(): Promise<void> {
  const { dryRun, live } = parseArgs();
  if (!dryRun && !live) {
    console.error("[backfill-embeddings] Must pass exactly one of --dry-run or --live. Exiting.");
    process.exit(2);
  }
  if (dryRun && live) {
    console.error("[backfill-embeddings] Cannot pass both --dry-run and --live. Exiting.");
    process.exit(2);
  }

  const mode = live ? "LIVE" : "DRY-RUN";
  console.log(`[backfill-embeddings] Mode: ${mode}`);

  assertKnownApp();

  // Warm-up
  try {
    await query(`SELECT 1`);
    console.log("[backfill-embeddings] warm-up query OK");
  } catch (e) {
    console.error(`[backfill-embeddings] warm-up query FAILED: ${(e as Error).message}`);
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(1);
  }

  const model = process.env.VOYAGE_MODEL ?? "voyage-multilingual-2";
  const apiKey = process.env.APATRIS_VOYAGE_API_KEY!;

  // Phase 1 target: legal_knowledge only.
  const candidates = await query<KbRow>(
    `SELECT id, title, content, embedded_at::text AS embedded_at, embedding_model, content_hash
       FROM legal_knowledge
      ORDER BY id`,
  );
  console.log(`[backfill-embeddings] legal_knowledge candidates=${candidates.length}`);

  let scanned = 0;
  let embedded = 0;
  let skippedUnchanged = 0;
  let errors = 0;
  const startMs = Date.now();

  for (const row of candidates) {
    scanned++;
    const subject = composeEmbedSubject(row);
    const hash = sha256(subject);

    if (row.content_hash === hash && row.embedding_model === model && row.embedded_at) {
      skippedUnchanged++;
      continue;
    }

    if (dryRun) {
      console.log(
        `[backfill-embeddings] DRY-RUN row=${row.id} title="${row.title.slice(0, 40)}..." would_embed hash_prefix=${hash.slice(0, 12)}`,
      );
      embedded++;
      continue;
    }

    try {
      const result = await callVoyageEmbed({
        apiKey, model, input: subject, inputType: "document",
      });
      const vec = result.embeddings[0];
      if (!vec || vec.length !== 1024) {
        throw new Error(`Voyage returned vector of length ${vec?.length ?? 0} (expected 1024)`);
      }

      const vecLiteral = `[${vec.join(",")}]`;

      await withTransaction(async (tx) => {
        await tx.execute(
          `UPDATE legal_knowledge
              SET embedding = $1::vector,
                  content_hash = $2,
                  embedding_model = $3,
                  embedded_at = NOW()
            WHERE id = $4`,
          [vecLiteral, hash, model, row.id],
        );
        await tx.execute(
          `INSERT INTO audit_logs (action, actor, actor_email, worker_id, worker_name, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            "UPDATE_WORKER",
            "backfill-embeddings-script",
            "backfill@apatris.internal",
            null,
            null,
            `EMBEDDING_BACKFILL: table=legal_knowledge id=${row.id} model=${model} tokens=${result.totalTokens} hash_prefix=${hash.slice(0, 12)}`,
          ],
        );
      });
      embedded++;
      console.log(
        `[backfill-embeddings] [${scanned}/${candidates.length}] id=${row.id} embedded tokens=${result.totalTokens}`,
      );
    } catch (e) {
      errors++;
      console.error(
        `[backfill-embeddings] [${scanned}/${candidates.length}] id=${row.id} ERROR: ${(e as Error).message}`,
      );
    }
  }

  const durationMs = Date.now() - startMs;
  console.log("[backfill-embeddings] ── SUMMARY ──────────────────────");
  console.log(`[backfill-embeddings] mode=${mode}`);
  console.log(`[backfill-embeddings] scanned=${scanned}`);
  console.log(`[backfill-embeddings] ${dryRun ? "would_embed" : "embedded"}=${embedded}`);
  console.log(`[backfill-embeddings] skipped_unchanged=${skippedUnchanged}`);
  console.log(`[backfill-embeddings] errors=${errors}`);
  console.log(`[backfill-embeddings] duration_ms=${durationMs}`);

  // ── Phase 1.5 targets (skeleton — DO NOT enable without audit update) ──
  // await backfillRejectionAnalyses();  // Phase 1.5 — PII, requires anonymizeForEmbedding
  // await backfillCaseGeneratedDocs();  // Phase 1.5 — PII, requires anonymizeForEmbedding
  // await backfillWorkerProfiles();     // Phase 1.5 — profile-string construction path

  await pool.end();
  if (errors > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("[backfill-embeddings] FATAL:", e);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
