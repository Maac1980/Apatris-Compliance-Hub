# AC-46 Phase A Audit — Worker Issue / Complaint Engine

**Date:** 2026-05-16 (Day 30)
**Verdict:** YELLOW (greenfield issue/complaint domain; `safety_incidents` provides strong template pattern)
**HEAD at audit:** `b183696`
**Scope:** Read-only enumeration of complaint/issue infrastructure → vision Section 4 feature gap → Phase B Wave 1 + Wave 2 sequencing. Confirms AC-40 Phase A's two-wave dependency-loop resolution. Mirrors AC-31 / AC-38 / AC-47 / AC-39 / AC-40 Phase A pattern.

---

## Current state summary

**Zero complaint / issue / grievance infrastructure exists.** Grep for `complaints` / `issues` / `tickets` / `grievance` / `escalation` against init-db.ts returned no matches. Grep for matching route files returned only a false positive (`/identity/issue/:workerId` is identity *issuance*, not issue tracking). Grep for frontend surfaces returned zero matches.

**But the pattern is well-established by adjacent domains:**

- **`safety_incidents`** (init-db.ts:1466) — closest template: `tenant_id + worker_id + worker_name + site + incident_type + severity + description + photo_url + ai_analysis JSONB + status + reported_at + resolved_at + resolved_by`. Mirrors most of what AC-46 needs.
- **`/safety/incidents`** routes (safety.ts:9 POST + 53 GET + 69 analyse + 134 scores) — complete CRUD + analyse pattern.
- **`SafetyMonitor.tsx`** (dashboard) — full frontend template (table + severity color + expand + analyze button).
- **`compliance_incidents`** (init-db.ts:1843) — another incident pattern.
- **`legal_cases`** (init-db.ts:2413) + **`deadline_countdowns`** (init-db.ts:2636) — adjacent case-tracking patterns.
- **`notification_log`** (init-db.ts:867) — adjacent notification-routing primitive.

AC-46 is therefore **net-new domain but template-clear.** Build mirrors `safety_incidents` shape; routes mirror `/safety/incidents` pattern; frontend mirrors `SafetyMonitor.tsx`. Schema gaps are well-scoped (categories enum, anonymous flag, attachments table, assignment columns, escalation rules table); no novel design required.

---

## Per-feature inventory (against vision Section 4)

| Vision feature | Built | Partial | New build | Schema source | Notes |
|---|---|---|---|---|---|
| 10 issue categories (payroll / attendance / leave / housing / transport / supervisor / safety / legal-permit / document / other) | — | — | enum or `complaint_categories` table | none — `safety_incidents.incident_type` is free TEXT, not enum | category list canonical-source decision needed |
| Category selection UI | — | — | worker-facing in AC-40 Help tab + admin-facing in dashboard | none | AC-40 owns frontend |
| Text message + voice note + image/PDF proof | partial | `safety_incidents.photo_url` exists for one image; `messages` table holds text | new `complaint_attachments` table OR extend with multi-attachment JSONB | safety_incidents (single photo only) | multi-attachment shape decision |
| Urgency selection | partial | `safety_incidents.severity` (critical / high / medium / low) | reuse pattern; align urgency taxonomy with vision | safety_incidents.severity | small alignment work |
| Anonymous option for sensitive complaints | — | — | `is_anonymous BOOL` column + identity-suppression in admin GET route | none | policy decision (Yulia / Manish) |
| Case ID generation (human-readable) | partial | UUID PK exists in `safety_incidents` pattern | human-readable format (e.g., `COMP-2026-0123`) + formatter | safety_incidents.id (UUID only) | format design decision |
| Status tracking | partial | safety_incidents has full status pattern (open / closed / resolved + reported_at + resolved_at + resolved_by) | reuse verbatim | safety_incidents | template-complete |
| Internal assignment | — | — | `assigned_to` + `assigned_at` columns + assignment service + admin UX | safety_incidents has `resolved_by` only (post-fact) | medium |
| Escalation rules | — | — | `escalation_rules` table + cron service + notification trigger | none — could share `notification_log` infrastructure | large |
| AI classification (issue type / urgency / routing) | — | — | AC-44 service consumed at submit flow | none | **gated on AC-44** |

---

## Tier breakdown

**Tier 1 — built, working:** None for issue/complaint specifically.

**Tier 2 — partial, needs adoption from template:** 3 features
- Photo/text/severity (safety_incidents primitives)
- Status tracking pattern (full template, just needs adoption)
- Case ID (UUID exists; human-readable format is the design work)

**Tier 3 — schema-only:** None.

**Tier 4 — net-new (with template):** 7 features
- 10-category enum / table
- Multi-attachment for voice notes + photos + PDFs
- Anonymous option (schema + policy)
- Internal assignment
- Escalation rules
- AI classification (gated on AC-44)
- Category selection UI (worker + admin)

---

## Cross-AC dependency map

### AC-40 dependency-loop resolution — CONFIRMED

AC-40 Phase A proposed Wave 1 / Wave 2 sequencing. This audit **confirms it works:**

| AC-40 work unit | Consumes from AC-46 Wave 1 |
|---|---|
| WU-5 (categorized issues picker) | Wave 1 categories enum/table (A1) |
| WU-6 (complaint submission form) | Wave 1 POST /complaints route (A4) |
| WU-7 (anonymous toggle) | Wave 1 `is_anonymous` flag + suppression logic (A2) |
| WU-8 (case ID + status badge) | Wave 1 case-ID generator (A3) + status workflow (A4) |
| WU-9 (attachments) | Wave 1 `complaint_attachments` table (A1) |

**After AC-46 Wave 1 ships, all 5 AC-40 work units (WU-5 through WU-9) unblock.** Wave 2 is independent of AC-40 — it's admin-side workflow.

### AC-31 Phase B integration

Worker profile page (AC-31 Phase B) should add a per-worker complaints view. Two design options for AC-31 Phase B kickoff:
- **Option A:** Standalone "Complaints" tab in worker profile
- **Option B:** Extend proposed "Cases" tab to merge legal_cases + complaints (unified case view)

Recommendation: Option B (single Cases tab) — operator mental model is "all cases for this worker" rather than "legal cases vs complaints split." Defer final decision to AC-31 Phase B kickoff when operator-interview output is known.

### AC-44 integration

Wave 2 WU-B3 is the integration point. AC-46 submit flow calls AC-44 classifier; AC-44 returns classified category + urgency + suggested routing; AC-46 stores `ai_classification JSONB` result in complaints row (mirrors `safety_incidents.ai_analysis JSONB` pattern). AC-46 Wave 1 can ship WITHOUT AC-44 — categories selected manually by worker initially; AI suggestion added at Wave 2.

### AC-50 integration

If complaints lead to disciplinary records (e.g., supervisor complaint triggers worker-side penalty review), AC-50 legal-input applies. AC-50 Phase A (when it runs) should clarify if disciplinary records cite complaints — that's the AC-46 ↔ AC-50 boundary. **Not blocking AC-46 Phase B** — most complaints are operational (transport, housing, payroll), not disciplinary.

### AC-43 integration

If worker-facing AI assistant (AC-43) helps workers draft complaints ("describe your issue, I'll suggest the category"), that's an AC-43 surface consuming AC-46 categories. **Not blocking AC-46 Phase B** — manual category picker is fine for v1.

---

## Phase B Wave 1 / Wave 2 sequencing (the audit's core output)

### Wave 1 — data layer (UNGATED — pure greenfield using safety_incidents template)

**Goal: unblock AC-40 WU-5 through WU-9.** 5 work units.

- **WU-A1** — Schema: create `complaints` table (mirror safety_incidents shape + adds: category column + is_anonymous + assigned_to nullable + ai_classification JSONB) + `complaint_attachments` table + category enum or constant list
- **WU-A2** — Anonymous flag column + identity-suppression logic in admin GET route (sender_id + sender_name → "Anonymous" when `is_anonymous = TRUE` and viewer is not Admin/LegalHead)
- **WU-A3** — Case ID human-readable format generator (e.g., `COMP-{YYYY}-{6-digit-tenant-seq}`) + display formatter for frontend
- **WU-A4** — 5 routes: `POST /complaints` (worker submit) + `GET /complaints/my` (worker own list) + `GET /complaints` (admin list, requireRole) + `GET /complaints/:id` (detail) + `PATCH /complaints/:id` (status update). All role-gated correctly (avoid AC-51 pattern).
- **WU-A5** — Worker profile integration — `GET /workers/:id/complaints` route (consumed by AC-31 Phase B Cases tab)

### Wave 2 — engine layer (gated on Wave 1 + selective downstream)

- **WU-B1** — Internal assignment: `assigned_to` + `assigned_at` columns (already in WU-A1 schema if scoped together) + assignment service + admin-side assignment UX
- **WU-B2** — Escalation rules: `escalation_rules` table + cron service (extends scheduler.ts) + notification trigger via existing `notification_log` infrastructure
- **WU-B3** — AI classification: consumes AC-44 classifier; stores in `ai_classification JSONB`; surfaces in admin view as "AI suggests: payroll / high urgency / route to Office Staff" — **gated on AC-44 Phase B**
- **WU-B4** — Frontend admin workflow: queue view + assign + escalate + resolve actions (likely a new dashboard page `Complaints.tsx` or extending `SafetyMonitor.tsx` pattern). Operator-priority informed by **AC-35 interviews** (Yulia/Akshay rank how much escalation routing matters).

**Total: 5 Wave 1 + 4 Wave 2 = 9 work units.** Plus 2 cross-cutting (admin dashboard surface + worker workflow polish) ≈ 11 work units total.

---

## Verdict reasoning: YELLOW

**Why not GREEN:** Zero existing complaint domain. Every feature is net-new schema + route + frontend. Cumulative scope (~11 work units across 2 waves) is substantial.

**Why not RED:** The `safety_incidents` + `/safety/incidents` + `SafetyMonitor.tsx` template stack proves the build pattern. No novel design problem; just composition. Wave 1 ships cleanly without any cross-AC dependency. Schema gaps are clear and small individually.

YELLOW captures: net-new but template-clear; Wave 1 is unblocked greenfield, Wave 2 is mostly unblocked with one AC-44 dependency.

---

## Phase B effort scope (work units, not hours)

Per CLAUDE.md doctrine:

**Wave 1 (UNGATED — ship first):**
- WU-A1, WU-A2, WU-A3, WU-A4, WU-A5 — 5 atomic work units

**Wave 2 (mostly ungated):**
- WU-B1, WU-B2 — 2 work units (ungated technically; WU-B4 escalation UX benefits from operator interview)
- WU-B3 — 1 work unit (**gated on AC-44 Phase B**)
- WU-B4 — 1 work unit (operator-priority informed by AC-35 interviews)

**Cumulative:** ~9 work units across 2 waves + 2 cross-cutting = ~11.

Compare to AC-40 (11 WU, most blocked): AC-46 has the inverse profile — most ungated, ships cleanly, unblocks AC-40 downstream. **Recommended order: AC-46 Wave 1 → AC-40 WU-5-9 → AC-46 Wave 2.**

---

## Phase B gating rule

- **Wave 1 (5 WU)** — UNGATED. Pure greenfield build using `safety_incidents` template. Ship Day 31+.
- **Wave 2 WU-B1, WU-B2** — ungated technically; ship after Wave 1.
- **Wave 2 WU-B3** — gated on **AC-44 Phase B classifier service.**
- **Wave 2 WU-B4** — operator-priority informed by **AC-35 interviews** but not strictly gated; can ship with placeholder priority and refine.

**Cross-AC unblock effect:** AC-46 Wave 1 completion unblocks AC-40 WU-5 through WU-9 (5 of AC-40's 11 work units). High leverage.

---

## Phase B sequencing rule

1. **Wave 1 first** — atomic per-work-unit commits. Order: A1 schema → A2 anonymous → A3 case ID → A4 routes → A5 worker profile integration. Each commit smoke-validated against existing tenant + role pattern.
2. **AC-40 WU-5 through WU-9** can start once Wave 1 ships — parallel-track to Wave 2.
3. **Wave 2 WU-B1 + WU-B2** — atomic commits. WU-B2 (escalation) extends existing scheduler.ts + notification_log infrastructure.
4. **Wave 2 WU-B3** — after AC-44 Phase B classifier ships.
5. **Wave 2 WU-B4** — after AC-35 interview output informs operator priority.

One commit per work unit; smoke-validate after each. Role-gating discipline mandatory (avoid AC-51 pattern from day 1).

---

## Phase B first-action checklist (per work unit)

1. Re-read `safety_incidents` schema (init-db.ts:1466-1485) + `/safety/incidents` routes (safety.ts:9-150) + `SafetyMonitor.tsx` (dashboard) before any work — these are the template stack.
2. For WU-A1 schema: `CREATE TABLE IF NOT EXISTS complaints` (per CLAUDE.md database safety rule). All new columns `ADD COLUMN IF NOT EXISTS`.
3. For WU-A4 routes: apply `requireRole(...)` on admin routes from day 1 (avoid AC-51 pattern). Worker-self routes use `requireAuth` + worker-scope filter only.
4. For WU-A2 anonymous: confirm with Manish/Yulia which roles see real identity (Admin? LegalHead? T1 only?) before implementing suppression.
5. For WU-A3 case ID: confirm format with Manish (`COMP-YYYY-NNNNNN`? `C-{site}-{seq}`?). Sequence counter scoped per-tenant.
6. For category enum: confirm 10 categories from vision Section 4 are final (payroll / attendance / leave / housing / transport / supervisor / safety / legal-permit / document / other) — small clarification, can default to literal vision list.
7. For i18n: add complaint category names + status labels + workflow strings to BOTH `en.json` and `pl.json` per CLAUDE.md Bilingual Architecture.

---

## Anti-hallucination caveats

- **"Zero complaint infrastructure"** — verified by 3 separate greps (schema, routes, frontend), all returning zero matches. The only "issue" hit was `identity/issue/:workerId` which is identity issuance, not issue tracking.
- **`safety_incidents` template** — verified by reading init-db.ts:1466-1485 + safety.ts route signatures. The schema is what I claim it is. Whether all 4 routes work end-to-end NOT deep-audited; SafetyMonitor.tsx imports + uses them, so they're presumed functional.
- **AC-44 classifier service does not exist yet** — verified by Day 30 Scoping audit. AC-46 Wave 2 WU-B3 is genuinely gated, not pretend-gated.
- **Vision Section 4 category list (10 categories)** is from chat-Claude's vision summary, not directly verified against the original document text. If the document lists different categories, AC-46 Phase B WU-A1 first action confirms the canonical list.
- **Two-wave sequencing** is recommendation, not contract. AC-46 could ship as one big push, but the two-wave decomposition unblocks AC-40 earlier — that's the design choice.
- **`escalation_rules` table shape** not designed in this audit — Phase B WU-B2 designs it; could involve recurrence, severity-trigger logic, time-to-escalate windows. The audit just names the work unit; doesn't pre-empt the design.
- **AC-31 ↔ AC-46 boundary** (Cases tab unified vs separate) flagged but deferred — depends on AC-31 Phase B operator-input.

---

## Cross-AC notes (consolidation)

- **AC-46 Wave 1 unblocks 5 AC-40 work units.** Leverage point.
- **AC-46 Wave 2 WU-B3 gates on AC-44.** Single dependency.
- **AC-46 Wave 2 WU-B4 informed by AC-35 interviews.** Not strict gate.
- **AC-31 Phase B Cases tab design** decision involves AC-46 (unified Cases vs separate Complaints tab).
- **AC-50 boundary** (disciplinary records citing complaints) clarified during AC-50 Phase A, when it runs.
- **AC-51 pattern compliance** — Wave 1 WU-A4 must apply `requireRole(...)` correctly from day 1 to avoid creating new evidence for AC-51.
- **AC-43 worker-facing AI assistant** could later help workers draft complaints; not blocking Wave 1.

---

## Status

- **Phase A:** complete (this document).
- **Phase B Wave 1:** **UNGATED.** Ship Day 31+ as 5 atomic work units. Unblocks AC-40 WU-5-9.
- **Phase B Wave 2:** 2 work units ungated; 1 gated on AC-44; 1 informed by AC-35 interviews.
- **Recommended Day 31+ posture:** AC-46 Wave 1 is the highest-leverage UNGATED workstream after AC-47 — both share "ungated greenfield with template pattern" profile. Sequence: pick AC-47 or AC-46 first based on which downstream effect Manish wants sooner (AC-47 unblocks AC-41/42/44/31; AC-46 Wave 1 unblocks AC-40 WU-5-9).
- **Template stack:** `safety_incidents` schema + `/safety/incidents` routes + `SafetyMonitor.tsx` frontend — re-read before Wave 1 WU-A1 starts.

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
