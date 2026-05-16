# AC-41 Phase A Audit — No-Show Alert Engine + Escalation Cascade

**Date:** 2026-05-16 (Day 30)
**Verdict:** YELLOW (architecture work is UNGATED + template-rich; cross-AC dependency network is dense)
**HEAD at audit:** `57f1135`
**Scope:** Read-only audit of WorkerMatching share boundary + escalation cascade architecture + no-show event state machine. Vision Module 1. Surfaces 9-AC cross-overlap. Mirrors AC-31 / AC-38 / AC-47 / AC-39 / AC-40 / AC-46 Phase A pattern.

---

## Current state summary

**No-show domain is greenfield at the data layer** (zero `no_show` / `attendance_event` / `shift_attendance` tables). But three rich template stacks exist for the architecture pieces:

1. **WorkerMatching** — `matching.ts` (5 routes, 259 lines) provides full scoring engine + AI enhancement + eligibility filter + top-K selection + assignment trigger. This is the mandatory infrastructure share per Scoping audit. The scoring function (specialization + location + compliance + skills + certs, AI-enhanced via Claude Sonnet 4.6) is directly reusable for replacement-suggestion.
2. **Escalation engine** — `services/escalation-engine.service.ts` already implements scheduler-driven SLA breach detection with a 1/3/7-day escalation chain (push notification → WhatsApp coordinator → email T1 + push). Multi-channel routing proven. AC-41 can mirror this pattern for shift-event escalation.
3. **Notification channels** — `notifications.ts` + `push.ts` + WhatsApp via `lib/whatsapp.ts` + push_subscriptions table — all wired and used by escalation-engine.

AC-41 is therefore **architecture work + state machine, not greenfield reinvention.** The 10 event states (Scheduled / Checked-in / Late risk / Late confirmed / Absence on-time / Absence late / No-call no-show / Escalated / Resolved / Replacement assigned) require new schema + service-level state machine; but the matching + escalation + channel pieces are proven stacks to compose.

---

## Per-feature inventory (against vision Module 1)

| Vision feature | Built | Partial | New build | Source | Notes |
|---|---|---|---|---|---|
| Event states (10-state machine) | — | — | `no_show_events` table + service-level state machine | none — `shifts` has worker_ids JSONB but no per-worker event state | medium |
| Configurable grace period | — | — | `no_show_rules` config (per-tenant or global) | none | small |
| Automatic worker message (5 response options) | — | partial | new worker-facing UX + reply tracking | partial — push.ts + notifications.ts + messaging.ts 2-pane chat exist | **gated on AC-43** worker-facing AI safety |
| Coordinator alert at threshold 2 | — | — | new threshold logic; reuse escalation-engine pattern | escalation-engine.service.ts proves pattern | small-medium |
| Manager alert at threshold 3 | — | — | new threshold logic; same pattern | escalation-engine.service.ts | small-medium |
| Client-company notification (optional) | — | — | trigger only when enabled per client | none | **gated on AC-45 + AC-49** |
| Replacement suggestion | partial | full scoring engine in matching.ts (lines 70-155) | refactor matching.ts scoring into shared service | matching.ts (entire scoring + AI enhancement) | **shared service refactor** |
| Penalty/reward logic | — | — | trigger only after Yulia confirms legal boundaries | none | **gated on AC-50** legal review |
| Repeated-pattern detection | — | — | consumes AC-41 events + AC-47 intel | none | **gated on AC-44** internal AI |
| Case opening for repeat offenders | — | — | extends `legal_cases` or new `disciplinary_cases` | legal_cases exists as adjacent pattern | **gated on AC-50** |

---

## Tier breakdown

**Tier 1 — built, directly reusable (4 stacks):**
- Matching scoring engine (matching.ts lines 70-117 + AI enhancement 121-155 + eligibility filter 59-67)
- Escalation engine pattern (escalation-engine.service.ts — scheduler-driven SLA chain)
- Notification channels (push.ts + notifications.ts + WhatsApp via lib/whatsapp.ts)
- Scheduler infrastructure (lib/scheduler.ts — runs the engine on cron)

**Tier 2 — built, needs adaptation (1 feature):**
- Replacement suggestion — matching.ts scoring needs share-refactor into `services/matching-engine.service.ts` so both WorkerMatching (inbound jobs) and AC-41 (no-show events) consume the same function

**Tier 3 — schema/route partial:** None.

**Tier 4 — net-new (5 features):**
- `no_show_events` table + state machine
- `no_show_rules` config (grace period, thresholds)
- Worker reply tracking (gated AC-43)
- Penalty/reward integration (gated AC-50)
- Repeated-pattern detection (gated AC-44)

---

## WorkerMatching share-pattern proposal (the critical architecture decision)

### What WorkerMatching computes today

`routes/matching.ts:43` (`POST /matching/requests/:id/match`):

1. **Eligibility filter** (lines 59-67): excludes non-compliant + expired permits (TRC / passport / BHP / work permit / medical exam)
2. **Base scoring** (lines 70-117): base 50 + specialization (+20) + location (+15) + compliance (+10 GREEN / +5 AMBER) + phone (+5) + skills (+10) + certs (+10). Cap 100.
3. **AI enhancement** (lines 121-155): Claude Sonnet 4.6 with structured prompt, adjusts ±20 + reason text.
4. **Top-K selection** (line 159, currently top-5)
5. **Storage** (lines 162-168): inserts into `worker_matches` table with status='suggested'
6. **Assignment trigger** (line 209-256): updates `worker_matches.status = 'assigned'` + WhatsApp via `sendWhatsAppAlert`

### Proposed share-refactor

Extract steps 1-4 into new `services/matching-engine.service.ts`:

```
export interface MatchCriteria {
  roleType: string;
  skillsRequired?: string;
  certificationsRequired?: string;
  location?: string;
}

export interface MatchOptions {
  excludeWorkerIds?: string[];
  topK?: number;
  useAI?: boolean;
}

export async function computeMatchScores(
  criteria: MatchCriteria,
  options: MatchOptions,
  tenantId: string
): Promise<ScoredMatch[]>
```

Then refactor:
- `routes/matching.ts:43` calls `computeMatchScores(criteria, { topK: 5, useAI: true }, tenantId)` instead of inline — preserves existing inbound-job-request path
- New `services/no-show.service.ts` calls `computeMatchScores(derivedCriteria, { excludeWorkerIds: [noShowWorkerId], topK: 3, useAI: true }, tenantId)` when a no-show event fires

### Share boundary

| Aspect | WorkerMatching path | AC-41 path |
|---|---|---|
| Trigger | Inbound client request (job_requests row) | No-show event (shifts past grace period) |
| Criteria source | job_requests.role_type + skills_required + location | shifts row + derived from shift_slot/site/roleType |
| Result storage | worker_matches table (status='suggested') | no_show_events.replacement_match_scores JSONB |
| Result presentation | WorkerMatching.tsx dashboard page | Coordinator alert + admin UI inline |
| Assignment trigger | PATCH /matching/requests/:id/assign | TBD — could be same PATCH route or new no-show-resolution route |

**Same scoring engine → different triggers → different storage.**

### Refactor risk

The refactor changes one existing route (`POST /matching/requests/:id/match`). Phase B WU-A1 first action: smoke-test against existing WorkerMatching.tsx with the same input + output shape before merging. Behavioral parity is the success criterion.

---

## Escalation cascade architecture

### Reusable pattern from escalation-engine.service.ts

The existing engine (proven, scheduler-driven):
- 1 day overdue → push notification to all
- 3 days overdue → WhatsApp to coordinator
- 7 days overdue → email to T1 executive + push alert

Scoped to `legal_cases` SLA breaches. Adapt for shift events.

### AC-41 escalation chain proposal (mirrors pattern)

For shift events:
- **Grace period elapsed** (e.g., 15 minutes after shift_start without checkin) → worker auto-message (5 response options) — **gated on AC-43**
- **Threshold 2** (e.g., 30 minutes) → coordinator push + WhatsApp (Tier4Home + sendWhatsAppAlert)
- **Threshold 3** (e.g., 60 minutes) → manager push + WhatsApp (T2/T3 ManagerHome surface)
- **No-call no-show** (e.g., end-of-shift without resolution) → trigger replacement-suggestion + log no_show_events row in 'Escalated' state

Thresholds + grace defaults validated by AC-35 operator interviews (coordinator-vs-manager timing).

### Architecture options

**Option A — extend escalation-engine.service.ts** to query shift events alongside legal_cases.

**Option B — new `services/no-show-escalation.service.ts`** mirroring the pattern, scoped to shift events.

**Recommendation: Option B.** Separation of concerns. escalation-engine.service.ts is case-SLA-specific (`legal_cases` + sla_deadline). Mixing shift events makes both services harder to test. New service mirrors structure, runs on same scheduler.

### State machine implementation

The 10 vision states require enum-or-text column + transition rules. Implement at **service level** (not DB triggers) for:
- Testability (Vitest unit tests over state transitions)
- Explicit transition validation (e.g., Scheduled → Checked-in OR Scheduled → Late risk; not arbitrary state jumps)
- Visibility (state diagram lives in service file, not DDL)

### Configurable rules surface

**Recommendation: inline in AC-41 Phase B for v1.** Schema: `no_show_rules` table per-tenant with columns (grace_period_minutes, threshold_2_minutes, threshold_3_minutes, channel_coordinator, channel_manager). Admin UI: small config card in Manager dashboard (AC-48 integration). If config scope grows (multiple rule sets, conditional rules, time-of-day variation), extract as AC-52 stub.

---

## Cross-AC overlap map (9 ACs touch AC-41 — genuinely a hub)

| AC | Type | Relationship | Phase B effect |
|---|---|---|---|
| AC-35 | gate informer | thresholds validated by operator interviews | informs WU-A4 + WU-C1 |
| AC-42 | downstream consumer | reliability points consume no-show events as signal | AC-42 Phase B depends on AC-41 events existing |
| AC-43 | gate | worker-facing automatic message + reply UX gated on worker-facing AI safety | gates WU-B1 |
| AC-44 | downstream consumer | repeated-pattern detection + internal AI routing | AC-44 Phase B depends on AC-41 |
| AC-45 | gate | optional client-company notification gated on client contract + AC-49 | gates WU-B4 |
| AC-47 | data provider | time/site intelligence is the check-in source-of-truth | AC-41 reads AC-47 attendance facts |
| AC-50 | gate | penalty boundaries — what disciplinary actions are legal | gates WU-B2 + WU-B3 |
| AC-51 | discipline | admin escalation routes MUST role-gate correctly | discipline applied during WU-A5 (avoid new evidence) |
| WorkerMatching (no AC#) | mandatory share | scoring service refactor | shared via WU-A1 |

**Architecture work (~5 WU) is ungated. Worker-facing message + penalty + client comms + AI patterns are gated downstream.**

---

## Phase B effort scope (work units, not hours)

### UNGATED architecture work (5 WU — ship first)

- **WU-A1** — Refactor `matching.ts` scoring into shared `services/matching-engine.service.ts`. Smoke-test WorkerMatching path for behavioral parity.
- **WU-A2** — Schema: `no_show_events` table (state column + grace_started_at + threshold_2_at + threshold_3_at + replacement_match_scores JSONB + resolved_at + resolved_by) + `no_show_rules` config table.
- **WU-A3** — Core service: `services/no-show.service.ts` — detect missing checkins by scheduler poll, fire state transitions, store events. Vitest unit tests over state machine.
- **WU-A4** — Escalation service: `services/no-show-escalation.service.ts` mirroring escalation-engine pattern. Channel routing via existing push/WhatsApp/email infrastructure (channel choice deferred to AC-43 framework).
- **WU-A5** — Routes: GET `/no-show-events` (admin list, requireRole) + GET `/no-show-events/:id` (detail) + PATCH `/no-show-events/:id/resolve` (resolve) + GET `/workers/:id/no-show-history` (per-worker view). Role-gating discipline mandatory (avoid AC-51 evidence).

### GATED downstream work (4 WU)

- **WU-B1** — Worker-side automatic message with 5 response options + reply tracking — **gated on AC-43** worker-facing AI safety + channel decisions.
- **WU-B2** — Penalty/reward trigger integration — **gated on AC-50** Yulia legal-input clarifying allowed actions.
- **WU-B3** — Repeated-pattern detection — **gated on AC-44** internal AI service (consumes AC-41 events + AC-47 intel).
- **WU-B4** — Optional client-company notification trigger — **gated on AC-45** per-client contract + **AC-49** Client Contact role.

### OPERATOR-INFORMED work (2 WU)

- **WU-C1** — Threshold defaults (grace period, threshold-2, threshold-3 timing) — confirmed via AC-35 operator interviews.
- **WU-C2** — Admin UI for configuring no-show rules — inline in Manager dashboard (AC-48 integration). If scope grows, extract as AC-52 stub.

**Total: 5 ungated + 4 gated + 2 operator-informed = ~11 work units.** Architecture (5 WU) ships first as foundation; downstream layers integrate as their gates clear.

---

## Verdict reasoning: YELLOW

**Why not GREEN:** 5 net-new architecture work units + 10-state machine + cross-AC dependency network (9 ACs touch) is substantial. Not "extend existing" — genuinely new module.

**Why not RED:** Three rich Tier-1 stacks (WorkerMatching scoring + escalation-engine pattern + notification channels) reduce design risk significantly. The matching share-pattern is clean; the escalation pattern is proven; the channel infrastructure is wired. Architecture composition not greenfield reinvention.

YELLOW captures: substantial new architecture with proven templates and clear gating boundaries.

---

## Phase B gating rule

- **WU-A1 through WU-A5 (architecture)** — UNGATED. Ship Day 31+ as 5 atomic work units. Foundation layer.
- **WU-B1 (worker-facing message)** — gated on **AC-43** Phase A framework decisions.
- **WU-B2 (penalty integration)** — gated on **AC-50** Yulia legal-input.
- **WU-B3 (pattern detection)** — gated on **AC-44** Phase B service.
- **WU-B4 (client comms)** — gated on **AC-45** + **AC-49**.
- **WU-C1 (thresholds)** — informed by **AC-35** interviews.
- **WU-C2 (admin config UI)** — informed by **AC-35**; may spawn **AC-52** if scope grows.

**Cross-AC unblock effect:** AC-41 WU-A3 (no_show_events stream existing) unblocks AC-42 Phase B (reliability points) + AC-44 Phase B (pattern detection consumes AC-41 events). AC-41 architecture is high leverage for the broader vision program.

---

## Phase B sequencing rule

1. **WU-A1 first** — matching.ts refactor. Atomic commit. WorkerMatching behavioral parity verified (curl test or Vitest snapshot).
2. **WU-A2 next** — schema + rules config. Atomic commit. `CREATE TABLE IF NOT EXISTS` discipline.
3. **WU-A3 then** — core service + state machine + Vitest tests. Atomic commit. State machine logic explicit + unit-tested.
4. **WU-A4 then** — escalation service (mirrors escalation-engine.service.ts pattern). Atomic commit. Scheduler integration tested.
5. **WU-A5 then** — routes. Atomic commit. Role-gating from day 1 (avoid AC-51 evidence).
6. **WU-C1** — threshold defaults validated after AC-35 interviews. Small config commit.
7. **WU-B1 through WU-B4** — as gates clear. Atomic per-WU commits. Each smoke-validated.
8. **WU-C2** — admin UI inline; extract to AC-52 only if scope grows beyond simple config card.

One commit per work unit. Smoke-validate after each. State machine Vitest tests mandatory (no shortcuts).

---

## Phase B first-action checklist (per work unit)

1. Re-read `matching.ts` lines 43-188 + `escalation-engine.service.ts` first 40 lines + push.ts route signatures + WorkerMatching.tsx use-of-scoring before any work. These are the templates.
2. For WU-A1 refactor: `git diff` matching.ts inline scoring against extracted service function for behavioral parity. Run smoke-test (create job request, call /match, verify same top-5 output).
3. For WU-A2 schema: `CREATE TABLE IF NOT EXISTS no_show_events ... no_show_rules`. All columns `ADD COLUMN IF NOT EXISTS`. Index on (tenant_id, state, shift_start_at).
4. For WU-A3 state machine: explicit transition validation (`canTransition(from, to)`) + Vitest tests covering all 10 states × valid transitions. Defer time-zone handling questions to AC-43 design decisions.
5. For WU-A4 escalation: scheduler hook via `lib/scheduler.ts` pattern. Channel selection abstracted (placeholder for AC-43 framework).
6. For WU-A5 routes: `requireRole(...)` on all admin routes from day 1. Worker-self routes use `requireAuth` + worker-scope filter only.
7. For i18n: add no-show event state labels + threshold names to BOTH `en.json` and `pl.json` per CLAUDE.md Bilingual Architecture.

---

## Anti-hallucination caveats

- **"Zero no-show schema"** — verified by grep, zero matches for `no_show` / `noshow` / `attendance_event` / `shift_attendance`.
- **WorkerMatching scoring details** — verified by reading matching.ts lines 43-188 verbatim. Scoring weights (+20 spec / +15 loc / +10 compliance / etc.) are exact, not approximate.
- **escalation-engine.service.ts 1/3/7-day chain** — verified by reading service header comment + first 40 lines. Whether the actual implementation matches the comment NOT deep-audited; Phase B WU-A4 first action verifies before mirroring.
- **State machine 10 states** — sourced from chat-Claude's vision summary. If the original vision document specifies different states or different counts, Phase B WU-A3 first action confirms canonical list.
- **Cross-AC dependency network (9 ACs)** is my synthesis based on vision-to-AC map (commit `ad8a78e`) + this audit. Not yet validated against AC-42 / AC-43 / AC-44 / AC-45 / AC-50 Phase A audits (which don't exist yet). When those audits land, cross-AC gating should be cross-checked.
- **Polish Labour Code reference** for AC-50 gate is established in Day 30 Scoping audit + AC-39 audit. Yulia confirms before WU-B2 builds.
- **Threshold defaults (15 / 30 / 60 minutes example)** are illustrative only; AC-35 operator interviews provide real defaults.
- **`worker_matches` table** existence inferred from matching.ts INSERT statements; schema not directly read in this audit (it's the existing table the matching path writes to; AC-41 storage uses NEW `no_show_events.replacement_match_scores JSONB` instead).

---

## Cross-AC notes (consolidation)

- **AC-41 architecture work unblocks AC-42 + AC-44 downstream.** High leverage for vision program.
- **Matching engine refactor is a shared infrastructure change** affecting one existing route — needs behavioral parity verification before merge.
- **Escalation pattern is replicate-not-extend** — keep escalation-engine.service.ts focused on case SLA; new service for no-show events.
- **AC-51 discipline applies from WU-A5** — admin routes role-gated correctly from day 1, no evidence added.
- **Worker-facing messages (WU-B1) are the AC-43 first big consumer** — AC-41 + AC-39 + AC-40 all want worker-facing comms; AC-43 framework must scope to handle all three.
- **AC-50 legal-input batching opportunity:** Yulia covers AC-50 (penalty) + AC-39 item 8 (leave cutoffs) + AC-41 WU-B2 (no-show penalty integration) in one conversation.

---

## Status

- **Phase A:** complete (this document).
- **Phase B Architecture (5 WU):** **UNGATED.** Ship Day 31+. Highest leverage in the vision program — unblocks AC-42 + AC-44 downstream.
- **Phase B Downstream (4 WU):** gated on AC-43 / AC-44 / AC-45 / AC-50.
- **Phase B Operator-informed (2 WU):** informed by AC-35.
- **Recommended Day 31+ posture:** AC-47 + AC-46 Wave 1 + AC-41 architecture are the three UNGATED workstreams. Sequence by Manish's preference; all three deliver foundational data layers downstream ACs will consume. AC-41 architecture has the highest cross-AC unblock count (AC-42 + AC-44 directly depend).
- **Template stacks:** matching.ts (scoring) + escalation-engine.service.ts (escalation chain) + notifications.ts/push.ts (channels) + scheduler.ts (cron) — re-read before WU-A1 starts.

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
