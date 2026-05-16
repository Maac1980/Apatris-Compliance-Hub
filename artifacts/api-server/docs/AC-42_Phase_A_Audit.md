# AC-42 Phase A Audit — Reliability / Points System

**Date:** 2026-05-16 (Day 30)
**Verdict:** YELLOW (substantial scope but template-rich via trust_scores stack reuse; most architecture ungated; legal gates contained to penalty subsection)
**HEAD at audit:** `1887044`
**Scope:** Read-only audit of trust_scores template + scoring service architecture + cross-AC data flow resolution + configurable rules + worker visibility surface. Resolves the AC-44-vs-AC-41 consumption question left open by prior audits. Mirrors AC-31 / AC-38 / AC-47 / AC-39 / AC-40 / AC-46 / AC-41 / AC-44 / AC-43 Phase A pattern.

---

## Current state summary

**trust_scores infrastructure is the full template stack for reliability/points.** A rich template exists:
- `trust_scores` table (line 1290) — exact shape AC-42 needs: `worker_id + score INTEGER + breakdown JSONB + calculated_at + version + tenant_id`
- 4 trust routes: `POST /trust/calculate/:workerId` (per-worker recalc) + `POST /trust/calculate-all` (batch) + `GET /trust/scores` (list) + `GET /trust/scores/:workerId/history` (**history endpoint already exists**)
- `TrustScores.tsx` (dashboard) with PLATINUM/GOLD/SILVER/BRONZE tier display + Recharts visualization + per-worker drill-down
- `TrustTab.tsx` (workforce-app) — worker-facing trust score surface already shipped

**But trust_scores is AI/trust-domain, not attendance-behavior.** AC-47 audit recommended Option C separation: AC-47 produces attendance facts; AC-42 consumes them; separate concerns. This audit confirms the recommendation: AC-42 needs a parallel `reliability_points` table (mirror trust_scores schema) — same pattern, different writer, different operator-mental-model.

**Configurable rules infrastructure does NOT exist.** Zero matches for `rules` / `policies` / `tenant_config` tables. This is genuinely net-new.

AC-42 is therefore **architecture + 3 net-new tables + scoring service + rule engine + 2 new frontend surfaces** — substantial scope, but with rich template patterns (trust_scores schema + tier display + history endpoint + worker-facing tab pattern). Most work is ungated; only penalty-rule subsection waits on Yulia legal-input.

---

## Per-feature inventory (against vision Module 2)

| Vision feature | Built | Partial | New build | Event source | Notes |
|---|---|---|---|---|---|
| Request leave in advance (reward) | — | — | new rule handler | AC-39 `leave.requested_early` | leave_requests row created with `start_date - created_at ≥ N days` |
| Inform absences on time (reward) | — | — | new rule handler | AC-41 `absence.notified_on_time` | derived from no-show event + early notification |
| Low no-show rate (reward) | — | — | new rule handler (window-based) | AC-41 events history + AC-44 patterns | rolling 30-day window |
| Good punctuality (reward) | — | — | new rule handler | AC-41 events + AC-47 attendance facts | weekly streak |
| Completing full assigned weeks (reward) | — | — | new rule handler | AC-47 attendance facts | per-week aggregation |
| Covering urgent shifts voluntarily (reward) | — | — | new event type + rule handler | new event source (shift volunteer) | event source TBD |
| Attending required meetings / document submissions (reward) | — | — | new event types + rule handlers | new event sources (meeting attendance + document submit) | event source TBD |
| Convert good planning → points (transformation rule) | — | — | new rules engine | configurable rules table | reward subset (ungated) |
| Convert attendance streaks → rewards (rolling-window rule) | — | — | new rule + cron evaluator | rolling 30/60-day windows | scheduled handler |
| Convert unused flexible leave → bonus (legal-gated) | — | — | gated on AC-50 + Yulia legal review | leave_requests at end-of-year | **legal-gated** |
| Tier display (worker-facing) | partial | TrustTab.tsx pattern exists | new ReliabilityTab.tsx mirroring TrustTab | trust_scores + tier color map | template reuse |
| Why-points-changed history (audit trail) | partial | trust history endpoint exists | new reliability_events log table + per-worker history view | reliability_events | template extends |
| Warning before penalty | — | — | gated on AC-43 worker-comms framework | configurable rules with notification trigger | **gated on AC-43** |

---

## Tier breakdown

**Tier 1 — built, directly reusable (4 stacks):**
- `trust_scores` table schema (mirror for `reliability_points` shape)
- `routes/trust.ts` 4-route pattern (mirror for `reliability` routes)
- `TrustScores.tsx` dashboard tier display + Recharts visualization
- `TrustTab.tsx` worker-facing pattern (mirror for `ReliabilityTab.tsx`)

**Tier 2 — built, needs adaptation:**
- History endpoint pattern (extend to event-log shape with reason text per point change)

**Tier 3:** None.

**Tier 4 — net-new (scoring engine + rules):**
- `reliability_points` table (parallel to trust_scores)
- `reliability_rules` table (configurable rules)
- `reliability_events` table (event log — every point change with reason)
- `services/reliability-points.service.ts` (scoring engine)
- `services/reliability-rules.service.ts` (rule lookup + delta computation)
- `ReliabilityAdmin.tsx` (dashboard rule config UI)
- Cron service for weekly + monthly recompute

---

## Scoring service architecture proposal (the critical cross-AC data flow decision)

Three options for AC-42 event consumption:

### Option A — AC-42 consumes AC-44 alerts (high-level derived patterns)

Pro: AC-44 already does pattern detection. Con: AC-42 misses raw events (single leave-on-time event that should award immediate points doesn't generate an AC-44 alert because it's not a "pattern").

### Option B — AC-42 consumes AC-41 events directly (raw events)

Pro: AC-42 sees every event for fine-grained scoring. Con: AC-42 has to re-implement pattern detection that AC-44 already does.

### Option C (RECOMMENDED) — AC-42 consumes BOTH — AC-41 for raw events + AC-44 for derived patterns

Pro: full coverage + separation of concerns. Con: dual-consumer pattern slightly more complex.

**Recommended dispatch:**
```
AC-41 raw events           AC-44 derived alerts (lateness pattern,
("leave_requested_early"   no-show pattern, etc.)
"shift_checked_in_on_time"          │
"shift_completed"           )       │
            │                       │
            ▼                       ▼
       reliability-rules.service.ts (rule lookup)
                       │
                       ▼
       reliability-points.service.ts (apply delta + log event + recompute snapshot)
                       │
                       ▼
       Storage: reliability_events log + reliability_points snapshot
                       │
                       ▼
       Notification: AC-43 worker-comms (if rule.notify_worker = true)
                       │
                       ▼
       Operator: AC-48 ManagerHome distribution widget
```

**Boundary rules:**
- AC-41 events fire reliability handlers for per-event scoring (e.g., +2 points for leave_requested_early with 14+ days notice)
- AC-44 derived alerts fire reliability handlers for pattern scoring (e.g., +5 streak bonus for 3 consecutive on-time shifts)
- Same scoring service entry point — `applyReliabilityRule(event, rule, worker, tenantId)` — used by both registry instances
- Mirrors AC-44 registry pattern + Option C registry-share decision in AC-43 (consistent architecture across AC-41 / AC-42 / AC-43 / AC-44)

**Resolves prior audit open question:** AC-44 audit flagged whether AC-42 consumes AC-44 alerts or AC-41 events. This audit answers: BOTH, via registered handlers in both registries.

---

## Temporal model proposal

The key design decision per Day 30 Scoping audit. Recommended:

| Concern | Recommendation |
|---|---|
| **Storage granularity** | Per-event log (`reliability_events`) — every score change with reason + timestamp + source_event_id |
| **Snapshot granularity** | Per-worker current_score (`reliability_points`) — fast lookup, recomputed incrementally on event + cron weekly recompute |
| **Aggregation window** | Rolling 30-day primary; per-month snapshot for "previous month tier" |
| **Worker tenure context** | Separate `tenure_days` column on reliability_points (computed from workers.created_at); new workers (< 30 days) see same points but different tier thresholds (handicap factor configurable per tenant) |
| **Recompute trigger** | Event-driven (immediate for worker feedback) + cron-driven weekly + monthly (for trend correction + new-window evaluation) |
| **Policy versioning** | rules.version + events.applied_rule_version columns — rule changes don't retroactively apply |

**Worker mental model:** "My points reset rolling 30 days, recalculated continuously. New-worker handicap protects me for first month."

**Operator mental model:** "Per-worker current score (rolling), tier distribution (current), monthly snapshot (previous-month tier for trend analysis)."

---

## Configurable rules architecture

### Schema

```
CREATE TABLE IF NOT EXISTS reliability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  event_type TEXT NOT NULL,           -- e.g., 'leave.requested_early', 'shift.checked_in_on_time'
  trigger_condition JSONB,             -- e.g., {min_advance_days: 14}
  points_delta INTEGER NOT NULL,
  window_days INTEGER,                  -- rolling window for streak rules; NULL = single-event
  enabled BOOLEAN DEFAULT TRUE,
  legal_category TEXT CHECK (legal_category IN ('reward','neutral','penalty')),
  notify_worker BOOLEAN DEFAULT FALSE,
  worker_message_template TEXT,         -- i18n key for AC-43 message
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_reliability_rules_tenant ON reliability_rules(tenant_id, enabled);
CREATE INDEX IF NOT EXISTS idx_reliability_rules_event ON reliability_rules(event_type);

CREATE TABLE IF NOT EXISTS reliability_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  source_event_type TEXT NOT NULL,
  source_event_id UUID,
  rule_id UUID REFERENCES reliability_rules(id),
  applied_rule_version INTEGER,
  points_delta INTEGER NOT NULL,
  reason TEXT,
  legal_category TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reliability_events_worker ON reliability_events(worker_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS reliability_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL UNIQUE REFERENCES workers(id) ON DELETE CASCADE,
  current_score INTEGER DEFAULT 0,
  tier TEXT,                            -- BRONZE/SILVER/GOLD/PLATINUM
  tenure_days INTEGER DEFAULT 0,
  monthly_snapshot_score INTEGER,       -- previous month
  breakdown JSONB DEFAULT '{}',
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_reliability_points_tenant ON reliability_points(tenant_id, current_score DESC);
```

**Mirror trust_scores schema** for current_score + tier + breakdown + version. Add tenure_days + monthly_snapshot_score for vision's per-month + new-worker requirements.

### Rule storage decision

- Recommendation: separate `reliability_rules` table (not JSON config column)
- Reason: queryable + version-trackable + per-tenant overrides per rule + admin-UI-friendly

### Admin UI surface

- v1: inline in Manager dashboard via AC-48 integration (Phase B WU-C3) — small config card per rule
- If scope grows (multi-tenant rule variation, conditional rules, time-of-day variation): extract as AC-52 sub-stub

### Policy versioning

- `reliability_rules.version` increments on each edit
- `reliability_events.applied_rule_version` records which version evaluated the event
- Rule changes don't retroactively apply; new events use new version, old events keep old version reference

---

## Worker-facing visibility surface

`ReliabilityTab.tsx` (workforce-app) mirrors TrustTab pattern:

| Surface element | Source |
|---|---|
| Current points + tier badge (BRONZE/SILVER/GOLD/PLATINUM mirror) | `reliability_points.current_score` + `tier` |
| 30-day breakdown chart (Recharts) | `reliability_events` aggregated by week |
| "Why points changed" history list | `reliability_events` per-worker recent events with `reason` |
| Upcoming opportunity hints | `reliability_rules.notify_worker = true` rules with prediction logic (e.g., "request leave by Friday for +2") |
| Warning-before-penalty surface | AC-43 worker-comms integration when penalty rule is about to fire |
| Tenure-bonus indicator | `reliability_points.tenure_days < 30` shows "new worker" badge with explanation |

Operator surface (`ReliabilityAdmin.tsx` dashboard page):
- Rule config UI (CRUD over reliability_rules per tenant)
- Tier threshold defaults (BRONZE/SILVER/GOLD/PLATINUM cutoffs configurable per tenant)
- Per-worker history view with audit-grade reason + applied_rule_version display

Manager surface (ManagerHome widget via AC-48):
- Tier distribution (top 5 / bottom 5)
- Recent significant point changes (last 7 days, threshold-filtered)

---

## Cross-AC overlap map (10 ACs touch AC-42)

| AC | Type | Relationship | Phase B effect |
|---|---|---|---|
| **AC-41** | event source | shift events directly consumed | 1 handler set (multiple event types from AC-41) |
| **AC-44** | event source | derived pattern alerts consumed | 1 handler set (multiple alert types from AC-44) |
| **AC-43** | delivery channel | worker points-change notification | `notify_worker` rules consume AC-43 worker-comms |
| **AC-47** | data source | attendance facts feed reliability rules (weekly attendance %) | enriches reliability scoring when AC-47 Phase B ships |
| **AC-39** | event source | leave-on-time events | 1 handler |
| **AC-46** | optional event source | complaint resolution behavior optional input | deferred — not required for v1 |
| **AC-50** | gate | penalty boundary legal — what point-deduction rules legal | gates penalty-rule WU only (rewards ungated) |
| **AC-31** | worker context | worker.id + name + tenure_days for context | uses workers table + new tenure_days column |
| **AC-48** | downstream | Manager dashboard surfaces tier distribution | WU-C3 integration |
| **AC-51** | discipline | admin rule-config routes role-gated correctly | applied at WU-A7 |

---

## Phase B effort scope (work units, not hours)

### UNGATED architecture work (10 WU — ship first)

- **WU-A1** — `reliability_points` table (mirror trust_scores schema + tenure_days + monthly_snapshot_score columns)
- **WU-A2** — `reliability_rules` table (configurable rules with legal_category + notify_worker)
- **WU-A3** — `reliability_events` table (event log + applied_rule_version for versioning)
- **WU-A4** — `services/reliability-points.service.ts` (scoring engine: snapshot recompute + tier assignment + tenure handicap)
- **WU-A5** — `services/reliability-rules.service.ts` (rule lookup + delta computation + dispatch entry point)
- **WU-A6** — Event handler registration: 1 handler set for AC-41 events (registers with AC-41 event stream) + 1 handler set for AC-44 alerts (registers with AC-44 registry) + 1 handler set for AC-39 leave events (registers with AC-39 leave events) — Option C dual-consumer pattern
- **WU-A7** — Routes: `GET /reliability/scores` (list, admin) + `GET /workers/:id/reliability` (per-worker, role-gated worker-self OR admin) + `GET /workers/:id/reliability/history` (event log) + `POST/PATCH /admin/reliability-rules` (rule CRUD, admin-only). Role-gated from day 1 (avoid AC-51 evidence).
- **WU-A8** — Cron service for weekly + monthly snapshot recompute (extends scheduler.ts)
- **WU-A9** — `ReliabilityTab.tsx` (workforce-app) — worker-facing view mirroring TrustTab pattern
- **WU-A10** — `ReliabilityAdmin.tsx` (dashboard) — admin rule config + tier threshold defaults UI

### GATED on AC-50 legal (1 WU)

- **WU-B1** — Penalty rules (point deductions) — config space gated on Yulia legal-input clarifying what point-deduction rules are legal under Polish Labour Code Art. 87 + Art. 108

### GATED on AC-43 (1 WU)

- **WU-B2** — Points-change notifications via AC-43 worker-comms layer (consumes `reliability_rules.notify_worker` flag + worker_message_template)

### OPERATOR-INFORMED (3 WU)

- **WU-C1** — Default reward rules baseline (which behaviors get how many points — Yulia + Akshay input)
- **WU-C2** — Tier threshold defaults (BRONZE/SILVER/GOLD/PLATINUM cutoffs — informed by operator priority)
- **WU-C3** — ManagerHome widget integration (AC-48) — tier distribution display

**Total: 10 ungated + 2 gated + 3 operator-informed = 15 work units.**

---

## Verdict reasoning: YELLOW

**Why not GREEN:** 10 ungated architecture WU + 3 net-new tables + scoring service + rule engine + 2 new frontend surfaces is substantial. Configurable rules engine + temporal model + tenure handicap are real design problems.

**Why not RED:** trust_scores template stack (table + 4 routes + tier display + worker-facing tab) is directly reusable. Pattern is proven. Most work is composition not invention. Legal gates are contained to specific WU subsets (penalty rules + worker notification). The "consume AC-44 vs AC-41" cross-AC question — left open by prior audits — is resolved by Option C (BOTH via registered handlers).

YELLOW captures: substantial new domain (reliability), template-rich pattern (trust_scores), clean gating boundaries (most ungated).

---

## Phase B gating rule

- **WU-A1 through WU-A10 (architecture)** — UNGATED. Ship Day 31+ as 10 atomic work units. Reward rules (legal_category = 'reward') ship freely; penalty rules deferred to WU-B1.
- **WU-B1 (penalty rules)** — gated on **AC-50** Yulia legal-input.
- **WU-B2 (worker notifications)** — gated on **AC-43** Phase B WU-A5 (worker-comms-routing service).
- **WU-C1 (default reward rules)** — informed by **AC-35** operator interviews + Yulia legal-input batching.
- **WU-C2 (tier thresholds)** — informed by **AC-35**.
- **WU-C3 (ManagerHome widget)** — coordinated with **AC-48** Phase B.

**Cross-AC unblock effect:** AC-42 architecture is downstream of multiple ACs (consumes events from AC-41 + AC-44 + AC-39). Doesn't unblock other ACs but is the "operator-visible reward surface" workers see. Shipping AC-42 architecture before AC-41 Phase B WU-A3 events stream means events queue up but get scored once stream is live.

---

## Phase B sequencing rule

1. **WU-A1, WU-A2, WU-A3** — schema first. Three atomic commits (`CREATE TABLE IF NOT EXISTS` discipline). Foundation layer.
2. **WU-A4, WU-A5** — services next. Scoring engine + rule engine. Vitest unit tests over rule evaluation + delta computation + tier assignment.
3. **WU-A6** — event handler registration. Wait until AC-41 / AC-44 / AC-39 register-points exist (could ship with placeholder if not).
4. **WU-A7** — routes. Role-gated from day 1.
5. **WU-A8** — cron service. Hooks into existing `lib/scheduler.ts` pattern.
6. **WU-A9** — ReliabilityTab.tsx (workforce-app). Mirrors TrustTab.
7. **WU-A10** — ReliabilityAdmin.tsx (dashboard). Admin rule config UI.
8. **WU-C2, WU-C1** — operator-informed defaults from AC-35 interviews.
9. **WU-B1** — penalty rules once AC-50 legal-input clears.
10. **WU-B2** — worker notifications once AC-43 Phase B WU-A5 ships.
11. **WU-C3** — ManagerHome widget integration when AC-48 Phase B scoping clears.

One commit per WU. Smoke-validate after each. Vitest tests mandatory for services (no shortcuts on rule evaluation logic).

---

## Phase B first-action checklist (per work unit)

1. Re-read `trust_scores` schema (init-db.ts:1290) + `routes/trust.ts` (lines 106-180) + `TrustScores.tsx` + `TrustTab.tsx` before any work. These are the templates.
2. For WU-A1 schema: `CREATE TABLE IF NOT EXISTS reliability_points` — mirror trust_scores shape + add tenure_days + monthly_snapshot_score. All columns `ADD COLUMN IF NOT EXISTS`.
3. For WU-A2 rules: confirm with Manish + Yulia which rule shapes are needed before designing trigger_condition JSONB. Start with the 5 reward rule types from vision Module 2.
4. For WU-A3 events: applied_rule_version + source_event_id required for audit + policy versioning.
5. For WU-A4 scoring service: tier assignment matches trust_scores tier display (PLATINUM ≥ 90, GOLD ≥ 75, SILVER ≥ 50, BRONZE < 50) initially — operator-configurable in WU-C2.
6. For WU-A6 event handlers: AC-41 events register with AC-41 event dispatcher (when AC-41 Phase B WU-A3 ships); AC-44 alerts register with AC-44 registry (Option C from AC-44 audit); AC-39 leave events register with AC-39 PATCH hook.
7. For WU-A7 routes: `requireRole(...)` on admin routes. Worker-self routes use `requireAuth` + worker-scope filter.
8. For WU-A9 ReliabilityTab: mirror TrustTab.tsx PLATINUM/GOLD/SILVER/BRONZE tier color map. Add "Why my points changed" history list via `GET /workers/:id/reliability/history`.
9. For i18n: tier labels + rule descriptions + worker-message templates in BOTH `en.json` and `pl.json` per CLAUDE.md Bilingual Architecture. Polish diacritics preserved.

---

## Anti-hallucination caveats

- **trust_scores template** — verified by reading init-db.ts:1290-1302 (exact schema) + routes/trust.ts route signatures + TrustScores.tsx first 25 lines (tier function with PLATINUM/GOLD/SILVER/BRONZE thresholds).
- **TrustTab.tsx existence** — verified by file list earlier in this session (Day 30 Scoping audit). Did NOT deep-read TrustTab.tsx body in this audit; assumes mirror pattern; Phase B WU-A9 first action reads TrustTab.tsx end-to-end.
- **Zero configurable-rules tables** — verified by grep returning empty for `rules` / `policies` / `tenant_config` patterns.
- **Option C cross-AC data flow** — design choice from this audit; resolves prior audits' open question. Validated against AC-44 audit (commit `170b038`) registry pattern + AC-41 audit event dispatch pattern. Not yet validated against AC-39 Phase B (which doesn't exist yet) — assumes AC-39 will expose leave-status-change events compatible with handler registration.
- **Polish Labour Code Art. 87 + Art. 108** reference for penalty boundaries carries through from AC-50 + AC-39 + AC-41 + AC-43 audits. Yulia confirms before WU-B1 builds.
- **Tier thresholds (90/75/50)** are illustrative — sourced from TrustScores.tsx tier function. Real defaults via WU-C2 operator-informed.
- **15 work units** is structured count; some WU could split or merge during Phase B kickoff. Real per-WU effort confirmed at per-commit start.
- **`reliability_events` event log shape** assumes per-event audit trail is sufficient for "why points changed" history. If vision requires more detail (e.g., before/after score snapshots per event), WU-A3 schema may add columns.

---

## Cross-AC notes (consolidation)

- **AC-42 architecture (10 WU) ungated; ships independently** but is downstream of multiple ACs (AC-41 + AC-44 + AC-39 events) — handlers can register early but only fire when those event streams exist.
- **Option C dual-consumer pattern** confirms consistency across AC-41 / AC-42 / AC-43 / AC-44 architecture: each scoring/orchestration AC handles event consumption via registry pattern (Option C from AC-44 + Option C from AC-43 + this audit's Option C for AC-42).
- **AC-50 legal-input batching opportunity grows to 6 items:** AC-50 (penalty engine) + AC-39 item 8 (leave cutoffs) + AC-41 WU-B2 (no-show penalty) + AC-43 consent text + AC-43 WU-B9 (sensitive penalty messages) + **AC-42 WU-B1 (penalty rules)**. Consolidate into single Yulia conversation.
- **AC-51 discipline applies from WU-A7** — admin rule-config routes role-gated correctly from day 1.
- **AC-52 candidate scope expands** — Day 30 drift discoveries now include: ai-provider drift (AC-44) + consent table drift (AC-43) + potentially trust_scores-vs-reliability_points naming consistency (AC-42). Could be folded into "drift consolidation + naming consistency" AC-52 if Manish prefers grouped hygiene.
- **AC-48 (Manager dashboard) integration** at WU-C3 — surfaces tier distribution. AC-48 Phase A audit hasn't run yet; recommend AC-48 Phase A sequence after AC-42 Phase A so AC-48 scoping has concrete AC-42 surface to integrate.

---

## Status

- **Phase A:** complete (this document).
- **Phase B Architecture (10 WU):** **UNGATED.** Ship Day 31+. Foundation: 3 schemas + 2 services + handlers + routes + cron + 2 frontends. Reward rules ship freely.
- **Phase B Gated (2 WU):** 1 on AC-50 (penalty rules legal-input); 1 on AC-43 Phase B WU-A5 (worker notifications).
- **Phase B Operator-informed (3 WU):** AC-35 interview output informs reward rule defaults + tier thresholds + ManagerHome integration.
- **Cross-AC resolved:** prior audits' open "AC-44 vs AC-41 consumption" question answered — Option C dual-consumer via registry handlers.
- **Recommended Day 31+ posture:** AC-42 is template-rich; trust_scores stack reuse makes architecture work fast. Sequence after AC-41 Phase B WU-A3 (events stream) so handlers actually fire when registered. Independent ship order: AC-47 + AC-46 Wave 1 + AC-41 architecture + AC-44 architecture + AC-43 architecture + AC-42 architecture are 6 ungated workstreams — Manish prioritization Monday after AC-35 interviews.
- **Template stacks:** `trust_scores` schema + `routes/trust.ts` + `TrustScores.tsx` + `TrustTab.tsx` + AC-44 registry pattern + `lib/scheduler.ts` — re-read before WU-A1 starts.

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
