---
name: self-review-day-18-lesson
description: Use this skill before shipping any non-trivial output — code edit, document, save-prompt, commit message, audit finding. The 5-element self-review template (errors / missing / better / concerns / anti-hallucination) catches mistakes that would compound. Trigger when about to send/commit/paste output that crossed a phase boundary.
---

# Self-review (Day 18 lesson)

## When to use

Before shipping output that crossed a phase boundary:

- Code edit before commit
- Document before paste/send
- Save-prompt before pasting to Apatris Claude
- Commit message before push
- Audit finding before incorporating into ledger
- Synthesis output before atomic commit

The discipline emerged Day 18 when chat-Claude shipped output that had errors a re-read would have caught. Codified as Operating Principle 6 Day 20: "ask yourself the questions, if we do not improve ourselves we can make nothing better."

## The 5-element template

Apply each element in order. State explicitly when complete.

### 1. ERRORS

Re-read the output. Ask: are there wrong refs, dates, paths, file names, line numbers, commit SHAs, or factual claims?

Common error patterns:
- Stale commit count (797 vs actual 802)
- Wrong HEAD reference (321564a vs actual c0f12fa)
- File path typo (artifacts/api-server/docs vs artifact/api-server/docs)
- Commit SHA hallucination (when not verified against `git log`)
- Date drift (referencing "Day 19" when working on Day 20)

State: "ERRORS check complete — [N corrections found, OR none]."

### 2. MISSING PIECES

Ask: is something this output should include but doesn't?

Common missing patterns:
- Cross-pass observation surfaced but not logged
- Cross-reference to adjacent skill not added
- Anti-hallucination check stated but not actually performed
- Verification step claimed but not executed
- Commit message missing co-authored-by trailer

State: "MISSING PIECES check complete — [N additions, OR none]."

### 3. BETTER SUGGESTIONS

Ask: would the receiver act more easily on a different shape?

Common improvement patterns:
- Prose narrative when table would be clearer
- 5 options when recommendation + consequences fits better
- Assumed knowledge when explicit reference helps
- Bundled saves when chunked saves are easier to verify
- Long save-prompt when split save-prompts are easier to paste

State: "BETTER SUGGESTIONS check complete — [N revisions, OR shape stays as-is]."

### 4. CONCERNS HELD SILENTLY

Ask: is there anything I noticed but didn't surface?

Common concerns patterns:
- Worry about scope drift but didn't name it
- Doubt about a verdict but didn't flag UNCLEAR
- Discomfort about a recommendation but went along
- Uncertainty about a file's state but assumed it's right
- Hesitation about a decision but didn't pause

State: "CONCERNS check complete — [concerns surfaced, OR none held]."

### 5. ANTI-HALLUCINATION CHECK

Trace every concrete claim back to evidence:
- Counts → grep/ls/wc -l output
- Verdicts → direct command output
- File presence → git ls-files / find
- Commit SHAs → git log
- Behavior claims → boot-soak observation, not assumption

If any claim cannot trace back to evidence, mark as UNCLEAR rather than asserted.

State: "ANTI-HALLUCINATION CHECK complete — every claim traces to verifiable source."

### Conclude

After all 5 elements, state explicitly:

  Self-review complete — ready for [commit / send / paste / next phase].

OR if revisions needed:

  Self-review surfaced [N items]. Revising before [shipping action].

## Why this works

- Catches before-they-compound errors — fixing in self-review is 10x cheaper than fixing post-commit
- Forces explicit-not-implicit verification — saying "self-review complete" requires actually doing it
- Distinguishes 5 different failure modes — different patterns of mistake catch different errors
- Models the discipline for next intelligence in chain — Apatris Claude self-reviews because chat-Claude self-reviews
- The recursive lesson Day 20: Operating Principle 6 was added because chat-Claude failed Principles 1-5 within the same response that named the lesson. Failure proves the principle is needed.

## Examples from APATRIS work

**Day 18 Item 2.5 self-review** — caught speculative original framing in RECOVERY_PROCEDURES.md before commit; replaced with Day 19 Phase A definitive root cause.

**Day 19 Item 2.4.x Phase B-1.5 self-review** — caught Day-17-vs-Day-18 dating discrepancy on b02b326 commit reference before commit; corrected to honor multi-day work pattern.

**Day 19 Item 2.5.x Appendix B self-review** — verified zero secret values across 30 mapped secrets via grep before commit; every external source path verified before staging.

**Day 20 Phase B-1 reconstitution self-review** — caught "stale by 4 commits" anti-hallucination slip mid-review; corrected to "stale by 5 commits" verified against actual git log.

## Anti-patterns

Do not skip self-review because work feels routine.

Verification-discipline gaps of any kind produce silent failures. The 61977ad cluster (5 of 10 features broken silently for 19 days) pre-dates the explicit self-review discipline; the lesson it taught is that any verification-discipline gap — pre-merge, post-deploy, or pre-commit — produces this pattern. Routine work is when discipline matters most.

Do not collapse 5 elements into one general check.

"Looks good to me" is not self-review. Each element catches different failure modes — collapsing them loses 4 of 5 catches.

Do not state "self-review complete" without actually applying the elements.

Performative self-review is worse than no self-review — creates false confidence.

Do not self-review only structure, skip content.

Format-clean output with wrong content is the worst failure mode. Content review is element 1 (ERRORS), not skipped.

## When NOT to use

- Trivial edits (single-character typo fixes)
- Conversational chat with no shipped artifact
- Mid-stream work where final output not yet ready

## Cross-reference

- Adjacent superpowers skill: .claude/skills/superpowers/verification-before-completion/SKILL.md (generic verification pattern; this APATRIS skill has the 5-element template)
- Companion skills: gate-stop-and-confirm-pattern (self-review belongs in GATE reports), phase-a-investigation (self-review applies to investigation output)

## Slug

self-review-day-18-lesson
