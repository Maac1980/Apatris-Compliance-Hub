---
name: gate-stop-and-confirm-pattern
description: Use this skill when authoring or executing any work split across phases — investigation then execution, draft then commit, save-prompt write then atomic commit. The GATE forces explicit stop between phases, structured reporting, and operator review before next phase. Trigger when about to advance work through a state transition where wrong direction would compound into the next phase.
---

# Gate stop-and-confirm pattern

## When to use

Whenever work has phases or transitions:

- Phase A investigation → Phase B execution
- Save N → Save N+1 (chunked content writes)
- Stage 1 read → Stage 2 synthesize → Stage 3 commit
- Code change → boot-soak verification → traffic enabled
- Audit dimension → cumulative synthesis → durability commit

The GATE prevents auto-advance. Each transition becomes a deliberate decision, not momentum.

## Pattern shape

After completing one phase, the executing intelligence (typically Apatris Claude) reports:

  GATE T[Item]-[Phase]-[Save] — STOP-AND-CONFIRM

  Report:
  - [Specific result 1]
  - [Specific result 2]
  - Self-review: [anti-hallucination check applied]

  WAIT for Manish + chat-Claude review before [next phase action].

The naming convention `T[Item]-[Phase]-[Save]` makes gates traceable in commit messages, save-prompts, and EOD docs.

## Why this works

- Prevents momentum-driven errors — work that "feels right" continuing isn't always right
- Surfaces issues before they compound — Phase B errors are 10x harder to fix than Phase A errors
- Forces evidence-grounded reporting — recipient can't auto-advance, must report what was found
- Respects three-intelligences model — gives Manish + chat-Claude review window
- Catches incomplete-refactor pattern — Day 20 startScheduler finding showed what happens when work transitions without gates (10 of 13 jobs left ungapped silently)

## Examples from APATRIS work

**GATE T2-3-PHASE-B-EDIT** — Item 2.3 main-thread Sentry hook deploy. Phase A identified root cause (esbuild + worker_threads); GATE held before Phase B edit; Phase B then shipped Option 2 cleanly.

**GATE T2-4-x-PHASE-B-EDIT** — Item 2.4.x doc sweep. GATE between draft and commit caught Day-19 framing error in commit message before push.

**GATE T2-4-S5-SAVE-1 / SAVE-2 / FINAL** — Session 5 atomic commit of synthesis docs. Three GATEs: write Migration Ledger / write DIMENSION_8 / atomic commit. Each gate prevented partial commit if a write failed.

**GATE T2-6-PAUSE-PHASE-A** — Day 21 Skills directory inventory. GATE held before any consolidation action; investigation revealed 3 locations are correct architecture (not drift) — consolidation would have been wrong.

**GATE T2-4-S5-PASS-2-INVESTIGATION** — AC-10b startScheduler 13-job mapping. GATE held before classification; revealed 10 of 13 GAPPED including Job 12 HIGH severity North Star concern.

## Anti-patterns

Do not auto-advance through GATEs.

Wrong: "Phase A complete. Proceeding to Phase B." (auto-advancing without operator review)
Right: "GATE T-XXX — STOP. Report: [findings]. WAIT for review."

Do not skip GATEs because work feels routine.

The Day 20 startScheduler 61977ad-style failures happened in commits that felt routine. Routine is when discipline matters most.

Do not soften GATEs into checkpoints.

GATE means STOP. Checkpoint suggests "noted, continuing." The discipline is the stop, not the report.

Do not skip self-review at GATE.

Self-review at the GATE catches mistakes that would compound. The 5-element pattern (errors / missing / better / concerns / anti-hallucination) belongs in the GATE report.

Do not collapse multiple GATEs into one.

When work has 3 transitions, use 3 GATEs. Bundling into one super-GATE loses the discipline at intermediate failure points.

## When NOT to use

- Single-step tasks with no phase transition
- Conversational chat (no work to gate)
- Trivial edits where review is implicit (typo fixes, single-character corrections)

## Cross-reference

- Adjacent superpowers skill: .claude/skills/superpowers/executing-plans/SKILL.md (mentions review checkpoints concept)
- Companion skills (artifacts/api-server/skills/): save-prompt-10-element-structure (GATE is element 7), phase-a-investigation (GATE is final step)

## Slug

gate-stop-and-confirm-pattern
