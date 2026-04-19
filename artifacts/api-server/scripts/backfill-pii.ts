/**
 * One-shot PII backfill for Apatris staging.
 *
 * Encrypts plaintext pesel / iban / passport_number rows at rest using the
 * same encryptIfPresent + lookupHash functions as live writes (imported from
 * src/lib/encryption.ts — no duplication). Populates companion
 * pesel_hash / iban_hash / passport_hash columns in the same transaction.
 *
 * Usage (inside Fly staging machine, via `fly ssh console`):
 *   node /app/artifacts/api-server/dist/scripts/backfill-pii.cjs --dry-run
 *   node /app/artifacts/api-server/dist/scripts/backfill-pii.cjs --live
 *
 * Safety:
 *   - Refuses to run unless FLY_APP_NAME === "apatris-api-staging"
 *   - Requires --dry-run OR --live (no default write behavior)
 *   - Per-row transaction via withTransaction; one row failure rolls back
 *     only that row, other rows proceed
 *   - Idempotent: rows already encrypted (enc:v1: prefix) skip per-field
 *   - NIP is NEVER touched (Blocker 2, locked 2026-04-18)
 */

import { pool, query, withTransaction } from "../src/lib/db.js";
import { encryptIfPresent, isEncrypted, lookupHash } from "../src/lib/encryption.js";

// Resilience hardening (2026-04-19): intercept unhandled pg Client 'error'
// events so a dropped socket (e.g., Neon Scale-to-zero dropping an idle
// connection mid-script) does NOT crash the process. Combined with the
// retry-once wrapper inside the row loop, this lets the script survive
// transient connection drops without data corruption.
pool.on("error", (err) => {
  console.warn(`[backfill] pg pool client error (intercepted): ${err.message}`);
});

type PiiField = "pesel" | "iban" | "passport_number";

const PII_TO_HASH: Record<PiiField, string> = {
  pesel: "pesel_hash",
  iban: "iban_hash",
  passport_number: "passport_hash",
};

const PII_COLS: PiiField[] = ["pesel", "iban", "passport_number"];

interface WorkerRow {
  id: string;
  full_name: string | null;
  pesel: string | null;
  iban: string | null;
  passport_number: string | null;
}

interface FieldUpdate {
  col: PiiField;
  hashCol: string;
  cipher: string;
  hash: string;
  plainLen: number;
}

function parseArgs(): { dryRun: boolean; live: boolean } {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const live = argv.includes("--live");
  return { dryRun, live };
}

function assertStaging(): void {
  const flyApp = process.env.FLY_APP_NAME ?? "";
  if (flyApp !== "apatris-api-staging") {
    console.error(
      `[backfill] REFUSING TO RUN: FLY_APP_NAME="${flyApp}" (expected "apatris-api-staging").`
    );
    console.error("[backfill] This script is staging-only. Exiting with code 2.");
    process.exit(2);
  }
  console.log(`[backfill] FLY_APP_NAME=${flyApp} — staging safety check OK.`);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

async function main(): Promise<void> {
  const { dryRun, live } = parseArgs();

  if (!dryRun && !live) {
    console.error("[backfill] Must pass exactly one of --dry-run or --live. Exiting.");
    process.exit(2);
  }
  if (dryRun && live) {
    console.error("[backfill] Cannot pass both --dry-run and --live. Exiting.");
    process.exit(2);
  }

  const mode = live ? "LIVE" : "DRY-RUN";
  console.log(`[backfill] Mode: ${mode}`);

  assertStaging();

  // Warm-up query: wake the Neon compute endpoint and verify the pool can
  // reach it before we start doing real work. If this fails we bail out
  // cleanly before touching any business data.
  try {
    await query(`SELECT 1`);
    console.log("[backfill] warm-up query OK");
  } catch (e) {
    console.error(`[backfill] warm-up query FAILED: ${(e as Error).message}`);
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }

  // Sanity counts before scanning candidates.
  const [totals] = await query<{
    total_workers: string;
    plaintext_pesel: string;
    plaintext_iban: string;
    plaintext_passport: string;
  }>(
    `SELECT
       COUNT(*)::text AS total_workers,
       COUNT(*) FILTER (WHERE pesel IS NOT NULL AND pesel NOT LIKE 'enc:v1:%')::text AS plaintext_pesel,
       COUNT(*) FILTER (WHERE iban IS NOT NULL AND iban NOT LIKE 'enc:v1:%')::text AS plaintext_iban,
       COUNT(*) FILTER (WHERE passport_number IS NOT NULL AND passport_number NOT LIKE 'enc:v1:%')::text AS plaintext_passport
     FROM workers`
  );

  console.log(`[backfill] workers_total=${totals?.total_workers ?? "?"}`);
  console.log(`[backfill] plaintext_pesel=${totals?.plaintext_pesel ?? "?"}`);
  console.log(`[backfill] plaintext_iban=${totals?.plaintext_iban ?? "?"}`);
  console.log(`[backfill] plaintext_passport=${totals?.plaintext_passport ?? "?"}`);

  const candidates = await query<WorkerRow>(
    `SELECT id, full_name, pesel, iban, passport_number
       FROM workers
      WHERE (pesel IS NOT NULL AND pesel NOT LIKE 'enc:v1:%')
         OR (iban IS NOT NULL AND iban NOT LIKE 'enc:v1:%')
         OR (passport_number IS NOT NULL AND passport_number NOT LIKE 'enc:v1:%')
      ORDER BY id`
  );

  console.log(`[backfill] candidate_rows=${candidates.length}`);

  if (candidates.length === 0) {
    console.log("[backfill] Nothing to do. Exiting cleanly.");
    await pool.end();
    return;
  }

  let scanned = 0;
  let encrypted = 0;
  let skippedAlreadyEncrypted = 0;
  let errors = 0;
  let samplesShown = 0;
  const startMs = Date.now();

  for (const row of candidates) {
    scanned++;

    // Build per-field update list. Skip fields that are null or already encrypted.
    const updates: FieldUpdate[] = [];
    for (const col of PII_COLS) {
      const raw = row[col];
      if (raw == null) continue;
      if (isEncrypted(raw)) continue;
      const cipher = encryptIfPresent(raw);
      const hash = lookupHash(raw);
      if (cipher == null || hash == null) {
        console.warn(
          `[backfill] worker=${row.id} field=${col}: encryptIfPresent/lookupHash returned null (empty/whitespace?). Skipping field.`
        );
        continue;
      }
      updates.push({
        col,
        hashCol: PII_TO_HASH[col],
        cipher,
        hash,
        plainLen: raw.length,
      });
    }

    if (updates.length === 0) {
      skippedAlreadyEncrypted++;
      continue;
    }

    if (dryRun) {
      if (samplesShown < 2) {
        console.log(
          `[backfill] DRY-RUN sample worker=${row.id} name="${row.full_name ?? ""}"`
        );
        for (const u of updates) {
          console.log(
            `  → ${u.col}: plain_len=${u.plainLen} cipher_preview=${truncate(u.cipher, 40)} hash_prefix=${u.hash.slice(0, 12)}...`
          );
        }
        samplesShown++;
      }
      encrypted++;
      continue;
    }

    // LIVE path — per-row transaction with retry-once on connection errors.
    // If a Neon socket is dropped mid-flight, retry the row exactly once;
    // any other error (or a second connection error) falls through to the
    // errors counter and the row is skipped, not retried further.
    let attempts = 0;
    const maxAttempts = 2;
    while (attempts < maxAttempts) {
      attempts++;
      try {
        await withTransaction(async (tx) => {
          const setFragments: string[] = [];
          const params: unknown[] = [];
          let idx = 1;
          for (const u of updates) {
            setFragments.push(`${u.col} = $${idx++}`);
            params.push(u.cipher);
            setFragments.push(`${u.hashCol} = $${idx++}`);
            params.push(u.hash);
          }
          params.push(row.id);
          await tx.execute(
            `UPDATE workers SET ${setFragments.join(", ")} WHERE id = $${idx}`,
            params
          );

          await tx.execute(
            `INSERT INTO audit_logs (action, actor, actor_email, worker_id, worker_name, note)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              "UPDATE_WORKER",
              "backfill-script",
              "backfill@apatris.internal",
              row.id,
              row.full_name ?? null,
              `PII_BACKFILL: fields=${JSON.stringify(updates.map((u) => u.col))}`,
            ]
          );
        });
        encrypted++;
        console.log(
          `[backfill] [${scanned}/${candidates.length}] worker=${row.id} encrypted_fields=[${updates.map((u) => u.col).join(",")}] hash_populated=true`
        );
        break;
      } catch (e) {
        const msg = (e as Error).message ?? "";
        const isConnErr = /Connection terminated|connection reset|ECONNRESET|socket hang up/i.test(msg);
        if (isConnErr && attempts < maxAttempts) {
          console.warn(
            `[backfill] [${scanned}/${candidates.length}] worker=${row.id} conn err, retrying (attempt ${attempts}/${maxAttempts}): ${msg}`
          );
          continue;
        }
        errors++;
        console.error(
          `[backfill] [${scanned}/${candidates.length}] worker=${row.id} ERROR: ${msg}`
        );
        break;
      }
    }
  }

  const durationMs = Date.now() - startMs;
  console.log("[backfill] ── SUMMARY ──────────────────────");
  console.log(`[backfill] mode=${mode}`);
  console.log(`[backfill] scanned=${scanned}`);
  console.log(`[backfill] ${dryRun ? "would_encrypt" : "encrypted"}=${encrypted}`);
  console.log(`[backfill] skipped_already_encrypted=${skippedAlreadyEncrypted}`);
  console.log(`[backfill] errors=${errors}`);
  console.log(`[backfill] duration_ms=${durationMs}`);

  await pool.end();
  if (errors > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("[backfill] FATAL:", e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
