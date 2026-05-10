# Apatris Day 24 EOD - May 10, 2026

**Build:** APATRIS Compliance Hub
**HEAD at close:** ffcca72 (deployed v301 at 12:57Z)
**Production:** Fly v301 (Job 12 dry-run live)
**Session:** Manish + chat-Claude + Apatris Claude + Holmes (cross-build via EEJ routing)

---

## Health Check (Layer 1) - second application of eod-health-check skill

| Zone | Verdict | Notes |
|------|---------|-------|
| 1 Sentry | clean | NODE-EXPRESS-5 + NODE-EXPRESS-8 marked resolved Day 24 morning; staging suspension closed pollution at source |
| 2 Prod | clean | v301 deployed 12:57Z, both Fly machines healthy, /health 200, deploy SHA ffcca72 matches origin/main HEAD (HB15 verified) |
| 3 Scheduler | clean | [Scheduler] Daily legal scan (DRY-RUN) scheduled in 15 hours (04:00) confirmed both machines; runDeadlineCheck silent-success continues; daily regulatory scan fired clean |
| 4 Database | clean | init-db ran clean both machines; AC-21 backfill silent-success; admins backfill from Day 23 commit 10 stable |
| 5 Background jobs | clean | zero schema-assumption errors; AC-15 wiring stable post-deploy |
| 6 Anomalies | 1 caught + closed | Day 23 misframing surfaced Day 24 morning (NODE-EXPRESS-8 fly.io tag); investigation revealed apatris-api-staging on stale May 6 image was actual M9 event source; staging suspended; Day 23 framing canonically corrected |

**Layer 1 ritual (second application) learnings:**
- Sentry inbox cleanup post-incident is critical for ritual signal-to-noise (today's resolve of NODE-EXPRESS-5/8 means Day 25 sweep starts truly clean)
- Cross-build observation pattern proved value SECOND time in 48 hours (Day 22 EEJ-Holmes caught APATRIS Sentry; Day 24 APATRIS chat-Claude caught EEJ channel-binding)
- Discipline now has TWO real proofs, not one - pattern is load-bearing

---

## What was built today

**3 commits + 1 deploy + 1 cross-build coordination outbound:**

1. `4843249` - Staging suspension + Day 23 misframing correction
   - Phase A multi-hypothesis investigation revealed apatris-api-staging on stale May 6 image (NOT Replit zombie) was actual source of Day 22-23 Sentry M9 events
   - Both staging machines (7847550b10e358 + d897570ae11798) sharing SENTRY_DSN with prod, firing M9 bug at ~6/day each
   - Day 23 "Replit zombie" framing was wrong attribution
   - flyctl scale count 0 destroyed both machines (app shell preserved for future revival)
   - Migration Ledger M9 runtime entry corrected with self-correction acknowledgment
   - CLAUDE.md note added clarifying staging-was-source
   - AC-28 captured: staging deploy strategy decision (Phase 2 deferred, measured-trigger)

2. `ffcca72` - AC-15 Phase B (Job 12 wired with dry-run mode)
   - Phase A audit revealed all 13 startScheduler jobs GAPPED at invocation level (not 10/13 as B13 framing stated)
   - Service exists at services/daily-legal-scan.service.ts:74 but wired only inside dead startScheduler
   - Option A: granular startDailyLegalScan() mirroring startDailyRegulatoryScan pattern
   - Path 1 mitigation: dry-run mode prevents first-run flood (Job 12 has never fired in production; could create alerts for every worker with status changes since build start ~March 22)
   - 6 files changed, backward-compat preserved for manual HTTP route POST /v1/legal-alerts/scan

3. AC-15 deployed to Fly as v301 at 12:57Z
   - Both machines healthy on v301
   - [Scheduler] Daily legal scan (DRY-RUN) scheduled in 15 hours (04:00) confirmed
   - First scheduled fire ~04:00 UTC May 11 (~06:00 Poland tomorrow)
   - Hard Boundary 15 verified (deploy SHA matches origin/main HEAD)

**Cross-build coordination outbound:**
EEJ Postgres auth crisis (~3 hours stuck on 28P01 across multiple secret updates). Manish routed symptom to APATRIS chat-Claude. Three hypotheses generated (channel binding, pooler vs direct, hidden chars). EEJ chat-Claude filtered + added host-mismatch hypothesis. EEJ Claude Code tested Hypothesis 1 (channel binding strip). Fix landed. Both EEJ environments restored. Root cause: pg client failed SCRAM-SHA-256-PLUS handshake against Neon pooler; channel_binding strip allows fallback to plain SCRAM-SHA-256.

---

## Key realizations

**1. Day 23 closure was incomplete, and Day 24 caught it.**

Day 23 ended with confident "M9 + AC-21 closed, Replit zombie eliminated" framing. Day 24 morning Sentry sweep (Layer 1 Zone 1 ritual) caught NODE-EXPRESS-8 with fly.io provider tag - direct evidence that didn't fit "Replit zombie" story. Investigation revealed apatris-api-staging was real source. Day 23 framing canonically corrected. The discipline caught itself one day late, but caught itself.

**2. Audit-first discipline (committed Day 23 d1ddc66) saved the AC-15 work.**

Phase A audit revealed all 13 startScheduler jobs GAPPED at invocation level - not "10/13" as B13 had stated. Without audit-first, Phase B would have drafted from wrong baseline. Also caught: existing service code clean (M9 fix coverage validated), no hidden parallel call paths, manual HTTP route preserves backward-compat.

**3. Cross-build observation pattern proved SECOND-time value.**

Day 22 EEJ-Holmes caught APATRIS Sentry events. Day 24 APATRIS chat-Claude caught EEJ channel-binding. Same discipline, different direction. The pattern is load-bearing, not accidental.

**4. Four intelligences, not three.**

Today's EEJ resolution: Manish routes -> APATRIS chat-Claude generates hypotheses -> EEJ chat-Claude filters + augments -> EEJ Claude Code executes. Four distinct roles, none bypassable. Memory entry #16 ("three intelligences") needs update to reflect Claude Code as fourth distinct intelligence (not subordinate to chat-Claude).

---

## State for Day 25 inheritance

**Production:**
- HEAD = ffcca72 deployed as v301 at 12:57Z
- Job 12 dry-run live; first fire ~04:00 UTC May 11 (~06:00 Poland)
- All other production paths stable (M9 v300 carryover, AC-21 stable)

**Movement 3 status:**
- AC-15 Phase B done; Phase B verification pending Day 25 dry-run output review
- 28 total ACs in ledger
- M3-Item-3.1 (AC-15) substantially advanced via Phase B Tier 1 (Job 12 wired); Tier 2-4 (other 12 GAPPED jobs) remain deferred per audit-first per-job decision discipline

**Day 25 first action priority order:**
1. ~06:00 Poland: Job 12 dry-run output review - flyctl logs --app apatris-api --since 1h | grep -iE "LegalScan|DRY-RUN" | head -50
   - Look for [DailyLegalScan][DRY-RUN] Complete: N workers scanned, M alerts WOULD HAVE BEEN created, X errors
   - If reasonable count -> Phase B follow-up commit removes dry-run flag, redeploy
   - If massive count -> add watermark mitigation, redeploy
2. AC-22 procedural - provision Akshay on Sentry (~5 min Manish-action; closes operator-presence early-warning gap)
3. AC-15 Tier 2 - review which other GAPPED jobs warrant wiring (Job 1 token cleanup easy candidate)

**Pending Phase 2 deferred:**
- Credential rotation (deferred to production-readiness milestone)
- AC-23 Layer 1 alternate-authority designation (after AC-22 lands)
- AC-24 contract-gen audit
- Operator Transition Plan Phase 1A drafting

**Pending memory updates:**
- Memory entry #16 update: "three intelligences" -> "four intelligences" framing
- Cross-build observation discipline (currently held in conversation; needs canonical capture when memory room opens)

---

## Personal context

3-hour focused work session this Sunday. Anna at competition until ~14:30 Poland; returned safely. Manish back to build for second session; EEJ stuck; eventually routed to APATRIS chat-Claude; resolved via cross-build coordination. Anna home for evening.

Day 24 closes with both APATRIS and EEJ at clean state. Discipline accumulating. The cycle continues - tomorrow.

Rest is part of the build.
