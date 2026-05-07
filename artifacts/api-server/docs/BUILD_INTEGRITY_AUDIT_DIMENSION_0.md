# BUILD INTEGRITY AUDIT — Dimension 0: Timeline Establishment

**Audit date:** 2026-05-01
**Session:** 1 of 5 (Dimensions 0 + 3)
**Status:** ✅ verified
**Author:** APATRIS Claude (executor); chat-Claude + Manish (last source of truth); Holmes (structural reviewer)

This document is the read-only record of Dimension 0 findings. NOT committed in Session 1. Working draft until full audit synthesis.

---

## Genesis

| Field | Value |
|---|---|
| Genesis SHA | `fc0d390` |
| Genesis date | 2026-03-13 19:45:33 +0000 |
| Genesis commit message | "Initial commit" |

**First 10 commits (the build's earliest evolution):**

```
fc0d390 2026-03-13 19:45:33 +0000  Initial commit
49265ff 2026-03-13 22:33:33 +0000  Add foundational components and layout for the compliance dashboard
18e6ec6 2026-03-14 09:41:24 +0000  Implement a comprehensive compliance dashboard for welder management
b1494f2 2026-03-14 09:44:59 +0000  Add default login credentials to the login screen for easier access
b427991 2026-03-14 10:10:12 +0000  Improve Airtable connection by extracting correct base ID
b08bea7 2026-03-14 10:37:38 +0000  Add multi-language support for English and Polish
83b029c 2026-03-14 12:11:41 +0000  Update the Apatris logo to display a clean icon
965188c 2026-03-14 12:26:23 +0000  Update the company logo displayed throughout the application
11b4a63 2026-03-14 12:30:15 +0000  Update application branding with new primary colors and logo
0fa3273 2026-03-14 12:46:54 +0000  Add ability to upload worker documents directly to Airtable
```

The first 28 hours of the build delivered: foundational dashboard, Airtable integration, English/Polish multi-language scaffolding, Apatris branding, and worker document upload. The "multi-language support" commit on Day 2 (2026-03-14 10:37) is a notable foundational signal — bilingual was on the roadmap from genesis, even if remediation took until Day 47–48 (Tier 1 closure 2026-04-30).

---

## HEAD (current state)

| Field | Value |
|---|---|
| HEAD SHA | `3e6cc89` ✓ (matches expected) |
| HEAD date | 2026-04-30 14:34:36 +0200 |
| HEAD commit message | "docs: add 3 additional Track 0 docs to CLAUDE.md (Path C Step 2 follow-up)" |

No drift from expected. HEAD = `3e6cc89` confirmed.

---

## Counts

| Metric | Value | Source |
|---|---|---|
| **Total commits** | **792** | `git log --format='%h' \| wc -l` |
| Pre-March-15 commits (genesis through 2026-03-14) | 51 | derived: 792 − 133 − 608 |
| Baseline period commits (2026-03-15 to 2026-03-22) | 133 | `git log --since=... --until=... \| wc -l` |
| Strategic build period commits (since 2026-03-22) | 608 | `git log --since="2026-03-22" \| wc -l` |
| **Total span (genesis to HEAD)** | **48 days** | 2026-03-13 to 2026-04-30 |

The **48-day span** is close to chat-Claude's estimate of "~45 days" — the estimate was directionally accurate but slightly low. The actual span is 48 calendar days, ~16.5 commits/day on average, with high variance (some days have 30+ commits, some have 0).

---

## Period segmentation

The 792 commits divide naturally into three periods based on the prompt's framing:

### Period 1 — Pre-baseline (genesis to 2026-03-14): 51 commits

Days 1–2 only. Foundational work: initial commit, dashboard skeleton, Airtable connection, branding, multi-language scaffolding. This is "before the partnership started" predating the 7-day baseline window.

### Period 2 — Baseline (2026-03-15 to 2026-03-22): 133 commits

7-day window before the strategic build started. High-velocity Replit-style iteration: 133 commits in 7 days = ~19 commits/day. Many commits with messages like "Published your App", "Update layout to use a top navigation bar", "Improve back button navigation". The "before our partnership started" context the prompt references — foundational dashboard, mobile workforce-app, role-based login, biometric auth, Digital Site Pass, profile tabs, payroll page, login styling.

This 133-count is materially larger than chat-Claude's framing might suggest. The pre-strategic period was substantively built, not just brand placement. By 2026-03-22 the codebase already had: dashboard, mobile-first workforce-app PWA, T1-T5 role-based access, biometric auth, payroll layout, document tabs.

### Period 3 — Strategic build (since 2026-03-22): 608 commits

39-day strategic build period. ~15.6 commits/day on average. This is the partnership-driven period.

---

## Inflection point candidates

Heuristic analysis of commit message patterns identifies the following inflections:

| Date | SHA | Inflection signal |
|---|---|---|
| **2026-03-22** | `cf1fda2` | First conventional-commit-prefix commit (`fix:`). Marks transition from Replit-style "Published your App" messages to disciplined commit messages. Day 10 of build. |
| **2026-04-21** | `ca227c9` | First sub-phase commit (`feat(apatris-identity): shared system prompt module — AI idea #1 Phase 1`). Marks transition to explicit phase architecture (1F-1, 1G-1, 1G-2, 1G-3). Day 40. |
| **2026-04-22** | `43ab0c2` | First RAG infrastructure commit (`feat(rag): vector RAG infrastructure — Sub-phase 1G-2 Phase 1`). RAG / pgvector / embeddings begin. Day 41. |
| **2026-04-23** | `1fe4a60` | First Claude-schema commit (`feat(intake): migrate to callClaudeWithSchema with discriminated union document schema`). AI integration sophistication. Day 42. |
| **2026-04-24** | `02a469b` | TypeScript baseline recorded (159 errors at v295). First explicit type-debt baseline. Day 43. |
| **2026-04-25** | `902117a` | First Track 0 doc commit (`docs: add Apatris master blueprint as Track 2 reference`). Strategic documentation discipline begins. Day 44. |
| **2026-04-25** | `c6f895d` | MASTER_PLAN.md added later same day. The constitutional planning document. Day 44. |
| **2026-04-26** | `3e0dead`, `1d10251`, `bf4d92b`, `41dedd1`, `5873fca` | Five major Track 0 docs in one day: Layer 0 design, Layer 0 testability, EU AI Act research, language toggle verification, Polish authoritative principle. Day 45 — the documentation explosion. |
| **2026-04-26 → 2026-04-27** | `6696bcc` → `27ff161` | Counsel handoff packet authored from v0.6 to v1.0 (Sections 1-11). Day 45-46. |
| **2026-04-28 → 2026-04-30** | `3a0f5e4` → `0f3a8d6` | Tier 1 bilingual remediation (Phases 1-8). Sub-tasks 1-5 closed. Days 47-49. |

**The clearest inflection** is **2026-04-25 (Day 44)** — the Track 0 documentation discipline begins. Before that day, the build had no Track 0 docs in `artifacts/api-server/docs/`. After that day, the documentation discipline becomes integral to every phase.

A secondary inflection is **2026-04-21 (Day 40)** when sub-phase architecture (1F-1, 1G-1, etc.) becomes explicit in commit messages. Before this, commits were features without a phase taxonomy.

---

## Findings summary

**The actual timeline tells us:**

1. **48 days, 792 commits** — averaging 16.5 commits/day. High velocity.
2. **The "before partnership" baseline is materially larger than implied** — 51 + 133 = 184 commits across 9 days delivered substantive product (dashboard, workforce-app PWA, RBAC, payroll, biometric auth, document upload). The strategic build inherits a non-trivial foundation.
3. **The strategic build's 608 commits in 39 days** demonstrate sustained pace — not a sprint, a marathon. ~15.6/day for over a month.
4. **Documentation discipline arrived late but decisively** — 0 Track 0 docs before Day 44; 12 Track 0 docs by Day 49. The architectural sophistication of MASTER_PLAN, LAYER_0_DESIGN, EU_AI_ACT_RESEARCH, COUNSEL_HANDOFF_PACKET, LANGUAGE_TIER1_REMEDIATION/VERIFICATION_v2, MIGRATION audit (this work) all landed in the final 6 days.
5. **Tier 1 remediation was a 3-day phase explosion** (Days 47-49) — Phase 1 erratum through Phase 8 docs closure compressed into ~72 hours of intense work.
6. **The chat-Claude "~45 days" estimate was directionally correct but slightly low** — actual 48 days. Within reasonable estimation tolerance.

**What this timeline does NOT tell us** (deferred to other dimensions):
- Whether the 608 strategic-period commits actually built the multi-scenario AI North Star (Dimension 3 will test).
- Whether the 51+133 pre-strategic commits left scaffolding that contradicts the strategic build's purpose.
- Whether the documentation discipline that arrived on Day 44 reflects the code state or aspires past it.

These questions are Dimension 3's territory.

---

## Reality-vs-plan mismatches encountered

None of significance. The prompt's expected commands all worked. Two minor notes:

- **EXPECTED:** Genesis presumed to be ~March 13. **FOUND:** Confirmed 2026-03-13 19:45:33 +0000. **Match.**
- **EXPECTED:** "~45 days" total span. **FOUND:** 48 days. **REASONABLE INTERPRETATION:** Estimate was directionally accurate. **No action needed.**
- **EXPECTED:** Strategic build "March 22 onwards". **FOUND:** First conventional-commit-prefix on 2026-03-22 19:21 (`cf1fda2`) — confirms the partnership-driven discipline started exactly on that date. **Match.**

No commands failed. No file paths surprised. No codebase surprises in this dimension.

---

## Status

✅ **VERIFIED** — Dimension 0 complete. All sub-tasks D0-1 through D0-7 produced clean output. Sub-task D0-8 (this file) is now written. Awaiting GATE 0 confirmation before proceeding to Dimension 3.
