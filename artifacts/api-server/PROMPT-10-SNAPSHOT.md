# Prompt 10 — Pre-Backfill Staging Snapshot

## Snapshot Identity

| Field | Value |
|---|---|
| Snapshot name | `pre-pii-backfill-staging-20260419` |
| Neon branch ID | `br-damp-lake-agj8ht23` |
| Parent branch | staging (`br-dry-dust-ag6a0c2s`) |
| Created at | 2026-04-19 11:22:34 +02:00 |
| Created by | Manish |
| Compute status | auto-suspended (Scale-to-zero 5 min); attach a fresh compute on rollback |
| Purpose | Point-in-time restore target before Prompt 11 PII backfill on staging |

## Pre-Snapshot Row Counts (verified on snapshot branch)

Verification executed 2026-04-19 against `br-damp-lake-agj8ht23` — all counts match Phase 1 baseline captured from `br-dry-dust-ag6a0c2s` before snapshot.

| Metric | Count |
|---|---|
| `total_workers` | 31 |
| `legacy_plaintext_pesel` (pesel IS NOT NULL AND pesel NOT LIKE 'enc:v1:%') | 25 |
| `encrypted_pesel` (pesel LIKE 'enc:v1:%') | 0 |
| `pesel_hash_populated` (pesel_hash IS NOT NULL) | 0 |
| `audit_log_rows` | 6 |

**Note:** 6 of 31 worker rows have `pesel IS NULL`. Prompt 11 backfill will only touch the 25 non-NULL plaintext rows; NULL rows remain untouched and hash columns for those stay NULL.

## Rollback Procedure

If Prompt 11 backfill corrupts staging data, revert by repointing staging's `DATABASE_URL` to this snapshot branch:

1. **Neon Console** → Project → Branches → `pre-pii-backfill-staging-20260419`
2. **Attach a fresh compute endpoint** to the snapshot branch (it is currently storage-only; Scale-to-zero auto-suspended its verification compute).
3. **Copy** the new compute's pooled connection string.
4. **Fly staging secrets:** `fly secrets set DATABASE_URL='<new-connection-string>' --app apatris-api-staging`
5. **Verify staging digest changed** (not `30e15609a4d46e09` anymore).
6. **Redeploy staging** so new secret takes effect: `fly deploy --remote-only --app apatris-api-staging`
7. **Smoke check:** `curl -s https://apatris-api-staging.fly.dev/api/healthz` + run the 5 baseline counts again — they must match the table above (31 / 25 / 0 / 0 / 6).
8. **Do NOT delete** the original staging branch (`br-dry-dust-ag6a0c2s`) — keep it for forensics until backfill is re-run and verified.

## Hard Boundaries at Time of Snapshot

- Prod (`br-...-prod`, digest `59e5061e76027e27`) is untouched. Snapshot is staging-only.
- No source code changes accompany this snapshot.
- This file is uncommitted at time of writing — will be committed alongside Prompt 11.
