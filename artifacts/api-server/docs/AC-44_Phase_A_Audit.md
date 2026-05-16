# AC-44 Phase A Audit — Internal AI Orchestration

**Date:** 2026-05-16 (Day 30)
**Verdict:** YELLOW (orchestration is net-new but rich existing AI primitives + OODA template + use-cases fallback pattern reduce design risk; handlers are small)
**HEAD at audit:** `a01fee0`
**Scope:** Read-only audit of existing AI infrastructure across 46 files + orchestration pattern proposal for vision Module 3 internal AI features. Mirrors AC-31 / AC-38 / AC-47 / AC-39 / AC-40 / AC-46 / AC-41 Phase A pattern.

---

## Current state summary

**AI infrastructure is rich (46 files use AI) but no internal-AI orchestration layer exists.** Each route invokes AI directly with its own prompt — no event-driven pattern, no registry, no dispatch. The existing `services/ai/provider.ts` is a thin abstraction over the Anthropic SDK; it's a primitive, not an orchestrator.

But three template stacks are directly relevant:

1. **Provider abstraction** — `services/ai/provider.ts` (current) + `services/ai-provider.ts` (older, drift) + `services/ai/use-cases.ts` (rule-based fallback + AI enhancement pattern, exemplified by `generateComplianceSummary`).
2. **Rate limiter** — `lib/ai-rate-limiter.ts` enforces per-tenant 50 Claude/hr + 10 Perplexity/hr. AC-44 handlers respect this.
3. **OODA orchestration** — `services/ooda-orchestration.service.ts` already implements REGULATORY + CASE domain orchestration with Observe → Orient → Decide → Act loop. Returns `OodaRecommendation[]` with action/reason/urgency/requiresHumanReview/confidence/linkedEntities. **This is the closest existing orchestration template AC-44 can borrow shape from.**

Additional adjacent stacks:
- `services/intelligence-router.service.ts` — 3-tier Q&A pipeline (KB → Perplexity → Claude) with `IntelligenceAnswer` shape (answer + sourceTier + confidence + citations).
- `services/escalation-engine.service.ts` — scheduler-driven escalation pattern (1/3/7-day chain) used in AC-41 audit too.
- `lib/complianceAI.ts` — Job 12 daily-legal-scan already does scheduled AI risk-scoring at 04:00 UTC (live on v303 per Day 28).

**Critical finding — DRIFT:** TWO ai-provider files exist. `services/ai-provider.ts` returns `string`; `services/ai/provider.ts` returns `{text, model}`. Both have "Centralized AI integration layer" docstrings. AC-44 Phase B WU-A1 must consolidate (recommend `services/ai/provider.ts` wins per structured-types pattern; `services/ai-provider.ts` removed).

---

## Existing AI infrastructure catalog (the foundation)

| Service / module | What it does | Surface | Reusable for AC-44? |
|---|---|---|---|
| `services/ai/provider.ts` | Provider abstraction (Anthropic Claude Sonnet 4.6) | low-level primitive | YES — handlers call `getProvider()` |
| `services/ai-provider.ts` (drift) | Older string-returning variant | low-level primitive | **CONSOLIDATE in WU-A1** |
| `services/ai/use-cases.ts` | Rule-based fallback + AI enhancement pattern | use-case template | YES — pattern for each AC-44 handler |
| `lib/ai-rate-limiter.ts` | Per-tenant 50/hr Claude + 10/hr Perplexity | cost protection | YES — handlers respect limit |
| `services/ooda-orchestration.service.ts` | REGULATORY + CASE OODA cycles, `OodaRecommendation[]` output | orchestration template | TEMPLATE REFERENCE (don't extend; mirror shape) |
| `services/intelligence-router.service.ts` | 3-tier KB→Perplexity→Claude pipeline | tiered-fallback template | YES — pattern for handlers that need tiered sources |
| `services/escalation-engine.service.ts` | Scheduler-driven SLA escalation chain | scheduler-handler template | YES — pattern for daily-digest handler |
| `lib/complianceAI.ts` (scoreWorkerRisk, scoreAllWorkers) | Per-worker risk scoring + Job 12 daily scan | existing operational handler | WRAP in WU-A4 as document-expiry AC-44 handler |
| `routes/ai-copilot.ts` | Operator-facing AI Copilot (query-triggered) | parallel surface | NOT AC-44 — query vs event invocation |
| `routes/ai.ts` (risk batch + summary) | Operator-triggered risk endpoints | parallel surface | NOT AC-44 — operator-triggered, not system-initiated |
| 24 inline-prompt routes (matching.ts, legal-kb.ts, contract-gen.ts, etc.) | Domain-specific AI calls | feature-specific | NOT directly reused — but pattern-consistent |

**Conclusion:** AI primitives are well-developed (provider + rate limit + fallback pattern + scheduler integration + OODA orchestration template). What's missing is a **registry/dispatch layer** that lets AC-44 events from other ACs route to specific handlers.

---

## Per-feature inventory (against vision Module 3)

| Vision feature | Built | Partial | New build | Source data | Notes |
|---|---|---|---|---|---|
| No-show alert (event-driven) | — | — | new handler | AC-41 events (Phase B WU-A3 stream) | gated AC-41 |
| Repeated lateness pattern (multi-event analysis) | — | — | new handler | AC-41 events history + AC-47 facts | gated AC-41 + AC-47 (or stub with hours_log) |
| Unresolved complaint alert | — | — | new handler | AC-46 case_status workflow | gated AC-46 Wave 1 |
| Document expiry risk | partial | Job 12 / complianceAI.ts already does scheduled scan | refactor into AC-44 handler pattern | hours_log + workers doc fields (existing) | small refactor — no new logic |
| Replacement needed | — | — | new handler + shared matching infrastructure | AC-41 events + AC-41's shared matching-engine service | gated AC-41 |
| Daily attendance digest | — | — | new scheduled handler | hours_log (today) + AC-47 facts (when ships) | ungated v1 (placeholder), richer post AC-47 |
| Site coverage warning | — | — | new handler | shifts + worker_availability (both exist today) | ungated |

**Plus implicit gaps:**

| Implicit gap | Surface | Notes |
|---|---|---|
| Provider drift consolidation | services/ai-provider.ts + services/ai/provider.ts | WU-A1 hygiene |
| No `internal_ai_alerts` table for surfacing handler outputs | none | WU-A3 net-new |
| No registry / dispatch pattern | none — direct route invocation today | WU-A2 net-new |
| Admin dismissal/acknowledge UX for alerts | none | WU-A7 net-new |
| Operator-priority surfacing (which alerts most matter) | none — depends on operator priority from AC-35 | WU-C1 operator-informed |

---

## Tier breakdown

**Tier 1 — built, reusable infrastructure (10 stacks):** provider abstraction, rate limiter, use-cases fallback pattern, scheduler, OODA template, intelligence-router tiered pattern, escalation-engine pattern, complianceAI Job 12 wrap-target, ai-copilot reference, 24 route-inline prompt patterns

**Tier 2 — built, needs adaptation:** document expiry handler (existing logic, refactor into handler shape)

**Tier 3 — schema/route partial:** None.

**Tier 4 — net-new (orchestration layer):** registry + dispatch + `internal_ai_alerts` table + 6 handlers + admin routes + dashboard hook

---

## Orchestration pattern proposal (the critical architecture decision)

Three options considered:

### Option A — Extend OODA orchestration to new domains

Add ATTENDANCE / COMPLAINT / COVERAGE domain types to existing `services/ooda-orchestration.service.ts`. Pro: reuse existing pattern. Con: dilutes OODA's legal-domain focus; existing OODA assumes legal_cases / regulatory_updates entity types; AC-44 events have different shape (operational not legal).

### Option B — Single big orchestrator service

New `services/internal-ai-orchestration.service.ts` with a switch statement routing event_type to handler. Pro: one entry point. Con: scales poorly (7+ handlers → growing switch); each new event type requires editing the orchestrator; testability suffers.

### Option C (RECOMMENDED) — Registry pattern

`services/internal-ai/registry.ts` maintains a Map<eventType, handler>. Handlers register themselves; dispatch is a lookup. Each handler is a small independently-testable module under `services/internal-ai/handlers/`.

```
services/internal-ai/
  registry.ts                    // register + dispatch
  types.ts                       // shared InternalAIEvent / AIHandler / AIAlert types
  handlers/
    no-show-alert.ts             // event: 'no_show.detected'
    lateness-pattern.ts          // event: 'attendance.pattern.weekly' (scheduler-driven)
    complaint-classification.ts  // event: 'complaint.submitted'
    complaint-unresolved.ts      // event: 'complaint.unresolved.sla'
    document-expiry.ts           // wraps Job 12 logic (scheduler-driven)
    replacement-needed.ts        // event: 'no_show.unresolved'
    daily-attendance-digest.ts   // scheduler-driven daily
    site-coverage-warning.ts     // scheduler-driven hourly or shift-start triggered
```

**Why Option C:**
- Each handler is independently testable (Vitest unit tests over handler logic, mocked event input)
- New event types add a new handler file + one `registry.register('event_type', handler)` line (no orchestrator surgery)
- Handler failures don't cascade (try/catch per handler in dispatch)
- Mirrors EventEmitter pattern familiar to Node/React devs
- Matches the loose-coupling of AC-44's role (consume events from many ACs, emit alerts to one surface)

**Handler contract** (registry.ts types):
```
export interface InternalAIEvent {
  type: string;              // e.g., 'no_show.detected'
  tenantId: string;
  payload: Record<string, unknown>;
  triggeredAt: Date;
  sourceAC: string;          // e.g., 'AC-41' (for audit trail)
}

export type AIHandler = (
  event: InternalAIEvent
) => Promise<AIAlert | null>;  // null = no alert worth surfacing

export interface AIAlert {
  alert_type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  payload: Record<string, unknown>;
  recommended_actions: string[];
  ai_generated: boolean;      // false for rule-only handlers
  source_event_type: string;
}
```

Handlers internally use `getProvider()` for AI calls, follow `use-cases.ts` fallback pattern (rule-based first, AI enhancement when available), respect `ai-rate-limiter.ts` per-tenant limits.

**Output sink:** new `internal_ai_alerts` table (alert_type + severity + payload JSONB + recommended_actions JSONB + ai_generated + source_event_type + tenant_id + created_at + dismissed_at + dismissed_by). Admin UI surfaces via WU-A7 routes; Manager dashboard hook via WU-C1.

---

## Integration point map

| Source | Event type | AC-44 handler | Gate |
|---|---|---|---|
| **AC-41** no-show detection | `no_show.detected` | `no-show-alert.ts` | AC-41 Phase B |
| **AC-41** lateness history | `attendance.pattern.weekly` (scheduler) | `lateness-pattern.ts` | AC-41 + AC-47 (or stub) |
| **AC-41** no-show unresolved | `no_show.unresolved` | `replacement-needed.ts` (uses shared matching-engine) | AC-41 Phase B |
| **AC-46** complaint submitted | `complaint.submitted` | `complaint-classification.ts` (called from AC-46 submit flow — same as AC-46 Wave 2 WU-B3) | AC-46 Wave 1 |
| **AC-46** complaint stale | `complaint.unresolved.sla` (scheduler) | `complaint-unresolved.ts` | AC-46 Wave 1 |
| **scheduler** (existing) | daily 04:00 | `document-expiry.ts` (wraps Job 12) | none |
| **scheduler** | daily morning | `daily-attendance-digest.ts` | none — placeholder data |
| **scheduler** | shift-start triggered / hourly | `site-coverage-warning.ts` | none |

**Parallel surfaces (separate from AC-44):**
- **AC-43** worker-facing AI — separate orchestration; may share provider/rate-limiter infrastructure but different safety profile (worker-facing requires GDPR consent path + channel decisions).
- **ai-copilot.ts** operator query AI — query-triggered (user asks question); AC-44 is event-triggered (system observes pattern). Different invocation pattern, different routes. Both can coexist.
- **complianceAI.ts** scoreWorkerRisk — wraps into AC-44 document-expiry handler at WU-A4, but doesn't replace operator-callable `/ai/risk/*` routes.

---

## Cross-AC overlap map

| AC | Type | Relationship | Phase B effect |
|---|---|---|---|
| AC-41 | event provider | no-show / lateness / replacement events | 3 handlers gated on Phase B WU-A3 events stream |
| AC-46 | event provider | complaint / unresolved-complaint events | 2 handlers gated on Wave 1 |
| AC-43 | parallel | worker-facing AI orchestration separate | infrastructure share (provider + rate limiter) |
| AC-47 | data provider | attendance facts for lateness pattern + digest | enriches AC-44 handlers when ships |
| AC-31 | worker context | every handler needs worker.id + .name | uses existing workers table |
| AC-42 | downstream consumer | reliability points may consume AC-44 alerts | OR consume AC-41 events directly (AC-42 Phase A decision) |
| AC-48 | downstream | Manager dashboard surfaces internal_ai_alerts | WU-C1 integration |
| AC-51 | discipline | admin alert routes role-gated correctly | applied at WU-A7 |

---

## Phase B effort scope (work units, not hours)

### UNGATED architecture work (7 WU — ship first)

- **WU-A1** — Consolidate ai-provider drift: keep `services/ai/provider.ts`; remove `services/ai-provider.ts`. Migrate callers (smoke-grep for `from "../services/ai-provider"` and update import paths). Behavioral parity verified.
- **WU-A2** — Registry + dispatch: `services/internal-ai/registry.ts` with `register(eventType, handler)` + `dispatch(event)`. Plus shared `types.ts` (`InternalAIEvent`, `AIHandler`, `AIAlert`).
- **WU-A3** — Schema: `internal_ai_alerts` table (alert_type + severity + payload JSONB + recommended_actions JSONB + ai_generated + source_event_type + tenant_id + created_at + dismissed_at + dismissed_by). Indexes on (tenant_id, created_at) + (tenant_id, dismissed_at IS NULL).
- **WU-A4** — Document expiry handler: wrap existing `complianceAI.ts` scoreWorkerRisk logic into `handlers/document-expiry.ts`. No new logic; AC-44 pattern compliance only.
- **WU-A5** — Daily attendance digest handler: scheduler-driven, consumes hours_log + workers list (today); richer when AC-47 ships. Stub-data acceptable for v1.
- **WU-A6** — Site coverage warning handler: shifts + worker_availability are existing today; handler analyzes coverage gaps.
- **WU-A7** — Admin routes: `GET /internal-ai/alerts` + `PATCH /internal-ai/alerts/:id/dismiss` (role-gated via `requireRole`, avoiding AC-51 pattern).

### GATED on AC-41 Phase B (3 WU)

- **WU-B1** — No-show alert handler (consumes `no_show.detected` events).
- **WU-B2** — Lateness pattern handler (consumes AC-41 history + AC-47 facts).
- **WU-B3** — Replacement needed handler (consumes AC-41 unresolved events + shared matching-engine service from AC-41 WU-A1).

### GATED on AC-46 Phase B Wave 1 (2 WU)

- **WU-B4** — Complaint classification handler (called from AC-46 submit flow — this IS AC-46 Wave 2 WU-B3 from AC-46 audit; shared work unit, executed once).
- **WU-B5** — Unresolved complaint alert handler (scheduler-driven; consumes AC-46 case_status workflow).

### OPERATOR-INFORMED (1 WU)

- **WU-C1** — Manager dashboard hook into `internal_ai_alerts` table (AC-48 integration). Operator priority informs which alert types surface most prominently.

**Total: 7 ungated + 5 gated + 1 operator-informed = ~13 work units.** Architecture work (7 WU) is the foundation; gated handlers are small additions on top.

---

## Verdict reasoning: YELLOW

**Why not GREEN:** Net-new orchestration layer (registry + dispatch + handlers + alerts table + admin routes) + ai-provider consolidation across 46-file footprint. Cumulative scope (~13 work units) is the largest in vision program so far.

**Why not RED:** Rich existing AI primitives reduce design risk substantially. OODA orchestration provides shape reference; use-cases.ts provides handler-shape pattern; rate limiter is wired; scheduler integration is proven. Each handler is small (1-3 work units worth of work) once registry exists. No novel architecture problem.

YELLOW captures: largest scope yet, but composition not invention.

---

## Phase B gating rule

- **WU-A1 through WU-A7 (architecture + 3 scheduled handlers)** — UNGATED. Ship Day 31+ as 7 atomic work units. Foundation + first 3 working handlers (document-expiry / daily-digest / coverage-warning) prove the registry pattern.
- **WU-B1, WU-B2, WU-B3** — gated on **AC-41 Phase B** (specifically WU-A3 no_show_events stream existing).
- **WU-B4, WU-B5** — gated on **AC-46 Phase B Wave 1**. WU-B4 is shared work unit with AC-46 Wave 2 WU-B3 — execute once, count under whichever AC's Phase B kicks off first.
- **WU-C1** — informed by **AC-35** operator interviews + **AC-48** Manager dashboard work.

**Cross-AC unblock effect:** AC-44 architecture ungated and ships independently. Doesn't block any AC; consumes from many.

---

## Phase B sequencing rule

1. **WU-A1 first** — ai-provider consolidation. Atomic commit. Test all 46 AI call sites still work (smoke: run any one AI route, verify response).
2. **WU-A2 next** — registry + dispatch + types. Atomic commit. Vitest unit tests over register/dispatch.
3. **WU-A3 then** — `internal_ai_alerts` schema. Atomic commit. `CREATE TABLE IF NOT EXISTS` discipline.
4. **WU-A4 then** — document-expiry handler (refactor). Atomic commit. Behavioral parity vs Job 12 verified.
5. **WU-A6 then** — site-coverage handler (data exists, simplest event-driven handler to prove pattern).
6. **WU-A5 then** — daily-attendance-digest handler (scheduled).
7. **WU-A7 then** — admin routes. Atomic commit. Role-gated from day 1.
8. **WU-B1-B3** — as AC-41 Phase B WU-A3 (events stream) ships.
9. **WU-B4-B5** — as AC-46 Phase B Wave 1 ships.
10. **WU-C1** — after AC-48 ManagerHome integration scoping.

One commit per work unit. Smoke-validate after each. Vitest unit tests mandatory for registry + each handler (no shortcuts).

---

## Phase B first-action checklist (per work unit)

1. Re-read `services/ai/provider.ts` + `services/ai-provider.ts` + `services/ai/use-cases.ts` + `services/ooda-orchestration.service.ts` first ~50 lines + `lib/ai-rate-limiter.ts` before any work. These are the template stack.
2. For WU-A1 consolidation: `grep -rn "services/ai-provider" artifacts/api-server/src` to find all callers; update each import; smoke-test any one AI route.
3. For WU-A2 registry: design `register(eventType, handler)` + `dispatch(event)` with try/catch per handler (failure of one ≠ cascade). Vitest tests over: register adds handler; dispatch fires correct handler; dispatch with no handler logs warning + continues.
4. For WU-A3 schema: `CREATE TABLE IF NOT EXISTS internal_ai_alerts`. All columns `ADD COLUMN IF NOT EXISTS`.
5. For WU-A4 document-expiry refactor: read `complianceAI.ts` scoreWorkerRisk + scoreAllWorkers; wrap as `handlers/document-expiry.ts` calling registry on detected risk; Vitest snapshot test for behavioral parity.
6. For WU-A7 routes: `requireRole(...)` on admin routes from day 1. Avoid AC-51 evidence creation.
7. For each handler: follow `use-cases.ts` pattern — rule-based first, AI enhancement when `getProvider()` available; never AI-only; respect `ai-rate-limiter.ts`.
8. For i18n: alert type labels + severity labels in BOTH `en.json` and `pl.json` per CLAUDE.md Bilingual Architecture.

---

## Anti-hallucination caveats

- **"46 files use AI"** — verified by `grep -rln "complianceAI|@anthropic-ai" | wc -l = 46`. Includes some duplicate counts (one file may match both patterns) — actual unique call sites probably 40-46. Order of magnitude correct.
- **TWO ai-provider files** — verified by direct file enumeration. The drift is real.
- **OODA orchestration template** — verified by reading services/ooda-orchestration.service.ts header + first 60 lines. Shape (`OodaRecommendation[]` with action/reason/urgency/etc.) is exact; whether full implementation matches docstring NOT deep-audited; Phase B WU-A2 first action verifies if borrowing more than shape.
- **`intelligence-router.service.ts` 3-tier pattern** — verified by reading first 50 lines. KB → Perplexity → Claude is exact; whether Tier 2 + Tier 3 functions are fully implemented NOT verified.
- **Registry pattern recommendation** — design choice from this audit; not validated against AC-43 (worker-facing) Phase A audit (which doesn't exist yet). When AC-43 Phase A lands, verify whether AC-43 shares the registry or maintains separate orchestration.
- **Vision Module 3 features (7 features)** sourced from save-prompt + Day 30 Scoping audit; not directly verified against original vision document text. WU-A2 first action confirms canonical list.
- **WU-B4 shared with AC-46 Wave 2 WU-B3** — verified by reading AC-46 audit (commit `57f1135`). Single work unit, counted once.
- **Handler effort sizing (1-3 WU each)** is rough — real per-handler effort confirmed at per-handler kickoff. Some handlers (lateness pattern with multi-event analysis) may exceed 3 WU; daily-digest may exceed if AC-47 facts shape requires translation.
- **`ai-copilot.ts` operator-query AI is separate** — verified by reading route signatures (`/ai/query`, `/ai/queries`, `/ai/status` — query-triggered not event-triggered).

---

## Cross-AC notes (consolidation)

- **AC-44 architecture (7 WU) is UNGATED and ships independently.** Doesn't block any AC; consumes from many.
- **3 handlers gate on AC-41 Phase B + 2 handlers gate on AC-46 Phase B Wave 1.** Same pattern as AC-40 (downstream consumer dependent).
- **WU-B4 is shared work** with AC-46 Wave 2 WU-B3 — executed once under whichever AC's Phase B kickoff first; the other's WU counted as "consumed."
- **AC-43 worker-facing AI is parallel orchestration** — shares provider + rate-limiter infrastructure but NOT registry/dispatch. AC-43 Phase A defines its own framework.
- **AC-51 discipline applies from WU-A7** — admin alert routes role-gated correctly from day 1.
- **AC-48 Manager dashboard integration (WU-C1)** is the operator surfacing path. Without WU-C1, alerts land in DB but operators don't see them. Recommend WU-C1 closes the loop early (after WU-A7 ships, even before all handlers wired).
- **Provider drift (WU-A1) is opportunistic hygiene** — could be split as a separate AC-52 if Manish prefers AC-44 to not own the consolidation. Recommend keep inline since AC-44 is the largest AI-consumer about to ship; cleanup-before-extend is cleaner than cleanup-later.

---

## Status

- **Phase A:** complete (this document).
- **Phase B Architecture (7 WU):** **UNGATED.** Ship Day 31+. Foundation + first 3 working handlers (document-expiry / daily-digest / coverage-warning).
- **Phase B Gated (5 WU):** 3 on AC-41 Phase B; 2 on AC-46 Phase B Wave 1.
- **Phase B Operator-informed (1 WU):** AC-48 ManagerHome integration.
- **Recommended Day 31+ posture:** AC-47 + AC-46 Wave 1 + AC-41 architecture + AC-44 architecture are four UNGATED workstreams. AC-44 architecture is largest (7 WU) but doesn't unblock other ACs directly — sequence after the unblock-leverage ACs (AC-41 + AC-46 Wave 1).
- **Template stacks:** `services/ai/provider.ts` + `services/ai/use-cases.ts` + `services/ooda-orchestration.service.ts` + `services/intelligence-router.service.ts` + `services/escalation-engine.service.ts` + `lib/ai-rate-limiter.ts` + `lib/complianceAI.ts` — re-read before WU-A1 starts.
- **Drift discovery:** TWO ai-provider files (services/ai-provider.ts vs services/ai/provider.ts) need consolidation as WU-A1. If preferred as separate hygiene, extract as **AC-52 ai-provider consolidation**.

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
