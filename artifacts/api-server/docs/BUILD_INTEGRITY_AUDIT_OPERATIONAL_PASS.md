# BUILD INTEGRITY AUDIT — Operational Pass (between Session 3 and Session 4)

**Audit date:** 2026-05-02 (Sunday — between Session 3 close and Session 4 launch)
**Pass scope:** 8 items (a–h) grouped into 3 gates (GATE-OP-1, GATE-OP-2, GATE-OP-3) per save prompt; modified at start to Branch 1 (items a + b deferred to future pass after staging reactivation; items c–h executed)
**Status:** working draft — GATE-OP-1 close
**Author:** APATRIS Claude (executor + active reviewer); Manish + chat-Claude (last source of truth); Holmes structural review of save prompt (not execution).

This document is the read-only record of operational pass findings between Session 3 (Dimensions 7 + 1) and Session 4 (Dimensions 5 + 6). NOT committed during operational pass — working draft until full audit synthesis (Session 5).

---

## Pre-execution verification

### V1 — Repo state baseline

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `3e6cc89286f2432679f6d81680713e1323a28aa0` (matches Session 3 close) |
| Sync with `origin/main` | ahead 0, behind 0 |
| Pre-existing untracked items | `.claude/skills/superpowers/`, six BUILD_INTEGRITY_AUDIT sub-files |
| Pre-existing modified items | `.mcp.json`, `artifacts/apatris-dashboard/dist/public/index.html`, `artifacts/api-server/dist/index.cjs`, `artifacts/workforce-app/dist/public/index.html` (Tier-2 #4 dist gitignore observation per DIMENSION_3.md), `artifacts/apatris-dashboard/dist/public/assets/purify.es-CovBOfck.js` (deleted) |

V1 ✅ pass.

### V2 — Six audit sub-files exist

```
BUILD_INTEGRITY_AUDIT_DIMENSION_0.md  ( 9347 bytes, May  1 11:31)
BUILD_INTEGRITY_AUDIT_DIMENSION_1.md  (26020 bytes, May  2 10:55)
BUILD_INTEGRITY_AUDIT_DIMENSION_2.md  (19698 bytes, May  1 13:38)
BUILD_INTEGRITY_AUDIT_DIMENSION_3.md  (53466 bytes, May  2 11:31)
BUILD_INTEGRITY_AUDIT_DIMENSION_4.md  (36255 bytes, May  2 11:31)
BUILD_INTEGRITY_AUDIT_DIMENSION_7.md  (40920 bytes, May  2 10:47)
```

V2 ✅ pass.

### Branch 1 reality-vs-plan resolution

Two pre-execution discoveries surfaced before GATE-OP-1 deep execution:

1. **Flyctl auth absent in operational pass shell session.** Session 3 GATE 7 had flyctl access; operational pass session inherited a clean shell without auth credentials. Initial `flyctl apps list`, `flyctl status`, `flyctl auth whoami` all returned `Error: no access token available`. Surfaced as reality-vs-plan; Manish ran `flyctl auth login` interactively; auth re-confirmed as `manishshetty79@gmail.com`; v295 prod app reachable; both machines `started` and passing checks.

2. **Staging environment suspended (per Session 3 D7-4).** Items (a) `agent_queries` observability and (b) `kg_*` auto-population health both required SELECT against staging/dummy DB. With staging suspended and the operational-pass hard boundary `NO connection to production DB. NO SELECT against production. ABSOLUTE.`, items (a) + (b) have no read-only target.

**Branch 1 resolution applied per Manish + chat-Claude confirmation:** items (a) + (b) deferred to a future operational pass after staging reactivation. Items (c) + (d) + (e) + (f) + (g) + (h) execute as scoped.

**Modified gate structure:**
- GATE-OP-1 covers item (c) only — items (a) + (b) deferred
- GATE-OP-2 covers items (d) + (e) + (f) — unchanged
- GATE-OP-3 covers items (g) + (h) — unchanged

---

## Operational hygiene findings (surfaced during operational pass execution)

These observations capture systemic patterns visible only at the operational layer. They are not architectural verdicts and do NOT change Sessions 1–3 verdicts. They feed Session 5 synthesis as cumulative-trajectory data.

### Hygiene-1 — Staging environment suspension blocks audit work

Staging Fly app `apatris-api-staging` was suspended (per Session 3 D7-4 finding). Operational pass items (a) `agent_queries` observability and (b) `kg_*` auto-population health both required staging DB access and are deferred to a future pass after staging reactivation.

**Pattern:** operational hygiene deferred long enough that audit work itself is now blocked. The deferral was rational at each step (no live customer load, prod is read-only authoritative, save costs) but compounds: D7-4 noted suspension; operational pass scoped DB items against staging anyway under the assumption it would be reactivated; reactivation didn't happen between Session 3 and the operational pass; audit items defer.

**Recommendation:** schedule staging reactivation as part of next operational hygiene work — not as a remediation but as a precondition for the deferred audit items (a) + (b) AND for safe Layer-3 build-time experimentation against representative-but-non-prod data. Feeds Session 5 synthesis as cumulative-trajectory data showing how operational-discipline deferrals propagate.

### Hygiene-2 — Flyctl session-context observation (methodology note)

Operational pass execution discovered flyctl auth token did not carry across shell sessions — Session 3 had flyctl access but the operational pass session did not. Bash subshells launched here inherit `~/.fly/config.yml` automatically once it exists, but if a session starts before any local `flyctl auth login` has run (or if credentials live in a different home, or under an `FLY_API_TOKEN` env var not exported into this shell), authentication fails on first flyctl call. Auth was re-established by Manish running `flyctl auth login` interactively; verified via `flyctl auth whoami`.

**Recommendation (methodology):** confirm flyctl auth state in V1 verification, not at item execution time. Add to V1 baseline checks for any future operational pass that depends on flyctl. Avoids mid-execution authentication discoveries that delay flow.

---

## Item (c) — Silent-failure trace spot-check

**GOAL:** Verify which silent failures are firing in production right now, beyond the three already surfaced in Session 3 GATE 7. Cross-reference catch-block patterns from `init-db.ts` (Session 2 D2) and `legal-case.service.ts:260-282` fan-out (Session 2 Hook 1).

**EXECUTION:** `flyctl logs --app apatris-api --no-tail` recent buffer captured.

### (c)-1 — Log window observed

| Metric | Value |
|---|---|
| Buffer size returned by `flyctl logs --no-tail` | 100 lines (after stripping ANSI codes + Metrics-token warning) |
| First entry | 2026-05-02T05:46:46Z |
| Last entry | 2026-05-02T13:27:31Z |
| Window duration | ~7 hours 41 minutes |
| Both Fly machines represented | ✓ (`891361a6672738`, `d8d5056c126908`) |
| HTTP/request traces | 0 (Pino logger configured to suppress request-level logs at info level; only error-class events surface) |
| Service tags observed | `[DB]` (66), `[Escalation]` (4), `[Scheduler]` (2), `[cause]` (2 — Node `Error.cause` continuation lines) |

### (c)-2 — Pattern inventory (with frequency + severity)

| Pattern | Count in 7.7h window | Per-day projection | Per-machine | Severity | Source |
|---|---|---|---|---|---|
| `[DB] Unexpected pool client error: Connection terminated unexpectedly` | 66 | ~206/24h | 24 on `8913…`, 42 on `d8d5…` (asymmetric ~1.75x) | 🟡 noisy / not crash-grade | `lib/db.ts:25-27` `pool.on("error")` callback |
| `[Escalation] Error: column w.first_name does not exist` | 4 | ~12/24h | 2 / 2 (symmetric) | 🔴 silent functional failure | `services/escalation-engine.service.ts:27,38,106,114` (per Session 3 D1-PRIORITY-A — born in `61977ad`) |
| `[Scheduler] Regulatory scan/snapshot error: Error: Connection terminated due to connection timeout` (with stack trace) | 2 | ~6/24h (matches daily-scan cadence) | 1 / 1 | 🔴 silent functional failure (daily cron returns no data) | `services/daily-legal-scan.service.ts` triggered by `lib/scheduler.ts:startDailyRegulatoryScan` — symptom of root cause = pool timeout from item (g) |
| `init-db` warnings | 0 | n/a | n/a | (boot-only; v295 booted 2026-04-24, ~8 days outside buffer) | `init-db.ts` catch blocks 2332/3625/3646/3669/3692/3711 (per Session 2 D2) |
| Fan-out service tags (`[CaseNotebook]`, `[CaseSync]`, `[KnowledgeGraph]`, `[CaseDocGen]`) | 0 | n/a | n/a | **invisible** — see (c)-3 below | `services/legal-case.service.ts:260-282` fan-out wraps each downstream call in `try { ... } catch { /* non-blocking */ }` with NO log call inside the catch |
| Sentry capture mentions in stdout | 0 | n/a | n/a | confirms Session 3 D7-5 finding: silent catches don't reach Sentry | — |

### (c)-3 — Three categories of silent-failure observability

The 7.7-hour window confirms three distinct silent-failure categories with different visibility properties:

1. **Vocal-fail with logger** (DB pool errors, escalation engine, regulatory scan):
   - DO log to stdout via `console.error` / `console.warn` with `[Service]` tag
   - DO NOT reach Sentry (per Session 3 D7-5 — Sentry middleware only captures unwrapped route exceptions; these come from cron handlers and `pool.on("error")` callbacks that wrap their own errors)
   - Visible to anyone reading `flyctl logs`; invisible to Sentry dashboards
   - Captures the three Session 3 D7-2(d) findings

2. **Silent-fail no logger** (legal-case fan-out catches at lines 260-282, plus parallel patterns elsewhere):
   - Empty catch body OR `/* non-blocking */` JS comment without any logger call
   - ZERO output anywhere — stdout, Sentry, structured logs, all silent
   - Cannot quantify frequency from logs alone; cannot distinguish "no failure" from "silent failure" without instrumenting the catch
   - **Confirms Session 3 D7-5 cross-dim implication:** the systemic gap is not "Sentry doesn't capture them"; it's "no logger anywhere captures them."

3. **Silent-fail boot-time `console.warn`-only** (`init-db.ts` catches at lines 2332/3625/3646/3669/3692/3711):
   - DO emit at boot via `console.warn`
   - But our 7.7h window is mid-runtime — boot was 2026-04-24 (v295 deploy date), ~8 days outside the buffer
   - Cannot test from this window; would need a future deploy event OR `flyctl logs` retention longer than the default rotating buffer

### (c)-4 — Cross-reference with init-db.ts catch blocks (Session 2 D2 finding)

Lines 2332, 3625, 3646, 3669, 3692, 3711. **NOT testable in this window** — those catches fire only at boot, and v295's boot is 8 days old. Operational pass output: catches are real (Session 2 D2 verified); their boot-time firing is not observable here. Recommend re-checking next deploy event by capturing logs immediately post-boot.

### (c)-5 — Cross-reference with `legal-case.service.ts:260-282` fan-out

Wraps four downstream calls (`logStatusChange`, `syncLegalCaseToTrcCase`, `recordCaseInGraph`, `generateDocumentForStage`) each in `try { ... } catch { /* non-blocking */ }` with no logger inside the catch. **Zero log output observed for any fan-out service in 7.7-hour window.** Three possible interpretations:

- (i) No case status changes fired in this window
- (ii) Status changes fired and downstream services succeeded silently (no info-level log surfaces because Pino is at error/warn-only effective level for these services)
- (iii) Status changes fired and downstream services failed silently (catches swallowed errors)

Cannot distinguish from logs alone. This confirms Session 3 D7-5 cross-dim finding: **without explicit logger calls inside the catch blocks, silent failures stay invisible.** Stabilization-eligible item already named in DIMENSION_2 Tier-2 + DIMENSION_7 D7-5 — confirmed empirically here.

### (c)-6 — Frequency trend on DB pool errors (sharpens Session 3 Pre-D1 Verification 2)

Per-hour distribution within the 7.7h window:

```
T05: 3   T06: 7   T07: 10   T08: 7   T09: 8   T10: 8   T11: 10   T12: 8   T13: 5
```

(T05 + T13 are partial hours.) Steady-state ~7–10/hour = **~206/24h projection** — close to Session 3 Pre-D1 Verification 2's ~240/24h projection but slightly lower in this window (no per-hour escalation; flat pattern). Reinforces Session 3 D1-PRIORITY-C "longstanding-not-recent-regression" reframe: pattern is steady from `9db39cb` config landing onward, not escalating in operational-pass window.

### (c)-7 — Item (c) reality-vs-plan

**EXPECTED:** flyctl logs over last 7 days, comprehensive silent-failure inventory.

**FOUND:** `flyctl logs --no-tail` returns recent buffered logs only; the available buffer was 100 lines = ~7.7 hours, not 7 days. flyctl's default log retention is the rotating Vector buffer per machine, not a 7-day archive. Longer history would need a Sentry archive (silent failures don't reach there), a custom log shipper (not configured per CLAUDE.md), or external log aggregation (none configured).

**REASONABLE INTERPRETATION:** 7.7-hour window is sufficient to confirm Session 3 D7-2(d) findings still firing (DB pool errors, escalation engine, regulatory scan all observed at expected cadence), but cannot quantify long-term trend or detect rare-event patterns (e.g., a once-per-week silent failure). The three patterns Session 3 surfaced are stable and steady; no new silent-failure categories surfaced. This is sufficient signal for operational-pass purposes.

**RECOMMENDATION:** Note as observability gap. Long-term silent-failure tracking is a stabilization candidate (Tier-2 — log shipper / aggregator setup) but not a Production fix. Current logs sufficient to confirm patterns; insufficient for archaeology.

---

## GATE-OP-1 — STOP

**Items covered:** (c) only. Items (a) + (b) deferred to future pass per Branch 1 resolution.

### Findings

1. **Item (c) — Silent-failure trace spot-check** completed against 7.7-hour Fly logs window:
   - Three Session 3 D7-2(d) silent-failure patterns ALL still firing at expected cadence (DB pool errors ~206/24h projection; escalation engine 4 in window with `w.first_name does not exist`; regulatory scan 2 in window with connection timeout).
   - No new silent-failure categories surfaced beyond Session 3 inventory.
   - Three observability categories framed: vocal-fail-with-logger (visible in stdout, invisible to Sentry), silent-fail-no-logger (invisible everywhere), boot-only-`console.warn` (not testable mid-runtime).
   - Fan-out catches (legal-case.service.ts:260-282) confirmed unobservable: zero log output for case-notebook / case-sync / kg_* / case-doc-gen across full window. Cannot distinguish "no failures" from "silent failures."
   - DB pool error rate ~206/24h slightly lower than Session 3 ~240/24h but flat (no escalation) — reinforces D1-PRIORITY-C longstanding-not-regression reframe.

2. **Items (a) + (b) deferred** with reason captured in Hygiene-1: staging suspended, production DB excluded by hard boundary, no read-only target available. Future pass after staging reactivation will execute these.

3. **Operational hygiene findings** captured (Hygiene-1 staging suspension; Hygiene-2 flyctl session-context methodology note).

### Reality-vs-plan mismatches

- Item (c) "last 7 days" was aspirational — flyctl logs returns rotating buffer, not 7-day archive. 7.7-hour window sufficient for pattern confirmation; insufficient for archaeology. Surfaced in (c)-7.
- Items (a) + (b) staging-DB requirement unmet — staging suspended. Resolved via Branch 1 (defer).

### Implications and observations beyond literal items

- **Pattern: silent-fail-no-logger is the systemic invisibility, not Sentry coverage.** The legal-case fan-out catches don't merely fail to reach Sentry — they fail to reach ANY logger. Wiring Sentry into `pool.on("error")` would capture (c)-3 category 1 (vocal-fail-with-logger) but does NOTHING for category 2 (silent-fail-no-logger) which is the actually-invisible class. Remediation pattern: add `logger.error({err}, "[Service] non-blocking failure in fan-out")` inside each fan-out catch BEFORE Sentry capture is added. The logger gives stdout visibility; Sentry then trivially attaches.
- **Frequency confirms 19-day silent persistence of escalation engine bug.** Session 3 D1-PRIORITY-A documented `61977ad` ship date 2026-04-13 → today 2026-05-02 = 19 days; observing `Error: column w.first_name does not exist` four times in 7.7 hours = bug actively firing at every escalation cron invocation today, exactly as it has every day for those 19 days. The bug is not intermittent; it fires at the cron's full cadence. Build philosophy implication for Session 4: this isn't an "escaped bug" — it's a "service that has never worked since it shipped, with zero feedback loop to detect that."
- **Daily regulatory scan failure cadence is 1× per day per machine, not intermittent.** Two errors in window at 06:00:41 + 06:00:48 (one per machine, 7-second gap) = the daily cron fires once per machine per day and fails on connection-timeout 100% of the time in the observed window. The scheduler IS firing on schedule; the work is silently failing at every fire. Same pattern shape as escalation engine (cron fires; SQL/connection fails; catch swallows; nothing surfaces).
- **Cross-pass observation**: items (a) + (b) defer is itself a Session 4 input — the build's operational discipline allowed staging to suspend long enough that audit work blocked. This is the kind of empirical signal Session 4 (Dimensions 5+6 — build philosophy + doc truthfulness) can use.

### Cross-pass recharacterization (preliminary)

No verdict changes proposed at GATE-OP-1. Item (c) findings reinforce Session 3 verdicts; do not contradict. Final cross-pass recharacterization check at GATE-OP-3 close.

### Suggestion for next step

Proceed to GATE-OP-2 (items d + e + f). Item (d) is repo-only `trc_cases.tenant_id` JOIN investigation; item (e) builds on Pre-D1 Verification 1 with code-path encryption-use audit per granularity guidance; item (f) inspects Sentry config + machine env state. All three are read-only and within scope.

**GATE-OP-1 confirmed by Manish + chat-Claude with three observations carried forward:**

1. **"Service that has never worked since it shipped" reframe** of the escalation engine bug held for Session 4 build-philosophy assessment; not a Session 3 verdict change.

2. **Category 2 silent-fail-no-logger interpretation kept open**: legal-case fan-out invisible across full 7.7h window has two competing explanations (low usage triggering fan-out infrequently; OR silent catches with no `logger.error`). Both feed Session 5 — first feeds Layer 3 cost-reducing-substrate dependency; second feeds Sentry-remediation pattern. Hold both interpretations open until items (a) + (b) execute against staging post-reactivation.

3. **Sentry remediation framing**: Sentry is downstream consumer of structured logging that doesn't exist yet, not the missing piece itself. Item (f) below captures this remediation pattern explicitly.

---

## Item (d) — `trc_cases.tenant_id` type investigation

**GOAL:** Determine if `trc_cases.tenant_id` (TEXT) requires elevation from Tier-2 to Production fixes pending. Session 2 D4-4 finding deferred to operational pass.

### (d)-1 — Schema confirmation

`init-db.ts:2314-2321` — `trc_cases` definition:

```sql
CREATE TABLE IF NOT EXISTS trc_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  worker_id TEXT,
  worker_name TEXT NOT NULL, ...
)
```

Confirmed: **`tenant_id TEXT NOT NULL` AND `worker_id TEXT`** — both columns deviate from the rest of the schema. The rest of the schema's `tenant_id` columns (workers, documents, admins, site_coordinators, compliance_snapshots, hours_log, mobile_pins, payroll_*, notification_log, audit_logs, plus 14 more) are uniformly `tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`. **trc_cases is the schema outlier.**

### (d)-2 — Cross-table usage inventory

49 grep hits across api-server source. Three patterns:

**Pattern A — Single-table queries with explicit `::text` cast on parameter** (most common):
- `routes/trc-service.ts` — 10 sites: `WHERE tenant_id = $1` (no explicit cast; pg driver type-infers from JS string parameter)
- `routes/legal-status.ts:91`, `services/legal-status.service.ts:121`, `services/legal-copilot.service.ts:81`, `services/authority-response.service.ts:138`, `services/mos-engine.service.ts:223`, `services/mos-engine.service.ts:290`, `services/action-engine.service.ts:68`, `services/legal-document.service.ts:170` — all use `worker_id = $1::text AND tenant_id = $2::text` (explicit double-cast)
- `services/case-sync.service.ts:60, 156`, `services/cross-worker-intelligence.service.ts:173, 234` — use `tenant_id = $1::text` (single cast)
- `services/document-intake-hardening.service.ts:282, 293`, `routes/legal-immigration-command.ts:39-42` — direct WHERE filters

These are NOT JOINs; they are WHERE-clause filters. Type matches by parameter binding (JS string → SQL TEXT). **No type-coercion JOIN risk.**

**Pattern B — JOINs on `id` (UUID), tenant filtered separately**:
- `services/case-sync.service.ts:228` — `LEFT JOIN trc_cases tc ON tc.id = lc.trc_case_id` (UUID = UUID; tenant filter on `lc.tenant_id` separately)
- `services/cross-worker-intelligence.service.ts:183` — same pattern

**No type clash.** JOIN is on `id` UUID columns; tenant filtering is on `lc.tenant_id` (UUID).

**Pattern C — Cross-type JOIN with explicit `::text` casts on both sides** (one site only):
- `services/legal-evidence-ocr.service.ts:204`:
  ```sql
  LEFT JOIN trc_cases tc ON tc.worker_id = le.worker_id::text AND tc.tenant_id = le.tenant_id::text
  ```
  This JOINs `legal_evidence` (UUID worker_id, UUID tenant_id) against `trc_cases` (TEXT worker_id, TEXT tenant_id) using **explicit `::text` casts on both sides** of the JOIN condition.

### (d)-3 — Cross-type JOIN impact assessment (Pattern C)

**Performance:** The `::text` cast is per-row on the `legal_evidence` side. Index usage: `trc_cases` has indexes on `(tenant_id, worker_id, case_reference)` and `(tenant_id, worker_id)` which are TEXT-indexed; PostgreSQL CAN use these via index lookup on the cast values. The `legal_evidence` side is the JOIN driver (the FROM table); it's typically filtered upstream by `le.id = $1` before the JOIN, so the cast affects ≤1 row most of the time. **Real-world performance impact: bounded.**

**Correctness:** UUID-to-text cast is canonical (`gen_random_uuid()` produces lowercase 36-char hyphenated form; cast preserves this). `trc_cases.worker_id` and `trc_cases.tenant_id` must hold text values that match the canonical UUID form for the JOIN to find rows. If `trc_cases.worker_id` is ever populated with non-canonical text (e.g., uppercase, malformed, or unrelated string identifier), the JOIN silently returns null — which is the LEFT JOIN's correct behavior, but masks the data inconsistency.

**Schema-cleanliness liability:** Real. Future maintenance hazard if a developer adds a new JOIN against trc_cases without realizing tenant_id is TEXT not UUID; type mismatch could surface as "no rows match" without explicit error.

### (d)-4 — Classification per save prompt's branching rule

Save prompt classification:
- "Type-coerced JOINs found: elevate to Production fixes pending #5"
- "No cross-type JOINs: keep at Tier-2"

**Strict reading:** A type-coerced JOIN exists at `legal-evidence-ocr.service.ts:204`. **Recommend elevation to Production fixes pending #5** with a bounded-impact qualifier:

- The explicit `::text` cast is intentional, not silent coercion at the driver level
- Performance impact bounded by upstream filtering of `legal_evidence`
- Correctness depends on canonical-UUID storage in `trc_cases.worker_id` / `tenant_id` (probabilistic, not enforced)
- **Long-term remediation:** ALTER `trc_cases.tenant_id` to UUID (with FK to `tenants(id)` ON DELETE CASCADE) and `trc_cases.worker_id` to UUID (with FK to `workers(id)`). Single migration; data exists in canonical UUID form already (per case-sync.service.ts comment "[id]→tenant_id::text" usage); migration is type-tightening, not data migration.

**Active-reviewer note:** This is borderline — single JOIN site, bounded impact, explicit cast — and might equally be classified as Tier-2 with an "elevate if frequency increases" condition. Operational urgency is low. Recommend Production fixes pending #5 per strict reading of save prompt; final classification with Manish + chat-Claude.

### (d)-5 — Item (d) reality-vs-plan

**EXPECTED:** Find type-coerced JOINs OR confirm no cross-type JOINs.

**FOUND:** Mixed — most usage is single-table WHERE with parameter binding (no clash), and most JOINs are on UUID `id` columns (no clash), but one cross-type JOIN exists at `legal-evidence-ocr.service.ts:204` with explicit `::text` casts.

**REASONABLE INTERPRETATION:** The schema's TRC-cases legacy (likely seeded from Airtable migration where tenant/worker IDs were strings) was preserved when the rest of the schema went UUID-FK-tenants-table. The single JOIN at line 204 exists because `legal_evidence` is the modern UUID schema and needs to JOIN against the TRC legacy schema for OCR verification.

**RECOMMENDATION:** Production fixes pending #5 per strict save-prompt rule, with bounded-impact qualifier. Or alternatively: keep at Tier-2 and tighten classification rule to "type-coerced JOINs with high frequency / unbounded impact." Manish + chat-Claude decision.

---

## Item (e) — Encryption keys verification + code-path use audit

**GOAL:** Build on Pre-D1 Verification 1 (key presence) with encryption-USE verification at CODE-PATH level (per Session 3 close granularity guidance).

### (e)-1 — Pre-D1 Verification 1 confirmation

Per Session 3 DIMENSION_7.md Pre-D1 Verification 1: `flyctl ssh console --app apatris-api -C "sh -lc 'env | grep APATRIS'"` confirmed `APATRIS_ENCRYPTION_KEY` and `APATRIS_LOOKUP_KEY` present on the running prod Fly machine, with `_BACKUP` variants also present (rotation safety net), 32-byte hex strings (length-confirmed; values intentionally redacted from audit docs).

**Status: ✅ keys present and length-confirmed.**

### (e)-2 — Encryption module location + behavior

**Module:** `artifacts/api-server/src/lib/encryption.ts` (132 lines).

**Functions exported:**
- `encrypt(plain)` — AES-256-GCM with random 12-byte IV; returns `enc:v1:<iv>:<tag>:<ciphertext>` base64-tuple
- `decrypt(stored)` — reverses; returns null on malformed ciphertext or auth-tag mismatch; passes through plaintext (legacy support)
- `encryptIfPresent(value)` — null-safe wrapper for write paths
- `lookupHash(plain)` — HMAC-SHA256 deterministic hash for index lookups (separate `APATRIS_LOOKUP_KEY`)
- `maskForRole(value, role)` — tier-based masking: T1/T2 plaintext, T3/T4/T5 last-4-digits-only with `***-****-XXXX` format
- `isEncrypted(s)` — prefix check on `"enc:v1:"`
- `__resetKeyCacheForTests()` — guarded by `NODE_ENV === "test"`

**Key resolution behavior** (lines 10-26):
- Reads `APATRIS_ENCRYPTION_KEY` / `APATRIS_LOOKUP_KEY` from `process.env`
- In test env: falls back to `"00".repeat(32)` / `"11".repeat(32)` (test fixtures)
- In non-test env: **throws hard** if env missing (`[encryption] X is required`)
- Validates: must be exactly 64 lowercase hex chars (32-byte key)

**Operational implication:** v295 has been up since 2026-04-24 with passing health checks (per Session 3 D7-3). If keys were missing, key resolution would throw on first encrypt/decrypt call (likely during `init-db.ts` seed or first worker write), and the failure would surface either at boot (terminating the process) or as a route-handler error (caught by Sentry middleware). Neither has happened. **Encryption module IS operational on prod.**

### (e)-3 — Code-path inventory (per granularity guidance: code-path level, not per-PII-field)

22 caller files across api-server source. Categorized:

**Routes (HTTP-touching, request-driven encryption):**
- `routes/trc-service.ts` — `encryptIfPresent(passportNumber)` on TRC create/update
- `routes/contracts.ts` — `encryptIfPresent(pesel)` on contract worker fields
- `routes/self-service.ts` — `encryptIfPresent` + `lookupHash` on worker self-service updates
- `routes/worker-email.ts` — `encryptIfPresent(workerPassportNumber)` on email send
- `routes/public-verify.ts` — `decrypt(worker.passport_number)` on public verification token flow
- `routes/payroll.ts` — `decrypt` + `Tier` type for payslip generation
- `routes/contract-gen.ts` — `decrypt(pesel/iban/passport_number)` on contract generation
- `routes/compliance-enforcement.ts` — `decrypt(w.pesel)` on compliance read paths
- `routes/workers.ts` — imports `Tier` type only (uses `maskForRole` indirectly via `lib/compliance.ts`)
- `routes/zus.ts` — imports `Tier` type only

**Services (background and internal):**
- `services/vault-search.service.ts` — `decrypt(w.pesel)` on search results
- `services/document-intake.service.ts` — `encryptIfPresent` + `lookupHash` + `decrypt` on intake (pesel, passport_number)
- `services/worker-validation.service.ts` — `decrypt(worker.pesel)` on validation
- `services/smart-document.service.ts` — `lookupHash(pesel)` on smart-doc matching
- `services/case-doc-generator.service.ts` — `decrypt(pesel/passport_number)` on doc generation
- `services/authority-response.service.ts` — `decrypt(worker.pesel/passport_number)` on authority response
- `services/mos-package.service.ts` — `decrypt(worker.pesel/passport_number)` on MOS package generation

**Library (shared infrastructure):**
- `lib/workers-db.ts` — `encryptIfPresent` + `lookupHash` + `decrypt` + `isEncrypted` on workers CRUD (the central PII write path)
- `lib/compliance.ts` — `maskForRole` on compliance reads (tier-based masking)
- `lib/init-db.ts` — `encryptIfPresent` + `lookupHash` on seed data for initial worker rows
- `lib/seed-comprehensive.ts` — `encryptIfPresent` + `lookupHash` on demo seed
- `lib/seed-test-scenarios.ts` — `encryptIfPresent` + `lookupHash` on test-scenario seed

**Code-path verdict:** encryption is **wired into the central CRUD path (`lib/workers-db.ts`)** and fans out through routes (10+ sites) and services (7+ sites). Module is operational and used at substantial scope. **PII encryption posture: ACTIVE.** Per Pre-D1 + this code-path tracing, the encryption-at-rest claim in counsel handoff packet is grounded in real wiring, not aspirational.

### (e)-4 — Parallel encryption path discovered (not part of `lib/encryption.ts`)

`routes/messaging.ts:9-23` defines its OWN local `encrypt`/`decrypt` functions:

```ts
// Simple encryption (XOR with key hash — production should use AES)
const ENC_KEY = process.env.JWT_SECRET || "apatris-msg-key";
function encrypt(text: string): string {
  const keyHash = createHash("sha256").update(ENC_KEY).digest();
  const buf = Buffer.from(text, "utf8");
  const enc = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) enc[i] = buf[i] ^ keyHash[i % keyHash.length];
  return enc.toString("base64");
}
```

**Key observations:**
- Comment explicitly acknowledges this is a TODO: `"Simple encryption (XOR with key hash — production should use AES)"`.
- Algorithm is XOR with SHA-256 hash of `JWT_SECRET` (or fallback string `"apatris-msg-key"` if JWT_SECRET unset).
- This is NOT real cryptographic encryption — XOR with a fixed key is trivially breakable; provides obfuscation only, not confidentiality.
- The fallback key `"apatris-msg-key"` is hard-coded and would be active if `JWT_SECRET` env was missing, which is a concerning fallback (effectively no encryption).
- Uses for: `message_threads.last_message`, message body storage in messaging endpoints.

**Severity classification:** This is a **real Production fix candidate.** Messaging payloads often contain PII (worker conversations may include PESEL, passport refs, salary discussions, legal-case status). Storing them with XOR-based "encryption" gives false sense of confidentiality. Replace with `lib/encryption.ts`'s AES-256-GCM module. Same key infrastructure (`APATRIS_ENCRYPTION_KEY`) can be reused.

**Recommend: elevate to Production fixes pending #6** (messaging module encryption-strength gap; replace XOR with AES-256-GCM). Tier-2 wouldn't capture the severity of acknowledged-weak-crypto in a PII context.

### (e)-5 — Item (e) reality-vs-plan

**EXPECTED:** Confirm Pre-D1 key presence + verify keys are actively used in code (not configured-but-unused).

**FOUND:** Pre-D1 confirmation holds; encryption module IS actively used at substantial scope (22 caller files, central CRUD path wiring, routes + services). PII encryption posture verified ACTIVE. **Plus: discovered parallel weaker encryption in messaging module** that the code itself flags as TODO.

**REASONABLE INTERPRETATION:** Core PII encryption (`lib/encryption.ts`) is operational and counsel-handoff claims are grounded. Messaging encryption is a known shortcut. The TODO comment confirms this was a deliberate "ship now, harden later" choice — but post-counsel-handoff, "harden later" is now.

**RECOMMENDATION:** Capture as two findings — (1) Pre-D1 + code-path use confirms central PII encryption operational; (2) Messaging XOR encryption elevated to Production fixes pending #6. Per-PII-field audit deferred to Session 5 per granularity guidance.

---

## Item (f) — Sentry alert configuration check

**GOAL:** Document the gap between caught silent failures and Sentry alerting. Capture remediation pattern explicitly per observation 3 (Sentry is downstream consumer of structured logging that doesn't exist yet).

### (f)-1 — Sentry initialization (`index.ts:7-15`)

```ts
// Sentry error monitoring (optional)
try {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/node");
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? "production", tracesSampleRate: 0.1 });
    console.log("[Sentry] Initialized.");
  }
} catch { /* Sentry is optional */ }
```

- **Conditional initialization:** only fires if `SENTRY_DSN` env var is set (graceful no-op pattern; matches Session 3 D7-1 graceful-degradation finding).
- **Trace sample rate:** 10% — performance traces sampled at 10%, errors are 100% (sample rate doesn't affect error capture).
- **Wrapped in try/catch:** even Sentry init failure is silent (`/* Sentry is optional */` comment). Means: if Sentry SDK has a startup bug or DSN is malformed, no error surfaces. Lowest-tier silent-fail pattern.

### (f)-2 — Sentry middleware (`app.ts:111-115`)

```ts
if (process.env.SENTRY_DSN) {
  try {
    Sentry.setupExpressErrorHandler(app);
    console.log("[Sentry] Express error handler attached.");
  } catch (err) {
    console.warn("[Sentry] Failed to attach Express error handler:", err instanceof Error ? err.message : err);
  }
}
```

- **`setupExpressErrorHandler(app)`** — captures uncaught exceptions in Express route handlers + middleware-emitted errors via `next(err)` propagation.
- **Conditional on `SENTRY_DSN` presence**, mirrors init.
- **Catches Sentry attach failure** with `console.warn` — better than init's silent catch (gives stdout visibility if attach fails).

### (f)-3 — Machine env state confirmation

`flyctl ssh console --app apatris-api -C "sh -lc 'env | grep -E \"^SENTRY|^NODE_ENV\"'"` returned (key material redacted):

```
SENTRY_AUTH_TOKEN=sntryu_<REDACTED — runtime presence noted; build-time use only>
SENTRY_DSN=https://<REDACTED>@o4511191353655296.ingest.de.sentry.io/4511191372136528
NODE_ENV=production
```

- **`SENTRY_DSN` present** → Sentry init fires, middleware attaches, Sentry IS active in prod.
- **EU region (de.sentry.io)** — confirms data residency for GDPR posture.
- **`SENTRY_AUTH_TOKEN` also present at runtime** — typically a build-time-only secret for source-map upload. No harm at runtime, but inconsistent with secret-minimization principle. Tier-2 stabilization candidate: scope `SENTRY_AUTH_TOKEN` to build env only.
- **`NODE_ENV=production`** confirmed.

### (f)-4 — Explicit Sentry capture sites in codebase

```bash
grep -rnE "Sentry\.captureException|Sentry\.captureMessage" artifacts/api-server/src --include="*.ts"
```

**Result: ZERO explicit `Sentry.captureException` or `Sentry.captureMessage` calls anywhere in the codebase.**

This means Sentry catches **only** what `setupExpressErrorHandler` picks up — uncaught exceptions in Express routes that propagate via `next(err)` or throw inside handlers. Everything else is invisible to Sentry.

### (f)-5 — Gap analysis: what Sentry does NOT see in production

Confirmed invisible to Sentry (cross-referenced with item (c) findings):

1. **`pool.on("error")` callback errors** (`lib/db.ts:25-27`) — pg-pool's EventEmitter error events never reach Express middleware. Sentry blind to ~206/24h DB pool errors.
2. **Errors caught inside try/catch with no rethrow** — `legal-case.service.ts:260-282` fan-out, `init-db.ts` boot catches, `daily-legal-scan.service.ts` cron handler, `escalation-engine.service.ts` cron handler. Sentry blind to escalation engine `w.first_name does not exist` (~12/24h), regulatory scan timeouts (~6/24h), and any silent fan-out failures.
3. **Errors thrown from background work** that never bubble to a captured boundary — cron handlers running in `setInterval` whose errors aren't caught by handler-internal try/catch. Sentry blind here too.
4. **Sentry init failure itself** — wrapped in `/* Sentry is optional */` silent catch. If DSN is malformed or Sentry SDK has a startup bug, no observable signal except the absence of `[Sentry] Initialized.` boot message.

### (f)-6 — Remediation pattern (per observation 3)

**Sentry is downstream consumer of structured logging that doesn't exist yet, NOT the missing piece itself.** The key insight: adding Sentry to existing silent-fail-no-logger catches doesn't fix anything if the error is *deliberately* swallowed without inspection. The fix is two-step:

**Step 1 — Make silent failures vocal at stdout level.**

For each silent catch (legal-case fan-out, init-db catches, scheduler error handlers, pool.on("error")), add a structured log call inside the catch:

```ts
// BEFORE:
try { await recordCaseInGraph(...); } catch { /* non-blocking */ }

// AFTER (Step 1):
try { await recordCaseInGraph(...); }
catch (err) { logger.error({ err, caseId, scope: "case-fanout" }, "[KnowledgeGraph] non-blocking failure"); }
```

This alone gives stdout visibility (matching the existing `[DB]`, `[Escalation]`, `[Scheduler]` patterns). Operators reading `flyctl logs` can see what's failing.

**Step 2 — Add Sentry capture for aggregated alerting.**

```ts
// AFTER (Step 2):
try { await recordCaseInGraph(...); }
catch (err) {
  logger.error({ err, caseId, scope: "case-fanout" }, "[KnowledgeGraph] non-blocking failure");
  Sentry.captureException(err, { tags: { service: "case-fanout", scope: "kg-record" }, extra: { caseId } });
}
```

Step 2 alone (without Step 1) is insufficient because:
- Sentry has rate limits and sampling (would lose high-frequency events)
- stdout debugging is faster for active dev work than dashboard checking
- Step 1's structured logger output composes with Pino-Sentry transport, achieving Step 2 implicitly

**Alternative — single-write via Pino-Sentry transport:** Configure `pino-sentry` so `logger.error` calls automatically route to Sentry as `captureException`. One write, two destinations. Reduces double-call boilerplate.

### (f)-7 — Item (f) reality-vs-plan

**EXPECTED:** Sentry config + machine env + initialization patterns + gap analysis + remediation pattern.

**FOUND:** Sentry IS initialized and active in prod (DSN + auth token confirmed; init log line `[Sentry] Initialized.` would surface at boot — not testable in current 7.7h window per item (c)). Middleware DOES catch Express-level uncaught exceptions. Zero explicit `captureException` calls in codebase. Sentry blind to all four silent-failure categories from item (c).

**REASONABLE INTERPRETATION:** Sentry posture is "configured-and-active for the catch surface it can reach (Express)." For everything else (background work, fan-out catches, EventEmitter error callbacks), Sentry is a downstream consumer that has nothing upstream feeding it. The build's observability gap is the missing `logger.error` calls inside silent catches, not the missing Sentry; Sentry will start producing useful signal as soon as those logger calls land.

**RECOMMENDATION:** Capture remediation pattern as Production fixes pending stabilization candidate (paired with item (c)'s silent-fail-no-logger finding). Two-step pattern (logger.error → Sentry.captureException) OR Pino-Sentry transport (single-write). Tier-2 cleanup: scope `SENTRY_AUTH_TOKEN` to build env only.

---

## GATE-OP-2 — STOP

**Items covered:** (d) + (e) + (f).

### Findings

1. **Item (d) — `trc_cases.tenant_id` type investigation:**
   - Schema: `trc_cases.tenant_id TEXT NOT NULL` + `worker_id TEXT` — schema outliers vs the rest of the codebase's UUID FKs to tenants table.
   - Most usage (Pattern A: WHERE filters, Pattern B: JOINs on UUID `id`) does NOT clash types.
   - **One cross-type JOIN found at `legal-evidence-ocr.service.ts:204`** with explicit `::text` casts on both `worker_id` and `tenant_id`. Bounded-impact (single site, pre-filtered driver table, explicit casts) but real schema-cleanliness liability.
   - **Classification per save-prompt strict reading: elevate to Production fixes pending #5** with bounded-impact qualifier. Active-reviewer note: borderline; could remain Tier-2 if the rule were "high-frequency or unbounded-impact JOINs only." Defer final classification to Manish + chat-Claude.

2. **Item (e) — encryption keys verification + code-path use audit:**
   - Pre-D1 Verification 1 confirmed (keys present; length-confirmed; values not captured).
   - Encryption module (`lib/encryption.ts`) is wired into 22 caller files: central `lib/workers-db.ts` CRUD path + 10 routes + 7 services + 3 seed files. AES-256-GCM with HMAC-SHA256 lookup hashing.
   - **PII encryption posture: ACTIVE** — encrypted-at-rest claim in counsel handoff is grounded in real wiring.
   - **NEW finding: parallel weaker encryption in `routes/messaging.ts`** — XOR with SHA256-hashed `JWT_SECRET`, fallback key `"apatris-msg-key"`. Comment explicitly says `"production should use AES"` (acknowledged TODO). Messaging payloads can contain PII.
   - **Recommend: elevate to Production fixes pending #6** (messaging XOR encryption replaced with AES-256-GCM via `lib/encryption.ts`).
   - Per-PII-field audit deferred to Session 5 synthesis per granularity guidance.

3. **Item (f) — Sentry alert configuration check:**
   - Sentry init at `index.ts:7-15` (conditional on SENTRY_DSN; `tracesSampleRate: 0.1`); middleware at `app.ts:111-115` (`setupExpressErrorHandler`).
   - Machine env confirms `SENTRY_DSN` (EU region `de.sentry.io`), `SENTRY_AUTH_TOKEN`, `NODE_ENV=production` all present.
   - Sentry IS initialized and active in prod (boot log `[Sentry] Initialized.` would surface; not testable in current 7.7h logs window).
   - **Zero explicit `Sentry.captureException` calls anywhere in api-server source.** Sentry catches only what `setupExpressErrorHandler` picks up — Express uncaught exceptions only.
   - **Confirmed Sentry blind to:** pool.on("error") callbacks (~206/24h), silent fan-out catches, cron handler swallows (escalation engine ~12/24h, regulatory scan ~6/24h), Sentry init failure itself (`/* Sentry is optional */`).
   - **Remediation pattern (per observation 3) captured explicitly:** two-step — (1) `logger.error({err, ...}, "[Service] non-blocking failure")` inside silent catches, (2) `Sentry.captureException(err, {tags, extra})` paired or via Pino-Sentry transport. Sentry is downstream consumer; structured logging is the missing upstream feeder.
   - Hygiene: `SENTRY_AUTH_TOKEN` is at runtime but typically build-time-only secret. Tier-2 candidate: scope to build env only.

### Reality-vs-plan mismatches

- Item (d): borderline classification — strict save-prompt rule says elevate; bounded impact suggests Tier-2-with-condition. Surfaced for Manish + chat-Claude decision.
- Item (e): unexpected discovery — parallel XOR-based encryption in messaging module flagged with TODO comment in code itself; raises severity beyond originally-scoped key-presence verification.
- Item (f): no surprises beyond pattern confirmation; remediation framing per observation 3 confirmed correct.

### Implications and observations beyond literal items

- **Schema outlier patterns (Item d) often correlate with legacy code-path origin.** trc_cases originated as Airtable migration target where text IDs were canonical. The "worker_id TEXT" mirrors the Airtable record-ID format. Future-proofing: when next greenfield case-related table is added, type-conventions discipline matters more than today's bounded JOIN cost.
- **Item (e) discovery has Session-4-build-philosophy implications.** A TODO comment that says `"production should use AES"` shipping in a production codebase is signal for Dimension 5 (build philosophy). Either: (i) the TODO was forgotten, or (ii) "production" was scope-defined to mean "enterprise multi-tenant deploy" and Apatris is currently treated as pre-production, or (iii) shortcut acknowledged-and-deferred but no tracking. All three are interesting Dimension 5 inputs.
- **Item (f) confirms the structured-logging-gap pattern is systemic, not localized.** Across pool errors, fan-out catches, cron handlers, init-db catches, and Sentry init itself — five different sites using identical "swallow silently" pattern. Single Pino-Sentry transport configuration could remediate all five with low surface area. Operational pass evidence base supports a single structured-logging upgrade as Tier-2 stabilization candidate (high-leverage, low-risk).
- **Cross-item observation:** items (d), (e), (f) are all Production-fixes-pending or Tier-2 stabilization candidates that share a common pattern — "shipped fast with deferred hardening." Item (d) deferred type tightening (TEXT→UUID). Item (e) deferred messaging crypto upgrade (XOR→AES). Item (f) deferred logger-Sentry wiring. Three independent deferrals all surface in operational pass — cumulative-trajectory signal for Session 4.

### Cross-pass recharacterization (preliminary)

No verdict changes proposed at GATE-OP-2. Items (d), (e), (f) findings reinforce Sessions 1–3 verdicts and add specific Production fixes pending candidates. Final cross-pass recharacterization check at GATE-OP-3 close.

### Updated lists (preliminary — pending GATE-OP-3 confirmation)

**Production fixes pending — proposed additions (subject to Manish + chat-Claude approval):**
- #5: `trc_cases.tenant_id` + `worker_id` TEXT-vs-UUID type tightening (single ALTER + data-canonical confirmation; bounded-impact qualifier)
- #6: `routes/messaging.ts` XOR encryption replaced with AES-256-GCM via `lib/encryption.ts` (acknowledged-TODO; PII potentially exposed in messaging payloads)

**Tier-2 stabilization — proposed additions:**
- Structured-logging-into-silent-catches systemic upgrade (covers pool.on("error"), legal-case fan-out, init-db catches, cron handler swallows, Sentry init catch). Single Pino-Sentry transport configuration could remediate all five in one stroke.
- `SENTRY_AUTH_TOKEN` runtime presence — scope to build env only.

### Suggestion for next step

Proceed to GATE-OP-3 (items g + h — DB pool root-cause investigation, 61977ad spot-check). Both within boundaries (read-only repo + flyctl logs + git inspection). Item (h) is the most consequential per Session 3 framing — outcome shapes Session 4 build philosophy verdict.

**GATE-OP-2 confirmed by Manish + chat-Claude with three integration elements:**

1. **Item (d) classification — Production fixes pending #5 with bounded-impact qualifier** approved per save-prompt strict rule. Single-site cross-type JOIN at `legal-evidence-ocr.service.ts:204`, pre-filtered driver, explicit casts on both sides. Lower priority than security-posture findings.

2. **Item (e) parallel XOR encryption — elevated to Production fixes pending #6.** Higher priority than #5 due to materially different security posture. Two reasons captured: (a) TODO-shipped-to-prod (`"production should use AES"` comment intent never returned); (b) hardcoded fallback key (`"apatris-msg-key"`) means missing `JWT_SECRET` produces source-key obfuscation, not encryption. Recommend: address before Layer 3 build OR before counsel engagement, whichever comes first. Single-site fix using `lib/encryption.ts` AES-256-GCM path.

3. **Tier-2 #5 (new): Systemic structured-logging upgrade via Pino-Sentry transport.** Single architectural fix, 5-site impact (pool.on('error'), legal-case fan-out catches, init-db.ts catch blocks, cron handler swallows, Sentry init silent catch). Addresses both vocal-fail-with-logger and silent-fail-no-logger observability categories. Tier-2 list now 5 items.

**Observation held for Session 4 Dimension 5 (NOT Session 3 verdict change):** items (d), (e), (f) share "shipped fast with deferred hardening" pattern. Combined with GATE-OP-1's "service that has never worked since it shipped" finding, cumulative pattern: (1) commit discipline arrived April 25 (Dimension 1 quantitative finding); (2) revisit-deferred-work discipline has NOT arrived; (3) features land, hardening is named as needed, hardening doesn't return.

---

## Item (g) — DB connection pool root-cause investigation

**GOAL:** Confirm or refine the Pre-D1 Verification 2 hypothesis (Neon idle-close vs pg-pool warm-connection retention).

### (g)-1 — Pool configuration (`lib/db.ts:15-23`)

```ts
export const pool = new Pool({
  connectionString: dbUrl || undefined,
  ssl: useSSL,
  max: 20,                      // Scale for multi-tenant SaaS
  min: 2,                       // Keep 2 warm connections
  idleTimeoutMillis: 30_000,    // 30 seconds
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: false,       // Keep pool alive
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool client error:", err.message);
});
```

Confirmed unchanged since `9db39cb "perf(scale): connection pool upgrade"` per Session 3 D1-PRIORITY-C finding. Same config has been live for weeks.

### (g)-2 — Comparison against Neon serverless behavior

Neon serverless Postgres key behaviors relevant to pool stability:

| Property | Neon default | Our pg-pool config | Interaction |
|---|---|---|---|
| Server-side idle timeout (TCP keepalive vs absolute) | Aggressive — Neon auto-suspends idle compute (free tier: ~5 min; paid: configurable up to 60 min). When compute suspends, ALL connections drop server-side. | `idleTimeoutMillis: 30_000` (30s) | When the 2 warm connections (`min: 2`) sit idle longer than Neon's compute-suspend window OR longer than Neon's per-connection TCP keepalive, Neon closes them server-side. pg-pool's `idleTimeoutMillis` of 30s is irrelevant — Neon closed it earlier. Pool keeps the closed sockets thinking they're warm. Next query attempts to use a stale socket → `Connection terminated unexpectedly` event from `pool.on("error")`. |
| Maximum connections | Project-scoped per tier (free: ~100; paid: configurable) | `max: 20` per machine × 2 machines = 40 | Within Neon limits. NOT the bottleneck. |
| Connection establishment latency | ~100-300ms cold; <10ms warm | `connectionTimeoutMillis: 5_000` (5s) | Plenty of headroom; `connectionTimeoutMillis` only fires under genuine network failure or Neon outage. |
| Pooler (PgBouncer-based) availability | Optional via `-pooler` suffix on connection-string host | Not used (current `NEON_DATABASE_URL` does NOT use `-pooler` suffix) | Direct connection mode; no PgBouncer in front; full impact of Neon idle-close on every warm connection. |
| `allowExitOnIdle: false` | n/a | Pool kept alive even if zero queries pending | Reinforces pattern — pool retains 2 warm connections indefinitely; Neon will close those eventually. |

### (g)-3 — Empirical pattern (extends item (c) data)

From item (c) 7.7-hour Fly logs window:
- **66 DB pool errors** in window, ~206/24h projected (steady, flat trend)
- Both Fly machines affected (24 on `8913…`, 42 on `d8d5…` — asymmetric ~1.75x; likely correlates with which machine routes more load)
- Per-hour: 7-10/hour, no escalation
- Timing pattern: minute markers cluster around `:46` and `:31` per hour — consistent with two schedulers (likely `setInterval` for scanAndCreateNotifications hourly + `startEscalationEngine` 4-hourly + others) firing at offset cadences and each touching the pool at its scheduled minute

### (g)-4 — Root-cause hypothesis (CONFIRMED, no change from Pre-D1 V2)

**Hypothesis:** Neon serverless aggressively closes idle TCP connections server-side. pg-pool's `min: 2` + `allowExitOnIdle: false` + `idleTimeoutMillis: 30_000` retains 2 connections beyond Neon's idle threshold. When a scheduled query attempts to use a stale connection from the warm pool, the underlying socket is closed by Neon, and pg-pool's `pool.on("error")` callback fires with `Connection terminated unexpectedly`.

**Evidence supporting hypothesis:**
- Errors are `Connection terminated unexpectedly` (Neon-side close pattern), NOT `ECONNREFUSED` (Neon down) or `ETIMEDOUT` (network failure)
- Frequency is stable (no escalation) — argues against load-related saturation
- Pattern persists across both machines — argues against per-machine local issue
- Scheduler-correlated timing — argues against random network instability
- Pool config is unchanged for weeks (per `9db39cb`) and Neon behavior is steady — pattern is steady-state mismatch, not regression

**Evidence requiring confirmation (deferred to operational dashboard):**
- Neon dashboard idle-disconnect logs would show server-side closure events
- Neon compute auto-suspend timer config would confirm the actual closure threshold
- Neon connection-count metrics over 24h would show the stable-warm vs reconnect pattern

These deferred items require Manish dashboard access; cannot be inspected via flyctl. Per Pre-D1 V2 Outcome C classification, **NOT a blocker for hypothesis confirmation** — code-side evidence is sufficient.

### (g)-5 — Remediation options

Four candidates, ranked by effort vs impact:

| Option | Change | Effort | Impact | Risk |
|---|---|---|---|---|
| **A. `min: 0`** | Drop `min: 2` to `min: 0`; no warm connections retained | 1-line config change | Eliminates warm-connection-stale source; trades cold-start latency on first query of an idle period | Low — warm connections to a serverless DB are an anti-pattern anyway; Neon cold-start is ~100-300ms which is fine for non-latency-critical scheduled work |
| **B. Reduce `idleTimeoutMillis` to ~10-15s** | Force pg-pool to close idle connections before Neon does | 1-line config change | Same effect as A (no stale warm connections) but preserves min:2 if connections are actively used | Low — needs to be shorter than Neon's compute idle-suspend timeout |
| **C. Add periodic keepalive query** | `setInterval(() => pool.query("SELECT 1"), 25_000)` | New ~5-line keepalive function | Keeps connections "actively used" so they never go idle from Neon's perspective | Medium — adds steady query load; correlates with multi-tenant scaling cost; obscures the underlying mismatch rather than fixing it |
| **D. Switch to Neon Pooler endpoint** | Change `NEON_DATABASE_URL` to use `-pooler` host suffix | Env var change (Fly secret update); no code change | PgBouncer-based pooling at the Neon edge; pool sees a "real" connection pool that handles Neon-side idle-close transparently | Low-medium — requires Fly secret rotation, brief connection-mode change, query-syntax restrictions for prepared statements (Neon Pooler uses transaction-mode pooling) |

**Active-reviewer recommendation:** Option A or B (one-line config change, lowest effort, highest leverage). Operational pass surfaces the cause; remediation belongs to next operational hygiene work. If Option D is chosen for longer-term scale, validate prepared-statement query patterns (most ORM-style queries are fine; raw multi-statement queries may need adjustment).

### (g)-6 — Item (g) reality-vs-plan

**EXPECTED:** Pool config + log analysis + hypothesis + remediation options.

**FOUND:** Pool config unchanged from `9db39cb` (Session 3 D1-PRIORITY-C confirmed). Hypothesis from Pre-D1 V2 confirmed via item (c) empirical data + comparison against Neon serverless behavior. Four remediation options enumerated. Neon dashboard deferred to Manish-access check (not blocker).

**REASONABLE INTERPRETATION:** Pre-D1 V2's Outcome C classification stands. Root cause is well-characterized. Single-line fix (Option A or B) likely sufficient. Production fixes pending #3 from DIMENSION_4.md is correctly framed as longstanding-not-recent-regression.

**RECOMMENDATION:** No verdict change. Production fixes pending #3 stays in place. Sharpen recommendation to "apply Option A (`min: 0`) as quick-fix" pending Manish + chat-Claude approval.

---

## Item (h) — `61977ad` spot-check for analogous schema-assumption bugs

**GOAL:** Determine if features in commit `61977ad` (besides escalation engine) share the same schema-assumption bug pattern. Outcome shapes Session 4 Dimension 5 build-philosophy verdict.

### (h)-1 — Commit metadata

```
commit 61977ad36f6558a1d253d134299af3573732c12c
Author: manish shetty <manishshetty@manishs-macbook-pro-1.home>
Date:   Mon Apr 13 18:28:33 2026 +0200

feat: 10 features — public verification, recruitment form, escalation, digest, client portal,
push, voivodeship, self-upload, Stripe webhooks, Polish i18n

Complete feature build — no gaps, no stubs:
... [10 numbered features]
```

13 files changed, 1669 insertions, 768 deletions. Commit message asserts "Complete feature build — no gaps, no stubs."

### (h)-2 — File inventory (per `git show --name-status 61977ad`)

| File | Status | Lines | Category |
|---|---|---|---|
| `dist/index.cjs` | M | 1589 | Compiled artifact (skip — verify from source) |
| `src/app.ts` | M | 4 | Wiring (no SQL) |
| `src/index.ts` | M | 4 | Boot (no SQL) |
| `src/lib/init-db.ts` | M | 46 | Schema additions (DDL only, not DML) |
| `src/lib/scheduler.ts` | M | 48 | Scheduler wiring (1 SQL line of comment-text) |
| `src/routes/billing.ts` | M | 74 | Stripe webhook routes (1 SQL) |
| `src/routes/public-verify.ts` | A | 248 | NEW — public verification + client portal endpoints (15 SQL) |
| `src/services/escalation-engine.service.ts` | A | 119 | NEW — escalation engine (2 SQL) |
| `src/services/push-sender.service.ts` | A | 83 | NEW — push notifications (2 SQL) |
| `src/services/weekly-digest.service.ts` | A | 150 | NEW — weekly compliance digest (5 SQL) |
| `workforce-app/dist/public/index.html` | M | 2 | Compiled (skip) |
| `workforce-app/src/components/tabs/Tier5Home.tsx` | M | 47 | Frontend (no SQL) |
| `workforce-app/src/locales/pl.json` | M | 23 | Translations (no SQL) |

**SQL surface in api-server source (excluding compiled `dist/index.cjs`):** 7 files with SQL, 26 DML statements + 46 DDL lines.

### (h)-3 — Item-internal escalation rule check

Save prompt: "If 61977ad has > 8 files containing SQL queries, OR substantive query count > 20 across all files, narrow scope."

- Files with SQL: 7 (just under the 8-file threshold)
- DML query count: **26 > 20** — escalation triggered

**Narrowed scope per save prompt:**
- (a) `escalation-engine.service.ts` (already verified at Session 3 close — confirm in spot-check)
- (b) Top 3-5 most-modified files: `public-verify.ts` (248 lines), `weekly-digest.service.ts` (150), `escalation-engine.service.ts` (119; covered by (a)), `push-sender.service.ts` (83)
- (c) NEW service / route files (excluding tests/config): `public-verify.ts`, `escalation-engine.service.ts`, `push-sender.service.ts`, `weekly-digest.service.ts` — all 4 covered

Final spot-check scope: **4 NEW api-server files = `escalation-engine`, `public-verify`, `weekly-digest`, `push-sender`.** init-db.ts schema additions are DDL not DML so not in scope. billing.ts Stripe webhooks (1 SQL) deferred.

**Escalation captured:** total file count = 7 (with SQL); total DML count = 26 (above threshold); files prioritized = the 4 NEW services/routes; files deferred = init-db.ts, scheduler.ts, billing.ts (existing files; minor DML; lower-leverage check).

### (h)-4 — Per-file findings

**File 1: `services/escalation-engine.service.ts` (NEW, 119 lines, 2 SQL)** — 🔴 CONFIRMED BROKEN

| Line | Query | Schema match | Status |
|---|---|---|---|
| 27-30 | `SELECT c.*, w.first_name, w.last_name, ... FROM legal_cases c JOIN workers w ON c.worker_id = w.id` | `workers` has `full_name TEXT NOT NULL`; NO `first_name` / `last_name` columns | 🔴 **FAILS at runtime** — confirmed by item (c) Fly logs (`[Escalation] Error: column w.first_name does not exist` × 4 in 7.7h window) |
| 106-107 | `SELECT id, first_name, last_name, ${field.col} FROM workers WHERE tenant_id = $1 AND ${field.col}::date = $2::date` | Same issue | 🔴 **FAILS at runtime** — same root cause |

**Both SQL queries broken. Same column-assumption error. 2/2 broken.**

**File 2: `routes/public-verify.ts` (NEW, 248 lines, 15 SQL)** — 🔴 BROKEN IN CORE ENDPOINT

| Line | Query | Schema match | Status |
|---|---|---|---|
| 28 | `DELETE FROM verification_tokens WHERE worker_id = $1` | `verification_tokens` table created in same commit | ✅ matches |
| 30 | `INSERT INTO verification_tokens (worker_id, tenant_id, token, expires_at) VALUES ...` | Same table | ✅ matches |
| 44 | `SELECT * FROM verification_tokens WHERE token = $1 AND expires_at > NOW()` | Same table | ✅ matches |
| 51-55 | `SELECT w.first_name, w.last_name, w.nationality, w.specialization, ... FROM workers w WHERE w.id = $1` | `workers` has no `first_name`/`last_name` | 🔴 **FAILS** — this is the **CORE public verification endpoint query** invoked when border police scans QR |
| 64-65 | `SELECT legal_status, risk_level, legal_basis, summary, conditions, warnings FROM worker_legal_snapshots WHERE worker_id = $1 ORDER BY created_at DESC LIMIT 1` | Need to verify `worker_legal_snapshots` schema; standalone select | 🟡 plausible match (table exists per CLAUDE.md) |
| 71 | `SELECT name FROM tenants WHERE id = $1` | Standard | ✅ matches |
| 129 | `SELECT id FROM tenants WHERE LOWER(name) = LOWER($1) OR id::text = $1 LIMIT 1` | Standard | ✅ matches |
| 135 | `SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1` | Standard | ✅ matches |
| 141 | `INSERT INTO job_applications (tenant_id, first_name, last_name, email, phone, nationality, specialization, experience, notes, source, status, applied_at)` | `job_applications` HAS first_name/last_name (added in same commit, init-db.ts:2268-2269) | ✅ matches (correct table for these columns) |
| 201 | `UPDATE job_applications SET notes = COALESCE(notes,'') \|\| $1 WHERE phone = $2 ORDER BY applied_at DESC LIMIT 1` | Standard | ✅ matches |
| 216 | `SELECT id, name FROM tenants ORDER BY created_at ASC LIMIT 1` | Standard | ✅ matches |
| 239 | `INSERT INTO client_portal_links (tenant_id, client_name, token, worker_ids, expires_at) VALUES ...` | Created in same commit | ✅ matches |
| 253 | `SELECT * FROM client_portal_links WHERE token = $1 AND expires_at > NOW()` | Same table | ✅ matches |
| 262-264 | `SELECT id, first_name, last_name, nationality, ... FROM workers WHERE id = ANY($1) AND tenant_id = $2` | Same workers schema mismatch | 🔴 **FAILS** — client portal worker list |
| 269-271 | `SELECT id, first_name, last_name, nationality, ... FROM workers WHERE tenant_id = $1 LIMIT 50` | Same | 🔴 **FAILS** — client portal worker list fallback |

**3 of 15 SQL queries broken. The CORE public verification endpoint (border police QR scan) is one of them. Client portal worker list endpoints are the other two.**

**Operational implication:** the public verification feature (commit message #1: "Border police scans → sees worker legal status") and client portal feature (commit message #7: "Read-only URL per client. Shows their workers' compliance status") **have never functioned correctly since shipping**. When invoked, they return 500 errors or empty results — silent or vocal depending on caller.

**File 3: `services/weekly-digest.service.ts` (NEW, 150 lines, 5 SQL)** — 🔴 PARTIALLY BROKEN

| Line | Query | Schema match | Status |
|---|---|---|---|
| 43 | `SELECT first_name, last_name, ${f.col} FROM workers WHERE...` | Same workers schema mismatch | 🔴 **FAILS** |
| 61-63 | `SELECT c.case_type, c.status, w.first_name, w.last_name, EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400 AS days_in_stage FROM legal_cases c JOIN workers w ON c.worker_id = w.id` | Same | 🔴 **FAILS** |
| 71 | `SELECT status, COUNT(*)::int AS count FROM legal_cases WHERE tenant_id = $1 GROUP BY status` | Standard | ✅ matches |
| 79 | `SELECT trc_expiry, work_permit_expiry, bhp_expiry, medical_exam_expiry, contract_end_date FROM workers WHERE tenant_id = $1` | All columns exist on workers per init-db.ts:42-67 | ✅ matches |
| 93 | `SELECT COUNT(*)::int AS c FROM case_generated_docs WHERE tenant_id = $1 AND status IN ('DRAFT','UNDER_REVIEW')` | Standard | ✅ matches |

**2 of 5 SQL queries broken. The Monday weekly compliance digest (commit message #6: "Monday 8am email to T1") fails on its expiring-document and SLA-breach queries.** Pipeline counts and document health % work; expiring-this-week table and SLA-breach table do not.

**File 4: `services/push-sender.service.ts` (NEW, 83 lines, 2 SQL)** — 🔴 INSERT BROKEN (DIFFERENT BUG)

| Line | Query | Schema match | Status |
|---|---|---|---|
| 25 | `INSERT INTO notification_log (tenant_id, channel, worker_name, message, status, created_at) VALUES ($1, 'push', $2, $3, 'pending', NOW())` | `notification_log` has columns: `id, channel, worker_id, worker_name, sent_by, recipient, message_preview, status, created_at, tenant_id`. The INSERT names column **`message`** but schema column is **`message_preview`** | 🔴 **FAILS** — different column-name bug than the workers `first_name`/`last_name` pattern, but **same shape: feature shipped with SQL referencing nonexistent column** |
| 34 | `SELECT * FROM push_subscriptions WHERE tenant_id = $1` | `push_subscriptions` table exists per init-db.ts:540 | ✅ matches |

**1 of 2 SQL queries broken. The push notification logging INSERT fails at runtime; push notifications are not durably logged to `notification_log`.** The actual web-push send (line 34's SELECT for subscriptions) works structurally, but per CLAUDE.md the VAPID keys gate this further — likely no actual push notifications have shipped, so the broken INSERT has been silently failing alongside zero-volume push usage.

### (h)-5 — Aggregate findings

| File | Total SQL | Broken SQL | Pattern |
|---|---|---|---|
| `escalation-engine.service.ts` | 2 | 2 | `w.first_name`/`w.last_name` on workers |
| `public-verify.ts` | 15 | 3 | Same |
| `weekly-digest.service.ts` | 5 | 2 | Same |
| `push-sender.service.ts` | 2 | 1 | `notification_log.message` should be `message_preview` (different column-name bug) |
| **Total** | **24** | **8** | **4 of 4 NEW api-server files in commit have schema-assumption bugs** |

**5 of the 10 features in commit `61977ad` have broken SQL paths:**
1. Public verification (#1) — core endpoint broken (3 broken queries)
2. Auto-escalation engine (#5) — confirmed broken (Session 3) (2 broken queries)
3. Weekly compliance digest (#6) — partially broken (2 broken queries)
4. Client compliance link / portal (#7) — broken in worker-list path (2 broken queries inside public-verify.ts)
5. Push notification service (#4) — INSERT logging broken (1 broken query)

The other 5 features (recruitment form, voivodeship column, Stripe webhooks, worker self-upload, Polish i18n) are not SQL-heavy in this commit; their primary work is in form handling, single column ALTER, webhook signature verification, and frontend.

### (h)-6 — Pattern characterization

The bugs cluster into TWO column-name-assumption patterns:

1. **`workers.first_name` / `workers.last_name`** (3 files, 7 broken queries): the developer at the time was thinking in first/last terms. ALSO added these columns to `job_applications` in the same commit (init-db.ts:2268-2269), but DID NOT add them to `workers`. The ALTER for `job_applications` confirms the developer KNEW how to add columns idempotently — but didn't touch `workers`. The mental model of "workers have first_name and last_name" was never validated against the actual workers schema.

2. **`notification_log.message` (vs actual `message_preview`)** (1 file, 1 broken query): different column-name guess. Same shape: shipped SQL referencing nonexistent column.

**Root common cause:** features were written without DB-level validation. If even a single test query had run against the actual schema (`psql staging -c "SELECT first_name FROM workers LIMIT 1"`), all 8 broken queries would have been caught pre-merge.

### (h)-7 — Persistence pattern (cross-reference with item (c))

Per item (c) 7.7-hour Fly logs window:
- `[Escalation] Error: column w.first_name does not exist` × 4 firings — confirms escalation engine SQL still failing today
- Public-verify and weekly-digest queries don't appear in the log buffer because:
  - Public verification: only fires on QR scan invocations, which may be zero for the day
  - Weekly digest: fires Monday 8am; 2026-05-02 is Saturday; next firing is 2026-05-04
  - Push-sender INSERT: gated by VAPID key configuration; per CLAUDE.md push hasn't been actively used

**The escalation engine bug is observable in logs because its cron fires every 4 hours; the others fail less often or invisibly. ALL FOUR have been silent-failing for 19 days (2026-04-13 → 2026-05-02 = 19 days) with zero feedback loop surfacing the problem to the operator.**

### (h)-8 — Item (h) reality-vs-plan

**EXPECTED:** Determine if other features in `61977ad` share the escalation engine's schema-assumption bug pattern.

**FOUND:** Yes, and at higher prevalence than anticipated. **4 of 4 NEW api-server files in commit have schema-assumption bugs.** 5 of 10 features have broken SQL paths. Pattern is not "isolated escape" but "systemic across the commit."

**REASONABLE INTERPRETATION:** Per Session 3 D1-PRIORITY-A elevated finding's "systemic implication": confirmed. The 13-files / 1,669-insertions commit shipped without DB exercise across all 4 new service/route files. Build-philosophy implication for Session 4: this isn't 1 bug; it's 8 broken queries across 4 files in a single 1-day commit, all silently persisting for 19 days.

**RECOMMENDATION:** Item (h) outcome strongly supports the "shipped fast with deferred hardening" cumulative pattern observation held for Session 4 Dimension 5. Production fixes pending #2 (escalation engine SQL bug) should be re-scoped to **"61977ad schema-assumption bug cluster"** covering all 8 broken queries across all 4 files. Single fix sweep — replace `first_name, last_name` references with `full_name` (or `split_part(full_name, ' ', 1)` if first-name display is needed); replace `notification_log.message` with `message_preview`. Sub-30-minute change.

---

## GATE-OP-3 — STOP (operational pass close)

**Items covered:** (g) + (h). Operational pass closes here per save prompt.

### Findings

1. **Item (g) — DB connection pool root-cause investigation:**
   - Pool config (`lib/db.ts:15-23`) confirmed unchanged since `9db39cb`. Same config has been live for weeks.
   - Pre-D1 V2 hypothesis CONFIRMED: Neon serverless aggressive idle-close mismatched with pg-pool `min: 2 + idleTimeoutMillis: 30_000 + allowExitOnIdle: false` warm-connection retention. Errors are `Connection terminated unexpectedly` (Neon-side close pattern), steady frequency, both machines, scheduler-correlated timing.
   - Four remediation options enumerated: (A) `min: 0`; (B) reduced `idleTimeoutMillis`; (C) periodic keepalive query; (D) Neon Pooler endpoint.
   - **Recommend:** Option A or B (one-line config change). Defer to next operational hygiene work; this pass investigates, doesn't remediate.
   - Production fixes pending #3 (DB pool) verdict unchanged — longstanding-not-recent-regression reframe stands.

2. **Item (h) — `61977ad` spot-check:**
   - Item-internal escalation rule TRIGGERED (26 DML queries > 20 threshold; 7 files with SQL just under 8-file threshold). Narrowed to 4 NEW api-server files: `escalation-engine`, `public-verify`, `weekly-digest`, `push-sender`.
   - **4 of 4 NEW api-server files contain schema-assumption bugs.**
   - **8 broken SQL queries identified across the 4 files** (2 from escalation-engine, 3 from public-verify, 2 from weekly-digest, 1 from push-sender).
   - **5 of 10 features in commit have broken SQL paths**: public verification (#1), escalation engine (#5), weekly digest (#6), client portal (#7), push service (#4).
   - Two column-name-assumption patterns: `workers.first_name`/`last_name` (7 broken queries) and `notification_log.message` (1 broken query).
   - All 4 files have been silent-failing for 19 days with zero feedback loop surfacing the problem.
   - **Recommend:** Re-scope Production fixes pending #2 from "Escalation engine SQL bug" to **"61977ad schema-assumption bug cluster"** covering all 8 broken queries. Single sweep — sub-30-minute change.

### Reality-vs-plan mismatches

- Item (g): no surprises. Hypothesis from Pre-D1 V2 confirmed. Neon dashboard inspection deferred to Manish-access (not blocker).
- Item (h): higher-than-anticipated bug prevalence — 4/4 new files, 8 broken queries, 5/10 features affected. Anticipated single-bug-extension; found systemic cluster.

### Implications and observations beyond literal items

- **Item (h) outcome strongly validates the Session 4 Dimension 5 "shipped fast with deferred hardening" framing.** A 13-files / 1,669-insertions commit titled "Complete feature build — no gaps, no stubs" shipped 4 broken services/routes, 8 broken queries, with 19-day silent persistence. The commit message's assertion of completeness is empirically false on inspection — no SQL was DB-exercised pre-merge.
- **Cross-item observation (g) ↔ (h):** the DB pool errors that item (g) characterizes mask the cluster of broken queries item (h) identifies. When `[Escalation] Error: column w.first_name does not exist` fires, it surfaces ABOVE the pool noise because escalation has its own service tag. When public-verify's `SELECT w.first_name, w.last_name FROM workers w` fails inside an HTTP handler, the error reaches Express-level Sentry middleware and IS captured — but if no QR scan ever invokes the handler, no failure is captured. **Sentry's "captured what it sees" is empty for these features because nobody is using them.** The Sentry remediation pattern from item (f) doesn't help here — the gap is "untested feature" not "swallowed exception."
- **Cumulative-trajectory signal for Session 4:** items (a-h) plus the Hygiene findings collectively show:
  - **Operational hygiene deferred:** staging suspended (Hygiene-1)
  - **Auth state assumed:** flyctl session-context (Hygiene-2)
  - **Type discipline deferred:** trc_cases TEXT-vs-UUID (item d)
  - **Crypto strength deferred:** XOR vs AES messaging (item e)
  - **Logging discipline deferred:** structured-logging-into-silent-catches (item f)
  - **DB pool tuning deferred:** Neon idle-close / pg-pool warm-connection (item g)
  - **DB-validation discipline absent:** 8 broken queries across 4 files in one commit (item h)
  - **All 7 deferrals visible at the operational layer; none visible from architectural inspection alone.** Sessions 1-3 (architecture) couldn't have surfaced these. Session 4 Dimension 5 (build philosophy) and Dimension 6 (documentation truthfulness) will read this evidence base directly.

### Cross-pass recharacterization (final check)

Operational pass findings DO NOT change Sessions 1–3 verdicts. Architecture (Pattern Y), 5-layer sequencing, Layer 3 deliberate deferral, North Star directional alignment — all preserved. Operational pass enriches the **execution-quality** layer beneath the architectural layer with empirical evidence; this evidence becomes Session 4 input.

**Production fixes pending list — proposed final state (subject to Manish + chat-Claude approval):**

1. `legal_briefs.case_id` FK constraint missing (DIMENSION_4.md, unchanged)
2. **`61977ad` schema-assumption bug cluster** — re-scoped from "escalation engine SQL bug" to cover all 8 broken queries across 4 files (escalation-engine, public-verify, weekly-digest, push-sender). 19-day silent persistence. Sub-30-minute fix sweep.
3. DB connection pool errors (DIMENSION_4.md, unchanged; Option A/B remediation candidates)
4. Daily regulatory scan DB-timeout (DIMENSION_4.md / DIMENSION_7.md, unchanged; symptom of #3)
5. `trc_cases.tenant_id` + `worker_id` TEXT-vs-UUID type tightening (item d) — bounded-impact qualifier
6. `routes/messaging.ts` XOR encryption replaced with AES-256-GCM via `lib/encryption.ts` (item e) — TODO-shipped-to-prod + hardcoded fallback key

**Tier-2 stabilization list — proposed final state:**

1. CLAUDE.md PHASE 2 sub-agent list update (Session 1)
2. `LegalBrief.tsx` UI header comment update ("4-stage" → "6-stage") (Session 1)
3. `agent_queries` observability pass — DEFERRED to future operational pass post-staging-reactivation (item a)
4. `dist/` gitignore hygiene (Session 3)
5. **Systemic structured-logging upgrade via Pino-Sentry transport** (item f / Element 3) — 5-site impact: pool.on("error"), legal-case fan-out catches, init-db.ts catch blocks, cron handler swallows, Sentry init silent catch
6. `SENTRY_AUTH_TOKEN` runtime presence — scope to build env only (item f)
7. Staging environment reactivation (Hygiene-1) — preconditions deferred items (a) and (b)

### Implications for Session 4 (Dimensions 5 + 6 — build philosophy + doc truthfulness)

The operational pass produces a strong empirical evidence base for Session 4:

- **Dimension 5 (build philosophy):** the cumulative-trajectory signal (7 deferrals visible only at operational layer) is direct input. Item (h)'s "Complete feature build — no gaps, no stubs" commit-message-vs-reality gap is direct input. The "service that has never worked since it shipped" reframe of escalation engine, now extended to "5 features that have never worked since they shipped," is direct input.
- **Dimension 6 (doc truthfulness):** CLAUDE.md PHASE 2 (sub-agent list lag), MASTER_BLUEPRINT.md (15 lifecycle steps with retention deferred), commit message #1 (61977ad's claim of "no gaps, no stubs"), `MASTER_PLAN.md` Layer 3 vision vs current `Stage5Result` collision — multiple instances where docs assert state ahead of code reality. Operational pass adds the empirical layer: code-vs-runtime gap on top of the docs-vs-code gap.

Session 4 launches with these inputs in hand. No anticipation needed.

### Updated lists and sub-file edits required

The proposed Production fixes pending re-scope (item #2 from "escalation engine SQL bug" → "61977ad schema-assumption bug cluster") requires a small edit to DIMENSION_4.md upon Manish + chat-Claude confirmation. Other lists (Tier-2 in DIMENSION_3.md) remain accurate if items 5-7 from this pass are added.

**Recommend:** capture proposed updates here; defer DIMENSION_4.md / DIMENSION_3.md edits until Session 5 synthesis OR until Manish issues an integration prompt.

### Suggestion for next step

Operational pass closes here per save prompt. Recommended next steps in order:

1. **Manish + chat-Claude review and confirmation** of GATE-OP-3 findings (with particular attention to: re-scoping Production fixes pending #2 to bug cluster; classification of item (d) borderline case; final Tier-2 list).
2. **Optional: integration prompt to Apatris Claude** for cross-file consistency edits (DIMENSION_4.md re-scoping, DIMENSION_3.md Tier-2 additions if approved).
3. **Operational hygiene work scheduled** — staging reactivation (precondition for items (a) and (b)); pool config quick-fix (item g Option A or B); 61977ad bug cluster sweep (item h).
4. **Session 4 launch (Dimensions 5 + 6 — build philosophy + doc truthfulness)** with operational pass evidence base in hand.

**Awaiting confirmation from Manish + chat-Claude. Operational pass execution complete.**

---

## Verdict on operational layer

🟡 **VERIFIED with directional alignment — phase-appropriate operational layer with surfaced execution-quality gaps**

The operational pass confirms Sessions 1–3's architectural verdicts are preserved AND enriches the execution-quality layer beneath with empirical evidence:

- **Sessions 1–3 verdicts unchanged:** Pattern Y confirmed; 5-layer architecture deliberately sequenced; Layer 3 cost-reducing-substrate dependent on Voyage key + staging reactivation; multi-scenario AI directionally aligned with North Star.
- **Operational layer findings:** 6 Production fixes pending (1 from earlier; 5 surfaced or sharpened by operational pass). 7 Tier-2 stabilization candidates. 2 hygiene findings. Items (a) + (b) deferred to future pass post-staging-reactivation.
- **The build's execution-quality discipline is uneven:** strong on encryption-at-rest core path, schema integrity (Dimension 2), case data flow (Dimension 4); weak on DB-validation pre-merge (item h), structured logging (items c+f), type tightening (item d), crypto-strength follow-through (item e), pool config (item g). All weak areas are deferred-hardening patterns; none are architectural drift.
- **Phase-appropriate qualifier preserved:** at this build phase (post-Layer 0 prerequisite, pre-Layer 3 build, gated on EU AI Act counsel), execution-quality gaps are remediable with single-sweep fixes. None of them block Layer 3 sequencing if addressed in operational hygiene work between now and Layer 3 build start.

**The operational pass is the empirical layer beneath Sessions 1–3's architectural claims.** Session 4 (Dimensions 5 + 6) reads from this evidence base directly. Session 5 (Dimension 8 — synthesis) integrates Session 4 findings with operational pass findings into the final cumulative verdict.

---

## Audit metadata

- File: `BUILD_INTEGRITY_AUDIT_OPERATIONAL_PASS.md`
- NOT committed during operational pass — working draft until full audit synthesis (Session 5)
- Hard boundaries respected throughout: read-only repo + read-only flyctl (no state-changing commands) + read-only git inspection + no DB connections (production excluded by ABSOLUTE boundary; staging suspended)
- Deferred to future operational pass post-staging-reactivation: items (a) `agent_queries` observability + (b) `kg_*` auto-population health (both require staging DB SELECT access)
- Write operations: this sub-file creation at exact path; cross-file integration edits to DIMENSION_4.md (Production fixes pending list to 6 entries) and DIMENSION_3.md (Tier-2 stabilization list to 7 entries) per Manish + chat-Claude GATE-OP-3 close confirmation.
- flyctl commands used (all read-only, all in ALLOWED list): `flyctl auth whoami`, `flyctl status`, `flyctl logs --no-tail`, `flyctl ssh console -C "sh -lc 'env | grep ...'"`. No state-changing flyctl commands.

---

## Operational pass close — final verdict (per GATE-OP-3 Element 3)

**Operational pass verdict: 🟡 VERIFIED with directional alignment — phase-appropriate operational layer with surfaced execution-quality gaps.**

Sessions 1–3 architectural verdicts unchanged. Architecture preserved; operational pass enriches execution-quality layer with empirical evidence. All weak areas are deferred-hardening patterns, not architectural drift. Single-sweep fixes available; none block Layer 3 sequencing if addressed in operational hygiene work before Layer 3 build start.

**Cross-pass recharacterization:** no verdict changes to Sessions 1–3. Operational pass adds 6 production fixes (with #2 re-scoped to bug cluster), 3 new Tier-2 entries, 2 hygiene findings.

**Cumulative-trajectory signal for Session 4:** 7 deferrals visible only at operational layer — staging suspension, auth assumed, type discipline, crypto strength, logging discipline, DB pool tuning, DB-validation pre-merge. None of these visible from architectural inspection alone. Sessions 1–3 (architecture) couldn't have surfaced these. Session 4 (build philosophy + doc truthfulness) reads this evidence directly.

---

## Operational hygiene work scheduling (per GATE-OP-3 Element 5)

Operational hygiene work scheduled separately from audit work. Three immediate priorities:

- **Staging reactivation** (unblocks future operational pass items a, b)
- **DB pool quick-fix** (Production fixes #3, one-line config change — Option A `min: 0` or Option B reduced `idleTimeoutMillis`)
- **`61977ad` bug cluster sweep** (Production fixes #2, sub-30-minute fix covering all 8 broken queries across 4 files)

These are remediation tasks, NOT audit work. Schedule as capacity allows. None block Session 4 launch.

(Mirror entry placed at top of DIMENSION_4.md Production fixes pending section per Element 5.)

---

## Session 4 Inputs (per GATE-OP-3 Element 4)

Operational pass produces three specific inputs for Session 4 Dimensions 5 + 6:

### INPUT 1 (Dimension 5 — build philosophy)

**The "shipped fast with deferred hardening" pattern is empirically validated.**

April 25 commit-discipline inflection (Session 3 D1-3 quantitative finding: 71 vague messages pre-April-25 → 0 post-April-25) captured commit-message discipline but did NOT capture verification discipline. `61977ad`'s 5 broken features have been silent-failing for 19 days (2026-04-13 → 2026-05-02 detection) with zero feedback loop.

**Commit discipline ≠ verification discipline.** Two distinct disciplines; one arrived at April 25, the other has not yet arrived. The commit-message-quality regime change suggests "process maturity is improving"; the unverified-broken-SQL-shipping pattern shows "process maturity has a specific gap that the commit-message regime change did not close."

### INPUT 2 (Dimension 5 — build philosophy)

**Two distinct observability gaps surfaced.**

- **Gap 1 — silent-fail-no-logger:** catches without `logger.error` → Sentry blind. Operational pass item (c)-3 category 2. Affects fan-out catches, init-db catches, cron handlers, Sentry init itself. **Remediation:** Pino-Sentry transport (Tier-2 #5).

- **Gap 2 — untested-feature:** features ship → never executed by users in production → never surface in any observability layer. Operational pass item (h) found this for public verification, client portal, weekly digest, push service — they were broken at ship time but observability blind because no user invoked them. **Remediation needs different shape than Gap 1:** integration testing, manual post-deploy verification, smoke-test discipline. Pino-Sentry transport doesn't address Gap 2 because the catches never fire if the handler is never invoked.

Both gaps need different remediations. Pino-Sentry addresses Gap 1; verification discipline addresses Gap 2.

### INPUT 3 (Dimension 6 — documentation truthfulness)

**Commit message `61977ad` "Complete feature build — no gaps, no stubs" is empirically false.** 5 of 10 features have broken SQL paths. 4 of 4 NEW api-server files in commit have schema-assumption bugs. 8 broken queries across the cluster.

This is a **doc-vs-reality gap at commit-message granularity.** Worth checking in Dimension 6: are similar gaps at other granularities?
- CLAUDE.md claims (Session 1 already found PHASE 2 sub-agent list lag; what else is stale?)
- MASTER_BLUEPRINT.md claims (Session 2 found 7/14 documented case fields absent from `legal_cases`; documented vs implemented gap)
- README claims (not yet audited)
- Counsel handoff packet claims (encryption-at-rest claim grounded per item (e); other claims?)
- Track 0 doc claims more broadly

Dimension 6 territory.

---

## Cross-file consistency confirmation (per GATE-OP-3 Element 6)

**Audit state at operational pass close:**

- **7 audit sub-files** at `artifacts/api-server/docs/` (`DIMENSION_0.md`, `DIMENSION_1.md`, `DIMENSION_2.md`, `DIMENSION_3.md`, `DIMENSION_4.md`, `DIMENSION_7.md`, `OPERATIONAL_PASS.md`)
- **All untracked working drafts; no commits.** Per audit hard boundary: working drafts until full audit synthesis (Session 5).
- **Build-sequencing findings:** 4 entries in DIMENSION_3.md (Pipeline naming reconciliation; Knowledge graph substrate wiring; kg_* densification strategy; Voyage embedding service wiring)
- **Production fixes pending:** 6 entries in DIMENSION_4.md (legal_briefs.case_id FK; **#2 re-scoped to 61977ad bug cluster**; DB pool with operational pass remediation options; daily regulatory scan; trc_cases TEXT-vs-UUID; messaging XOR→AES)
- **Tier-2 stabilization:** 7 entries in DIMENSION_3.md (CLAUDE.md sub-agent list; LegalBrief.tsx header; agent_queries pass deferred to post-staging-reactivation; dist/ gitignore; **#5 Pino-Sentry transport upgrade**; **#6 SENTRY_AUTH_TOKEN scope**; **#7 staging reactivation**)
- **Operational pass verdict:** 🟡 VERIFIED with directional alignment — phase-appropriate operational layer with surfaced execution-quality gaps
- **Sessions 1–3 architectural verdicts unchanged**

Cross-file integration edits applied per GATE-OP-3 Element 1 (DIMENSION_4.md) and Element 2 (DIMENSION_3.md). No edits to DIMENSION_0, DIMENSION_1, DIMENSION_2, DIMENSION_7. Operational pass sub-file (this file) carries verdict + Session 4 inputs + hygiene scheduling.

**Operational pass execution complete. Awaiting Session 4 launch direction (timing decided separately by Manish + chat-Claude).**
