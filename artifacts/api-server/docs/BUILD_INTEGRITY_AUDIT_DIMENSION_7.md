# BUILD INTEGRITY AUDIT — Dimension 7: External Integrations

**Audit date:** 2026-05-02
**Session:** 3 of 5 (Dimensions 7 + 1)
**Status:** 🟡 **VERIFIED with directional alignment — phase-appropriate, two real-gap findings (cron + voyage-key drift)**
**Author:** APATRIS Claude (executor + active reviewer); Manish + chat-Claude (last source of truth); Holmes not involved this session.

This document is the read-only record of Dimension 7 findings. NOT committed in Session 3. Working draft until full audit synthesis (Session 5).

---

## D7-1 — API key configuration audit

### Fly secrets configured (24 deployed)

```
JWT_SECRET, APATRIS_PASS_AKSHAY, APATRIS_PASS_MANISH,
MOBILE_T2_PIN, MOBILE_T3_PIN, MOBILE_T4_PIN, MOBILE_T5_PIN,
NEON_DATABASE_URL, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER,
ANTHROPIC_API_KEY, PPLX_API_KEY, SENTRY_DSN, FILE_STORAGE,
S3_ACCESS_KEY_ID, S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_SECRET_ACCESS_KEY,
SENTRY_AUTH_TOKEN, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY
```

### Per-integration cross-reference

| Integration | Fly secret? | Code usage (file count) | Status |
|---|---|---|---|
| Anthropic Claude (primary AI) | ✅ ANTHROPIC_API_KEY | 44 files | ✅ wired and used |
| Perplexity Sonar | ✅ PPLX_API_KEY | 6 files | ✅ wired and used |
| SMTP/Brevo email | ✅ SMTP_HOST/PASS/PORT/USER | 8 files | ✅ wired and used |
| Cloudflare R2 (S3 storage) | ✅ S3_* (5 secrets) | 4 files | ✅ wired and used |
| Sentry observability | ✅ SENTRY_DSN + SENTRY_AUTH_TOKEN | 2 files (init at index.ts:9-11; middleware at app.ts:112) | ✅ wired and used |
| Web Push (VAPID) | ✅ VAPID_PRIVATE_KEY/PUBLIC_KEY | (per CLAUDE.md push subscriptions) | ✅ wired and used |
| Neon Postgres | ✅ NEON_DATABASE_URL | 1 file (db connection) | ✅ wired and used |
| JWT auth | ✅ JWT_SECRET | 7 files | ✅ wired and used |
| Workforce-app PIN auth | ✅ MOBILE_T2/T3/T4/T5_PIN | (per CLAUDE.md) | ✅ wired and used |
| Admin password auth | ✅ APATRIS_PASS_MANISH/AKSHAY | (per CLAUDE.md) | ✅ wired and used |
| Twilio (WhatsApp/SMS/Voice) | ❌ NOT in Fly secrets | 1 file (`lib/whatsapp.ts`) — gracefully no-ops if missing | 🟡 used in code but NOT configured in prod; degrades gracefully |
| Stripe billing | ❌ NOT in Fly secrets | 3 files (`routes/billing.ts`) — returns 503 with `missing` array if not configured | 🟡 used in code but NOT configured in prod; degrades gracefully (503 with explanatory error) |
| DeepL translation | ❌ NOT in Fly secrets | 1 file (`routes/translate.ts`) — falls back to no-translation if missing | 🟡 used in code but NOT configured in prod; degrades gracefully |
| Google Workspace OAuth | ❌ NOT in Fly secrets | 1 file (`routes/google.ts`) — uses empty default `""` | 🟡 used in code but NOT configured in prod; OAuth flow inert |
| OpenAI (provider abstraction) | ❌ NOT in Fly secrets | 1 file — **comment only** in `services/ai/provider.ts:53` (`// Future: check for OPENAI_API_KEY`) | ✅ correctly inactive per CLAUDE.md ("scaffolded but not active") |
| Voyage AI embeddings | ❌ **NOT in Fly secrets** (`APATRIS_VOYAGE_API_KEY`) | 2 files (`lib/embeddings.ts`, `lib/rag.ts`) — gracefully returns null if missing | 🔴 **REAL GAP — see D7-1 critical finding below** |
| Brevo native API | ❌ NOT in Fly secrets (BREVO_API_KEY) | 0 files | ✅ correctly absent (Brevo accessed via SMTP, not REST API) |
| Resend | ❌ | 0 files | Not used |
| DocuSign | ❌ | 0 files | Not used |
| GitHub token | ❌ | 0 files | Not used at runtime (CI-only if anywhere) |

### D7-1 critical finding: Voyage embedding key drift

**Reality-vs-plan mismatch (escalation format):**
- **EXPECTED:** Vector RAG retrieval substrate (pgvector embeddings on legal_knowledge / rejection_analyses / case_generated_docs / workers per Sub-test C+D Session 2 findings) is operational because the vector columns are populated and HNSW indexes exist.
- **FOUND:** Embedding generation requires `APATRIS_VOYAGE_API_KEY` (per `lib/rag.ts:120` and `lib/embeddings.ts`), but **this key is NOT in `flyctl secrets list` for `apatris-api`**. The 4 vector(1024) columns exist on schema (Dimension 2 verified), but new embeddings cannot be generated on prod without the Voyage key.
- **REASONABLE INTERPRETATION:** Either (a) the seeded data shipped with pre-baked embeddings populated locally before prod deploy, or (b) the embedding generation is scheduled to be enabled later, or (c) the key lives in a different env-var location not surfaced by `flyctl secrets list`. Most likely (a) — initial 12 legal_knowledge articles were seeded with embeddings via `scripts/backfill-embeddings.ts` (per `lib/embeddings.ts` comment). Going forward, new content (new rejections, new generated docs, new worker profiles) WILL NOT have embeddings populated on prod because the runtime-callable Voyage path returns null gracefully.
- **RECOMMENDATION:** Either configure `APATRIS_VOYAGE_API_KEY` in Fly secrets OR document that embedding generation is staging-only and prod uses pre-baked embeddings. Operationally, the system degrades gracefully (no exceptions; fallback to non-vector retrieval), but Layer 3's "find similar cases" promise is **harder to deliver than expected** if new case data isn't being embedded on prod.
- **AWAITING confirmation** on whether to elevate to Production fixes pending or document as known-deferred.

### D7-1 graceful-degradation pattern observed

A consistent pattern emerges across all "configured-in-code-but-not-in-Fly" integrations: **if env var missing, return null / 503 / empty / fallback**. No throw-on-startup. No hard requirement. This means the system runs on prod with a subset of integrations and the rest are inert dark zones.

This is **defensible architecture** — better than crash-on-missing-key. But it's also opaque: from a black-box prod test, you can't tell which features are wired vs which return graceful-empty. The dark zones are: Twilio (WhatsApp alerts), Stripe (billing), DeepL (translation), Google OAuth, Voyage embeddings.

This is **phase-appropriate** for the current build (counsel-engagement gating most operational integrations; no live Stripe customer; SMTP suffices for email; Twilio is post-launch). But **stabilization-eligible** for documentation: a `.env.example` or integration matrix would clarify which features are actually live on prod.

---

## D7-2 — Cron jobs verification

`fly.toml` (30 lines) has NO `[processes]` or cron definitions. Cron-style scheduling lives in-process via `node-cron` (4.2.1 dependency) but the actual implementation uses `setTimeout` / `setInterval` recurring patterns rather than node-cron's `cron.schedule()` (zero matches for `cron.schedule` in source).

### Schedulers exported from `lib/scheduler.ts` (10 functions)

| Function | Schedule | Started in `index.ts` boot? | Handler substantive? |
|---|---|---|---|
| `startScheduler()` | Daily (24h `setTimeout` recurrence at line 301-316) — document expiry alerts | ❌ **NOT invoked in boot sequence** | ✅ substantive (the original purpose: scan documents, fire alerts to coordinators) |
| `triggerScanNow()` | On-demand only | N/A | ✅ substantive — invoked manually from `routes/documents.ts:52` |
| `startMonthlyInvoices()` | Daily check (32-bit-overflow-safe), executes monthly | ✅ booted | ✅ substantive |
| `startWeeklyMoodPrompts()` | Weekly (`setTimeout` 7-day recurrence) | ✅ booted | ✅ substantive |
| `startWeeklySignalScan()` | Weekly | ✅ booted | ✅ substantive |
| `startWeeklyCompetitorScan()` | Weekly | ✅ booted | ✅ substantive |
| `startWeeklyReport()` | Weekly | ✅ booted | ✅ substantive |
| `startEscalationEngine()` | Interval | ✅ booted | ✅ substantive |
| `startWeeklyDigest()` | Weekly | ✅ booted | ✅ substantive |
| `startDailyRegulatoryScan()` | Daily (24h) | ✅ booted | ✅ substantive |
| Inline hourly scheduler in `index.ts:108-118` | Hourly `setInterval` | ✅ booted | ✅ substantive — runs `runScheduledReports` + `scanAndCreateNotifications` |

### D7-2 critical finding: dead cron — `startScheduler()` never invoked

**Reality-vs-plan mismatch (escalation format):**
- **EXPECTED:** All 10+ scheduler functions in `scheduler.ts` are wired up at boot.
- **FOUND:** `startScheduler()` (the original document-expiry daily-scan handler) is exported and substantive but **NOT invoked from `index.ts:85-130` boot sequence**. The 9 newer schedulers and 1 inline hourly are wired; the original document-scan is not.
- **REASONABLE INTERPRETATION:** When the newer schedulers were added, the original document scan was likely retired in favor of the inline hourly-check-for-notifications path (`index.ts:108-118`). The function remained because `triggerScanNow()` (manual trigger from `routes/documents.ts:52`) still uses the same code path. Dead-cron-but-live-handler.
- **RECOMMENDATION:** Either (a) wire `startScheduler()` into the boot if the daily document scan still serves a purpose distinct from the hourly notification scan, or (b) delete `startScheduler()` if it's superseded. Tier-2 stabilization candidate. Not blocking; not a Production fix because document expiry IS being handled by the hourly scheduler.
- Functionally NO degradation; **organizationally** dead code that suggests an incomplete refactor.

### D7-2 cron count summary

- Schedulers exported: 10
- Schedulers actively booted: 9 + 1 inline hourly = 10 active cron-equivalents
- Dead cron exports: 1 (`startScheduler`)
- node-cron dependency installed but unused (uses native `setTimeout/setInterval` instead)

CLAUDE.md mentions "Scheduling: node-cron (daily compliance alerts)" — this is **partially stale**: node-cron is installed but not actually invoked; scheduling uses native timers. Stabilization-eligible for documentation.

---

## D7-3 — Fly deployment state

| Field | Value |
|---|---|
| Production app | `apatris-api` |
| Production version | **v295** (Apr 24 2026 19:19) |
| Production region | `iad` (US-East primary) |
| Staging app | `apatris-api-staging` |
| Staging status | **SUSPENDED** (last deploy Apr 24 2026 17:36) |
| HEAD commit (main) | `3e6cc89` (Apr 30 2026 14:34) |
| Production deploy commit | `8fa917e` (per `TECH_DEBT.md` v295 baseline; matches Apr 24 deploy date) |
| Drift between prod and HEAD | **6 days / ~26 commits behind** |

### D7-3 deployment-vs-HEAD drift analysis

Production is at v295, deployed 2026-04-24, corresponding to commit `8fa917e` (`feat(intake): persist uploaded PDFs so lawyers can retrieve source files`).

HEAD (`3e6cc89`, Apr 30) is **6 days and ~26 commits ahead.** The drift includes:
- All 8 phases of Tier 1 bilingual remediation (commits `3a0f5e4` → `0f3a8d6`)
- The Path C Step 2 CLAUDE.md updates (commits `b208ccb`, `3e6cc89`)
- Various intermediate Track 0 doc additions

**This is normal between-deploy drift.** The build's pattern is that documentation-heavy commits accumulate before the next prod deploy bundles a code-significant change. Tier 1 was code + docs (LanguageToggle component + AppShell mounts); these have NOT been deployed to prod yet.

**Operational implication:** Workforce-app users on prod see the OLD bilingual setup (no LanguageToggle in AppShell, no PL default, isPl ternaries on ImmigrationSearch, etc.). Tier 1's user-facing benefits land at next deploy. Not a Dimension 7 problem; a Manish-cadence-decision item.

### D7-3 staging suspension

`apatris-api-staging` is SUSPENDED. This blocks D7-4 (live schema-vs-database drift inspection). See D7-4 below.

---

## D7-4 — Neon database state vs init-db.ts schema

### D7-4-NO-STAGING-CASE invoked

Staging is suspended. Production DB connection is forbidden by hard boundary. **No live DB inspection performed in this audit session.**

Per the prompt's escalation rule: "If staging/dummy DB access requires DML/DDL or only production access available, surface and STOP D7-4. Note in findings."

D7-4 is **deferred to the operational pass scheduled BETWEEN Session 3 and Session 4** (per Session 2 close Integration 5). The operational pass will need to either (a) wake `apatris-api-staging` (operational change, requires explicit Manish authorization since it exceeds read-only audit scope), or (b) accept the live-drift-inspection limitation and run remaining operational checks (a, b, c, d from DIMENSION_4.md Operational Pass Scope) against an alternative target if available.

**This is not a Dimension 7 verdict failure.** It's an **observability gap acknowledged at audit close**: staging is suspended, so live-vs-init-db.ts drift cannot be quantified from repo alone. The schema as documented in init-db.ts is verified (Dimension 2). Whether prod's Neon DB matches init-db.ts character-for-character is unknown without staging access.

**Confidence:** Given init-db.ts uses `IF NOT EXISTS` guards on every CREATE TABLE / ALTER TABLE / CREATE INDEX, and given the pattern is idempotent on every boot, drift on prod would only occur from:
- A DDL change applied manually in prod outside init-db.ts (no evidence of this; would surface in `ALTER TABLE` SQL grep — it doesn't)
- A historical migration that was deleted from init-db.ts but its column still exists in prod (no evidence)
- A failed catch block silently leaving a column missing (Dimension 2 found 6 such catch blocks; risk is bounded)

**Practical confidence:** HIGH that prod schema matches init-db.ts. Staging-DB inspection would tighten this to MEDIUM-HIGH or HIGH-VERIFIED.

---

## D7-5 — Cross-dimension observability: kg_*/pgvector → external services

(Active reviewer hook bridging Dimension 7 to Session 2 Dimension 2 findings.)

### kg_* (knowledge graph) external dependencies

`services/knowledge-graph.service.ts` (280 lines) is **fully self-contained PostgreSQL operations**. No external service calls. INSERT/SELECT/UPDATE on kg_nodes + kg_edges only. The "Auto-populated on case status changes" path (per Session 2 Dimension 4 Hook 1) is pure in-database logic.

External integration touchpoint: ZERO. kg_* substrate works with no external API keys.

### pgvector (embedding substrate) external dependencies

The 4 vector(1024) columns (legal_knowledge, rejection_analyses, case_generated_docs, workers) populate via `lib/embeddings.ts` calling Voyage AI's API. **Voyage is a real external dependency.**

Per D7-1 critical finding: `APATRIS_VOYAGE_API_KEY` not in Fly secrets. Embedding generation on prod is degraded — `embedQueryText()` returns null gracefully when key missing. Pre-baked seed-time embeddings work; runtime new-content embedding does not.

**Cross-dim implication:** Session 2 PART D's claim that "kg_* + pgvector substrate is cost-reducing for Layer 3" was contingent on substrate being **active**. kg_* IS active (Hook 1 verified). pgvector is **partially active** — historical seed embeddings exist; runtime growth requires Voyage key configuration. Layer 3's "find similar cases via pgvector" path needs Voyage key configured before scenarios engine can leverage growing case corpus for calibrated forecasts.

**This is not a verdict change for Session 2;** it's a sharpening: Voyage key is on the Layer 3 cost path. Configure Voyage before Layer 3 build, or scenarios engine retrieves from a static seed corpus.

### Anthropic API as substrate user

`ANTHROPIC_API_KEY` is configured (Fly secret) and used heavily — 44 files invoke Claude. The 6-stage legal_briefs pipeline depends on it. The 6 sub-agents in ai-copilot.ts synthesis layer depends on it. Layer 3 will be Anthropic-dependent.

**Confidence:** HIGH. Anthropic dependency is operational; Layer 3 inherits this without additional cost.

### Sentry as observability for case lifecycle fan-out

Sentry is configured (`SENTRY_DSN` Fly secret, `index.ts:9-11` init, `app.ts:112` middleware). However, per Session 2 Dimension 4 Hook 1, the case lifecycle fan-out (`legal-case.service.ts:260-282`) wraps each downstream call (case-notebook, case-sync, kg_*, case-doc-generator) in `try { ... } catch { /* non-blocking */ }` — silent failures. **These silent catches do NOT report to Sentry.** Sentry sees only un-caught errors at the route boundary; silent best-effort failures in the fan-out are invisible.

**Cross-dim implication for operational pass scope (c) — silent-failure trace spot-check:** Sentry will not surface these. The operational pass will need to query Fly logs for `[init-db]` warnings (Dimension 2 finding) and inspect prod log streams for `[Scheduler]` errors (Dimension 7 finding). Sentry is only useful for unwrapped exceptions.

This recharacterizes the silent-failure operational concern: **without explicit logger.error / Sentry capture inside the catch blocks, silent failures stay invisible.** Stabilization-eligible: wire silent-catch blocks to structured logger calls. Already named in DIMENSION_2 Tier-2 findings.

---

## D7-6 — Forward-build capture (Layer 3 implications)

When Layer 3 (scenarios engine) is built, the following external-integration changes will be needed:

**Required configurations (currently missing or partially missing):**
1. **`APATRIS_VOYAGE_API_KEY`** — must be configured in Fly secrets for runtime embedding generation. Without this, Layer 3's "find similar cases" similarity scoring is limited to pre-baked seed corpus, not growing case data.
2. **Sentry coverage of fan-out catch blocks** — Layer 3 will add additional best-effort writes (scenario generation, scenario-evidence linking, scenario-document generation). Without explicit logger calls inside catches, Layer 3 silent failures stay invisible. Recommend: standardize "non-blocking with logger.error" pattern before Layer 3 build.

**Underutilized integrations Layer 3 could leverage:**
1. **Sentry tracesSampleRate at 0.1** (10%) — Layer 3 latency monitoring would benefit from per-stage trace sampling. Sentry is already wired; Layer 3 inherits.
2. **VAPID web push** — Layer 3 scenario decisions (lawyer chooses pathway, status changes, document generation) could trigger client-side push notifications. Already wired; opt-in for Layer 3.
3. **PPLX_API_KEY** (Perplexity Sonar) — already used by Stage 1 of legal_briefs pipeline for legal research. Layer 3 stage5_alternatives could augment scenario generation with Perplexity-sourced "similar pathway precedents" lookup. Already wired; cost-neutral.

**Gaps that Layer 3 work would expose:**
1. **DeepL translation key not configured** — Layer 3 scenarios will need to be presentable to the worker in their preferred language (per LAYER_0_TESTABILITY tone-calibration spec). DeepL fallback to no-translation may be acceptable; or Anthropic Claude can translate (already configured). Worth deciding.
2. **No staging DB access (D7-4)** — Layer 3 build needs a staging substrate to test scenarios engine without touching prod. Reactivating apatris-api-staging is recommended before Layer 3 build starts.
3. **Cron consolidation** — `startScheduler()` dead-cron should be cleaned up before Layer 3 adds its own scheduled work (similarity recalibration, scenario expiry, etc.).

**Build complexity impact for Layer 3:** Marginal. Most external integrations Layer 3 needs are already configured (Anthropic, PPLX, Sentry, Neon, S3). The Voyage key is the one configuration gap that must close. Voyage is already integrated in code; configuring is `flyctl secrets set` — minutes, not days.

---

## Verdict

🟡 **VERIFIED with directional alignment — phase-appropriate, two real-gap findings**

External integrations are **substantially configured and operational** for the current build phase. 13+ integrations actively wired (Anthropic, PPLX, SMTP, S3, Sentry, JWT, Neon, VAPID, admin auth, mobile PINs); 4 used-in-code-but-not-configured gracefully degrade (Twilio, Stripe, DeepL, Google OAuth — the future Phase 1 features per CLAUDE.md ROADMAP); 1 abstraction-only (OpenAI) correctly inactive. Cron schedulers (10 active) are running. Fly v295 deployed Apr 24, healthy.

**Two real gaps surfaced:**

1. **Voyage embedding key drift (D7-1 critical):** `APATRIS_VOYAGE_API_KEY` is referenced in `lib/rag.ts` and `lib/embeddings.ts` for runtime embedding generation but is **NOT in Fly secrets**. Pre-baked seed embeddings work; runtime new-content embedding falls back to null. Layer 3's pgvector "find similar cases" path needs this configured. **Awaiting confirmation** on whether to elevate to Production fixes pending.

2. **Dead cron (D7-2 critical):** `startScheduler()` (original document expiry daily-scan handler) is exported and substantive but NOT invoked from boot sequence. Functionally harmless (the hourly scheduler covers the same ground via `scanAndCreateNotifications`), but organizationally dead code suggesting incomplete refactor. Tier-2 stabilization.

**Three observability gaps for operational pass scope:**

1. **Staging DB access (D7-4):** `apatris-api-staging` is SUSPENDED; live schema-vs-init-db.ts drift inspection cannot run from repo alone. Operational pass will need staging reactivation OR alternative-target inspection.
2. **Silent-failure invisibility (D7-5):** Sentry doesn't see best-effort catch blocks in `legal-case.service.ts:260-282` fan-out. Stabilization-eligible (already named in Dimension 2 Tier-2).
3. **CLAUDE.md cron framing stale (D7-2):** "Scheduling: node-cron" is partially stale; actual implementation uses native `setTimeout/setInterval`. Tier-2 doc fix.

These gaps are **phase-appropriate**: integration scope is concentrated on the AI/legal-case-reasoning North Star path (Anthropic + PPLX + Voyage embeddings + Sentry + S3). Operational integrations (Twilio, Stripe, DeepL, Google) are properly behind feature-flag-style env-var gates and degrade gracefully.

ASSUMPTION 3 holds: integrations are **infrastructure layer**, not architectural decisions. The architectural pattern (Pattern Y) and 5-layer sequencing remain unchanged by Dimension 7 findings.

ASSUMPTION 1 holds: Session 1+2 verdict (YELLOW with directional alignment) is **reinforced** by Dimension 7. Execution quality on infrastructure layer is sound for documented architecture.

---

## Cross-dimension recharacterization check

Dimension 7 findings do NOT change Session 1+2 verdicts. They:
- **Sharpen** Session 2 PART D's "kg_* + pgvector cost-reducing for Layer 3" claim: kg_* fully active, pgvector pre-baked-active-but-runtime-degraded without Voyage key configured. Layer 3 cost remains reducing IF Voyage gets configured before Layer 3 build.
- **Reinforce** Session 2 Dimension 4 Hook 1's silent-failure observation: Sentry is wired but doesn't see best-effort catches; stabilization to wire structured logger inside catches stands as Tier-2.
- **Add 2 new findings** (Voyage key, dead cron) to the audit's Production-fixes-pending and Tier-2-stabilization queues.

No updates to Session 1+2 sub-files required from Dimension 7 findings alone. (Dimension 1 may surface additional cross-dimension recharacterization candidates.)

---

---

## D7-1 DISCOVERY-FIRST refinement (Holmes refinement applied)

The initial audit checked a hardcoded list of expected env vars. The DISCOVERY-FIRST methodology enumerates ALL `process.env.X` references across the codebase and checks each against Fly secrets. Result: **47 unique env vars discovered** (43 in api-server, plus dashboard/workforce-app and `lib/db/`). Initial audit's hardcoded list missed several.

### Newly-discovered integrations not in initial audit

| Integration | Code reference | Fly secret? | Status |
|---|---|---|---|
| **Airtable** (legacy data source) | `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME` | ❌ NOT in Fly secrets | 🟡 used in code; legacy Airtable integration likely deprecated post-Postgres migration. Genesis commits (`b427991` 2026-03-14) showed Airtable as data source. Stabilization-eligible: confirm deprecation OR re-add secrets. |
| **APATRIS Encryption** | `APATRIS_ENCRYPTION_KEY`, `APATRIS_LOOKUP_KEY` | ❌ NOT shown in `flyctl secrets list` output (may be set via Replit/local env or via different secret name) | 🟡 critical for PII encryption (per `lib/encryption.ts`). If missing on prod, PII columns may use empty key — **needs verification** in operational pass. |
| **DocuSign** | `DOCUSIGN_API_KEY` | ❌ | 🟡 used in code; not configured (Phase 1 ROADMAP) |
| **Perplexity (alt name)** | `PERPLEXITY_API_KEY` | ❌ (only `PPLX_API_KEY` in Fly) | 🟡 dual-naming code-vs-config drift — `PERPLEXITY_API_KEY` in code falls back; effective name is `PPLX_API_KEY`. Stabilization-eligible: standardize. |
| **SignNow** | `SIGNNOW_API_KEY` | ❌ | 🟡 used in code; not configured (e-signature alternative) |
| **SMTP From** | `SMTP_FROM` | ❌ NOT in Fly secrets (only SMTP_HOST/PASS/PORT/USER) | 🔴 **REAL GAP** — emails sent without configured FROM address; likely defaults to SMTP_USER. Worth verifying. |
| **STRIPE_WEBHOOK_SECRET** | (paired with STRIPE_SECRET_KEY) | ❌ | 🟡 same status as Stripe — graceful degrade |
| **TWILIO_ACCOUNT_SID** + **TWILIO_WHATSAPP_NUMBER** | (paired with TWILIO_AUTH_TOKEN) | ❌ | 🟡 same status as Twilio |
| **Upstash Redis** | `UPSTASH_REDIS_TOKEN`, `UPSTASH_REDIS_URL` | ❌ | 🟡 caching/queue layer not configured. Likely Phase 2 (per CLAUDE.md MCP servers section mentions Redis-style usage). |
| **VAPID_PUBLIC_KEY** | (paired with VAPID_PRIVATE_KEY which IS in Fly) | ✅ both VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY in Fly | ✅ wired |
| **APP_URL, BASE_PATH, FLY_APP_NAME, ALLOWED_ORIGINS, LOG_LEVEL, NODE_ENV, PORT, REPL_ID, VOYAGE_MODEL** | runtime/build config | partial in Fly | ✅ standard runtime config; not API integrations |

### DISCOVERY-FIRST summary

The codebase references **47 unique env vars** total. **24 are configured in Fly secrets**. The 23+ unconfigured fall into three classes:
1. **Runtime config** (NODE_ENV, PORT, LOG_LEVEL, BASE_PATH, FLY_APP_NAME, REPL_ID) — Fly platform sets these automatically; not "missing"
2. **Phase 1 ROADMAP integrations** (Twilio, Stripe, DeepL, DocuSign, SignNow, Google OAuth, Upstash Redis) — graceful degradation; counsel-/billing-engagement gates these
3. **Real gaps** (Voyage embeddings — flagged earlier; Airtable legacy — confirm deprecation; SMTP_FROM — verify default behavior; APATRIS_ENCRYPTION_KEY/LOOKUP_KEY — verify presence by alternative means)

The **APATRIS_ENCRYPTION_KEY** and **APATRIS_LOOKUP_KEY** absence from `flyctl secrets list` is concerning if confirmed missing — encryption depends on these. Could be set via Fly machine env directly (not as a secret) OR could actually be missing. Recommend: operational pass scope (e) added — verify encryption-key presence via `flyctl ssh + env | grep APATRIS_ENCRYPT` (read-only env inspection, allowed per hard boundaries).

---

## D7-2 MULTI-METHOD refinement (Holmes refinement applied)

The initial audit relied only on (a) cron config files + (b) code grep. MULTI-METHOD adds (c) flyctl ssh + crontab -l and (d) flyctl logs.

### (c) System crontab on prod machine

```
*/15 * * * *  run-parts /etc/periodic/15min
0    * * * *  run-parts /etc/periodic/hourly
0    2 * * *  run-parts /etc/periodic/daily
0    3 * * 6  run-parts /etc/periodic/weekly
0    5 1 * *  run-parts /etc/periodic/monthly
```

This is the **default Alpine Linux system crontab** — system maintenance only. **NO Apatris-specific cron jobs at the OS level.** Confirms initial finding: all Apatris schedulers run in-process via Node.js `setTimeout/setInterval`. The OS cron is unused for app logic.

### (d) Recent Fly logs (last 24h, scheduler activity)

**Three production observability findings discovered via logs that repo-only inspection couldn't surface:**

1. **`[Scheduler] Regulatory scan/snapshot error: Error: Connection terminated due to connection timeout`** — observed 2026-05-02T06:00:41Z and 06:00:48Z. The `startDailyRegulatoryScan` cron IS firing on schedule (daily 24h cycle) but failing with DB connection timeout. **Real production failure pattern.**

2. **`[DB] Unexpected pool client error: Connection terminated unexpectedly`** — recurring **every ~10 minutes for hours straight** (2026-05-02 01:06 → 06:00 sampled, dozens of occurrences). Both Fly machines (`891361a6672738` and `d8d5056c126908`) experiencing the same error. This is a persistent **DB connection pool instability** affecting prod runtime. **Significant production observability finding** that audit's repo-only inspection missed entirely.

3. **`[Escalation] Error: column w.first_name does not exist`** — observed 2026-05-02T03:21-03:22. The `startEscalationEngine` cron IS firing but produces a **real SQL error** — its query references `w.first_name` which doesn't exist on `workers` table (workers has `full_name`, not split first/last). **Schema-vs-query drift in cron handler.**

### MULTI-METHOD summary

The MULTI-METHOD verification surfaces **three findings invisible to repo-only inspection:**

| Finding | Severity | Category |
|---|---|---|
| Daily regulatory scan failing on DB timeout | 🔴 production failure (silent — non-blocking; degrades gracefully) | **Production fixes pending** |
| DB pool client errors recurring every ~10min for hours | 🔴 production stability concern | **Production fixes pending — potentially urgent** |
| Escalation engine SQL bug (`w.first_name` doesn't exist) | 🔴 production failure (silent — non-blocking caught at cron level) | **Production fixes pending** |

These were INVISIBLE to my initial repo-only Dimension 7 work. The MULTI-METHOD refinement (Holmes addition) is the value-add that turned a phase-appropriate verdict with two minor gaps into one with **three real production runtime failures surfacing in logs.**

**Critical re-assessment:** the dead-cron `startScheduler()` finding is mild compared to these three live cron failures. The schedulers that ARE booted are firing on schedule but **failing at runtime** in ways that don't surface to Sentry or anywhere except Fly logs.

This connects directly to Dimension 2's silent-failure-pattern observation and Dimension 4's Hook 1 best-effort fan-out — the catch blocks swallow these failures into stdout warnings; Sentry doesn't see them. The audit's "wire silent-failure catches to structured logging" Tier-2 stabilization just became more concrete and more urgent.

---

## Verdict update post-refinement

**Verdict revised: 🟡 VERIFIED with directional alignment — phase-appropriate, FIVE real-gap findings (revised from two)**

The DISCOVERY-FIRST + MULTI-METHOD refinements added three real findings to the original two (Voyage key, dead cron). Total Production-fixes-pending candidates surfaced by Dimension 7:

1. **Voyage embedding key drift** (D7-1 — APATRIS_VOYAGE_API_KEY not in Fly secrets)
2. **Daily regulatory scan failing on DB timeout** (D7-2 (d) — production logs observed)
3. **DB connection pool instability** (D7-2 (d) — recurring every ~10min for hours; multiple machines affected)
4. **Escalation engine SQL bug** (D7-2 (d) — `w.first_name` doesn't exist; cron handler errors silently)
5. **Possible APATRIS_ENCRYPTION_KEY missing from Fly secrets** (D7-1 DISCOVERY-FIRST — needs operational-pass verification)

Plus stabilization-eligible: SMTP_FROM not configured; Airtable legacy keys deprecated-or-not unclear; PERPLEXITY_API_KEY vs PPLX_API_KEY naming drift; dead cron `startScheduler()`.

**ASSUMPTION 3 holds with sharpened nuance:** integrations as INFRASTRUCTURE — yes, but Dimension 7's value depended on multi-method observability inspection, not repo-only. The audit's "phase-appropriate" verdict on infrastructure layer is preserved BUT three observed-runtime failures elevate three Tier-2 candidates to Production-fixes-pending. **The build is running degraded on prod in observable ways that operational pass needs to address before Layer 3 build adds load.**

This is **the exact value the operational pass between Sessions 3-4 was designed to capture.** Holmes's MULTI-METHOD refinement front-loaded some of that value into Dimension 7. The operational pass scope expands accordingly.

---

## Audit metadata (revised post-refinement)

- File: `BUILD_INTEGRITY_AUDIT_DIMENSION_7.md`
- NOT committed in Session 3 — working draft until full audit synthesis
- Hard boundaries respected: read-only repo, no commits, no DML/DDL, no DB connections, no migration runner invocation, no Fly secret changes, no deploys
- Live data sources accessed: `flyctl releases`, `flyctl secrets list`, `flyctl apps list`, **`flyctl ssh + crontab -l`**, **`flyctl logs`** (read-only Fly metadata + read-only command + read-only log stream — no SSH state changes, no DB connection, no deploys)
- DISCOVERY-FIRST + MULTI-METHOD refinements applied per Holmes review on Session 3 save prompt

---

## Pre-Dimension-1 Bounded Verifications (Session 3 mid-session investigation)

Two targeted verifications run after GATE 7 confirmation, before Dimension 1 launches. Read-only investigation; captures evidence for operational-pass remediation; remediates nothing.

### Verification 1 — Encryption key presence (5 min)

**Command (read-only):** `flyctl ssh console --app apatris-api -C "sh -lc 'env | grep APATRIS'"`

**Result: ✅ OUTCOME A — both keys present.**

`APATRIS_ENCRYPTION_KEY` and `APATRIS_LOOKUP_KEY` both confirmed on the running prod Fly machine, with `_BACKUP` variants also present (rotation safety net). Values are 32-byte hex strings (length-confirmed; values intentionally redacted from this audit doc).

**Recharacterization of D7-1 finding:** APATRIS_ENCRYPTION_KEY DISCOVERY-FIRST flag was a **false alarm caused by `flyctl secrets list` not surfacing the key**. The keys live in the running container's environment via a different mechanism (likely set via `fly machines update` machine env, or imported from a secret file at boot, or set as Fly platform-level rather than app-level secrets). The `flyctl secrets list` output is INCOMPLETE for environment inventory purposes.

**Implication for audit methodology:** `flyctl secrets list` alone is insufficient for verifying environment-variable presence. The DISCOVERY-FIRST refinement was right to enumerate code references; the verification step (`env | grep`) is the definitive check. Pattern to remember for future operational-state audits.

**Note on key visibility:** running this command exposed the key values + admin passwords (`APATRIS_PASS_*`) in CLI output. Audit boundaries don't forbid read-only env inspection but the discipline of NOT capturing key material in audit documents is observed: this DIMENSION_7.md contains only "present, length confirmed" — no key material.

**PII encryption posture: intact.** Counsel handoff packet's encryption posture references match reality. No audit-pause needed. Proceed to Verification 2.

### Verification 2 — DB pool diagnostic (15-20 min)

#### VERIF-2-A — Pool configuration inspection

`artifacts/api-server/src/lib/db.ts` (100 lines). Pool configuration at lines 15-23:

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

#### VERIF-2-B — Error pattern documentation (deeper than GATE 7 sample)

Captured via `flyctl logs --app apatris-api -n` filtered for "Connection terminated | ECONNRESET | pool | timeout":

| Metric | Value |
|---|---|
| Window observed | 2026-05-02T01:27:31Z → 2026-05-02T08:16:46Z (~7 hours) |
| Total error events captured in window | **70** |
| Per-machine distribution | `891361a6672738`: 29 errors / `d8d5056c126908`: 41 errors |
| **Both machines affected** | ✓ |
| Timing pattern | Recurring minute markers: `:06, :16, :27, :36, :46, :56` per hour (every ~10 minutes; not perfectly spaced — likely multiple in-process schedulers triggering connection use at offset cadences) |
| Frequency (24h projection) | ~240 errors / 24h |
| Frequency trend | **Steady** (not escalating) |
| First error in window | 01:27:31Z |
| Last error in window | 08:16:46Z |
| Correlation with cron timing | Likely correlates with the inline hourly scheduler (index.ts:108-118 `setInterval(..., 60*60*1000)` for `runScheduledReports` + `scanAndCreateNotifications`) AND `startEscalationEngine` interval. Multiple schedulers firing at offset intervals each take a connection from pool, hit Neon, error on stale-connection — recurring pattern. |

#### VERIF-2-C — Neon dashboard metrics

**NOT accessible to APATRIS Claude in this audit session.** No Neon dashboard credentials configured. Note for Manish: Neon connection-count metrics over last 24h, idle disconnect patterns, and Neon-side timeout logs require manual dashboard access. **Defer to operational pass scope (g) — DB connection pool root-cause investigation.**

#### Likely root cause (informational; quick-fix path identified)

**Pattern:** Neon serverless Postgres aggressively closes idle connections (server-side timeout). pg-pool's `min: 2` + `allowExitOnIdle: false` + `idleTimeoutMillis: 30_000` combination keeps 2 connections "warm" in the pool indefinitely. When Neon closes them server-side after its own (different, likely shorter) idle timeout, pg-pool doesn't know — and when the next scheduled query tries to use the stale pool connection, the connection-already-closed event fires `pool.on("error")` which logs `[DB] Unexpected pool client error: Connection terminated unexpectedly`. Classic Neon + pg-pool interaction with serverless connection closure.

**Quick-fix candidates (DO NOT apply today; for operational pass remediation):**
- Set `min: 0` — don't keep warm connections to a serverless DB. Each query opens fresh; trades cold-start latency for stability.
- Reduce `idleTimeoutMillis` to be shorter than Neon's server-side timeout (~10-15 sec) so pg closes idle connections before Neon does.
- Add a periodic `pool.query("SELECT 1")` keepalive query every ~25 seconds.
- Switch to Neon's official `@neondatabase/serverless` driver or `pg`'s pool with explicit `keepAlive: true` on TCP socket.

The error is **logged but does NOT crash the app** — pg-pool transparently opens a new connection on the next query. So observable degradation is "noisy logs" rather than "broken queries." Per audit findings, Sentry doesn't see these (they're caught silently in `pool.on("error")`).

#### Verification 2 outcome classification

Per the prompt's branching:

- OUTCOME A: pool configured reasonably AND errors bounded (< 50/24h) — **NO** (240/24h projected)
- OUTCOME B: pool actively degrading, no clear correlation, escalating frequency — **NO** (frequency is steady; clear pattern; root cause likely identified)
- OUTCOME C: investigation reveals likely root cause that's quick-fixable — **YES**

**Classification: OUTCOME C with elevated severity due to volume.** Root cause likely identified (Neon idle-timeout vs pg-pool warm-connection retention). Quick-fix path exists (multiple options above). High projected volume (~240/24h) makes this **urgent within operational pass scope (g)** but does not warrant pausing audit today.

#### Decision taken

**Proceed to Dimension 1 with three findings folded forward:**

1. APATRIS_ENCRYPTION_KEY DISCOVERY-FIRST flag resolved positively (Verification 1 OUTCOME A)
2. DB pool errors are bounded operational issue with likely root cause identified (Verification 2 OUTCOME C)
3. Operational pass scope (g) — DB connection pool root-cause investigation — now has concrete starting point (likely Neon idle-timeout vs pg-pool config; quick-fix options enumerated)

These findings expand Dimension 7's verdict context but do NOT change the verdict (still 🟡 VERIFIED with directional alignment — phase-appropriate, FIVE real-gap findings). The Voyage key gap, escalation engine SQL bug, and daily regulatory scan DB timeout findings stand. The encryption-key concern resolves. The DB pool error gets its likely root cause documented, easing operational-pass remediation.

---

## Audit metadata (Pre-D1 verifications appended)

- File state: `BUILD_INTEGRITY_AUDIT_DIMENSION_7.md` extended with Pre-Dimension-1 Bounded Verifications section
- NOT committed in Session 3 — working draft until full audit synthesis
- Hard boundaries respected throughout Pre-D1 verifications: read-only repo, no commits, no DML/DDL, no Fly state changes (only `flyctl ssh -C "sh -lc 'env | grep APATRIS'"` read-only env inspection + read-only `flyctl logs`)
- Key material redaction discipline applied: actual key values + admin passwords visible during env inspection are NOT captured in audit doc
