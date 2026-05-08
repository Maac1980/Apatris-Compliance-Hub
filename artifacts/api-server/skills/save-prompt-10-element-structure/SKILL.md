---
name: save-prompt-10-element-structure
description: Use this skill when authoring any save-prompt routed from chat-Claude to Apatris Claude (or Holmes). The 10-element structure prevents misrouting, ensures purpose is explicit, embeds verification gates, and bounds execution scope. Trigger when about to draft a prompt instructing another intelligence to execute work in the build.
---

# Save-prompt 10-element structure

## When to use

Whenever chat-Claude (or any authoring intelligence) drafts a prompt routed to:

- Apatris Claude (Claude Code in repo terminal — for codebase work)
- Holmes (structural reviewer — for save-prompt review or plan critique)
- Another chat-Claude instance (rare — for content handoff between sessions)

Without the 10-element structure, save-prompts drift toward narrative, lose verification gates, or miss the recipient.

## The 10 elements (in order)

### 1. TO / FROM / SUBJECT header

Three lines at the top:

  TO: [recipient — Apatris Claude / Holmes / chat-Claude]
  FROM: Manish + chat-Claude (or whoever authored)
  SUBJECT: [what this prompt accomplishes — Item identifier + brief shape]

Prevents misrouting. The wrong-terminal paste lesson (Day 21) showed routing matters — a prompt intended for EEJ ran against APATRIS code because no TO header forced the receiving intelligence to verify scope.

### 2. WHY

Single sentence or short paragraph stating purpose. Why does this work need doing right now?

Operating Principle 2 in action: WHY in every prompt and execution.

### 3. FOR WHAT

What does the work feed into? Downstream effect. What Item closes? What gate unlocks? What enables Phase B?

Pairs with WHY. Together they bound scope.

### 4. PRE-EXECUTION VERIFICATION (V1, V2, V3)

Before any work begins, the recipient verifies state:

  V1: git log --oneline -3 (or equivalent state check)
  V2: file/directory presence (when relevant)
  V3: identity / auth / SSH (when relevant)

Each V check has explicit Expect: statement. If V check fails, recipient STOPs.

### 5. EXECUTION TASK

The actual work. Concrete, ordered, testable. Use Write tool / git add / grep commands etc. specified verbatim.

When task is large, split into Step 1 / Step 2 / Step 3 with structured outputs per step.

### 6. STRUCTURED OUTPUT FORMAT

Define what the recipient reports back. Per-step or per-target. Tables when comparing multiple things. Not narrative — structured so chat-Claude can integrate findings without interpretation.

### 7. GATE — STOP-AND-CONFIRM

Explicit halt before next phase. Recipient cannot auto-advance.

  GATE T[Item]-[Phase]-[Save] — STOP-AND-CONFIRM

  Report: [specific items expected]

  WAIT for Manish + chat-Claude before [next action].

### 8. HARD BOUNDARIES

State boundaries explicitly:

  Read-only across [scope]. No edits. No commits. No production touches.

OR for write-tasks:

  Write tool only. No commits yet. Override mode active.

Prevents scope creep. The recipient knows what NOT to do, not just what TO do.

### 9. ANTI-HALLUCINATION CHECK

Specific instruction:

  ANTI-HALLUCINATION CHECK: every [verdict / count / claim] traces to direct [grep / ls / git] output.

When unclear from evidence: surface as UNCLEAR, not asserted.

### 10. PROCEED / ESTIMATED TIME

End with:

  Estimated time: ~[N] min for [described scope].

  Proceed.

Bounds expectation. Lets recipient and operator gauge runway.

## Why this works

- TO/FROM/SUBJECT prevents misrouting between three intelligences
- WHY + FOR WHAT prevents scope drift (Operating Principle 2)
- V1-V3 catches state mismatch before work begins (file missing, wrong HEAD, auth broken)
- GATE prevents auto-advance through error states
- HARD BOUNDARIES bounds blast radius
- ANTI-HALLUCINATION forces evidence-grounded output
- ESTIMATED TIME respects operator runway

## Examples from APATRIS work

**Item 2.4.x save-prompt** — doc sweep cross-pass with V1-V3 + GATE T2-4-x-PHASE-B-EDIT
**Item 2.5.x save-prompt** — Appendix B secret source-of-truth with PHASE-B-WRITE gate
**Item 2.4 Session 5 Stage 3** — atomic commit of 9 audit files with explicit anti-hallucination check
**Item 2.6 Phase B Save 1-3** — skill extraction saves with chunked content + per-save GATE

## Anti-patterns

Do not skip TO/FROM/SUBJECT.

Wrong-terminal paste (Day 21) demonstrated cost — APATRIS Claude ran EEJ-intended prompt against APATRIS code. With explicit TO header, recipient could have flagged mismatch.

Do not bury WHY in narrative.

Wrong: "We've been thinking about doing X and it would be good if..."
Right: "WHY: [single concrete reason]"

Do not mix execution with verification.

V1-V3 happen before EXECUTION TASK begins. If V fails, work stops. Don't smuggle verification into mid-execution.

Do not auto-advance through GATEs.

GATE means STOP. Recipient reports, waits for review, then proceeds. Auto-advancing through gates was Day 20 lesson — incomplete refactor pattern (startScheduler) was the consequence.

Do not skip HARD BOUNDARIES.

Even read-only tasks should state "Read-only" explicitly. Bounds drift.

## When NOT to use

- Quick conversational checks (no save-prompt needed)
- Already-running tasks where structure was set earlier (don't re-prompt mid-task)
- Holmes review requests (different format — see holmes-structural-review-trigger when extracted)

## Cross-reference

- Adjacent superpowers skill: .claude/skills/superpowers/executing-plans/SKILL.md (review checkpoints concept)
- Companion skills (also in artifacts/api-server/skills/): phase-a-investigation, gate-stop-and-confirm-pattern (when extracted)

## Slug

save-prompt-10-element-structure
