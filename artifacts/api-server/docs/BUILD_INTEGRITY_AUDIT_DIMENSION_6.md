# BUILD INTEGRITY AUDIT — Dimension 6: Documentation Truthfulness

**Audit date:** Originally 2026-05-06 (Day 19) in conversation; persisted to disk 2026-05-07 (Day 20) per Session 5 Phase B-1 reconstitution with current-state evidence (HEAD = `c0f12fa`).
**Session:** 4 of 5 (Dimensions 5 + 6)
**Status:** 🟡 **MOSTLY TRUTHFUL — most Day-19 staleness items closed by Item 2.4.x + 2.5.x; two residual stale items + README drift remain**
**Author:** APATRIS Claude (Day 19 conversation findings, Day 20 reconstituted post-Item-2.4.x + 2.5.x reality)

This document is the read-only record of Dimension 6 findings. NOT committed at reconstitution time — working draft until full audit synthesis (Session 5 close).

---

## Question

Does what's written in the codebase (CLAUDE.md, STRATEGIC_RECOMMENDATIONS.md, RECOVERY_PROCEDURES.md, inline code comments, README) match what actually shipped?

## Approach

Five sub-checks against current state. Re-derived 2026-05-07; differences vs Day 19 explicitly noted. Item 2.4.x (commit `3858b30`) and Item 2.5.x (commit `c0f12fa`) closed multiple Day-19 stale items between findings.

---

## Sub-check 6.1 — `CLAUDE.md` vs current state

**Verdict: ✅ MOSTLY TRUTHFUL.** Stack + numerical claims accurate; Track 0 list updated post-Item-2.4.x; one residual staleness (date stamps in body).

### Evidence (re-derived 2026-05-07)

- **Path:** Workspace-root `/CLAUDE.md` (510 lines). No `artifacts/api-server/CLAUDE.md` exists.
- **Stack claims accurate:** Express 5, PG 8.20, Drizzle catalog, Pino 10.3.1, Stripe 20.4.1, node-cron 4.2.1, "Logging: Pino, Sentry" all match `package.json`.
- **Numerical claims verified today:**
  - Routes: 131 .ts files in `src/routes/` ✓ matches CLAUDE.md "131 route files"
  - Endpoints: 695 (rough `.get/.post/.put/.patch/.delete` count) ✓ matches CLAUDE.md "~688 endpoints"
  - Tests: 488 test cases across 24 test files ✓ matches CLAUDE.md "488 tests passing (24 test files)"
- **Track 0 Documentation list (lines 207-222) — post-Item-2.4.x updated** to include `STRATEGIC_RECOMMENDATIONS.md`, `RECOVERY_PROCEDURES.md`, `C1-SMOKE-CHECKLIST.md`, `BUILD_INTEGRITY_AUDIT_*.md` ✅ Day 19 missing-docs item RESOLVED.

### Residual staleness

- **Date markers in body** (lines 224, 227-229) still show "as of 2026-04-30" — now 7 days stale (was 6 days yesterday). Items 2.4.x deliberately did not update these because the underlying counts (488 tests, 159/18/15 type-error counts) hadn't been re-verified at that time. Re-verifying counts is itself work; held for next maintenance pass.
- **No "Last updated" stamp at top of file.** Item 2.4.x prompt CHANGE 5(a) was skipped because the anchor didn't exist. Manish + chat-Claude deferred the decision (add a stamp or leave as-is).

### Cross-pass

CLAUDE.md is mostly truthful. The body date markers will become stale on a rolling basis until each one is paired with a re-verification. Suggest synthesis recommendation: when a CLAUDE.md numerical claim is tied to a date marker, the date marker is a "last verified" not a "freeze" — re-verification can land in any subsequent doc-sweep commit without requiring a fresh audit.

---

## Sub-check 6.2 — `STRATEGIC_RECOMMENDATIONS.md` vs current state

**Verdict: ✅ TRUTHFUL post-Item-2.4.x.** All Day-19 stale items resolved.

### Evidence

- **File header:** `**Status:** Tracked; committed 2026-05-04 as 2d20156. Updated 2026-05-06 (Day 19) with progress on Track 1 + Track 2.` ✓ accurate
- **Track 1.1 (staging reactivation):** `✅ DONE 2026-05-06 — staging reactivated and verified during Item 2.3 deploy` ✓
- **Track 1.2 (`61977ad` schema-assumption fix):** `✅ DONE 2026-05-04 (Day 17) — commit 77267dc` ✓
- **Track 1.3 (DB pool fix):** `✅ DONE 2026-05-04 (Day 17) — commit 6ef9087` ✓
- **Track 2.1 (XOR → AES messaging):** `✅ DONE 2026-05-05 (Day 18) — commit b02b326, prod deploy v297` ✓
- **Track 2.2 — RECHARACTERIZED + DONE:** `**2.2 Wire Sentry capture for error+ logger calls (mechanism: main-thread Sentry capture hook in lib/logger.ts via pino's hooks.logMethod) (Tier-2 #5).**` + `✅ DONE 2026-05-06 (Day 19) — commit f33d067, prod deploy v298 (image 01KQY9E50KR2TMNSM9MQ3H95WR)` ✓

### Day-19-vs-Day-20 difference

Day 19 conversation found 6 stale items in this file (front-matter status, Tracks 1.1/1.2/1.3/2.1 not marked DONE, Track 2.2 mechanism mismatch). **All 6 resolved by Item 2.4.x (commit `3858b30`).** Today's re-derivation confirms file is now truthful relative to shipped work.

### Cross-pass

None remaining. STRATEGIC_RECOMMENDATIONS.md is the cleanest of the three audited docs post-2.4.x.

---

## Sub-check 6.3 — `RECOVERY_PROCEDURES.md` vs current state

**Verdict: 🟡 MOSTLY TRUTHFUL — most Day-19 staleness resolved; two residual stale lines (count + HEAD snapshot) that pre-date both Item 2.4.x and 2.5.x.**

### Evidence (post-Item-2.4.x and Item-2.5.x)

- **Line 3 header `**Last verified:** 2026-05-06 (Day 19)`** ✓ updated by Item 2.4.x
- **Line 56 PAT inventory line — UPDATED:** `Auth via SSH (key at ~/.ssh/id_ed25519, public key registered at https://github.com/settings/keys). Switched from PAT-embedded HTTPS to SSH on Day 18 (2026-05-05) per Item 2.5.y. All 3 prior PATs revoked at github.com/settings/tokens.` ✓ Day-19 stale PAT-on-disk line RESOLVED
- **Line 197 PAT comment — UPDATED:** `Auth posture: SSH (Item 2.5.y closed Day 18)` ✓
- **Line ~572 secret-leak example — UPDATED:** Day-18-and-remediated framing ✓
- **Line ~648 "Today's example" — UPDATED:** rephrased to historical Day 18 ✓
- **Appendix root cause section (lines 829-845) — SUPERSEDED** with definitive Day 19 Phase A finding (esbuild bundles pino → `__dirname`-relative `worker_threads` spawn fails) ✓ Day-19 speculative-root-cause item RESOLVED
- **Appendix B — Secret source-of-truth table** appended at line 883 by Item 2.5.x (commit `c0f12fa`); maps all 30 unique secrets across prod + staging to external sources ✓ NEW

### Residual staleness

- **Line 57:** `Total commits on origin/main: 797`. Current commit count is **802** (verified via `git rev-list --count HEAD`). **Stale by 5 commits.**
- **Line 58:** `HEAD on origin/main (this snapshot) = 321564a (Item 2.3 commit; preserved while item paused for debug)`. Current HEAD is `c0f12fa`. The 5 commits added since `321564a`, in order: `3733aaf`, `ce18114`, `f33d067`, `3858b30`, `c0f12fa`. **Stale by 5 commits.** Header now says "Last verified Day 19" — internal inconsistency: header date doesn't match line-58 snapshot SHA. Surfaced as cross-pass in Item 2.4.x but not authorized for fix at the time.

### Cross-pass

The line-57 + line-58 staleness is now cumulative across Day 19 + Day 20: deferred from Item 2.4.x explicitly. Suggest synthesis recommendation: in any future RECOVERY_PROCEDURES.md update, refresh both lines (commit count + HEAD snapshot) atomically with the header `**Last verified**` line.

---

## Sub-check 6.4 — Inline code comment drift

**Verdict: ✅ MOSTLY TRUTHFUL.** Spot-check of 5 key files; one mild drift (db.ts Replit framing) that corroborates 5.4 SaaS-scaffolding finding.

### Evidence (5-file spot-check)

- **`lib/logger.ts` (top 5 lines):** Day-19 design comment header — accurate, current
  - `// Logger: pino with main-thread Sentry capture hook (Day 19 — Item 2.3 Option 2).`
  - `// Intentionally avoids pino transport: { targets } because esbuild bundles pino...`
- **`lib/db.ts:5`:** `// Detect if SSL should be used — Replit's built-in PostgreSQL uses sslmode=disable`
  - **Mild drift:** Replit was the prior primary deployment (per CLAUDE.md "Primary: Replit"); current operational path is **Fly + Neon** (verified by `flyctl deploy --app apatris-api` Day 19 prod-deploy success). Comment still factually true (the SSL-mode detection logic), but framing is misleading — Fly + Neon is the actual current path.
- **`lib/db.ts:19`:** `max: 20, // Scale for multi-tenant SaaS` — accurate but corroborates Dimension 5.4 SaaS-scaffolding finding (the comment justifies pool size in SaaS terms even though current operational state is single-tenant internal use)
- **`lib/db.ts:20`:** `min: 0, // Neon serverless: no warm connections...` — accurate, recent (commit `6ef9087`)
- **`services/escalation-engine.service.ts` (top 12 lines):** clean block comment, accurate
- **`services/legal-case.service.ts` (top 13 lines):** clean block comment, accurate
- **`index.ts` (top 25 lines):** Day-19 Sentry-init + post-init-validation block — accurate, current

### Cross-pass

`db.ts:5` Replit framing: held as cross-pass. Not blocking. Surfaces a CLAUDE.md tension too — CLAUDE.md says "Primary: Replit" but the operational reality has shifted to Fly. Worth synthesizing in Session 5: should CLAUDE.md `## Deployment` section update to reflect Fly + Neon as the actual operational path?

---

## Sub-check 6.5 — `README.md` + `package.json` scripts truthfulness

**Verdict: 🟡 README has DRIFT — Airtable + 11.26% ZUS still stale; missing major-feature surface; scripts in `package.json` are TRUTHFUL.**

### Evidence

- **Workspace-root `/README.md`** is the only README (no `artifacts/api-server/README.md` exists). ~40 lines.
- **STALE:** `**Auth:** JWT, Airtable integration` — Airtable not present in current code; CLAUDE.md does not mention Airtable; `AIRTABLE_API_KEY` absent from Fly secrets (verified via Item 2.5.x Phase A inventory). Deprecated long ago, README text not updated.
- **STALE:** `Manages payroll with verified ZUS calculations (11.26%)` — current ZUS implementation is full Polish breakdown (employee ZUS, health, PIT, employer ZUS), not single 11.26%. Verified in CLAUDE.md tech-stack description.
- **MISSING from README:** Sentry observability (now load-bearing per Day 19 hook), AI stack (Claude Sonnet, Perplexity), face recognition, GPS, GDPR, Posted Workers Directive — all are present in CLAUDE.md feature list.
- **package.json scripts — TRUTHFUL:** `dev`, `build`, `start`, `test`, `typecheck` — all verified runnable today (build verified during Day 19 Item 2.3 deploy).

### Cross-pass

README drift is the most concentrated remaining stale surface across the audit. Held for separate cleanup pass (not part of Item 2.4.x scope). Suggest Session 5 synthesis: README is the public-facing front-of-repo; warrants a dedicated cleanup commit ahead of any community/external-engineer engagement.

---

## Overall Dimension 6 verdict

🟡 **MOSTLY TRUTHFUL — most Day-19 staleness items closed by Item 2.4.x + 2.5.x; two residual stale items + README drift remain.**

Net change Day 19 → Day 20: **dramatic improvement.** STRATEGIC_RECOMMENDATIONS now truthful (was 6 stale items); RECOVERY_PROCEDURES improved from 5 stale lines + speculative root cause + missing Appendix B → 2 stale lines + definitive root cause + present Appendix B; CLAUDE.md Track 0 list now complete.

The audit's recommendation discipline (Day 19 cross-pass items → Day 20 commits) demonstrably works.

---

## Differences vs Day 19 conversation findings

- **STRATEGIC_RECOMMENDATIONS.md:** 6 stale items at Day 19 → 0 stale items at Day 20 (Item 2.4.x closed all)
- **RECOVERY_PROCEDURES.md:** 5 stale lines + speculative root cause at Day 19 → 2 stale lines + definitive root cause + new Appendix B at Day 20 (Item 2.4.x closed 4 lines + root cause; Item 2.5.x added Appendix B; lines 57-58 deferred)
- **CLAUDE.md Track 0 list:** missing 4 docs at Day 19 → all 4 added at Day 20 (Item 2.4.x)
- **README.md:** unchanged Day 19 → Day 20 (no remediation commit applied; held for separate pass)
- **Inline code comments:** unchanged Day 19 → Day 20 (db.ts:5 Replit framing still mildly stale)
- **Numerical claims (routes 131, endpoints 695, tests 488):** unchanged, all match

---

## Cross-pass items surfaced

1. **6.1 / CLAUDE.md body date markers** — multiple "as of 2026-04-30" markers will become rolling stale; suggest treating each as "last verified" not "freeze" for the next maintenance commit
2. **6.3 / RECOVERY_PROCEDURES.md lines 57-58** — commit count `797` (actual 802) and HEAD snapshot `321564a` (actual `c0f12fa`) both stale by 5 commits; refresh atomically with header date in next doc maintenance
3. **6.4 / `db.ts:5` Replit framing** — comment + CLAUDE.md `## Deployment` Primary-Replit framing both lag the Fly + Neon operational reality; consider deliberate sync in next CLAUDE.md update
4. **6.5 / README cleanup** — Airtable + ZUS-11.26% stale + missing Sentry/AI/face/GPS/GDPR/posted-workers feature surface; held for dedicated cleanup commit

---

## Audit metadata

- File: `BUILD_INTEGRITY_AUDIT_DIMENSION_6.md`
- Originally Day 19 (conversation only); reconstituted Day 20 to disk per Session 5 Phase B-1.
- Session 4 (Dimensions 5 + 6) — companion file: `BUILD_INTEGRITY_AUDIT_DIMENSION_5.md`
- NOT committed at reconstitution — working draft until full audit synthesis (Session 5 close)
- Hard boundaries respected throughout: read-only repo for evidence gathering, read-only file writes for reconstitution, no commits, no deploys, no DB connections, no migration runner invocation
- Anti-hallucination: every fact verified by direct command output today (2026-05-07); not transcribed from Day 19 conversation memory. Day-19-vs-Day-20 differences explicitly enumerated.
