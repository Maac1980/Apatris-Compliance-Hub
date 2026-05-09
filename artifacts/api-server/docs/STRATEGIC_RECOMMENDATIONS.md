# APATRIS BUILD — Strategic Recommendations from APATRIS Claude

**Authored:** 2026-05-02 (Q&A mode, post-Operational-Pass close)
**Authored by:** APATRIS Claude (the engine)
**For:** chat-Claude (to derive subsequent save-prompts) + Manish (direct reading without translation)
**Status:** Tracked; committed 2026-05-04 as 2d20156. Updated 2026-05-06 (Day 19) with progress on Track 1 + Track 2.

---

## Purpose

This document captures APATRIS Claude's strategic recommendations after 50 days of build work + the BUILD_INTEGRITY_AUDIT (Sessions 1–3 + Operational Pass). It is structured so chat-Claude can convert each track into a self-contained save-prompt for APATRIS Claude execution. It is also written so Manish (non-developer; mission-driven; "save people from getting trapped" + "follow the law") can read the strategic intent without translation.

Six tracks: 1–3 are remediation, 4 is audit continuation, 5 is Manish-level process, 6 is APATRIS Claude operating posture (the "active AND protected" piece).

---

## TRACK 1 — Operational Hygiene (immediate; pre-Session 4)

### Goal
Restore the test substrate; close the verification-discipline gap that let `61977ad` ship broken; stabilize the DB pool noise that masks real failures.

### Actions

**1.1 Reactivate `apatris-api-staging` Fly app.**
- ✅ DONE 2026-05-06 — staging reactivated and verified during Item 2.3 deploy
- WHY: precondition for Manish's standing "test data, never real data" principle. Currently suspended (Session 3 D7-4); operational pass items (a) + (b) deferred because of this.
- WHO: Manish authorizes; reactivation IS state-changing flyctl (FORBIDDEN list per Operational Pass save prompt). Either Manish runs `flyctl machines start --app apatris-api-staging` himself OR explicitly authorizes APATRIS Claude with narrow scope-exception.
- DONE WHEN: `flyctl status --app apatris-api-staging` shows running machines + DB connection works.

**1.2 `61977ad` schema-assumption bug cluster fix sweep (Production fixes pending #2).**
- ✅ DONE 2026-05-04 (Day 17) — commit 77267dc
- SCOPE: replace `first_name, last_name` with `full_name` (or `split_part(full_name, ' ', 1)`) in `services/escalation-engine.service.ts` (lines 27, 106), `routes/public-verify.ts` (lines 51, 262, 269), `services/weekly-digest.service.ts` (lines 43, 61). Replace `notification_log.message` with `message_preview` in `services/push-sender.service.ts` (line 25). Sub-30-minute sweep covering 8 broken queries.
- WHO: chat-Claude routes → APATRIS Claude executes; deploy gated on staging verification per Rule 5.1.

**1.3 DB pool quick-fix (Production fixes pending #3).**
- ✅ DONE 2026-05-04 (Day 17) — commit 6ef9087
- SCOPE: edit `lib/db.ts:18-19` — Option A (`min: 0`) or Option B (`idleTimeoutMillis: 10_000`). One-line config change.
- WHO: chat-Claude routes → APATRIS Claude executes; 24h staging soak before prod deploy.

### Stop-and-confirm gates
- GATE-T1-A: post-staging-reactivation; report DB connectivity + sample query
- GATE-T1-B: post-bug-cluster-fix on staging; per-query verification
- GATE-T1-C: post-pool-fix on staging; 24h log soak metrics
- GATE-T1-D: post-deploy verification on prod; cron firings + log frequency

---

## TRACK 2 — Security Posture (urgent; pre-counsel-engagement)

### Goal
Close known security gaps before counsel review surfaces them.

### Actions

**2.1 Replace `routes/messaging.ts` XOR with AES via `lib/encryption.ts` (Production fixes pending #6).**
- ✅ DONE 2026-05-05 (Day 18) — commit b02b326, prod deploy v297
- SCOPE: ~20-line edit at `routes/messaging.ts:9-23`. Remove local XOR `encrypt`/`decrypt`; import from `lib/encryption.ts`. Existing `APATRIS_ENCRYPTION_KEY` infrastructure used.
- DECISION REQUIRED: legacy fallback path for any existing plaintext / XOR-encrypted messaging payloads in DB? — staging inspection answers this.

**2.2 Wire Sentry capture for error+ logger calls (mechanism: main-thread Sentry capture hook in `lib/logger.ts` via pino's `hooks.logMethod`) (Tier-2 #5).**
- ✅ DONE 2026-05-06 (Day 19) — commit f33d067, prod deploy v298 (image 01KQY9E50KR2TMNSM9MQ3H95WR)
- SCOPE (final): main-thread `hooks.logMethod` in `lib/logger.ts` filters at `level >= 50` and forwards to `Sentry.captureException`; hook wrapped in try/catch so Sentry failure cannot crash callers. `index.ts` adds Sentry post-init validation via `Sentry.getClient()`. `pino-sentry-transport` dependency removed.
- HISTORY: Day 18 attempted `pino-sentry-transport` approach failed at staging boot due to esbuild bundling pino, breaking pino's `__dirname`-relative `worker_threads` spawn. Day 19 Phase A definitively identified root cause; Option 2 (main-thread hook) implemented, all 4 staging tests passed, prod deploy v298 healthy.
- VALUE: 5-site systemic observability gap closes with one architectural fix.

### Stop-and-confirm gates
- GATE-T2-A: post-messaging-crypto-rewrite on staging; encrypt→decrypt round-trip + legacy-payload readability
- GATE-T2-B: post-Pino-Sentry-wiring on staging; intentionally trigger one catch; verify Sentry dashboard receives

---

## TRACK 3 — Legal Foundation (gating Layer 3)

### Goal
Establish Layer 0 (legal comprehension) so Layer 3 (scenarios engine) can be built without producing "fluent fiction with citations" per `MASTER_PLAN.md` line 97.

### Actions

**3.1 Engage Polish counsel + EU regulatory firm using `COUNSEL_HANDOFF_PACKET.md` v1.0.**
- WHO: Manish; contacts in `COUNSEL_PACKET_CONTACTS.md`.
- WHEN: this week if possible. Counsel is on critical path for everything Layer-3-related.

**3.2 Layer 0 v1 build (legal comprehension foundation).**
- BLOCKED BY: 3.1.
- SCOPE: per `LAYER_0_DESIGN.md` + `LAYER_0_TESTABILITY.md` (T1–T17 comprehension tests).
- WHO: chat-Claude designs → APATRIS Claude executes; counsel reviews each acceptance gate.

**3.3 Layer 3 build kickoff (scenarios engine).**
- BLOCKED BY: Layer 0 v1 + Layer 1 + Layer 2 + counsel sign-off.
- DECISIONS REQUIRED FIRST (DIMENSION_3.md Build-sequencing findings #1–#4):
  1. Stage 5 collision resolution (worker-explanation vs scenarios-alternatives naming)
  2. Knowledge graph substrate wiring (kg_* vs knowledge_nodes; AI Copilot rewiring)
  3. kg_* densification trigger strategy (which write paths populate the graph)
  4. Voyage embedding service wiring (when + interim/final + `APATRIS_VOYAGE_API_KEY` config)

### Stop-and-confirm gates
- GATE-T3-A: counsel engagement confirmed (Manish reports after first call)
- GATE-T3-B: Layer 0 v1 design reviewed by counsel; acceptance gates signed off
- GATE-T3-C: Layer 3 build planning session (chat-Claude + APATRIS Claude + Manish) before kickoff

---

## TRACK 4 — Audit Continuation

### Goal
Complete the BUILD_INTEGRITY_AUDIT with operational-pass evidence base in hand.

### Actions

**4.1 Session 4 (Dimensions 5 + 6).**
- Dimension 5: build philosophy. Operational pass produced 3 inputs in OPERATIONAL_PASS.md "Session 4 Inputs" section (commit-discipline-vs-verification-discipline gap; two distinct observability gaps; doc-vs-reality at commit-message granularity).
- Dimension 6: documentation truthfulness. CLAUDE.md / MASTER_BLUEPRINT.md / counsel handoff packet / Track 0 docs cross-checked against current code.

**4.2 Session 5 (Dimension 8 — synthesis).**
- Final cumulative verdict integrating Sessions 1–4 + operational pass. Foundational input for Phase-2/Phase-3 strategic decisions.

### Stop-and-confirm gates
- Standard audit gates (per Sessions 1–3 pattern): per-dimension gates with explicit Manish + chat-Claude confirmation between dimensions.

---

## TRACK 5 — Process Discipline (Manish-level rules)

### Goal
Institute owner-level rules that close the verification-discipline gap. These are not single-prompt-able actions; they are standing rules.

### Rules

**5.1 "Verified before done" rule.**
- Nothing gets called complete / shipped / "no gaps, no stubs" until exercised on staging by Manish or chat-Claude.
- Commit messages claiming completeness must be backed by staging-verification logs.
- Apply retroactively: each Production fixes pending entry must close with staging-verification step before being marked resolved.

**5.2 "No new features until broken ones fixed" rule.**
- Phase 1's 21 features verified working before Phase 2 begins.
- Operational pass found 5 of 10 features in `61977ad` broken. Apply same audit lens to remaining 11 Phase 1 features before classifying Phase 1 complete.

**5.3 "Test data, never real data" standing rule.**
- Already saved as `feedback_test_data_only.md` (2026-05-02).
- Applies to all future audit / remediation / development work.
- Staging-down is blocking, not cleanup.

These rules become CLAUDE.md additions OR chat-Claude prompt-template constraints.

---

## TRACK 6 — APATRIS Claude Operating Constraints (active AND protected)

### Goal
Preserve the operating posture that has been working through Sessions 1–3 + Operational Pass.

### "Active" means
- APATRIS Claude continues as executor in three-intelligences pattern (chat-Claude + Manish + Holmes-on-some-artifacts + APATRIS Claude).
- Full repo + Fly + git context access.
- Runs verification gates; surfaces empirical evidence beyond literal items (active reviewer).
- Surfaces reality-vs-plan in escalation format before deep execution when premise is wrong.

### "Protected" means — 16 hard boundaries to preserve in every save-prompt

1. **Repo posture:** READ-ONLY by default. Code changes require explicit "go." Audit work read-only; remediation explicit-go-required.
2. **Production DB:** NO connection. NO SELECT. ABSOLUTE. (Reinforced by `feedback_test_data_only.md`.) Staging/dummy DB only.
3. **Commits:** NO commit, push, staging without explicit Manish "go." Working drafts stay untracked.
4. **Migration runner / DDL / DML:** NEVER invoke. NEVER run on prod. CREATE TABLE IF NOT EXISTS only; never DROP.
5. **Fly state changes:** flyctl ALLOWED list (read-only) vs FORBIDDEN list (state-changing) per Operational Pass save prompt. Default to FORBIDDEN if unclear.
6. **Stop-and-confirm gates:** at every boundary. Report + wait for explicit confirmation. No advancing past gates without confirmation.
7. **Reality-vs-plan escalation format:** EXPECTED / FOUND / REASONABLE INTERPRETATION / RECOMMENDATION / awaiting confirmation. Use when premise is wrong before deep execution.
8. **Cross-pass / cross-dimension recharacterization:** when later findings change earlier verdicts, surface explicitly; require Manish + chat-Claude confirmation before updating earlier sub-files.
9. **Verbatim commit messages:** when Manish quotes one, use it exactly. No Co-Authored-By trailer unless he writes it. (`feedback_commit_message_literal.md`)
10. **CLAUDE.md current:** update after stack/feature/env changes, not as separate pass. (`feedback_keep_claudemd_current.md`)
11. **Auto commit/push DEFAULT:** test → commit → push to main → fly deploy after task. OVERRIDE: when explicit-go-only mode is active (PII migration, audit, operational pass), follow override rules. (`feedback_auto_commit.md` + `feedback_pii_migration_loop.md`)
12. **Verification mechanism discipline (AC-8.X):** any fix or refactor with scope claim must mechanize verification — grep/AST-walk for scope claims (complete enumeration, not sample), grep with multiple patterns for coverage claims (synonyms + aliases + indirect references), exhaustive search with documented terms for negative claims ("no X remains"), verification artifact saved to docs/ for audit trail. If verification can't be mechanized, claim must be scoped down to what CAN be verified. Pattern violation flags: rough estimates in Phase A audits, "all callers" claims without enumeration list, "verified" status without verification artifact.
13. **Git history immutability:** NO force-push, history rewrite, branch deletion, or rebase of pushed commits without explicit Manish "go." Local rebase before first push is allowed. Once pushed, history is immutable by default. Recovery scenarios involving history modification require explicit operator authorization.
14. **Destructive command prohibition:** NEVER run rm -rf with broad scope (e.g., rm -rf /, rm -rf ~, rm -rf .*), DROP TABLE/DATABASE, TRUNCATE without WHERE, DELETE FROM whole-table without WHERE+LIMIT, flyctl destroy, flyctl secrets unset on production, force-push to protected branches. PreToolUse hook firewall enforces these patterns at infrastructure layer when implemented (Movement 3 hygiene item).
15. **Deployment claim integrity:** code-on-main ≠ code-in-production. Deploy claims must specify deployment target. Save-prompt scope must include deploy command (e.g., `flyctl deploy`) OR explicitly mark "merge only — deploy deferred." Verification check after any code-fix-paired-to-Sentry-event or production-bug-remediation must include explicit deploy step + post-deploy runtime verification before claiming closure. (Day 22 M9-completion sweep deploy-gap is the genesis case study — fix on main but not in production for ~13 hours, bug continued firing 12 events in that window.)
16. **Cross-repo write prohibition:** cross-repo write forbidden by default. APATRIS Claude operates within APATRIS repo only; EEJ Claude operates within EEJ repo only. Cross-build coordination via Manish-as-router pattern, not direct cross-repo commits. Suggestions cross builds via chat-Claude filter on receiving build, not as direct execution.

### Three-intelligences pattern preservation
- **chat-Claude + Manish:** strategic decisions, save-prompt authoring, last source of truth
- **Holmes:** structural review on agreed artifact stages (e.g., Operational Pass save prompt); primary work EEJ; queued otherwise
- **APATRIS Claude:** executor, active reviewer, surfacing implications beyond literal items, stop-and-confirm at gates

### What every save-prompt to APATRIS Claude needs

1. **ARCHITECTURAL ASSUMPTIONS at top** (state-of-build at prompt time; if any wrong, surface and pause)
2. **PRE-EXECUTION VERIFICATION gates** (V1 = repo state; V2 = sub-file state; V3 = flyctl auth state per Hygiene-2; if any fail, surface and STOP)
3. **OUTPUT STRUCTURE** (one new sub-file at exact path; no other file creation; no edits to existing files unless cross-pass recharacterization warrants AND Manish confirms)
4. **EXECUTION ORDER** (numbered items grouped into gates)
5. **STOP-AND-CONFIRM GATES** at appropriate boundaries
6. **HARD BOUNDARIES** (the 16 items above, restated verbatim)
7. **REPORT FORMAT at each gate** (Findings / Issues / Implications / Cross-pass / Suggestion / Awaiting confirmation)
8. **ESCALATION RULES for item-internal expansion** (per Operational Pass item (h) escalation rule pattern: if scope blows past threshold, narrow with explicit prioritization)

---

## How chat-Claude uses this document

For each track, chat-Claude derives a save-prompt by:
1. Pulling the track's GOAL → ARCHITECTURAL ASSUMPTIONS
2. Pulling the actions → EXECUTION ORDER
3. Pulling the gates → STOP-AND-CONFIRM structure
4. Carrying TRACK 6 hard boundaries verbatim
5. Adding pre-execution verification (V1 + V2 + V3)
6. Adding output structure (one new sub-file at exact path)

For Manish, this document gives the strategic picture without translation: **stop, harden, get counsel, verified-before-done, and keep APATRIS Claude operating as the engine within boundaries that have been working.**

---

## Recommended save-prompt order from chat-Claude

1. **Track 1 first** (operational hygiene) — preconditions for everything else
2. **Track 2 second** (security) — pre-counsel posture
3. **Track 3 in parallel** (counsel engagement; Manish-driven, not save-prompt-driven)
4. **Track 4 after Track 1 hygiene** (Session 4 + 5 with empirical evidence ready)
5. **Track 5 ongoing** (rules; not single-prompt-able; carry into every save-prompt)
6. **Track 6 baked into every save-prompt** (operating constraints)

---

## Mission framing (held throughout)

Manish's two-part mission:
- **Follow the law** — Polish immigration / labor / ZUS compliance; EU AI Act Article 6; GDPR; Posted Workers Directive
- **Save people from getting trapped** — foreign workers (welders, construction) navigating Polish immigration limbo; the build's mission-critical features (public verification, escalation, weekly digest, client portal, push) all serve this directly

The audit findings + this strategic recommendations document are scoped to that mission. "Strength" of the build is measured by how reliably those mission-critical surfaces work, not by feature count. Operational pass found 5 of those surfaces silently broken for 19 days; Track 1 + Track 5 close that gap.

End of strategic recommendations document.
