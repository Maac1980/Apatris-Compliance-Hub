# CONTEXT — Apatris Compliance Hub

> Session continuity doc. Read this first when resuming work.
> Last updated: 2026-04-17

## Project
- Apatris Compliance Hub — SaaS for Polish workforce/legal compliance
- Solo founder build, ~30 days
- Monorepo: apatris-dashboard (React 19, 114 pages), workforce-app (PWA), api-server (Express 5, 130+ routes)
- Stack: TypeScript, pnpm, Vite, Vitest, Fly.io

## Environments
- Prod: https://apatris-api.fly.dev (app: `apatris-api`)
- Staging: https://apatris-api-staging.fly.dev (app: `apatris-api-staging`)
- Health endpoint: `/api/healthz`
- VAPID key endpoint: `/api/push/vapid-key`

## Secrets configured (Apr 17, 2026)
- Prod: `SENTRY_AUTH_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Staging: same 4 secrets, but **separate** VAPID pair (do NOT share between envs)
- All saved in user's password manager

## Locked files — do NOT modify without explicit approval
- `services/zus.service.ts` (verified payroll math, ZUS 2026 rates)
- `services/legal-status.service.ts` (decision trace + trusted inputs chain)
- `lib/auth-middleware.ts` (JWT + OTP + RBAC)
- Document intake approval flow
- Dashboard navigation tree

## Recent work (Apr 17, 2026 — v287 prod, v4 staging)
- Stripe billing now fail-loud (503 if keys missing) instead of silent
- Sentry Express middleware wired correctly
- Frontend push notification subscribe flow added (workforce-app)
- 5 runtime bugs fixed: `legal-kb.ts`, document-intake-hardening, escalation-engine, legal-copilot bilingual, airtable Buffer/Blob
- Staging redeployed from stale Apr 13 v1 → current v4

## Known deferred items (not bugs, intentional)
- `saas-billing.ts` — intentionally Stripe-optional with local DB fallback
- 159 TS strict errors — route-level type drift, not runtime bugs
- WhatsApp escalation — `to` field empty (needs coordinator phone lookup, not in scope)
- Stripe SDK type drift on `current_period_start`/`current_period_end`
- Frontend push only subscribes logged-in users (anonymous PWA visitors skipped, intentional)
- Decision trace has structured JSON but no UI yet

## Known bugs (follow-up — not today's work)
- **ComplianceCard fetches `/workers/me` which may not exist** (found 2026-04-18 during PII migration planning). Per Explore-agent search, no route by this name exists in `artifacts/api-server/src/routes/`. ComplianceCard (workforce-app digital site pass) is likely rendering on mock/broken data. Worth verifying during PII migration Prompt 8 — if confirmed missing, creating `/workers/me` is the right place to implement the `?purpose=compliance_card` plaintext-exception logic per PII-ENCRYPTION-PLAN.md §5. Stop and confirm before expanding Prompt 8's scope.

## Next priorities (in order)
1. Dummy seed data for staging — so team testing isn't on empty screens
2. Decision trace UI — operators can debug legal calls
3. Fix critical TS errors (~50 of the 159)
4. Smoke tests for dashboard + workforce-app
5. Real Stripe go-live when ready for paying customers

## Slash commands
- `/ship` — full pipeline to PROD (build → test → push → fly deploy → health check)

## How to resume Claude session from today
```
claude --resume 37ce6fb4-16b1-46da-aeb7-0af28672d85b
```

<!-- ship test: 2026-04-17 -->

## Tomorrow's plan (Apr 18, 2026)

**Goal:** Close the #1 CRITICAL debt item — `workers.pesel`, `workers.iban`, `workers.passport_number`, `workers.nip` all plaintext in Postgres. Migrate to AES-256-GCM at rest, format `enc:v1:<iv>:<tag>:<ciphertext>` (EEJ-compatible).

### Blocker questions — answer before coding starts

1. **Second env var `APATRIS_LOOKUP_KEY` for HMAC hash columns?** Needed to support `WHERE pesel = X` and `GROUP BY pesel` (fraud.ts, duplicate-prevention, worker matching). AES-GCM's random IV breaks these patterns. Separate key so rotating the encryption key doesn't force rebuilding every hash column. (Alternative: plain SHA-256 — rejected because 11-digit PESELs are rainbow-tableable without a key.)
2. **NIP scoping:** encrypt `workers.nip` only. Leave `clients.nip`, `crm_companies.nip`, and the 5 hardcoded Apatris company NIPs (`contracts.ts:16/258/329`, `zus.ts:109`, `mos-package.service.ts:64`) plaintext — those are public company tax IDs on invoices. Confirm?
3. **Neon PITR retention ≥7 days on current plan?** Check `neon.tech/projects/<id>/settings/storage` before Phase 2 backfill. A manual named snapshot at the cutover moment is the only rollback path after encryption.
4. **Fail-loud on missing `APATRIS_ENCRYPTION_KEY` in prod** — throw on startup, or JWT-derived fallback like EEJ (warns and silently derives)? My plan says fail-loud; EEJ says fallback. Your call — changes one line but affects prod bootup behavior.

### References

- **Full plan (§1-§13, 543 lines):** [PII-ENCRYPTION-PLAN.md](./PII-ENCRYPTION-PLAN.md)
- **Reusable migration-plan template:** [.claude/prompts/migration-plan-template.md](./.claude/prompts/migration-plan-template.md) — use for future encryption/schema/tenancy/auth migrations
- **Reference implementation:** EEJ `artifacts/api-server/src/lib/encryption.ts` and `artifacts/api-server/src/lib/pii-backfill.ts` in `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/`

### Honest time estimate

**10.5 focused hours** — expect 2 days of work, not one.
- Original outline assumed 4-6 h; undercount came from missing the hash-column scheme (~2h extra) and ~10 direct-SQL sites that bypass `workers-db.ts` (~2h extra).
- Realistic cadence: Day 1 morning = code + unit tests (~5h); Day 1 afternoon = staging deploy + verify (~1h); Day 2 morning = prod deploy Phase 1 + verify (~1.5h); Day 2 off-peak evening = prod backfill + verify (~1h); docs + cleanup (~1h).

### Deploy order (full, corrected)

1. **Staging keys** — generate `APATRIS_ENCRYPTION_KEY` + `APATRIS_LOOKUP_KEY`, set as Fly secrets on `apatris-api-staging`, store 3 copies
2. **Staging code deploy** — Phase 1 code (encryption.ts, workers-db changes, hash columns)
3. **Staging verify writes encrypt** — create test worker, confirm `enc:v1:` in DB
4. **Staging backfill** — run `scripts/backfill-pii.ts` against staging
5. **Staging verify full flow** — contracts PDF, payroll CSV, fraud duplicate detection, role masking
6. **Prod keys** — generate **different** `APATRIS_ENCRYPTION_KEY` + `APATRIS_LOOKUP_KEY`, set on `apatris-api`
7. **Prod Neon snapshot** — named manual snapshot (rollback anchor for Phase 2)
8. **Prod code deploy** — Phase 1 (reversible; legacy plaintext still readable)
9. **Prod verify writes encrypt** — create + delete one test worker
10. **Prod backfill** — off-peak window (02:00 Warsaw / weekend), run `scripts/backfill-pii.ts`
11. **Prod verify Phase 3** — `SELECT COUNT(*) FROM workers WHERE pesel NOT LIKE 'enc:v1:%'` must return 0
12. **Docs** — update CLAUDE.md (remove plaintext-PII critical debt entry), update this file

Snapshots separate reversible phases (code deploy) from non-reversible phases (backfill). Once Phase 2 runs on prod, the only rollback is restoring the Phase 7 snapshot — which loses any user data written between snapshot and restore.

### Audit correction (context for why this is the priority)

The EEJ vs Apatris audit reviewed earlier had 3 false positives that overstated Apatris engineering problems:
- ❌ "Typecheck blocks build on `NotifyWorkerResponse` ambiguity" — actual state: 159 non-blocking type drift errors in service/route layer; build ships fine (v288 deployed cleanly)
- ❌ "N+1 at `routes/payroll.ts:99-120`" — that block is pure in-memory iteration over pre-fetched Maps; no DB calls inside the loop
- ❌ "Bare subquery in `routes/billing.ts:263` skips tenant filter" — that's a Stripe webhook resolving tenant by customer email (no JWT context possible); idiomatic, not a leak

**The one real CRITICAL was plaintext PESEL/IBAN.** That's the only item tomorrow's work addresses. The 159 type errors and the tenant-coverage audit are separate, lower-priority roadmap items.

