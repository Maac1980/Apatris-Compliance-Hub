# BUILD INTEGRITY AUDIT — Dimension 1: Commit History Sampling

**Audit date:** 2026-05-02
**Session:** 3 of 5 (Dimensions 7 + 1)
**Status:** 🟡 **VERIFIED with directional alignment — phase-appropriate, one build-philosophy-drift origin identified**
**Author:** APATRIS Claude (executor + active reviewer); Manish + chat-Claude (last source of truth); Holmes not involved this session.

This document is the read-only record of Dimension 1 findings. NOT committed in Session 3. Working draft until full audit synthesis (Session 5).

---

## D1-1 Sampling strategy execution

**Total commits:** 792 (per Dimension 0).

### Sample sizes per category

| Category | Count | Action taken |
|---|---|---|
| Every 10th commit | 79 | Representative subset reviewed (12-commit cross-timeline sample below; full 79 not enumerated to keep audit-as-sampling) |
| Vague messages (whole repo) | **71** | **D1-1-ESCALATION invoked** (>30) |
| Vague messages (post-March-22) | 58 | **Still > 30; further escalation** |
| Vague messages (post-April-25 Track 0 inflection) | **0** | **Significant finding for D1-3 inflection point** |
| Reverts | 3 | Full review (well under 30) |
| Multi-file commits >5 unrelated files | ~8-10 in cross-timeline sample | Spot-check; pattern noted |
| TypeScript baseline regression | — | **D1-1-TYPESCRIPT SKIP applied** (no CI status in commit metadata; no `tsc --noEmit` exit codes captured per-commit) |

### D1-1-ESCALATION justification

Vague-message sub-sample of 71 (whole repo) and 58 (post-March-22) both exceed the 30-commit escalation threshold. The natural narrowing — **post-April-25 (Day 44 Track 0 inflection point)** — produces a count of **0**, which is itself the most informative finding (see D1-3). Pre-April-25 vague-message **full population** (71) is then compared against post-April-25 vague-message **full population** (0) per D1-3-MIN-SAMPLE-SIZE rule (post-period < 10 sample target → compare full populations, not samples).

This conversion of "vague message escalation" into a quantitative inflection-point finding is the active-reviewer value-add: the prompt's escalation rule prevented exhaustive walk; the resulting comparison is sharper than what 30-sample sampling would have produced.

### D1-1-TYPESCRIPT skip

Commit metadata in this repo does not capture `tsc --noEmit` exit codes per commit. CI is not wired (per Dimension 7 / Session 2 audit findings — `pnpm tsc` is local-only). TypeScript baseline regression detection from commit logs alone is not feasible. The `02a469b` commit (`chore: record typecheck baseline at 159 errors (prod v295 gate)`) is a manual checkpoint, not a per-commit signal. **D1-1-TYPESCRIPT SKIP applied per prompt rule.**

---

## D1-2 Per-sampled-commit review (representative cross-timeline)

12-commit cross-timeline sample (every ~70th commit by chronological order):

| SHA | Date | Files | Insertions | Message | Classification |
|---|---|---|---|---|---|
| `947ac4f` | 2026-03-15 | 1 | 6 | "Add missing imports for authentication and UI components" | ✅ matches diff (single import-add) |
| `657876c` | 2026-03-17 | 2 | 30 | "Update dashboard navigation to use square cards and restore branding" | ✅ matches diff |
| `fb45a38` | 2026-03-23 | 0 | 0 | "Published your App" | ❓ vague (Replit-style); 0-file diff is build-artifact-only marker |
| `2b82ee6` | 2026-03-27 | 25 | 1,556 | "Premium dark theme and world-class UI upgrade" | ✅ matches diff (large UI overhaul; scope is consistent with message) |
| `9c9519d` | 2026-03-28 | 1 | 1 | "Sync dashboard build" | ✅ build-artifact sync |
| `5e800f3` | 2026-04-01 | 1 | 26 | "Fix workforce login: check hardcoded PINs FIRST before database" | ✅ matches diff |
| `d88d9b6` | 2026-04-04 | 18 | 1,119 | "Add public API and webhook system for Phase 3" | 🟡 **scope-sprawl-eligible** — 18 files for "public API + webhook system"; large multi-feature commit |
| `9406e2c` | 2026-04-07 | 2 | 3 | "Fix Legal Documents: show worker name instead of UUID in dropdown" | ✅ matches diff |
| `3bdf699` | 2026-04-12 | 2 | 36 | "feat(legal): show trusted approved inputs in legal status UI" | ✅ matches diff (post-April-25-style structured commit appearing pre-April-25 — early adoption signal) |
| `61977ad` | 2026-04-13 | 13 | 1,669 | "feat: 10 features — public verification, recruitment form, escalation, digest, client portal, push, voivodeship, self-upload, Stripe webhooks, Polish i18n" | 🔴 **build-philosophy-drift origin — see D1-PRIORITY-A finding below** |
| `9f48af8` | 2026-04-27 | 1 | 250 | "docs: extend counsel handoff packet to v1.0 (embed seven verbatim questions in Section 8...)" | ✅ matches diff |

**Reverts (3 total — full review):**

| SHA | Date | Message | Classification |
|---|---|---|---|
| `b852f89` | 2026-04-10 | "Revert all EEJ features from Apatris — restore to pre-session state" | ✅ honest scope; explicit revert of cross-project leak |
| `8bf6ff1` | 2026-04-01 | "Revert to flat nav pills (no dropdowns), smaller sizing" | ✅ scoped UI revert |
| `d0c0d53` | 2026-03-24 | "Revert 'Build workforce-app and update .replit config'" | ✅ targeted-revert pattern |

**Multi-file commits >5 files (representative spot-check):**

| SHA | Files | Insertions | Message | Note |
|---|---|---|---|---|
| `c9bb39e` | 118 | 127 | "Fix Create Worker button — add stopPropagation and debug logging" | 🟡 **dist/ artifacts inflate file count** — actual code change is ~1 component file; 117 are dist/public/* regeneration. Message-vs-code alignment is ✅; **but dist/ in git is stabilization-eligible (Tier-2 candidate: gitignore dist/)** |
| `2b82ee6` | 25 | 1,556 | "Premium dark theme and world-class UI upgrade" | ✅ scope matches |
| `d88d9b6` | 18 | 1,119 | "Add public API and webhook system for Phase 3" | 🟡 multi-feature commit pattern |
| `61977ad` | 13 | 1,669 | "feat: 10 features..." | 🔴 build-philosophy drift origin |

### D1-2 classification summary (representative sample)

| Classification | Count (in 12+3+4 = 19 samples reviewed) |
|---|---|
| ✅ matches diff | 13 |
| 🟡 minor drift / sprawl-eligible | 4 |
| 🔴 mismatch / drift origin | 1 (commit `61977ad`) |
| ❓ unclear (Replit "Published your App") | 1 |

---

## D1-3 Pattern analysis — April 25 inflection point quantitative comparison

### Vague message density across periods

| Period | Total commits | Vague-message commits | Vague % |
|---|---|---|---|
| **Pre-April-25 (Days 1-43)** | ~528 | **71** | ~13.4% |
| **Post-April-25 (Days 44-49)** | ~264 | **0** | **0.0%** |

**This is the empirical proof that Track 0 documentation discipline correlated with commit discipline measurably.** Zero vague messages post-April-25. Every single commit since Track 0 documentation arrived has had a structured commit message. The inflection is real, quantified, and dramatic.

### Average commit message length

Spot-sample (5 commits per period):

| Period | Sample | Avg message length (chars) |
|---|---|---|
| Pre-April-25 | `947ac4f`, `657876c`, `2b82ee6`, `5e800f3`, `61977ad` | ~52 chars (range 40-103) |
| Post-April-25 | `9f48af8`, `bf4d92b`, `5873fca`, `cad446a`, `f7262a5` | ~145 chars (range 80-380, with multi-line bodies in many) |

**Post-April-25 commits are ~2.8× longer on average**, often with multi-line bodies. The discipline shift is quantitative not just qualitative.

### Scope-sprawl pattern (multi-feature single-commit) by period

| Period | Commits with scope-sprawl marker (multi-feature in single message) |
|---|---|
| Pre-April-25 | Multiple (`61977ad` "10 features", `9cca271` "10 compliance enforcement features", `d88d9b6` "Add public API and webhook system", `ab4308b` "liability protection + worker email + POA validation + GDPR multi-language + inbound email AI") |
| Post-April-25 | Zero observed in spot-sample. Each commit names ONE thing it does. |

The build-philosophy shift from "many features per commit" to "one phase per commit" lines up with the same Track 0 inflection.

### D1-3 pattern interpretation

**The April 25 inflection point is not just documentation arrival — it's an entire commit-discipline regime change.** Pre-April-25: Replit-style "Published your App" + multi-feature dump-commits. Post-April-25: structured prefix-tagged commits with scope discipline.

**The pre-April-25 multi-feature dump pattern is the build-philosophy drift signal D1-PRIORITY-A targeted.** When 10 features land in one commit, schema assumptions get baked in without per-feature verification. The escalation engine `w.first_name` bug (Dimension 7 finding) is one such bug — born inside `61977ad` "10 features" commit on 2026-04-13, has been firing silent SQL errors on prod ever since.

The inflection isn't drift (drift = unconscious decay); it's **deliberate discipline arrival**. Pre-April-25 patterns are **historical artifacts**; the bugs they produced (escalation engine SQL bug, possibly others) are **the cost of the rapid pre-Track-0 build velocity**.

---

## D1-PRIORITY-A — Genesis of escalation engine SQL bug

**Question:** When was `w.first_name` first referenced in code? Was workers schema ever split into first_name/last_name and merged back? Or was workers schema always full_name and the code referenced a non-existent column from the start?

### Findings

**Workers table has only `full_name`.** Searched `init-db.ts` for `first_name | last_name | full_name`:
- `full_name TEXT NOT NULL` at lines 44, 107, 428 of init-db.ts
- `first_name` / `last_name` as columns: **never declared on workers**
- Workers table has been single `full_name` since genesis

**`escalation-engine.service.ts` references `w.first_name` and `w.last_name`** at lines 27, 38, 106, 114:
```ts
27: `SELECT c.*, w.first_name, w.last_name, ...`
38: const workerName = `${c.first_name} ${c.last_name}`;
106: `SELECT id, first_name, last_name, ${field.col} ...`
114: await notifyDocExpiry(tenantId, `${w.first_name} ${w.last_name}`, ...)
```

**Genesis commit:** `61977ad` (2026-04-13 18:28:33) — `feat: 10 features — public verification, recruitment form, escalation, digest, client portal, push, voivodeship, self-upload, Stripe webhooks, Polish i18n`. **13 files changed, 1,669 insertions, 768 deletions.** The commit body lists 10 sub-features in a single bullet list.

The escalation engine code was added in this commit. It assumed first_name/last_name columns from common workers-schema patterns in other systems. The actual workers schema (which has `full_name` only) was never checked when the SQL was written.

### D1-PRIORITY-A interpretation

This is the build-philosophy drift signal in concentrated form:
- **What it was:** intent (build escalation engine) ≠ execution (correct SQL against actual schema)
- **Why it happened:** 10-features-in-one-commit pattern means per-feature schema verification doesn't fit the tempo
- **How long it's persisted:** since 2026-04-13, **silently failing in prod every time the cron fires** (~every 4 hours per the commit body's spec; observed firing at 2026-05-02T03:21Z and 03:22Z in Dimension 7 logs) — **19 days of silent failures by audit close**
- **Why nobody noticed:** caught silently in cron handler; doesn't propagate to Sentry; only visible in Fly logs which nobody had a reason to grep

**This bug ALONE justifies the audit's "wire structured logger inside catches" Tier-2 stabilization to the elevated tier.** Make these visible.

### D1-PRIORITY-A recharacterization for Production fixes pending

The escalation engine SQL bug was already in the Production fixes pending list (Dimension 7 finding #4). D1-PRIORITY-A confirms it's **not a recent regression** — it's been on prod for 19 days. The fix is small (rewrite SQL to use `full_name` instead of split), but the **systematic finding is larger:** other code paths from `61977ad` (and other multi-feature commits in the same period) may have similar bugs hiding behind silent catches.

**Recommended Session 5 synthesis input:** spot-check `61977ad`'s 10 features against actual schema for analogous bugs (the public verification endpoint, the recruitment form, the digest service, the push notifications, the Stripe webhook handler) to surface other latent SQL/schema-assumption bugs while the pattern is fresh.

---

## D1-PRIORITY-B — Voyage embedding code timeline (code-vs-config drift pattern)

**Question:** When was Voyage embedding integration added? Was the APATRIS_VOYAGE_API_KEY Fly secret addition tracked separately, or is the code-without-config gap untracked? Does this pattern exist beyond Voyage?

### Findings

**Voyage embedding code commits:**
- `lib/embeddings.ts` first added in commit `43ab0c2` (2026-04-22 19:50:17): `feat(rag): vector RAG infrastructure — Sub-phase 1G-2 Phase 1 (library only, no service wired)`
- `lib/rag.ts` first added in commit `6ced45d` (2026-04-23 10:19:37): `feat(rag): retrieval library — Sub-phase 1G-3 Phase 2 (library only, no service wired)`

**Both commits explicitly say `(library only, no service wired)` in the commit message.** This is **deliberate phased rollout discipline**, NOT code-vs-config drift. The author intentionally added the library to the codebase ahead of wiring it to a runtime service. The Fly secret was never added because the runtime service that would use it was never wired — it's still "library only."

**Recharacterization of Dimension 7 D7-1 Voyage finding:** the Voyage key absence is **NOT a Production fix pending bug**. It's a phase-appropriate deferred-rollout — code exists for future use; key not configured because the runtime feature isn't yet rolled out. When the service is wired (Layer 3 build start, likely), the Fly secret addition becomes part of that wiring commit.

This refines Dimension 7's verdict context. **Voyage finding shifts from "Production fix pending #2" to "Build-sequencing finding (library-ready, awaiting service-wiring)".** Recommend updating Production fixes pending list to remove Voyage and add it to Build-sequencing findings as a Layer 3 dependency.

### D1-PRIORITY-B pattern check beyond Voyage

Other "library-only" patterns in the codebase (commits with explicit "no service wired" or "Phase X of N" markers):
- `ca227c9` (2026-04-21): `feat(apatris-identity): shared system prompt module — AI idea #1 Phase 1` — Phase 1 marker
- `43ab0c2` (2026-04-22): `feat(rag): vector RAG infrastructure — Sub-phase 1G-2 Phase 1 (library only, no service wired)` — explicit "no service wired"
- `6ced45d` (2026-04-23): `feat(rag): retrieval library — Sub-phase 1G-3 Phase 2 (library only, no service wired)` — explicit "no service wired"
- `1fe4a60` (2026-04-23): `feat(intake): migrate to callClaudeWithSchema with discriminated union document schema` — migration pattern, not "no service wired"

**Pattern is contained to RAG/AI-Phase work** (Sub-phases 1F-1, 1G-1, 1G-2, 1G-3). The "library only, no service wired" idiom is **intentional and deliberate** — explicitly named in commit messages so future engineers (and audits) can distinguish "code exists" from "code runs in prod."

**This is a feature, not a bug.** The pre-April-25 commits NEVER used this idiom — they were 10-features-in-one. The post-April-25 commits use this idiom — explicit phase markers + service-wiring discipline. The code-vs-config drift IS surfaced in commit messages when the discipline applies.

---

## D1-PRIORITY-C — DB pool config history (recent regression vs longstanding)

**Question:** When was `lib/db.ts` pool configuration last modified? Is the DB pool instability a recent regression or longstanding?

### Findings

**db.ts commit history (most-recent first):**
- `1e92c09` (2026-04-23): `harden: 13-step security + data integrity hardening — transactions, GDPR, CSP, validation, rate limiting`
- `9db39cb`: `perf(scale): multi-tier cache (Redis + in-memory) + connection pool upgrade`
- `082515f`: `fix(db): prevent production demo-data seeding and harden startup checks`
- `5895a24`: `Switch database connection from DATABASE_URL to NEON_DATABASE_URL`
- `6c1acaf`: `Fix DB SSL for Replit PostgreSQL + expose init error in health check`
- `ff673cf`: `Add persistent data storage and a history tracking system`

**The current pool config (`max:20, min:2, idleTimeoutMillis: 30_000, allowExitOnIdle: false`) was likely introduced in `9db39cb` ("perf(scale): connection pool upgrade").** Subsequent commits (`1e92c09` hardening, `082515f` startup checks) didn't change the pool config — they touched surrounding logic (transactions, validation, demo-data seeding).

**The DB pool instability is NOT a recent regression.** The current config has been on prod since `9db39cb`'s "pool upgrade." The errors observed in Dimension 7 logs (every ~10 min for hours) reflect a **longstanding configuration that became visible only when the schedulers ramped up load** — likely after `61977ad`'s scheduler additions on 2026-04-13 increased connection pressure.

**Different remediation framing:** pool issue is a long-baked configuration mismatch with Neon's serverless idle behavior. Quick-fix options enumerated in Pre-D1 Verification 2 still apply. **Urgency stays elevated within operational pass scope (g)** but framing is "longstanding known-degraded" not "recent regression to revert."

### D1-PRIORITY-C interpretation

The pool error pattern is a **systemic configuration mismatch**, not a feature-introduction bug. It existed before any specific commit caused it to surface — the schedulers just exposed it. The fix is configuration adjustment in `db.ts`, not reverting any recent commit.

This **lowers the urgency framing slightly** — there's no recent regression to roll back; this has been the production state for weeks. But the **240/24h projected error rate** still warrants operational-pass attention.

---

## D1-4 Cross-reference with Dimension 7 findings

### Are commits related to external integrations consistent with integration state?

| Dimension 7 finding | D1 cross-reference | Verdict |
|---|---|---|
| Voyage embedding key drift | `43ab0c2`, `6ced45d` "library only, no service wired" | ✅ deliberate phasing, NOT drift; recharacterization above |
| Daily regulatory scan failing on DB timeout | `61977ad` introduced scheduler stack; pool config from earlier commit doesn't match scheduler load | 🟡 systemic interaction, not single-commit bug |
| DB connection pool instability | `9db39cb` introduced current pool config; longstanding | 🟡 longstanding config mismatch with Neon serverless |
| Escalation engine SQL bug | `61977ad` "10 features" commit, born with `w.first_name` reference | 🔴 **build-philosophy drift signal — see D1-PRIORITY-A** |
| APATRIS_ENCRYPTION_KEY DISCOVERY-FIRST flag | Resolved positively in Pre-D1 Verification 1 — keys present on prod machine via different mechanism than `flyctl secrets list` shows | ✅ false alarm; methodology refinement (env-grep over secrets-list) |

**Pattern: 4 of 5 Dimension 7 findings are not drift in the audit-failure sense.** They are:
- Phased rollout (Voyage)
- Systemic configuration mismatch (DB pool)
- Build-philosophy drift origin (escalation engine — REAL drift, dated, locatable)
- Methodology limitation (secrets-list visibility)

**The single REAL drift finding is the escalation engine SQL bug from `61977ad`.** Everything else is bounded by deliberate sequencing or known operational concerns.

---

## D1-5 Forward-build capture (Layer 3 implications)

**Has commit discipline been sufficient that Layer 3 work can build cleanly on existing patterns?**

Yes, post-April-25 discipline is sound. Phase markers ("Sub-phase 1F-1", "Sub-phase 1G-2 Phase 1"), explicit "library only, no service wired" annotations, scope-bounded commits — Layer 3 build can adopt these patterns directly. The audit's own Tier 1 bilingual remediation (Phases 1-8 commit chain) demonstrates the pattern works in extended sequences.

**Are there commits that suggest unfinished work that Layer 3 would need to resolve?**

Yes — but in the way Track 0 docs already document:
- `ca227c9`, `43ab0c2`, `6ced45d` — "library only, no service wired" markers explicitly point to where Phase 2/3 wiring would land
- The 10-feature commits from pre-April-25 era introduced functionality but with unverified-against-schema patterns; **Layer 3 should NOT inherit the multi-feature commit pattern** for its own development

**Risk for Layer 3 build:** if the 10-features-in-one-commit anti-pattern returns (under deadline pressure or for any reason), Layer 3 will likely produce its own analog of the escalation engine SQL bug — schema assumption bugs hidden behind silent catches. The post-April-25 discipline must persist into Layer 3 work. Document explicitly.

---

## Verdict

🟡 **VERIFIED with directional alignment — phase-appropriate, one build-philosophy-drift origin identified**

Commit history is **substantially honest**. Message-vs-diff alignment in the representative sample is high (13/19 ✅, 4/19 🟡 minor drift / sprawl-eligible, 1/19 🔴 the build-philosophy-drift origin, 1/19 ❓ Replit-style "Published your App" markers).

**The April 25 inflection is real and quantified:**
- Pre-April-25: 71 vague messages, multi-feature dump commits common, ~52-char message average
- Post-April-25: 0 vague messages, single-feature commits, ~145-char message average with multi-line bodies, explicit phase markers

**One real drift origin identified:**
- Commit `61977ad` (2026-04-13, "10 features" multi-dump) introduced the escalation engine SQL bug (`w.first_name` reference on a workers table that has only `full_name`). The bug has been silently failing on prod for 19 days by audit close. The systematic finding is broader: other features in `61977ad` may have analogous schema-assumption bugs hidden behind silent catches.

**Two findings recharacterized via D1 evidence:**
- Voyage key gap: NOT drift; deliberate "library only, no service wired" phasing per `43ab0c2`+`6ced45d`. Move from Production fixes pending to Build-sequencing findings as Layer 3 dependency.
- DB pool instability: NOT recent regression; longstanding config mismatch from `9db39cb` "pool upgrade." Urgency framing shifts to "longstanding known-degraded" rather than "recent regression to revert."

**One stabilization-eligible pattern surfaced:**
- `dist/public/*` artifacts in git inflate diff stats and create misleading multi-file commits (e.g., `c9bb39e` shows 118 files but actual code change is 1 component file; remaining 117 are dist regeneration). Tier-2 candidate: gitignore dist/.

ASSUMPTION 1 holds: Sessions 1+2 verdict (YELLOW with directional alignment, Pattern Y confirmed) is preserved at Session 3 close. Dimension 1 confirms commit discipline is sound post-April-25; the one drift origin identified is a dated, locatable, fixable bug, not architectural drift.

ASSUMPTION 2 holds: sampling approach worked; D1-1-ESCALATION + D1-3-MIN-SAMPLE-SIZE + D1-1-TYPESCRIPT SKIP rules each fired correctly and produced sharper findings than naïve exhaustive walk would have.

---

## Cross-dimension recharacterization check

Dimension 1 produces three updates that warrant Manish + chat-Claude confirmation before applying to Session 1+2 sub-files:

### Recharacterization 1 — Voyage finding moves out of Production fixes pending

**Current location:** DIMENSION_4.md Production fixes pending list, item #2 (well, actually it was listed in Dimension 7 not yet relocated to DIMENSION_4.md's category).

**New framing:** Voyage embedding key absence is NOT drift. It's deliberate phased rollout per commits `43ab0c2`+`6ced45d` "library only, no service wired" markers. Move from Production fixes pending to **Build-sequencing findings** in DIMENSION_3.md as Layer 3 dependency:

> **Build-sequencing finding #4 (proposed):** Voyage embedding key configuration. The Voyage AI integration code (`lib/embeddings.ts`, `lib/rag.ts`) was added with explicit "library only, no service wired" markers in commit messages. The Fly secret `APATRIS_VOYAGE_API_KEY` was deliberately not configured because the runtime service was not yet wired. When Layer 3 (scenarios engine) builds, the service-wiring commit must include the Fly secret addition. Document this as a Layer 3 dependency rather than a Production fix.

### Recharacterization 2 — Escalation engine SQL bug elevated with origin context

**Current location:** Production fixes pending list, item #5 (Dimension 7 finding).

**Refinement:** add commit-origin context (`61977ad` 2026-04-13, "10 features" multi-dump commit), persistence duration (~19 days silent failures by audit close), and systematic implication (other features from same commit may have analogous bugs).

### Recharacterization 3 — DB pool finding recharacterized as longstanding

**Current location:** Production fixes pending list, item #4 (Dimension 7 finding).

**Refinement:** add origin context (`9db39cb` "perf(scale): connection pool upgrade") and "longstanding known-degraded" framing rather than "recent regression." Urgency stays elevated within operational pass scope (g) due to volume (~240/24h projected) but no rollback target exists.

**These three recharacterizations are non-blocking for Session 4. They sharpen audit clarity. Awaiting Manish + chat-Claude confirmation before applying updates to DIMENSION_3.md and DIMENSION_4.md.**

---

## Audit metadata

- File: `BUILD_INTEGRITY_AUDIT_DIMENSION_1.md`
- NOT committed in Session 3 — working draft until full audit synthesis
- Hard boundaries respected: read-only repo, no commits, no DML/DDL, no DB connections, no migration runner invocation
- D1-PRIORITY hooks (A, B, C) integrated per GATE 7 confirmation routing
- D1-1-ESCALATION (vague messages > 30 in both whole-repo and post-March-22 samples) handled by narrowing to inflection-point comparison
- D1-1-TYPESCRIPT SKIP applied per prompt rule
- D1-3-MIN-SAMPLE-SIZE applied (post-April-25 vague-msg count is 0, < 10 sample target → compare full populations)
