# Prompt 14 — Production Backfill Snapshot Reference

## Snapshot Identity

| Field | Value |
|---|---|
| Snapshot name | `pre-pii-backfill-prod-2026-04-20` |
| Parent branch | production (main prod branch) |
| Source | Current data (latest commit from prod branch at creation time) |
| Auto-delete | disabled (manually preserved until backfill verified + cleanup) |
| Created | 2026-04-20 (Manish via Neon Console, pre-v290 deploy) |
| Purpose | Point-in-time rollback target before Prompt 14 PII backfill on prod |

## Pre-Backfill Prod State (v290 verified)

Verification executed 2026-04-20 post-v290 deploy, pre-backfill.

| Metric | Value | Notes |
|---|---|---|
| `total_workers` | 31 | unchanged from v288 / v289 / v290 |
| `plaintext_pesel` (pesel IS NOT NULL AND pesel NOT LIKE 'enc:v1:%') | 25 | rows needing encryption |
| `encrypted_pesel` (pesel LIKE 'enc:v1:%') | 0 | backfill not yet run |
| `pesel_hash_populated` (pesel_hash IS NOT NULL) | 0 | column added in v289 init-db, empty |
| `plaintext_iban` (iban IS NOT NULL AND iban NOT LIKE 'enc:v1:%') | 25 | rows needing encryption |
| `encrypted_iban` (iban LIKE 'enc:v1:%') | 0 | backfill not yet run |
| `iban_hash_populated` (iban_hash IS NOT NULL) | 0 | column added in v289 init-db, empty |
| `audit_logs_total` | 8 | 6 init-db seeds (March 31) + 2 from Phase C probe (ids 7, 8) |

**Note:** 6 of 31 worker rows have `pesel IS NULL` and `iban IS NULL`. Backfill will touch only the 25 non-NULL rows in each field; NULL rows remain untouched and their hash columns stay NULL.

## Neon Prod Scale-to-Zero

- **Compute endpoint:** ep-cool-wind-agveys71 (production primary)
- **Status during backfill window:** DISABLED (manually, via Neon Console, pre-deploy)
- **Post-backfill plan:** Re-enable in Phase C-5 as cost optimization

Scale-to-zero disable prevents idle-socket drops during the 25-row per-row transaction loop, learned from staging Prompt 11 v9→v10→v11 connection-termination incident.

## Deployed Code State

- **Prod release:** v290 (deployed 2026-04-20, after snapshot was taken)
- **Commit:** `3672409` + local uncommitted edit to `scripts/backfill-pii.ts` (guard widened from `assertStaging` → `assertKnownApp` allow-listing both staging and prod Fly app names)
- **Bundle:** `/app/artifacts/api-server/dist/scripts/backfill-pii.cjs` = 88,235 bytes

## Rollback Procedure

If backfill corrupts prod data, revert by repointing prod's `NEON_DATABASE_URL` (or `DATABASE_URL`) to this snapshot branch:

1. **Neon Console** → prod project → Branches → `pre-pii-backfill-prod-2026-04-20`
2. **Attach a fresh compute endpoint** to the snapshot branch if one is not already present (snapshot is storage-only at creation).
3. **Copy** the new compute's pooled connection string.
4. **Fly prod secrets:** `fly secrets set NEON_DATABASE_URL='<new-connection-string>' --app apatris-api`
5. **Verify digest changed** on the prod app's `NEON_DATABASE_URL` secret.
6. **Redeploy prod** so the new secret takes effect: `fly deploy --remote-only --app apatris-api`
7. **Smoke check:** `curl -s https://apatris-api.fly.dev/api/healthz` + re-run the 8 baseline counts — they must match the table above (31 / 25 / 0 / 0 / 25 / 0 / 0 / 8).
8. **Do NOT delete** the original prod branch — keep it for forensics until backfill is re-run and verified.

Alternative: `fly releases rollback --app apatris-api` reverts code to v289 or earlier but does NOT restore DB state. Use only if the issue is code-side (e.g., broken read path). For data restoration, the snapshot approach above is authoritative.

## Hard Boundaries at Time of Snapshot

- Staging (`br-dry-dust-ag6a0c2s`, fully encrypted post-Prompt-11-backfill) is untouched.
- BACKUP keys on prod (`APATRIS_ENCRYPTION_KEY_BACKUP`, `APATRIS_LOOKUP_KEY_BACKUP`) are Deployed but inert — not read by `encryption.ts`.
- Test audit rows id=7 and id=8 (from Prompt 13 Phase C probe, UPDATE_WORKER on worker `45120085-...`) are intentionally preserved as evidence of first-real-audit-row + P0-2 fix.
- This file is uncommitted at time of writing — will be committed alongside the `scripts/backfill-pii.ts` guard-widening edit as the Prompt 14 closeout after backfill is verified successful.
