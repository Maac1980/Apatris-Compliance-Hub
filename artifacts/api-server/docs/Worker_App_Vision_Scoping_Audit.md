# Worker App Vision — Scoping Audit

**Date:** 2026-05-16 (Day 30)
**Verdict:** PROGRAM-scale (multi-AC), not single-AC
**HEAD at audit:** `eac7d8b`
**Scope:** Naming + classification + overlap detection ONLY. Not per-module deep audit. Per-AC Phase A audits sequenced over Day 31+, prioritized by AC-35 operator interview output.
**Audit time:** ~75 min.

---

## Vision summary (3-paragraph compression)

Manish surfaced a major product expansion: a worker-side mobile app with 5 tabs (Home / Hours / Leave / Documents / Help), 6 critical operational modules (no-show alert + penalty engine; reliability / points system; AI communication layer across worker + internal + optional client surfaces; worker issue / complaint engine; time / site intelligence; coordinator + manager dashboards), and 6 roles (Worker, Coordinator, Manager, Office Staff, Owner/Admin, optional Client Contact).

The vision shifts APATRIS from operator-only platform (current state — 9 fragmented dashboards consumed by Manish + Akshay + Yulia) to a multi-sided system where workers, coordinators, managers, and optionally client companies all interact. Worker-facing AI proactive communication (shift reminders, document expiry alerts, lateness reminders, payroll prompts) is a category change — the existing 50+ AI call sites are operator-facing.

The vision also introduces configurable penalty / reward rules (not hardcoded policy), which intersects Polish Labour Code Art. 87 (wage deduction limits) + Art. 108 (penalty procedure requirements) + EU Posted Workers Directive — making it the highest-risk module pending legal-input review from Yulia.

---

## Scale framing

| Comparison | Items | Phase B effort |
|---|---|---|
| AC-31 (worker profile tabs) | 4 tabs | ~14-21h |
| AC-38 (worker-link invariant) | ~95-105 surfaces | ~14-23h |
| **This vision** | 6 modules + 5 tabs + 2 dashboards + RBAC + penalty engine | **6-10× the scope of either** |

Treating this as a single AC or single Phase A would lose scope discipline. Treated here as a **program** spanning multiple new ACs (AC-39 through AC-50 stubs added this commit) plus extensions of existing ACs (AC-31, AC-35).

---

## Existing-surface findings (from grep-level enumeration)

The audit revealed the workforce-app already has **60+ tab components**, far richer than peer-reasoning assumed. Direct evidence:

| Vision element | Existing surface | Notes |
|---|---|---|
| Worker Home tab | `Tier5Home.tsx` | T5 = worker self-service tier; exists |
| Worker Hours tab | `TimesheetTab.tsx` + `routes/hours.ts` + `hours_log` table | Fully built |
| Worker Leave tab | `LeaveTab.tsx` + `/api/self-service/leave` + `leave_requests` table | **Fully functional** — fetch + form + list pattern. Vision adds: rule-driven cutoffs, balance display, lateness category. |
| Worker Documents tab | `DocsTab.tsx` + `DocUploadTab.tsx` + `routes/worker-files.ts` | Fully built upload + list |
| Worker Help tab | `MessagingTab.tsx` (operator-worker threads) | Primitive exists; AI assistant + categorization is the new part |
| Coordinator dashboard | `Tier4Home.tsx` (coordinator tier) | Exists |
| Manager dashboard | `ManagerHome.tsx` | **Fully built** with motion + i18n + sheets pattern; needs integration with new modules |
| Owner / Admin dashboard | `OwnerHome.tsx` + `Tier3Home.tsx` | Exists |
| Time / site intelligence | `site_geofences` + `gps_checkins` + `worker_availability` + `shifts` tables + `routes/gps.ts` | All signal sources built; aggregation/scoring layer is new |
| AI proactive comms (infrastructure) | `push_subscriptions` + `notification_log` tables + `escalation-engine.service.ts` + WhatsApp/SMS in 7 service files | Infrastructure exists (operator-facing); worker-facing proactive AI is the new design problem |
| Matching infrastructure | `routes/matching.ts` + `MatchingTab.tsx` + existing `WorkerMatching.tsx` dashboard page | No-show replacement suggestions MUST share this infra, not create competing engine |

**Tables that don't exist** (NEW BUILD schema required): no_show, reliability_points, complaints/issues, penalty_rules, reward_rules.

**Routes that don't exist** (NEW BUILD required): no-show / reliability / issue / penalty / reward / help-AI-assistant.

---

## Vision-to-AC map (actual)

| # | Vision item | Type | Upstream gate | Overlaps existing | T-size | AC# |
|---|---|---|---|---|---|---|
| 1 | Worker Home tab | EXTEND | AC-35 interviews | extends AC-35 worker-side home | S | **extends AC-35** |
| 2 | Worker Hours tab | EXTEND | none | extends `TimesheetTab.tsx` + `routes/hours.ts` | S | **extends existing** (no new AC) |
| 3 | Worker Leave tab improvements | EXTEND | none | extends `LeaveTab.tsx` (already functional); add cutoffs + balance + lateness category | S | **AC-39** |
| 4 | Worker Documents tab (worker-side) | EXTEND | AC-31 Phase B | extends AC-31 Documents tab as worker-side mirror | S | **extends AC-31** |
| 5 | Worker Help tab (AI assistant + categorized issues) | EXTEND | none | extends `MessagingTab.tsx` with AI assistant + categorization | M | **AC-40** |
| 6 | No-show alert + escalation cascade | NEW BUILD | AC-35 interviews + Yulia legal input | shares matching infra with `WorkerMatching.tsx` (mandatory) | L | **AC-41** |
| 7 | Reliability / points system | NEW BUILD | AC-35 interviews + Yulia legal review | feeds AC-41 + AC-50 | L | **AC-42** |
| 8 | AI proactive worker-facing comms | NEW BUILD | GDPR consent path + channel decision + worker-facing AI design discipline | extends push_subscriptions + notification_log infra | XL | **AC-43** |
| 9 | Internal AI (no-show alerts + lateness patterns + replacement + daily digest) | NEW BUILD | AC-41 | depends on AC-41 | L | **AC-44** |
| 10 | Optional client-company AI comms | NEW BUILD (optional) | client contract clarification per client | no overlap | M | **AC-45** |
| 11 | Worker issue / complaint engine (categorized + AI-classified + case tracking) | NEW BUILD | AC-31 Phase B (link-out to worker profile) + Help tab AC-40 | partial overlap with MessagingTab (primitive) | L | **AC-46** |
| 12 | Time / site intelligence (geofence + wrong-site + suspicious patterns + reliability score) | EXTEND | none | aggregation over existing site_geofences + gps_checkins + worker_availability + shifts | M | **AC-47** |
| 13 | Coordinator dashboard | EXTEND | AC-35 interviews | extends AC-35 Akshay welding-view + `Tier4Home.tsx` | M | **extends AC-35** |
| 14 | Manager dashboard refinement + integration | EXTEND | AC-35 interviews | extends existing `ManagerHome.tsx`; needs hooks for new modules (AC-41/42/44/47) | M | **AC-48** |
| 15 | Client Contact role (RBAC extension) | NEW BUILD | RBAC audit | extends existing 5-tier T1-T5 with 6th role | S | **AC-49** |
| 16 | Configurable penalty / reward engine | NEW BUILD | **LEGAL REVIEW REQUIRED (Yulia)** | feeds AC-41 (penalty cascade) + AC-42 (reward rules) | L | **AC-50** |

**Totals:**

- **12 new AC stubs** added (AC-39 through AC-50)
- **3 vision items extend existing surfaces** without new AC (Hours tab, Documents tab worker-side, Coordinator dashboard — already in AC-35 scope)
- **2 vision items extend AC-35** (Worker Home, Coordinator dashboard) — AC-35 home-screens scope grows
- **1 vision item extends AC-31** (Documents tab worker-side mirror) — AC-31 Phase B scope grows
- AC count: **38 → 50 total**

---

## Three risk-gated concerns (from Day 30 peer reasoning)

### (a) AC-50 — Configurable penalty / reward engine — RED RISK

"Configurable penalty / reward rules — not hardcoded policy" sounds clean. The real problem is **Polish labor law has specific rules about wage deductions, penalties, and performance management:**

- **Polish Labour Code Art. 87** limits what can be deducted from wages and requires worker consent for many deduction types.
- **Polish Labour Code Art. 108** codifies penalty types (reprimand, reproof, financial) with specific procedural requirements: hearing the worker, documentation, time limits before applying penalty, appeal mechanism.
- **EU Posted Workers Directive** adds protections for posted workers — host-country rules apply for some elements.

A configurable engine that lets the office set penalty rules without legal review is a compliance risk: someone could configure it to violate labor law.

**Yulia's input is essential here.** She may say *"we can't legally penalize for X without process Y"* or *"Polish law requires Z disclosure before applying a penalty."*

**Mitigation:** AC-50 is the LAST Phase A audit in the sequence. Yulia legal-input gate is mandatory before any Phase B work begins. The engine's allowed configuration space must be defined by legal review, not by software flexibility.

### (b) AC-43 — AI proactive worker-facing comms — gated on 3 preconditions

The vision adds worker-facing AI: shift reminders, document expiry alerts, lateness reminders, payroll prompts. That's a CHANGE in worker UX from *"system holds data, worker queries when they need it"* to *"system actively messages worker."* Three preconditions:

1. **GDPR consent basis.** Proactive comms (push, SMS, WhatsApp) require different consent than reactive data retrieval. The existing `consent_records` table likely doesn't carry this consent. New GDPR audit + consent flow needed before any send.

2. **Channel choice + over-messaging.** WhatsApp / SMS / app push / email — different cost, different opt-out behavior. Over-messaging causes opt-outs which destroys the value of the channel for actual important messages. Frequency cap + worker preference + per-channel cost analysis required.

3. **Worker-facing AI is a different design discipline.** The existing 50+ AI sites are operator-facing — compliance analysis, contract gen, legal Q&A — all read by Manish/Akshay/Yulia who can disambiguate ambiguous AI output. Worker-facing AI requires much higher fidelity (workers don't know system context, may be in Polish vs default-English, can't ask follow-up questions). New design discipline, not a reuse.

**Mitigation:** AC-43 Phase A audit must scope all three preconditions and propose a worker-facing AI safety/design framework before Phase B starts.

### (c) AC-41 — No-show engine — mandatory infrastructure share with WorkerMatching

The vision says "no-show alert + replacement suggestions." `artifacts/apatris-dashboard/src/pages/WorkerMatching.tsx` already exists and surfaces worker→job matching for inbound client requests. The vision did not reference it.

**If the no-show engine "suggests replacements" and WorkerMatching "suggests workers for jobs" use different scoring logic, the operator sees inconsistent recommendations across two surfaces — both real, both wrong-feeling.**

**Mitigation:** AC-41 Phase A audit must explicitly map shared matching infrastructure. The no-show engine consumes the WorkerMatching scoring service; it does not create a new one. If WorkerMatching scoring needs new signals (recent no-shows, reliability points), those signals are added to the existing service, not forked.

---

## Design constraints (flag-only — design decisions, not separate ACs)

### RBAC 6-role expansion (folded into AC-49)

Current is 5-tier T1-T5. Vision adds 6 roles:
- **Worker** → maps to T5 (Professional)
- **Coordinator** → maps to T4 (Coordinator)
- **Manager** → likely maps to T3 (Tech Ops) or T2; needs clarification
- **Office Staff** → maps to T2 (Legal Head) or new — clarification needed
- **Owner / Admin** → maps to T1 (Executive)
- **Client Contact** → NEW; not in current RBAC

Only **Client Contact** is genuinely new (AC-49 scope). The Manager / Office Staff / Coordinator mapping needs clarification from Manish + Yulia (per-role responsibilities differ per company structure). Smaller than feared (1 new role, not full reshuffle).

### Temporal model (cross-cutting design decision)

Reliability points + penalty/reward + no-show engine all require a temporal unit:

- Per-shift? Per-week? Per-month?
- Worker tenure context — new worker on day 3 with one lateness vs veteran on day 365 with same lateness is operationally different.
- Rolling window vs calendar window — operationally different for "3 strikes" rules.

**Must be settled in AC-42 Phase A audit (reliability points) since it propagates downstream to AC-41 + AC-50.** Surface as the key design decision in AC-42 Phase A.

### Timezone handling (cross-cutting)

Polish workers, Polish sites; CLAUDE.md Phase 2-3 roadmap includes Ireland + Germany + Czech expansion. Shift reminders, lateness reminders, document expiry — must handle:

- Worker's local time vs site time vs Warsaw time (currently default).
- Multi-country expansion makes this non-trivial (Polish worker on German site, reminded in which timezone?).

**Must be settled in AC-43 Phase A audit (AI proactive comms) since timezone choice affects send-time logic.** Surface as a key design decision in AC-43 Phase A.

---

## Roadmap reconciliation

**CLAUDE.md ROADMAP section (lines 246-516) lists Phase 1 Week 1 (21 features), Phase 2 enterprise architecture, Phase 3 SaaS platform.**

Reconciliation findings:

- **No direct conflict.** The vision items are mostly net-new modules that extend Phase 1's worker-facing surface and Phase 2's AI orchestration scope. The Phase 1 roadmap's Worker Self-Service Portal (#3) + Voice Check-in (#15) + Worker Mood Tracker (#16) + Salary Advance Request (#14) all align with worker-app vision direction.
- **Phase 2 "Sub-Agent Architecture"** (compliance + payroll + immigration + notification sub-agents) aligns with the vision's AI Communication Layer (AC-43) + Internal AI (AC-44) — these could be implementations of the Phase 2 sub-agent pattern.
- **No CLAUDE.md edit recommended in this commit.** A future commit could update the roadmap section to reflect "Phase 1 Week 1 is the operator-facing layer; Phase 1 Week 2 (vision) is the worker-facing layer + intelligence modules." That's separate work, not Scoping audit scope.

**Flag for separate update:** CLAUDE.md roadmap section may benefit from a future revision adding "Phase 1 Week 2 — Worker-Facing Layer + Operational Intelligence" reflecting AC-39 through AC-50 as a named program. Defer until per-AC Phase A audits stabilize the scope.

---

## Recommended audit sequence (Day 31+)

After Sunday AC-35 interviews, the per-AC Phase A audits should be sequenced by:

1. **Operator priority from interviews** — Yulia + Akshay rank which modules matter most to them this quarter.
2. **Gating dependencies** — AC-44 depends on AC-41; AC-41 + AC-42 depend on AC-50 legal review; AC-43 depends on GDPR + channel decisions; etc.
3. **Risk-first for legal-gated items** — AC-50 (penalty engine) Phase A is gated on Yulia legal-input, so its Phase A audit must happen AFTER Yulia confirms allowed configuration space, not before.

**Indicative sequence (operator-priority pending):**

1. AC-47 — Time/site intelligence (Phase A, ~60-90 min) — lowest risk, all signals exist, pure aggregation layer. Good first audit.
2. AC-48 — Manager dashboard refinement (Phase A, ~60-90 min) — existing surface, needs Phase A to scope which new-module hooks land.
3. AC-39 — Leave tab improvements (Phase A, ~45-60 min) — small scope, fully extends existing.
4. AC-40 — Help tab AI assistant (Phase A, ~60-90 min) — extends MessagingTab; AI assistant is the new part.
5. AC-49 — Client Contact role / RBAC extension (Phase A, ~60-90 min) — RBAC audit + role mapping clarification.
6. AC-46 — Issue / complaint engine (Phase A, ~90 min) — gated on AC-31 Phase B + AC-40.
7. AC-41 — No-show engine (Phase A, ~90 min) — must share WorkerMatching infra; gated on AC-35 interview priority + Yulia legal input.
8. AC-42 — Reliability / points system (Phase A, ~90 min) — temporal model design decision lands here.
9. AC-44 — Internal AI (Phase A, ~90 min) — depends on AC-41 Phase B starting.
10. AC-43 — AI proactive worker-facing comms (Phase A, ~120 min) — three preconditions to scope; biggest single Phase A.
11. AC-45 — Optional client-company AI (Phase A, ~60 min) — optional; defer per operator priority.
12. AC-50 — Configurable penalty/reward engine (Phase A, ~120 min) — **LAST**, after Yulia legal-input gate clears.

Total Phase A audit time across 12 ACs: ~14-17 hours of audit work, spread over 4-6 sessions Day 31-37. Sequence subject to AC-35 interview output Sunday.

---

## Next steps

1. **Sunday AC-35 interviews** — use this Scoping audit as **supplementary context**. Ask Akshay + Yulia: *"Here are 12 candidate modules from Manish's vision. Which matter most to you this quarter? Which don't matter? Which are missing? Which would you rather we didn't build?"*
2. **Day 31 first action** — sequence per-AC Phase A audits by operator-priority output from interviews.
3. **Per-AC Phase A discipline** — one AC per session, atomic commit, audit doc + ledger row status update. Same pattern as AC-31 / AC-38.
4. **AC-50 legal-input gate** — separate Yulia conversation specifically about penalty / reward configuration space under Polish Labour Code Art. 87 + Art. 108 + Posted Workers Directive. Can happen any time before AC-50 Phase A.

---

## Status

- **Scoping audit:** complete (this document).
- **Per-AC Phase A audits:** pending, sequenced post-AC-35 interviews.
- **Per-AC Phase B work:** gated on respective Phase A + upstream-AC dependencies + operator priority.
- **AC-35 interview context:** this doc + the existing AC-35 interview sheets (Akshay + Yulia) form the Sunday interview surface.
