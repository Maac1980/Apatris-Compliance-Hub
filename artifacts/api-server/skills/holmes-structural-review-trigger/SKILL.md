---
name: holmes-structural-review-trigger
description: Use this skill to decide when to invoke Holmes (structural reviewer for the three-intelligences working pattern). Holmes reviews save-prompts, architectural decisions, first-of-kind patterns, and atomic commit pre-flight. Trigger when work crosses an architectural threshold or commits substantial scope to repo.
---

# Holmes structural review trigger

## Three-intelligences working pattern

The APATRIS build operates with three intelligences in partnership:

- Manish — last source of truth for direction; final decision authority on every architectural fork
- chat-Claude — strategic frame, save-prompt drafting, synthesis, Operating Principles maintenance
- Apatris Claude — repository operations, code execution, Phase A investigation, Write tool execution, atomic commits

Holmes sits adjacent — structural reviewer who is NOT a decision-maker. Holmes's primary work is EEJ build. Holmes is invoked into APATRIS for review at specific triggers, then returns to EEJ work.

## When to invoke Holmes

Always invoke before:

1. Architectural threshold crossings — new tech-debt-creating decisions, first-of-kind patterns, choices that lock the build into a path
2. Atomic commit pre-flight — large multi-file commits, migration ledger updates, commit messages that will be searched later
3. Save-prompt review when stakes warrant — cross-build proposals, first save-prompt of a new Item type

Sometimes invoke for:

- Plan critique when chat-Claude is unsure about scope
- Migration ledger entries with classification ambiguity
- Audit-derived findings before incorporating into Movement 3

Do NOT invoke Holmes for:

- Routine save-prompts in established patterns
- Single-character / line edits
- Conversational chat
- Read-only investigations with low blast radius

## Pattern shape

When invoking Holmes:

1. chat-Claude drafts the artifact
2. Manish routes to Holmes with explicit context
3. Holmes reviews structurally — not for decision-making, for catching architectural mismatch
4. Holmes returns review — confirms, surfaces concerns, or rejects with reason
5. chat-Claude integrates review into final draft
6. Manish routes final to Apatris Claude for execution

The flow protects each intelligence's role: Holmes reviews, chat-Claude integrates, Apatris Claude executes.

## Why this works

- Holmes catches structural mismatch chat-Claude misses (Day 17 DISCOVERY-FIRST + MULTI-METHOD refinements added 3 real findings)
- Routing through Holmes adds friction at the right scale
- Three-intelligences pattern survives across-session
- Cross-build proposals get verified at receiving end (Day 20 Multi-LLM proposal — Holmes confirmed APATRIS chat-Claude's filter)
- Discipline holds even when routing accidents happen — wrong-terminal paste Day 20 still produced correct output

## Examples from APATRIS work

- Holmes DISCOVERY-FIRST + MULTI-METHOD refinements added to DIMENSION_7
- Holmes review of Operational Pass save-prompt
- Holmes review of cross-build Multi-LLM proposal (chat-session pattern, not committed in repo) — verified APATRIS chat-Claude rejection of Gemini integration was structurally correct
- Holmes NOT involved sometimes — DIMENSION_1, DIMENSION_2, DIMENSION_4 had no Holmes involvement (sometimes the right call is to not invoke)

## Anti-patterns

Do not invoke Holmes for every save-prompt. Holmes time is finite (primary work is EEJ).

Do not let Holmes make decisions. Holmes reviews structurally; Manish + chat-Claude decide.

Do not skip Holmes for high-stakes work because urgency. Urgency-driven Holmes-skip is a recurring failure mode — high-stakes work happening fast is exactly when structural review catches errors that compound. Urgency is when discipline matters, not when it slips.

Do not bypass Holmes by routing direct to Apatris Claude when trigger says invoke.

Do not embed Holmes review request as placeholder. Holmes review requests must contain save-prompt content INLINE — embedded placeholders break the review (Holmes cannot review what is not present in the request).

## When NOT to use

- Established patterns with multiple successful prior runs
- Investigation work with low blast radius
- Single-intelligence operations
- Hygiene Items with bounded scope

## Cross-reference

- No superpowers analog — pure APATRIS three-intelligences pattern
- Companion skills: save-prompt-10-element-structure, gate-stop-and-confirm-pattern

## Slug

holmes-structural-review-trigger
