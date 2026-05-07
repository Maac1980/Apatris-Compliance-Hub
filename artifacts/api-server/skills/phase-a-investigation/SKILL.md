---
name: phase-a-investigation
description: Use this skill before any code change, schema migration, secret provisioning, or scope decision. Phase A is the read-only investigation that precedes Phase B (execution). Trigger when about to scope a new feature, classify dormant capability, or make a decision that depends on current code state. Default failure mode is jumping to Phase B without Phase A — produces speculation-based plans instead of code-based plans.
---

# Phase A investigation pattern

## When to use

Before any of the following:

- Scoping a new feature or Item
- Classifying dormant capability (Pattern 1A first-step / overbuilt / abandoned)
- Deciding whether to delete, refactor, or activate code
- Migration ledger entries (especially REFRAME with investigation)
- Worker portal or feature scope decisions
- Any decision where current code state matters more than memory

The rule from Day 20 spare-tyre lesson: "Investigate spare tyres first — before scoping ANY new feature, run Phase A investigation against codebase."

## Pattern shape

Phase A is structured as:

1. **WHY + FOR WHAT** — purpose of the investigation
2. **PRE-EXECUTION VERIFICATION** — V1, V2, V3 checks (git state, file presence, identity)
3. **INVESTIGATION TASK** — read-only commands (grep, find, cat, git log, flyctl secrets list)
4. **STRUCTURED OUTPUT** — per-target evidence with verdict
5. **GATE STOP-AND-CONFIRM** — explicit halt before Phase B authorization

Phase A produces evidence. Phase B uses evidence to execute. Never merge them.

## Why this works

- Prevents speculation-based plans — replaces "I think X is the case" with "grep shows X is the case"
- Surfaces surprises before execution — code rarely matches memory after weeks of work
- Anti-hallucination check is built in — every verdict traces to direct command output
- Decouples investigation cost from execution cost — Phase A is cheap (~30 min), Phase B is expensive (hours)
- Makes Manish's decision easier — evidence-grounded options instead of recommendation-from-memory

## Examples from APATRIS work

**Day 20 worker portal Phase A:**
Goal: scope worker portal Item.
Investigation: grep for existing endpoints, services, tables, manifests.
Outcome: 10 existing Pattern 1A spare tyres found. Item scoped as "extend GET /workers/me" not "build from scratch."

**Day 20 AC-10b Phase A (startScheduler):**
Goal: classify startScheduler dead-cron.
Investigation: read function body, grep for call sites, map 13 jobs to booted schedulers.
Outcome: 10 of 13 jobs GAPPED. Job 12 silent failure surfaced. Promoted to Movement 3 EARLY PRIORITY.

**Day 19 Item 2.3 Phase A (esbuild root cause):**
Goal: understand why pino-sentry-transport failed at staging boot.
Investigation: read worker_threads spawn path, grep esbuild config, examine bundled output.
Outcome: definitive root cause (esbuild bundles pino but worker_threads spawns by file path). Phase B switched to main-thread hook.

**Day 18 Item 2.5.x Phase A (secret inventory):**
Goal: enumerate all secrets across Fly apps.
Investigation: flyctl secrets list on prod and staging, grep env-var refs in code.
Outcome: 30 unique secrets mapped. Appendix B authored with zero secret values exposed.

## Anti-patterns

Do not skip Phase A because "I already know what the code does."

Memory drifts. The build evolved. Phase A is cheap insurance.

Do not let Phase A bleed into Phase B.

If the investigation surfaces something that needs fixing, do NOT fix it during Phase A. Surface it as cross-pass observation. Phase B (or different Item) handles execution.

Do not produce Phase A output as prose narrative.

Phase A must be structured: per-target evidence with verdict. Prose is hard to act on.

Do not skip the GATE.

Phase A must end with explicit STOP-AND-CONFIRM. No auto-advancing to Phase B even if evidence is clear.

## When NOT to use

- Single-line edits with obvious shape
- Documentation typo fixes
- Already-investigated capabilities (Phase A done in earlier Item)
- Pure synthesis work where investigation already happened

## Slug

phase-a-investigation
