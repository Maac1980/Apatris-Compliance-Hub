# BUILD INTEGRITY AUDIT — Dimension 5: Build Philosophy Honored

**Audit date:** Originally 2026-05-06 (Day 19) in conversation; persisted to disk 2026-05-07 (Day 20) per Session 5 Phase B-1 reconstitution with current-state evidence (HEAD = `c0f12fa`).
**Session:** 4 of 5 (Dimensions 5 + 6)
**Status:** 🟡 **MOSTLY ALIGNED — three of five sub-checks aligned cleanly, one carries pre-existing data-protection observation, one carries SaaS-scaffolding-ahead-of-internal-use drift**
**Author:** APATRIS Claude (Day 19 conversation findings, Day 20 reconstituted with current-state evidence)

This document is the read-only record of Dimension 5 findings. NOT committed at reconstitution time — working draft until full audit synthesis (Session 5 close).

---

## Question

Does the code reflect the build philosophy: *Build less, Stabilize more, Protect data, Use it internally first, Then expand*?

## Approach

Five sub-checks, one per philosophy clause. Evidence is direct command output; verdict is per-clause + overall.

---

## Sub-check 5.1 — Build less

**Verdict: ✅ ALIGNED.** Stabilization + documentation work outweighs feature work in the most recent 30-day window.

### Evidence (re-derived 2026-05-07)

- **Total commits since 2026-04-06:** 263 (was 258 on Day 19; +5 in 24h: 1 feat, 2 docs, 2 fix — preserves the pattern)
- **Prefix breakdown (top categories):**

| Prefix | Count | Share |
|---|---|---|
| `feat` | 73 | 28% |
| `docs` | 51 | 19% |
| `fix` (lower + upper) | 78 (49 + 29) | 30% |
| `test` + `perf` + `refactor` + `chore` + `harden` | 14 | 5% |

- **Stabilization (`fix` + `test` + `perf` + `refactor` + `chore`) = 92 commits (35%)** > **features (`feat`) = 73 commits (28%)**
- **Documentation = 51 commits (19%)** — substantial doc investment alongside code
- Per-commit volume: median small (~50 lines), large commits are docs (RECOVERY_PROCEDURES 861, STRATEGIC_RECOMMENDATIONS 218, language remediation files)

### Interpretation

Pure feature work is the smallest of the three load-bearing categories. The "build less, stabilize more" intent shows in the actual commit ratios. No discipline gap.

---

## Sub-check 5.2 — Stabilize more

**Verdict: ✅ ALIGNED.** Quantifiable stabilization infrastructure present.

### Evidence

- **Test files:** 24 (matches CLAUDE.md claim of "488 tests passing / 24 test files")
- **`logger.error` / `logger.fatal` call sites:** 14 (post-Day-19 main-thread-Sentry-hook architecture forwards all to Sentry per `lib/logger.ts` `hooks.logMethod`)
- **`artifacts/api-server/docs/` count:** 22 markdown documents — substantial Track-0 + audit + remediation documentation
- **`init-db.ts`:** 3,715 lines — schema baseline mechanism using idempotent `CREATE TABLE IF NOT EXISTS` pattern (verified Dimension 2)

### Interpretation

Stabilization infrastructure is real, not aspirational. Test count, error-handling depth, documentation infrastructure, and idempotent schema baseline all reflect intent.

---

## Sub-check 5.3 — Protect data

**Verdict: 🟡 MOSTLY ALIGNED — one pre-existing observation surfaces.**

### Evidence

- **Idempotent DDL pattern occurrences:** 702 (`ON CONFLICT` / `IF NOT EXISTS` / `CASCADE`) — strong idempotency culture
- **Catastrophic operations in code:** 0 `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` matches ✅
- **`DELETE FROM` total:** 66 — categorized:
  - Tenant-scoped CRUD (~40): `workers`, `admins`, `signatures`, etc. — legit row-level deletion
  - GDPR right-to-erasure (`gdpr.ts`): legitimate, required by law
  - Cleanup/expiry (auth OTP, refresh tokens, scheduler): legit
  - Cache regeneration (`fines.ts`, `churn.ts`, `fraud.ts`, `competitors.ts`): legit
  - Test/seed (`seed-comprehensive.ts:55: DELETE FROM workers WHERE tenant_id=$1`): scoped to `NODE_ENV !== "production"` per `index.ts`
- **Encryption / decryption / redaction occurrences:** 249 — substantial coverage
- **Pool config:** `max: 20`, `min: 0` (Neon serverless post commit `6ef9087`), `idleTimeoutMillis: 30_000` ✅

### Pre-existing observation — multi-tenant DELETE without `tenant_id` scope

Four routes execute `DELETE FROM ... WHERE id = $1` without binding `tenant_id`:

| File | Line | Statement |
|---|---|---|
| `routes/clients.ts` | 75 | `DELETE FROM clients WHERE id = $1 RETURNING id` |
| `routes/jobs.ts` | 97 | `DELETE FROM job_postings WHERE id = $1 RETURNING id` |
| `routes/shifts.ts` | 94 | `DELETE FROM shifts WHERE id = $1 RETURNING id` |
| `routes/worker-files.ts` | 147 | `DELETE FROM worker_files WHERE id = $1` |

**Risk class:** multi-tenant data-bleed if multiple tenants ever share a deployment. Currently single-tenant operationally (per Apatris internal-use posture); risk is latent.

**Pattern provenance:** these are pre-existing patterns from prior commits (not from current audit period). Same lines as Day 19 verification; no regression, no fix.

**Cross-pass implication:** when SaaS expansion proceeds (Phase 3 per CLAUDE.md), all such DELETEs require `WHERE id = $1 AND tenant_id = $2` discipline before multi-tenant onboarding.

---

## Sub-check 5.4 — Use internally first

**Verdict: 🟢 ALIGNED — deliberate Pattern 1A first-step dormant capability for Phase 2 SaaS scaling.**

### Pattern observed

- **Multi-tenant references** in `src/`: 2,978 occurrences
- **Explicit `tenant_id` references:** 1,287 — schema-level multi-tenant baked in throughout
- **`billing` / `subscription` / `stripe` references:** 141 occurrences across 3 files (`init-db.ts`, `routes/billing.ts`, **`routes/saas-billing.ts`**)
- **Marketing / landing / pricing references:** 8 — mostly false positives (GDPR marketing-consent flags, competitor pricing context)
- **Stripe library installed** (`package.json` `"stripe": "^20.4.1"`)
- **Code marker:** `lib/db.ts:19` comment `max: 20, // Scale for multi-tenant SaaS` makes the SaaS framing explicit
- **Operational gap (corroborating evidence, not a separate finding):** Phase A secret inventory (Day 20) found `STRIPE_*` and `TWILIO_*` secrets absent from Fly secret stores — features scaffolded in code, not yet provisioned operationally

### Day 19 framing (now superseded)

Day 19 conversation framed this as `🟡 DRIFT — SaaS-first scaffolding precedes internal-use need.` That framing observed the pattern but missed the intent.

### Day 20 reframing (Manish clarification)

Multi-tenant scaffolding was a deliberate decision earlier in the build. Reasoning: internal use is primary (the three entities — Apatris + EEJ + STPG — and their workers), but if a future opportunity to scale to other companies arrives, multi-tenant capability is already in place. Decision: keep it because the purpose was for the future. **This is deliberate dormant capability, not speculative accumulation.**

### Connection to build philosophy

The philosophy clause in full reads "Use it internally first. **Then expand.**" The "then expand" half explicitly contemplates expansion. Multi-tenant scaffolding makes the "then expand" path cheaper when opportunity arrives. Removing it now would be drift in the opposite direction — pulling back from a deliberate optionality decision.

### Connection to Core Plan Operating Principle 1 (Day 20)

Operating Principle 1: **"Dormant capability is deliberate, not drift."** First check on any "scaffolding ahead of use" finding is "is this deliberate dormant capability?" Multi-tenant scaffolding: YES, by direct Manish confirmation Day 20. Verdict resolves to 🟢 ALIGNED.

### Classification — Pattern 1A first-step (not overbuilt)

**Pattern 1A** = built in this build, dormant in this build, ready to activate when the use-case arrives. (Distinct from Pattern 1B = built in another build, awaiting cross-build replication.) Multi-tenant scaffolding is unambiguously Pattern 1A in `apatris-api`.

**First-step shape** (verified Day 20 by direct grep): tenant_id columns + tenant-scoped query patterns are scaffolded throughout. **NOT entire multi-tenant SaaS pre-built.** Specifically absent in code (zero matches for `signup|register-tenant|tenant-admin|customer.onboard|onboard-tenant`):

- No tenant signup flow
- No tenant admin pages
- No customer-onboarding pipeline
- No billing portal beyond the `routes/saas-billing.ts` route stub

The shape is **the spare tyre, not 4 spare tyres**: enough scaffolding to activate without a substrate rewrite, not so much scaffolding that it's a maintenance burden today. The code marker `lib/db.ts:19 max: 20, // Scale for multi-tenant SaaS` is sized for the dormant-capability posture, not a present-tense SaaS load.

### Verdict change

🟡 DRIFT (Day 19) → 🟢 ALIGNED (Day 20).

### Audit lesson held

Pattern alone is not sufficient for verdict. **Pattern + intent = verdict.** Future audits should check (a) intent, (b) Pattern 1A vs 1B classification (built-here-dormant vs built-elsewhere-awaiting-replication), and (c) first-step-vs-overbuilt shape (spare tyre vs 4 spare tyres) before flagging similar findings. The grep-count surface is a starting point for inquiry, not a closing one.

---

## Sub-check 5.5 — Then expand

**Verdict: ✅ ALIGNED.** No premature scale-prep abstractions in code.

### Evidence

- **Feature-flag references:** 0 (`feature_flag` / `featureFlag` / `launchDarkly` / `featureToggle` all absent in `src/`)
- **Dependency count:** 29 prod + 11 dev = 40 total — moderate, focused
- **Each dep has direct functional use:**
  - AI: `@anthropic-ai/sdk`
  - Observability: `@sentry/node`, `pino`, `pino-pretty`
  - HTTP: `express`, `cookie-parser`, `cors`, `helmet`, `express-rate-limit`
  - Auth: `jsonwebtoken`, `speakeasy`
  - DB: `pg`, `drizzle-orm`
  - Storage: `@aws-sdk/client-s3` (devDep; runtime via R2 endpoint)
  - Comms: `nodemailer`, `resend`, `twilio`
  - Payments: `stripe`
  - Files: `multer`, `pdfkit`, `qrcode`
  - Realtime: `ws`
  - Schedule: `node-cron`
  - Validation: `zod`
- **No over-engineering:** no Redis client, no message queue (RabbitMQ/Kafka), no microservice framework, no GraphQL stack, no LaunchDarkly/Unleash, no service-mesh sidecar.

### Interpretation

Dependency list is functional-not-aspirational. No abstraction is built before its use is needed. The `then expand` clause is honored at the dependency-discipline level.

(Note: the Stripe + Twilio libraries are installed but not provisioned with secrets — they are mid-state between "abstraction not built" and "feature in operational use." Categorically still aligned with `then expand` — the libraries exist because routes consume them; the expansion to operational use awaits the deliberate Movement-4+ provisioning.)

---

## Overall Dimension 5 verdict

🟢 **ALIGNED — four of five sub-checks aligned cleanly (5.1 build less, 5.2 stabilize more, 5.4 use internally first / Pattern 1A first-step dormant capability, 5.5 then expand); one carries pre-existing latent data-protection observation (5.3 missing-tenant-scope DELETEs in 4 routes).**

The 5.3 observation is pre-existing and latent (single-tenant operationally); not a regression from this audit period. Sub-check 5.4 reclassified from 🟡 DRIFT (Day 19) to 🟢 ALIGNED (Day 20) per Manish clarification: multi-tenant scaffolding is deliberate **Pattern 1A first-step** dormant capability for Phase 2 SaaS scaling — tenant_id columns + query patterns scaffolded, NOT entire SaaS pre-built (no signup / tenant-admin / onboarding flows). Operating Principle 1 (dormant capability is deliberate, not drift) governs.

---

## Cross-pass items surfaced

1. **5.3 / multi-tenant DELETE discipline** — 4 routes need `AND tenant_id = $X` before SaaS expansion activates. Held as Tier-2 stabilization candidate; specifically: tighten before Movement 3+ multi-tenant onboarding, since this is the operational gap that pairs with 5.4's deliberate-dormant-capability posture.
2. **5.4 / Stripe + Twilio operational activation queue** — libraries installed, route scaffolding present, secrets absent on Fly. Same deliberate-dormant-capability pattern as multi-tenant: kept available; activation deliberately deferred to Movement 4+. Held in Core Plan per Item 2.5.x Appendix B "Gaps surfaced" section. Not drift — queued capability.

---

## Differences vs Day 19 conversation findings

- **Sub-check 5.4 verdict reclassified:** 🟡 DRIFT → 🟢 ALIGNED. Day 19 framing observed the pattern (heavy multi-tenant scaffolding) but missed the intent (deliberate dormant capability for Phase 2). Manish clarification Day 20 supplied the intent; Operating Principle 1 codifies the rule for future audits. Day-20 enrichment adds **Pattern 1A vs 1B classification** + **first-step-vs-overbuilt distinction** ("spare tyre, not 4 spare tyres"). Audit lesson: pattern alone is not sufficient for verdict; pattern + intent + classification = verdict.
- **Overall Dimension 5 verdict reclassified:** 🟡 MOSTLY ALIGNED → 🟢 ALIGNED, consequent to 5.4 reclassification. Only 5.3 carries a residual observation, and that observation is latent (single-tenant operationally) and surfaced for Movement-3+ activation timing rather than as current drift.
- **Cross-pass item removed (Day-20 reframing resolved it):** the Day-19 entry "philosophy clause reframing — 'use internally first' reads against current code shape" is now resolved. The full philosophy clause "Use internally first. **Then expand.**" already contemplates expansion; deliberate dormant capability serves the "then expand" half. No clause reframing needed.
- **Cross-pass item recharacterized:** the Day-19 entry "Stripe + Twilio operational gap" was framed as a drift signal corroborating 5.4. Day 20 reframes it as an operational-activation queue item — same dormant-capability pattern as multi-tenant scaffolding.
- **Commit counts +5** (263 vs 258): Day 17-19 commits added since Day 19 audit; prefix ratio essentially unchanged.
- **All other counts identical** to Day 19 (24 tests, 14 logger calls, 22 docs, 3,715 init-db lines, 702 idempotent-DDL, 66 destructive-ops, 249 encryption refs, 2,978 tenant refs, 1,287 tenant_id refs, 141 billing/stripe, 8 marketing, 0 feature flags, 29+11 deps).
- **No regressions; no improvements** to data-protection observations between Day 19 and Day 20 — the 4 missing-tenant-scope DELETEs are still there at the same lines.

---

## Audit metadata

- File: `BUILD_INTEGRITY_AUDIT_DIMENSION_5.md`
- Originally Day 19 (conversation only); reconstituted Day 20 to disk per Session 5 Phase B-1.
- Session 4 (Dimensions 5 + 6) — companion file: `BUILD_INTEGRITY_AUDIT_DIMENSION_6.md`
- NOT committed at reconstitution — working draft until full audit synthesis (Session 5 close)
- Hard boundaries respected throughout: read-only repo for evidence gathering, read-only file writes for reconstitution, no commits, no deploys, no DB connections, no migration runner invocation
- Anti-hallucination: every count verified by direct command output today (2026-05-07); not transcribed from Day 19 conversation memory
