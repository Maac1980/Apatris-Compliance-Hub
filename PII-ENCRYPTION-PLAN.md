# PII Encryption Migration Plan

**Project:** Apatris Compliance Hub
**Target:** AES-256-GCM encryption at rest for PESEL, IBAN, passport_number, worker NIP
**Reference implementation:** EEJ `lib/encryption.ts` (format `enc:v1:<iv>:<tag>:<ciphertext>`)
**Author:** Planning doc, 2026-04-17
**Status:** NOT YET IMPLEMENTED — read-only plan

> ⚠️ **One architectural issue beyond the original outline, flagged in §11:** AES-GCM with a random IV breaks `WHERE pesel = X` lookups and `GROUP BY pesel` duplicate detection. Apatris uses both today (fraud.ts, workers-db.ts duplicate checks, document-intake worker matching). EEJ's reference does not solve this — it only supports lookup-by-id. We need a companion `pesel_hash` / `iban_hash` / `passport_hash` deterministic HMAC column. This is the single biggest decision in the plan.

---

## 1 · SCOPE

### Fields to encrypt

| Field | Sensitivity | Why encrypt |
|---|---|---|
| `pesel` | GDPR special / Polish national ID | Uniquely identifies a natural person; GDPR Art. 9 equivalent under Polish law |
| `iban` | Financial | Enables fraud if leaked; RODO-sensitive |
| `passport_number` | Identity | Immigration + border-control document number |
| `nip` (on `workers` table only) | Tax ID for sole-trader workers | Personally identifying when tied to natural person |

### Fields explicitly **NOT** encrypted

| Field | Reason |
|---|---|
| `nip` on `clients`, `crm_companies`, or hardcoded Apatris company NIP `5252828706` in contracts.ts / zus.ts / mos-package.service.ts | Company tax ID is public (visible on every invoice, GUS registry, employer A1 forms). Encrypting would break invoice generation and ZUS submission. |
| `name`, `email`, `phone` | Not in this migration's scope. Defer to later round if needed. |
| `monthly_hours`, `hourly_rate`, `advance`, `penalties`, bank transaction amounts | Not PII per Art. 4(1) GDPR — payroll math fields. |

### Tables + columns affected

| Table | Column | Type today | Type after |
|---|---|---|---|
| `workers` | `pesel` | `TEXT` | `TEXT` (ciphertext) + new `pesel_hash` `TEXT` for lookups |
| `workers` | `iban` | `TEXT` | `TEXT` (ciphertext) + new `iban_hash` `TEXT` |
| `workers` | `passport_number` | `TEXT` | `TEXT` (ciphertext) + new `passport_hash` `TEXT` |
| `workers` | `nip` | `TEXT` | `TEXT` (ciphertext); no hash (NIP lookups are not used in code today) |
| `power_of_attorney` | `pesel` | `TEXT` | `TEXT` (ciphertext); no hash (not searched) |
| `trc_cases` | `passport_number` | `TEXT` | `TEXT` (ciphertext) |
| `poa_registry` | `worker_passport_number` | `TEXT` | `TEXT` (ciphertext) |

**Source for schema locations:** `lib/init-db.ts:55-74` (workers), `:~431` (power_of_attorney), `routes/trc-service.ts:38-42` (trc_cases), `routes/worker-email.ts:218` (poa_registry).

### Files that read or write these fields (exhaustive)

> Produced by grep over `artifacts/api-server/src/` and `lib/`. Every item below must be either updated, or explicitly whitelisted as decrypt-on-read-only.

**Schema / migrations (decide column shape):**
- `artifacts/api-server/src/lib/init-db.ts:61-62` — `pesel TEXT`, `iban TEXT`, `nip TEXT` on workers
- `artifacts/api-server/src/lib/init-db.ts:~431` — `pesel TEXT` on power_of_attorney
- `artifacts/api-server/src/routes/trc-service.ts:38-42` — INSERT INTO trc_cases (`passport_number` inline)
- `artifacts/api-server/src/routes/worker-email.ts:218` — INSERT INTO poa_registry (`worker_passport_number`)

**Central CRUD service (PRIMARY choke point for writes):**
- `artifacts/api-server/src/lib/workers-db.ts` — `WorkerRow` interface (lines 25-27), `createWorker()` (line 167), `updateWorker()` (line 224)

**Write sites (INSERT / UPDATE):**
- `lib/workers-db.ts:172-181` — createWorker: duplicate-PESEL pre-check + INSERT
- `lib/workers-db.ts:185-191` — createWorker: duplicate-NIP pre-check + INSERT
- `lib/workers-db.ts:230-237` — updateWorker: duplicate-PESEL check
- `lib/workers-db.ts:241-248` — updateWorker: duplicate-NIP check
- `routes/contracts.ts:49-51` — INSERT INTO power_of_attorney (pesel)
- `routes/trc-service.ts:38-42` — INSERT INTO trc_cases (passport_number)
- `routes/worker-email.ts:218` — INSERT INTO poa_registry (worker_passport_number)
- `routes/payroll.ts:62-63` — PATCH /payroll/workers/:id updates iban via workers-db
- `routes/self-service.ts:58-59` — UPDATE workers SET iban (direct SQL, bypasses workers-db)
- `routes/workers.ts:386` — passport OCR extraction → sets passport_number
- `routes/document-intelligence.ts:214` — maps passport_number from extracted fields
- `services/document-intake.service.ts:668` — UPDATE workers SET passport_number in confirmIntake
- `lib/seed-test-scenarios.ts:107-113` — seed INSERTs with hardcoded pesel + passport
- `lib/seed-comprehensive.ts:59` — seed INSERT with pesel + iban
- `lib/init-db.ts:610-674` — bootstrap seed with hardcoded PESEL/IBAN values

**Read sites (rendered to caller, PDF, CSV, email, XML, or AI prompt):**
- `routes/fraud.ts:33` — **SELECT pesel, GROUP BY pesel** (duplicate detection — breaks under AES-GCM)
- `routes/fraud.ts:47` — **SELECT iban, GROUP BY iban** (same problem)
- `routes/zus.ts:172` — SELECT pesel → ZUS DRA XML export (plaintext on the wire to ZUS e-Płatnik)
- `routes/compliance-enforcement.ts:55, 70, 120` — PIP inspection pack JSON + PDF (plaintext PESEL)
- `routes/compliance-enforcement.ts:196-220` — Ukrainian worker status tracker
- `routes/payroll.ts:363` — payroll CSV export (plaintext PESEL + IBAN)
- `routes/contracts.ts:264` — contract PDF generation (pesel in template)
- `routes/contract-gen.ts:37, 61` — alternate contract generator
- `routes/public-verify.ts:53, 83` — public verification endpoint (already masks last-4)
- `routes/self-service.ts:30, 36, 64` — worker self-service profile (already masks display)
- `routes/document-intake.ts:135, 140` — AI extraction sandbox
- `services/vault-search.service.ts:51, 54` — worker search
- `services/document-intake.service.ts:348, 359-361` — **worker matching via pesel WHERE lookup** (breaks under AES-GCM)
- `services/document-intake.service.ts:494, 509-510` — contradiction detection via pesel matching
- `services/smart-document.service.ts:163-166` — matchWorker via pesel query
- `services/legal-intelligence.service.ts:170, 196, 238, 245, 263, 272` — pesel in legal doc generation + AI prompts
- `services/authority-response.service.ts:121` — authority response template
- `services/rejection-intelligence.service.ts:476, 541` — rejection analysis
- `services/mos-package.service.ts:75-76, 119-120, 147` — MOS package (passport_number plaintext)
- `services/legal-status.service.ts:633, 648, 669` — legal status snapshot (passport_number)
- `services/case-doc-generator.service.ts:136` — SELECT passport_number for case doc

**Audit log / export touch points:**
- `routes/compliance-enforcement.ts:129-137` — audit log entry for PIP pack export (flags "contains PESEL data")
- `routes/payroll.ts:206, 296, 393, 478` — audit log for payroll operations
- `routes/workers.ts:439, 467` — audit log for worker CREATE / UPDATE

**Affected files total:** ~68 (30 routes + 18 services + 20 lib/ and seed files). Not every file needs changes — many read via `workers-db.fetchWorkerById()` which will decrypt centrally.

---

## 2 · KEY MANAGEMENT

### New environment variable

```
APATRIS_ENCRYPTION_KEY=<64-hex-char string = 32 raw bytes>
```

**Deliberately separate from `JWT_SECRET`** — rotation requirements differ, and we don't want auth-secret compromise to also decrypt PII at rest (or vice versa).

### Generation command

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Produces a 64-character hex string. Copy output; paste into Fly secrets; also paste into password manager.

### Storage

- **Production key** → `fly secrets set --app apatris-api APATRIS_ENCRYPTION_KEY=<hex>`
- **Staging key** → `fly secrets set --app apatris-api-staging APATRIS_ENCRYPTION_KEY=<different-hex>`
- **MUST be different between environments.** A staging-key leak must not decrypt prod data.
- **Backup** → 1Password / Bitwarden entry labeled `apatris-pii-key-prod-2026` and `apatris-pii-key-staging-2026`. Two independent copies (phone + desktop vault).

### Separate HMAC key for lookup hashes

See §11 for why. We also need:
```
APATRIS_LOOKUP_KEY=<separate 64-hex string>
```
Used as the HMAC-SHA256 key for `pesel_hash`, `iban_hash`, `passport_hash` columns. Rotating this means rebuilding every hash column — treat it as effectively never-rotated. Generated and stored the same way as `APATRIS_ENCRYPTION_KEY` but **must be different**.

### Rotation strategy

**In-scope (supported):**
- Add `enc:v2:<iv>:<tag>:<ciphertext>` ciphertext format in the future. `decrypt()` reads both `v1` and `v2`. A one-shot script re-encrypts `v1` rows with the new key at `v2`. Key lives as `APATRIS_ENCRYPTION_KEY_V2` alongside v1 during cutover.

**Out-of-scope (not supported in this plan):**
- Per-tenant keys. If we ever sell the platform, each tenant should get its own key. Today: one key per environment.

### Backup plan if key is lost

**There is no recovery.**

Fields encrypted with `enc:v1:*` and an unknown key are **permanently unreadable**. Worker records will not decrypt. Payroll CSV export will output garbage. ZUS XML submission will fail. Contract generation will break.

Mitigation:
1. Key stored in **three places** before it is ever used: Fly secrets, password manager (primary device), password manager (secondary device or printed in a sealed envelope in a physical safe).
2. Before Phase 2 backfill, confirm all three copies exist and match (paste-compare).
3. Before Phase 2 backfill, `fly secrets list --app apatris-api` confirms the key is deployed.
4. **Do not proceed with backfill until step 3 is confirmed on the deployed machine** (by running a test decrypt on a non-backfilled test row).

---

## 3 · CODE CHANGES

### New file: `artifacts/api-server/src/lib/encryption.ts`

Port of EEJ `lib/encryption.ts` adapted for Apatris. Changes from the EEJ source:
- Env var: `EEJ_ENCRYPTION_KEY` → `APATRIS_ENCRYPTION_KEY`
- Warning messages: `[encryption]` prefix retained
- **No** JWT_SECRET derivation fallback in prod — we want loud failure if the key is unset on a prod deploy, not a silent fallback that would encrypt some rows with a JWT-derived key and break on key set later. Acceptable fallback: unit tests (`NODE_ENV=test`) use a fixed test key.

**Exports:**
```ts
export function encrypt(plain: string): string
export function decrypt(stored: string | null | undefined): string | null
export function isEncrypted(s: unknown): boolean
export function encryptIfPresent(value: unknown): string | undefined
export function maskForRole(value: string | null, role: Tier): string | null
export function lookupHash(plain: string): string   // HMAC-SHA256 for search
```

**Format:** `enc:v1:<iv-base64>:<tag-base64>:<ciphertext-base64>` — bit-for-bit compatible with EEJ.

### Backward compatibility

`decrypt()` checks for the `enc:v1:` prefix; if missing, it returns the input unchanged. This means legacy plaintext rows are readable during Phase 1 and Phase 2, before backfill completes.

`encrypt()` checks `isEncrypted()` first; if input is already `enc:v1:*`, returns unchanged. This makes double-encryption impossible even under partial re-runs of the backfill.

### Role-based masking

Function: `maskForRole(value, role)` — decrypts, then:

| Role | Output |
|---|---|
| T1 Executive | full plaintext |
| T2 Legal Head | full plaintext |
| T3 Tech Ops | `***-****-<last4>` |
| T4 Coordinator | `***-****-<last4>` |
| T5 Professional | only their own record, full plaintext; others: `***` |
| unauthenticated / unknown role | `***` |

Applied in `fetchAllWorkers()` and `fetchWorkerById()` as a post-decrypt step when the caller supplies their role. Direct `decrypt()` (no role) is reserved for internal flows that need the plaintext: ZUS XML, contract PDF, PIP pack, payroll CSV.

### Lookup hash function

```ts
export function lookupHash(plain: string): string {
  return createHmac("sha256", APATRIS_LOOKUP_KEY).update(plain.trim()).digest("hex");
}
```

Used to populate `pesel_hash`, `iban_hash`, `passport_hash`. Deterministic, so `WHERE pesel_hash = lookupHash(x)` works. HMAC (not plain SHA-256) so a rainbow-table attack against the hash column alone is infeasible without the key.

---

## 4 · WRITE-PATH CHANGES

### Pattern

Every write site becomes:

```ts
// Before
await execute(`UPDATE workers SET pesel = $1 WHERE id = $2`, [newPesel, id]);

// After
await execute(
  `UPDATE workers SET pesel = $1, pesel_hash = $2 WHERE id = $3`,
  [encrypt(newPesel), lookupHash(newPesel), id]
);
```

### Target list (source: §1 inventory)

1. `lib/workers-db.ts` `createWorker()` (line ~167) — the primary choke point. Wrap `pesel`, `iban`, `passport_number`, `nip` fields through `encrypt()`. Set companion `*_hash` columns for pesel/iban/passport. NIP gets no hash.
2. `lib/workers-db.ts` `updateWorker()` (line ~224) — same. For partial updates, only touch hash column when its source field is in the update payload.
3. `lib/workers-db.ts` duplicate checks (lines 172-181, 185-191, 230-237, 241-248) — change `WHERE pesel = $1` to `WHERE pesel_hash = $1` with `lookupHash(candidate)`.
4. `routes/contracts.ts:49-51` — power_of_attorney INSERT: wrap pesel.
5. `routes/trc-service.ts:38-42` — trc_cases INSERT: wrap passport_number.
6. `routes/worker-email.ts:218` — poa_registry INSERT: wrap worker_passport_number.
7. `routes/self-service.ts:58-59` — direct UPDATE bypasses workers-db; wrap iban + hash here, OR refactor to go through `workers-db.updateWorker()` (preferred).
8. `services/document-intake.service.ts:668` — confirmIntake direct UPDATE on workers.passport_number: wrap.
9. Seed files: `lib/seed-test-scenarios.ts:107-113`, `lib/seed-comprehensive.ts:59`, `lib/init-db.ts:610-674` — the seed inserts hardcoded PESEL/IBAN. Wrap these through `encrypt()` so seeded rows arrive pre-encrypted (otherwise backfill has to clean them up on first boot of a fresh DB).

### Verification

Unit test: after `createWorker({ pesel: '12345678901', ... })`, `SELECT pesel FROM workers WHERE id = ?` must return a value starting with `enc:v1:`. **Test will catch any missed write site.**

---

## 5 · READ-PATH CHANGES

### Pattern

```ts
// Before
const { pesel } = row;

// After
const pesel = decrypt(row.pesel);
// or, for role-aware:
const pesel = maskForRole(row.pesel, req.user.role);
```

### Central hook

`lib/workers-db.ts` `fetchAllWorkers()` and `fetchWorkerById()` decrypt `pesel`, `iban`, `passport_number`, `nip` before returning the row. Every route that goes through this service inherits decryption for free. That covers ~60% of read sites.

### Routes that hit the DB directly (not via workers-db)

From §1, these bypass the service layer and need per-site decryption:

| Site | Handling |
|---|---|
| `routes/fraud.ts:33, 47` | GROUP BY → use hash columns: `GROUP BY pesel_hash`. Return decrypted representative row from the DB only when the UI requests drill-down on a specific cluster. |
| `routes/zus.ts:172` | Decrypt in memory at PDF/XML render time; never write plaintext to response headers or logs. |
| `routes/compliance-enforcement.ts:55, 70, 120, 196-220` | Decrypt in memory at PDF/PIP-pack render. |
| `routes/payroll.ts:363` | CSV export: decrypt in memory at row-render. |
| `routes/contracts.ts:264`, `routes/contract-gen.ts:37, 61` | Decrypt in memory when building contract template variables. |
| `routes/document-intake.ts:135, 140` | AI extraction sandbox — decrypt for preview; masking per role optional. |
| `services/document-intake.service.ts:348-361, 494-510` | **Worker matching by PESEL**: convert `WHERE pesel = $1` → `WHERE pesel_hash = $1` with `lookupHash(candidate)`. See §11. |
| `services/smart-document.service.ts:163-166` | Same hash-column swap. |
| `services/legal-*.service.ts` | Decrypt before building AI prompts. See §11.4 on privacy — PII to LLM is a secondary concern not solved here. |
| `services/mos-package.service.ts`, `legal-status.service.ts`, `case-doc-generator.service.ts` | Decrypt in memory when building output package. |
| `services/vault-search.service.ts:51, 54` | Decrypt in memory for display; if free-text search across pesel is supported, route it through `lookupHash(query)` instead. |

### Role masking in HTTP responses

Apply `maskForRole()` at the boundary where the worker record leaves the server:
- `workers-db.fetchAllWorkers()` and `fetchWorkerById()` gain an optional `role` parameter; when supplied, they mask per §3.
- All public verification endpoints (`routes/public-verify.ts`) always mask to `***-****-<last4>` regardless of caller identity.

### Audit log sanitization

Current state (verified via grep at `routes/workers.ts:439, 467` and `routes/payroll.ts:206, 296, 393, 478`): audit log does **not** log PII values today — only field names and worker IDs. This is already safe.

Change: add a lint-style check to `lib/audit-log.ts` — if the `note` string passed to `appendAuditLog()` looks like a raw PESEL (11 digits), IBAN (starts with `PL` + 24 digits), or passport (letters + digits), replace with the literal string `[encrypted]` before persisting. Cheap, catches future regressions.

---

## 6 · DATA MIGRATION

### Phase 1 — Deploy encrypting code (no backfill)

- Add `pesel_hash`, `iban_hash`, `passport_hash` columns as nullable TEXT.
- Deploy `lib/encryption.ts`, updated workers-db, and all write-site changes.
- New writes → encrypted values + hash columns.
- Reads → `decrypt()` passes legacy plaintext through unchanged (§3 backward compat).

Effect: no data is touched at rest; all new data is safe; old data is still plaintext but reads work.

**Rollback from Phase 1:** revert the deploy. No data corruption possible.

### Phase 2 — Backfill existing rows

Port of EEJ `lib/pii-backfill.ts`:

```ts
SELECT id, pesel, iban, passport_number, nip FROM workers
WHERE (pesel IS NOT NULL AND pesel NOT LIKE 'enc:v1:%')
   OR (iban IS NOT NULL AND iban NOT LIKE 'enc:v1:%')
   OR (passport_number IS NOT NULL AND passport_number NOT LIKE 'enc:v1:%')
   OR (nip IS NOT NULL AND nip NOT LIKE 'enc:v1:%');
```

For each row: encrypt each plaintext field with `encrypt()`, compute `lookupHash()` for pesel/iban/passport, UPDATE in a single SQL. Idempotent — re-running is safe because `isEncrypted()` skips rows already in `enc:v1:` format.

Invocation: `scripts/backfill-pii.ts` (standalone, connects via `DATABASE_URL`). **Not** auto-run on boot (EEJ does; we don't, because we want explicit operator control on prod). Can be invoked via `pnpm --filter @workspace/api-server exec tsx scripts/backfill-pii.ts`.

Also backfill:
- `power_of_attorney.pesel`
- `trc_cases.passport_number`
- `poa_registry.worker_passport_number`

Batch size: 100 per transaction. Estimated runtime at 200 workers: under 30 seconds. Logs progress every batch.

**Rollback from Phase 2:** **Do not roll back after backfill runs.** The `enc:v1:*` rows are unrecoverable without the key, and rolling back the code deploy does not decrypt them — it just makes them unreadable. The only recovery is:
1. A fresh DB restore from a pre-backfill snapshot (Neon point-in-time recovery — available within retention window).
2. Or, re-deploy the encryption-capable code with the same key and keep going forward.

Before backfill runs: **confirm a Neon DB snapshot exists** from immediately before the script starts. This is the only rollback path.

### Phase 3 — Verify

- `SELECT COUNT(*) FROM workers WHERE pesel IS NOT NULL AND pesel NOT LIKE 'enc:v1:%'` — must return 0.
- Same for iban, passport_number, nip.
- Sample 5 workers: `fetchWorkerById()` returns the expected plaintext (decrypts correctly).
- Sample duplicate detection query (fraud.ts): returns the expected grouping using `pesel_hash`.
- Sample PIP inspection pack: renders with plaintext PESEL in the output PDF (internal admin only).

---

## 7 · TESTING

### Unit tests — new file `src/encryption.test.ts`

- `encrypt(plain)` returns a string starting with `enc:v1:`.
- `encrypt('')` returns `''` (empty-string passthrough, EEJ behavior).
- `decrypt(encrypt(x)) === x` for a variety of inputs (ASCII, UTF-8 Polish chars `ąćęłńóśźż`, IBAN format, empty, very long).
- `decrypt('12345678901')` returns `'12345678901'` (legacy plaintext passthrough).
- `decrypt(null)` returns `null`.
- `decrypt('enc:v1:garbage')` returns `null` + logs error (tag/IV validation fails).
- `isEncrypted('enc:v1:a:b:c')` is true; `isEncrypted('12345')` is false.
- `lookupHash('12345678901')` is deterministic (same input → same output) and differs from `lookupHash('12345678902')`.
- `lookupHash()` with different `APATRIS_LOOKUP_KEY` values produces different hashes.

### Role masking tests

- `maskForRole('enc:v1:...', 'T1')` returns plaintext.
- `maskForRole('enc:v1:...', 'T3')` returns `***-****-<last4>`.
- `maskForRole(null, *)` returns `null`.
- `maskForRole('12345678901', 'T3')` (legacy plaintext path) masks to `***-****-8901`.

### Integration tests — new file `src/pii-integration.test.ts`

- `POST /api/workers` with `{ pesel: '12345678901', iban: 'PL...', ... }` → 201. Then `SELECT pesel FROM workers WHERE id = <new>` returns a value starting with `enc:v1:`.
- `GET /api/workers/<id>` with T1 auth returns plaintext pesel.
- `GET /api/workers/<id>` with T3 auth returns `***-****-8901`.
- `POST /api/workers` with duplicate pesel returns 409 (proves the hash-column lookup works).
- `GET /api/fraud/duplicates` returns a grouping that correctly clusters 3 workers sharing the same PESEL.
- `POST /api/workers` followed by an audit log query returns `note = '[encrypted]'` if the note contained a raw-looking PESEL.

### Legacy compatibility test

- Pre-seed a worker row with plaintext pesel `99999999999` directly via SQL (bypassing the service).
- `fetchWorkerById(id)` returns plaintext `99999999999`.
- Re-run backfill script; row's pesel now starts with `enc:v1:`.
- `fetchWorkerById(id)` still returns `99999999999`.

### CI gate

Add `npx vitest run` to any pre-merge check that doesn't yet run it. (CLAUDE.md roadmap has this as a pending priority anyway.)

---

## 8 · DEPLOY ORDER

| Step | Action | Verify |
|---|---|---|
| 1 | Generate staging `APATRIS_ENCRYPTION_KEY` + `APATRIS_LOOKUP_KEY`. Store 3 copies (Fly secret, vault primary, vault secondary). | `fly secrets list --app apatris-api-staging` shows both keys |
| 2 | `fly secrets set --app apatris-api-staging APATRIS_ENCRYPTION_KEY=<hex> APATRIS_LOOKUP_KEY=<hex>` | secrets list confirms |
| 3 | Merge encryption code to `main`; deploy to staging via `fly deploy --remote-only --config fly.staging.toml -a apatris-api-staging` | `curl /api/healthz` → 200; `curl /api/push/vapid-key` → 200 (sanity check that existing routes are unaffected) |
| 4 | Create a test worker on staging via the dashboard UI. Inspect the DB: `SELECT pesel FROM workers WHERE id = <test>` via Neon console → starts with `enc:v1:` | ✅ |
| 5 | Read back the worker via `GET /api/workers/<test>` as T1, T3, T5 — confirm plaintext / masked / masked behavior | ✅ |
| 6 | Run the backfill script against staging (has some seed data with plaintext PESEL) | script reports `encrypted: N, errors: 0`; re-running reports `encrypted: 0, skipped: N` |
| 7 | Run the dashboard end-to-end on staging: create worker, generate contract PDF, export payroll CSV, run fraud duplicate detection. All produce plaintext in output. | ✅ |
| 8 | Generate prod `APATRIS_ENCRYPTION_KEY` + `APATRIS_LOOKUP_KEY` (**different** from staging). Store 3 copies. | `fly secrets list --app apatris-api` shows both |
| 9 | `fly secrets set --app apatris-api APATRIS_ENCRYPTION_KEY=<hex> APATRIS_LOOKUP_KEY=<hex>` | secrets list |
| 10 | Take a Neon point-in-time snapshot of prod. Record the snapshot timestamp. This is the rollback point for Phase 2. | Neon dashboard |
| 11 | Deploy to prod via `fly deploy --remote-only -a apatris-api` (Phase 1 — code only, no backfill) | `curl https://apatris-api.fly.dev/api/healthz` → 200 |
| 12 | Verify Phase 1 on prod: create one real test worker, confirm encryption on write; delete the test worker after. | ✅ |
| 13 | Off-peak window (weekend or 02:00 Warsaw time): run `scripts/backfill-pii.ts` against prod | report: `encrypted: 200+, errors: 0` |
| 14 | Verify Phase 3: run the 4 verification queries in §6 Phase 3 against prod | all pass |
| 15 | Update `CLAUDE.md` and remove the "PESEL/IBAN plaintext" critical debt item. | committed |
| 16 | Update `CONTEXT.md` recent-work section. | committed |

---

## 9 · ROLLBACK PLAN

| Phase | What to do if it breaks | When NOT to roll back |
|---|---|---|
| Pre-Phase 1 (key gen, secret setting) | No-op. Delete the secret via `fly secrets unset`. | n/a |
| Phase 1 deploy (code change, no data touched) | Revert the commit on `main`, redeploy via `fly deploy` or `fly releases rollback <prev-version>`. Data is untouched and readable throughout. | n/a |
| Phase 2 backfill **partial** | Stop the script. Rows already encrypted stay encrypted — and since the code is already deployed, they are readable. Re-run the script later; it's idempotent. | Do not restore from snapshot here — you'd lose legitimate work done between snapshot and now. |
| Phase 2 backfill **complete but wrong** (e.g., discovered a missed write site) | Do not roll back data. Fix the missed site with a follow-up deploy. The already-encrypted rows are fine; the newly-encrypted rows from the missed site will just be in a slightly different code path. | **Never restore from pre-backfill snapshot after users have created new workers post-backfill.** Those new workers' records would be lost. |
| Key lost after backfill | **There is no rollback.** Restore from the Phase 2 snapshot (§8 step 10) and re-run Phase 2 with a new key. All data between snapshot and restore is lost. | This is why §2 requires three independent key copies before §8 step 13. |

---

## 10 · ESTIMATED TIME

| Block | Estimate |
|---|---|
| Generate keys, set staging + prod secrets, verify | 0.5 h |
| Write `lib/encryption.ts`, unit tests, role masking, lookup hash | 1.5 h |
| Add hash columns via idempotent ALTER in init-db.ts | 0.25 h |
| Update `workers-db.ts` (write + read + duplicate checks) | 1.5 h |
| Update 10 direct-SQL sites from §5 (routes + services) | 2 h |
| Update seed files | 0.5 h |
| Write `scripts/backfill-pii.ts` + backfill unit test | 1 h |
| Integration tests (pii-integration.test.ts) | 1 h |
| Staging deploy + verification (§8 steps 1-7) | 1 h |
| Prod deploy Phase 1 (§8 steps 8-12) | 0.5 h |
| Prod backfill + verification (§8 steps 13-14) | 0.5 h |
| Docs update (§8 steps 15-16) | 0.25 h |

**Total: 10.5 h focused work.** User's outline estimated 4-6 h; that's too tight once you include the hash-column work (not in the original outline) and the 10 direct-SQL sites that go around workers-db. A realistic slot is 2 working sessions of ~5 h each over 2 days, with prod backfill on the second day's evening window.

---

## 11 · ARCHITECTURAL DECISIONS BEYOND THE OUTLINE

### 11.1 — The searchability problem

AES-256-GCM with a 12-byte random IV produces different ciphertext each time the same plaintext is encrypted. That is *required* for GCM's security guarantees. But it means:

- `WHERE pesel = $1` can never hit.
- `GROUP BY pesel` puts every row into its own group.
- `SELECT DISTINCT pesel` returns every row.

Apatris uses all three patterns today (source: §1 inventory):
- `routes/fraud.ts:33` — `GROUP BY pesel` for duplicate detection
- `routes/fraud.ts:47` — `GROUP BY iban` for duplicate IBANs
- `lib/workers-db.ts:172-181, 185-191, 230-237, 241-248` — `WHERE pesel = $1` / `WHERE nip = $1` for duplicate-prevention pre-checks
- `services/document-intake.service.ts:348-361, 494-510` — worker matching on PESEL from OCR'd documents
- `services/smart-document.service.ts:163-166` — same pattern

EEJ does not solve this. EEJ's reference code only supports `WHERE id = $1` lookups; it has no PESEL duplicate check and no fraud.ts equivalent.

**Solution:** add a deterministic HMAC-SHA256 column next to each searchable encrypted field:
- `workers.pesel_hash TEXT` — HMAC(APATRIS_LOOKUP_KEY, plaintext_pesel)
- `workers.iban_hash TEXT`
- `workers.passport_hash TEXT`

Writes: set both `pesel` (ciphertext) and `pesel_hash` in the same UPDATE. Searches: rewrite every `WHERE pesel = $1` as `WHERE pesel_hash = lookupHash($1)`. Duplicate detection: `GROUP BY pesel_hash`.

The HMAC key (`APATRIS_LOOKUP_KEY`) is separate from `APATRIS_ENCRYPTION_KEY` so a ciphertext-key leak doesn't also leak a rainbow-table vector against the hash column. Both keys must be stolen to recover plaintext *and* correlate it across rows.

Cost: two extra TEXT columns (~64 bytes each) on one table. Indexable. Fast.

### 11.2 — NIP-on-workers vs NIP-on-clients

The `nip` column exists on **three** tables in Apatris:
- `workers.nip` — sole-trader worker's personal tax ID. **Encrypt.**
- `clients.nip` — client company's public tax ID. **Do not encrypt.** Appears on invoices.
- `crm_companies.nip` — same as clients.

And there are hardcoded Apatris-own company NIPs in `routes/contracts.ts:16, 258, 329`, `routes/zus.ts:109`, `services/mos-package.service.ts:64`. These are Apatris's own NIP (5252828706), which is a public identifier on every contract and invoice. **Do not encrypt.**

### 11.3 — Seed data

Seed files (`lib/init-db.ts:610-674`, `lib/seed-test-scenarios.ts:107-113`, `lib/seed-comprehensive.ts:59`) contain hardcoded PESEL/IBAN/passport strings. On a fresh DB boot, these rows arrive as plaintext unless the seed goes through `encrypt()`.

Two options:
- (A) Leave seed plaintext, rely on the auto-backfill script. Simpler but messy.
- (B) Wrap every seed INSERT's PII fields in `encrypt()` and `lookupHash()`. Cleaner.

Plan prefers **B** — seeds run through the same encryption path as production writes. One line changed per seed file.

### 11.4 — PII to LLM prompts (out of scope for this migration, flagged)

`services/legal-intelligence.service.ts`, `services/document-intake.service.ts`, and `services/mos-package.service.ts` build AI prompts that include decrypted plaintext PESEL / passport. Anthropic's TOS allows this; GDPR requires it only if the data controller has a DPA with Anthropic (Apatris does, via the enterprise agreement).

This plan does **not** change the AI-prompt pathway. Plaintext PESEL still goes to Claude. A later round could:
- Redact to last-4 in prompts, pass full plaintext only in a separate authenticated channel, or
- Tokenize (replace `PESEL=X` with `PESEL=<token>` in the prompt, map back after).

Not in this migration's scope. Flagged so it doesn't look forgotten.

### 11.5 — Why not just use pgcrypto?

PostgreSQL's pgcrypto extension can do AES-256-GCM at the DB layer. We are choosing app-layer encryption instead because:
- The key lives in Fly secrets, not the DB. Anyone with DB read access still sees ciphertext — a pgcrypto approach would make the DB decrypt on SELECT, defeating the point.
- Consistency with EEJ's proven pattern — same team can maintain both codebases.
- Easier to rotate application-owned keys than DB-owned keys.

---

## 12 · OPEN QUESTIONS (to resolve before coding)

1. **Does Phase 2 backfill run during a maintenance window, or hot?** Writes during backfill are safe (encrypted path is already live), but a hot run competes with user traffic. Recommend: off-peak.
2. **Should T5 workers see their own plaintext on the mobile app?** Plan says yes (§3 role table). Confirm with user — alternative is "always masked, even to the worker themselves."
3. **Do we encrypt `trc_cases.passport_number` and `poa_registry.worker_passport_number`, or just the `workers.passport_number` source column?** Plan says yes, encrypt everywhere — consistency. Confirm.
4. **Neon retention window for point-in-time recovery?** Needs to be confirmed ≥ 7 days before running Phase 2.

---

## 13 · DEFINITION OF DONE

- [ ] `lib/encryption.ts` deployed, unit tests green
- [ ] `pesel_hash`, `iban_hash`, `passport_hash` columns added to workers
- [ ] Every write site from §4 target list updated
- [ ] Every read site from §5 target list either goes through workers-db.ts OR has its own decrypt/hash-swap
- [ ] Audit log sanitizer in place in `lib/audit-log.ts`
- [ ] `scripts/backfill-pii.ts` exists, runnable, idempotent
- [ ] Staging: backfilled, verified via §6 Phase 3 checks
- [ ] Prod: backfilled, verified via §6 Phase 3 checks
- [ ] `SELECT COUNT(*) FROM workers WHERE pesel NOT LIKE 'enc:v1:%'` = 0 on prod
- [ ] CLAUDE.md critical-debt entry for plaintext PII: removed
- [ ] CONTEXT.md recent-work: updated
- [ ] Both encryption keys stored in at least 3 independent places
