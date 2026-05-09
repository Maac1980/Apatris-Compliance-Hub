---
name: eod-health-check
description: Use this skill before closing any working day on the build. The Layer 1 manual EOD ritual sweeps Sentry / production health / scheduler / database / background jobs to catch silent failures BEFORE EOD doc closes. Trigger when authoring EOD doc, after final commit, or at any close-of-day-job moment. Without this skill, silent prod failures depend on operator luck and alertness (Day 22 M9-completion sweep incident).
---

# EOD health check (Layer 1 ritual)

## When to use

Before closing any working day on the APATRIS build:
- After final commit of the session
- Before authoring EOD doc
- At any moment when ending the day's work

The ritual takes ~10-15 minutes. It is the FIRST step of EOD discipline, not the last. EOD doc cannot honestly capture "what was built" without first verifying that what was built is actually working in production.

## Genesis

Day 22 May 8, 2026: 16 events/day firing in APATRIS prod from `services/deadline-engine.service.ts` for ~24 hours. Caught only because Manish noticed a Sentry email at end of long day. Without that vigilance, the M9-completion-sweep gap would have continued silently — plus 7 latent files would have surfaced as users hit them through subsequent days.

Layer 1 ritual exists so that catches don't depend on luck or alertness. The discipline becomes the catch.

## The 6-zone sweep

Apply each zone in order. Surface anomalies as they appear. Don't proceed to EOD doc if any zone shows uncovered regression.

### Zone 1 — Sentry sweep

Open APATRIS Sentry project inbox. Verify:

- **Total events last 24h** — number + trend vs prior day. Trending up sharply = regression signal.
- **New error types not seen in prior 7 days** — early warning for incomplete refactors. M9-style failures show up as new error types when the underlying schema-assumption hits a code path for the first time.
- **Top 5 recurring errors** — frequency + first-seen + last-seen. New "first-seen" date paired with high count = silent failure that started today.
- **Sentry inbox unread count** — alerts that fired without operator awareness. Day 22 lesson: one unread Sentry email was the only signal that 16 events/day were firing.

Surface any anomaly to chat-Claude before EOD doc closes. Don't rationalize away unread alerts.

### Zone 2 — Production health

Run these commands:

flyctl status --app apatris-api
flyctl releases --app apatris-api | head -3
curl -s -o /dev/null -w "%{http_code}" https://apatris-api.fly.dev/health

Verify:

- `/health` returns 200
- Both machines (or however many configured) show "started" + health checks passing
- Last release SHA matches origin/main HEAD (Hard Boundary 15 — code-on-main ≠ code-in-production check)
- Boot logs since last deploy show no "Cannot find module" / worker_threads / pino errors

If deploy SHA does NOT match origin/main HEAD, this is a deploy-gap event (Day 22 M9 pattern). Surface immediately. Do not close EOD until reconciled (deploy now OR explicitly mark "merge only — deploy deferred" in EOD doc).

### Zone 3 — Scheduler verification (APATRIS-distinctive)

This zone is APATRIS-specific because AC-15 startScheduler 10/13 GAPPED makes scheduler health critical to North Star (Job 12 silent = workers' permit-renewal awareness compromised).

Run these commands:

flyctl logs --app apatris-api --since 24h | grep -iE "Escalation|runDeadlineCheck|runDailyLegalScan|escalation cycle" | head -50
flyctl logs --app apatris-api --since 24h | grep -iE "scheduled|cron" | head -30

Verify:

- **Escalation engine 4-hour cycle** ran 6 times in last 24h (24/4 = 6 expected runs)
- **Daily 08:00 jobs** all fired (post-AC-15 re-wire: per-job success rate for all 13 jobs)
- **Job 12 `runDailyLegalScan`** completed cleanly (proxy: legal_alerts insert count > 0 if real cases present)
- **Cron drift detection** — any scheduled task fail to fire? Time-anchor mismatch (cron re-anchored to process start vs wall-clock)?
- **Schema-assumption errors** — anti-regression check on M9-completion sweep. Zero "column w.first_name does not exist" expected. Any match = M9 regression.

This zone is the most likely to catch silent failures. Apply rigorously.

### Zone 4 — Database health

Via Neon dashboard or query:

- **Connection pool error rate** — should be near zero. Spike = pool tuning issue or schema-assumption hit.
- **Slow query log** — any query over 1 second? Cumulative cost grows.
- **Idle disconnect count** — Neon idle-close mismatch sanity check (the issue Movement 1 fixed via Option A min:0).
- **Daily `legal_alerts` insert count** — proxy for AC-15 Job 12 actually working. Zero inserts on a day with real cases = silent failure.

If any metric trends wrong, document in EOD doc, escalate to Day N+1 first action.

### Zone 5 — Background jobs

Beyond scheduler — any background workers, queue processors, or async tasks running in production:

- **Schema-assumption errors of any kind** — anti-regression check across all background jobs. Zone 3 covers scheduler; Zone 5 catches one-off async work.
- **Failed retries** — patterns of retry-then-fail indicate transient infrastructure vs persistent code bug.
- **Queue depth** — anything growing unbounded?

### Zone 6 — Anomaly review

Before closing EOD:

- Anything from Zones 1-5 that's not "all clean"?
- If anomaly resolved during this sweep → log in EOD as "caught and fixed in EOD ritual"
- If anomaly persists → escalate to Day N+1 first action; explicitly state in EOD doc

Discuss any uncertain findings with chat-Claude before EOD closes. Hard Boundary 12 applies — verification claim ("EOD ritual passed") must trace to actual zone-by-zone output.

## Output format for EOD doc

EOD doc gets a "Health Check (Layer 1)" section before close, with this structure:

| Zone | Verdict | Notes |
|------|---------|-------|
| 1 Sentry | clean | 0 new error types, 14 events 24h trending flat |
| 2 Prod | clean | v299 deployed, both machines healthy, /health 200 |
| 3 Scheduler | clean | 6 escalation cycles, all 13 daily jobs fired (post-AC-15) |
| 4 Database | clean | Pool error rate 0, no slow queries, legal_alerts insert count 47 |
| 5 Background jobs | clean | Zero schema-assumption errors |
| 6 Anomalies | none caught | — |

EOD ready.

Or with anomalies:

| Zone | Verdict | Notes |
|------|---------|-------|
| 1 Sentry | caught | 3 events new error type "TimeoutError" first-seen today; investigating |
| 2 Prod | clean | — |
| 3 Scheduler | clean | — |
| 4 Database | clean | — |
| 5 Background jobs | clean | — |
| 6 Anomalies | 1 caught | TimeoutError → Day N+1 first action: investigate worker queue timeout |

## Why this works

- Catches silent failures before they accumulate. Day 22 M9 incident silent for 24+ hours; daily ritual catches within 24 hours maximum.
- Surfaces deploy-gap events automatically (Zone 2 SHA match check). Hard Boundary 15 self-applies.
- Routes anomalies to Day N+1 first action with explicit EOD documentation. No "deal with it tomorrow" without record.
- Discipline replaces luck. Operator vigilance is finite; ritual is repeatable.
- APATRIS-distinctive scheduler emphasis (Zone 3) reflects North Star concern: Job 12 silent = workers' permit-renewal awareness compromised.

## Examples from APATRIS work

**Day 22 M9-completion sweep incident** — would have been caught by Zone 1 (new error type firing, count climbing) on the day it began (~24 hours earlier than actual catch via Sentry email).

**Day 23 M9 deploy-gap** — would have been caught by Zone 2 (deploy SHA does not match origin/main HEAD) on Day 22 evening when M9 commit landed but deploy was not authorized in save-prompt scope.

**Hypothetical AC-15 Job 12 re-wire regression** — would be caught by Zone 3 (escalation cycle ran but Job 12 silent → legal_alerts insert count zero on day with real cases).

## Anti-patterns

Do not skip the ritual because the day was light. Light days are when discipline matters because operator vigilance is lowest.

Do not collapse zones. Each zone catches different failure modes. Skipping Zone 3 because Zone 1 was clean misses scheduler-specific failures.

Do not close EOD with anomalies marked "to be investigated tomorrow" without explicitly logging them as Day N+1 first action.

Do not rationalize unread Sentry alerts. Day 22 lesson: one unread email was the only signal of 16 events/day. Read every alert that fired in last 24h.

Do not perform the ritual mechanically without applying Zone 6 anomaly review. Format-clean output with uncovered regression is the worst failure mode.

## When NOT to use

- Mid-session work blocks (no EOD context)
- Conversation-only sessions where no commits or deploys occurred
- Days when operator is explicitly off (Anna's competition days where Manish stays on build but doesn't ship — different shape, partial ritual)

## Cross-reference

- Adjacent superpowers skill: none — APATRIS-specific operational ritual
- Companion skills (artifacts/api-server/skills/): self-review-day-18-lesson (5-element template applies to Zone 6 anomaly review), recovery-rollback-flyctl (Zone 2 deploy-gap remediation if SHA mismatch found)
- Plan reference: APATRIS_CORE_PLAN.md Section 11 (Daily Health Check Ritual + Continuous Health Infrastructure)
- Boundary reference: Hard Boundaries 12 (verification mechanism) + 15 (deployment claim integrity)

## Slug

eod-health-check
