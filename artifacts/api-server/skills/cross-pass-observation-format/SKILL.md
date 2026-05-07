---
name: cross-pass-observation-format
description: Use this skill when authoring an audit pass, investigation report, or any structured analysis that may surface concerns relevant to dimensions, passes, or decisions OUTSIDE the immediate scope. The pattern preserves observations as actionable items rather than burying them in finding-prose.
---

# Cross-pass observation format

## When to use

Whenever you (chat-Claude, Apatris Claude, or Holmes) are authoring an investigation, audit, or analysis document and surface an observation that:

- Is outside the immediate scope of the dimension, pass, or Item being authored
- Belongs to a different dimension, future pass, or different Item
- Requires Manish judgment rather than mechanical decision
- Is adjacent to the main finding but worth preserving

The default failure mode is burying these observations in finding-prose where they get lost. Cross-pass format preserves them as actionable items.

## Pattern shape

At the end of each finding or sub-check, add an explicit subsection with this structure:

### Cross-pass

- Observation 1: concrete description, arrow, target dimension or Item
- Observation 2: concrete description, arrow, target dimension or Item

When there is only one observation, inline format works:

**Cross-pass:** observation, arrow, target

## Why this works

- Avoids burying observations in prose
- Preserves actionability — each item has a target (which dimension or Item handles it)
- Decouples scope — current finding stays focused; cross-pass list catches scope drift
- Feeds the synthesis pass — Session 5 synthesis or equivalent reads cross-pass items across all dimensions to identify cross-cutting patterns

## Examples from APATRIS audit

**DIMENSION_6 cross-pass items (4 entries):**
- CLAUDE.md body date markers refresh, target AC-17 documentation hygiene
- RECOVERY_PROCEDURES.md lines 57-58 staleness cleanup, target AC-3
- db.ts line 5 plus CLAUDE.md "Primary: Replit" framing, target AC-18
- README.md cleanup conditional on Airtable investigation, target AC-19

**DIMENSION_5 section 5.4 cross-pass:**
- Multi-tenant DELETE discipline, target AC-7 (gates B1 activation)
- Stripe and Twilio activation queue, target B2 + B8 entries

**OPERATIONAL_PASS GATE-OP cross-pass recharacterization:**
- Item recharacterization, preliminary verdict to final verdict after Phase A investigation

## Anti-patterns

Do not bury observations in prose.

Wrong: "This finding shows X, and incidentally we noticed Y which seems concerning but is outside this dimension's scope."

Right: "This finding shows X."
"### Cross-pass"
"- Y observation, target dimension or Item"

Do not use cross-pass for in-scope items. If the observation belongs to the current dimension, address it in the main finding.

Do not skip the target. "Cross-pass: this is interesting" is useless. Always specify which dimension, Item, or pass owns it.

## When NOT to use

- Single-finding investigations with no scope drift
- Informal chat (use natural language)
- Items where every observation is in-scope by design

## Slug

cross-pass-observation-format
