# AC-38 Phase A Audit — Worker Reference Link-Out Surface Inventory

**Date:** 2026-05-14 (Day 28)
**Verdict:** YELLOW shading toward RED
**HEAD at audit:** `f6cb3a2`
**Scope:** Read-only enumeration of every UI surface that renders a worker reference as static text, across dashboard + workforce-app.
**Audit time:** ~45 min.

---

## Critical preconditions discovered

Two findings change AC-38's shape materially. Both surfaced before the surface enumeration was complete.

### 1. NO `<WorkerLink>` / `<WorkerChip>` / `<WorkerBadge>` component exists

Grep for `WorkerLink|WorkerChip|WorkerBadge|workerHref` against `artifacts/apatris-dashboard/src/` and `artifacts/workforce-app/src/`: **zero matches.** Phase B Step 1 is to build the shared component.

### 2. NO `/workers/:id` client-side route exists

`artifacts/apatris-dashboard/src/App.tsx:172-313` enumerates ~50 Wouter routes. Worker-related routes present:

- `/worker-upload/:id` (line 174) — public upload page
- `/worker-timeline` (line 286) — no `:id` param
- `/posted-workers` (line 262) — list page

There is **no `/workers/:id` profile-page route.** The current "worker profile" UX is a slide-out side panel (`WorkerProfilePanel.tsx`) that opens within the Workers list page (`Dashboard.tsx`). Clicking a worker name from another page cannot deep-link to a profile because **the destination URL does not yet exist as a routable client-side path.**

**Sequencing implication (hard technical blocker):** AC-38 Phase B has a precondition that **AC-31 Phase B must build either (a) a `/workers/:id` page route or (b) a `/workers?focus=:id` deep-link that opens the Workers page with WorkerProfilePanel pre-opened.** Without one of these, every `<WorkerLink>` has nowhere to point.

The AC-38 ledger note states *"Sequencing: follows AC-31."* This audit confirms it's not merely logical ordering — it's a hard precondition.

---

## Surface inventory — dashboard (53 files)

**53 page files in `artifacts/apatris-dashboard/src/pages/` contain worker_name / workerName / worker.name references.** Total grep hits across pages: 226 (including type defs, props, fetch bodies — not all user-visible renders).

Categorized by domain:

| # | Category | Page files | Est. visible renders |
|---|---|---|---|
| 1 | **Worker-list pages** (table/list of many workers) | Dashboard.tsx, PostedWorkers.tsx, HistoryPage.tsx (4 sub-tables), BenchManagement.tsx, ApplicationsFeed.tsx, ScreeningPage.tsx | ~12 |
| 2 | **Legal/case context** (highest Yulia priority) | LegalAlerts.tsx, LegalCommandCenter.tsx, LegalImmigrationCommand.tsx (10+ sub-tables), DocumentApproval.tsx, DocumentWorkflow.tsx, AuthorityPacks.tsx, LegalQueue.tsx, LegalBrief.tsx, LinkedCases.tsx, RejectionIntelligence.tsx, TRCService.tsx, TRCWorkspace.tsx, CertifiedSignatures.tsx | ~30 |
| 3 | **Compliance/ops** (highest Akshay priority) | ComplianceAlerts.tsx, ExpiryCalendar.tsx, HoursManagement.tsx, GpsTracking.tsx, ContractGenerator.tsx, ContractHub.tsx, DeploymentFlow.tsx, OnboardingPage.tsx | ~15 |
| 4 | **AI / analytics** | AnalyticsPage.tsx, FraudDetection.tsx, FinesPrevention.tsx, TrustScores.tsx, ChurnPrediction.tsx, SkillsMatrix.tsx, RiskOverview.tsx, PIPReadiness.tsx, PIPInspectionReport.tsx, WorkerMatching.tsx, ComplianceGuarantees.tsx, MarginAnalysis.tsx | ~20 |
| 5 | **Notifications / intake** | PostedNotifications.tsx, DocumentIntake.tsx, SafetyMonitor.tsx, VoiceCheckins.tsx, SelfService.tsx, MoodTracker.tsx | ~10 |
| 6 | **Wellness / self-service** | FinancialWellness.tsx, SalaryAdvances.tsx, InsuranceManagement.tsx, CareerPaths.tsx, EsspassPage.tsx | ~8 |
| 7 | **Modals / shared components** | DocumentApproval.tsx (panel), AuthorityPacks.tsx (panel), AddWorkerModal.tsx, BulkUploadModal.tsx, ComplianceReportModal.tsx, SmartDocumentDrop.tsx, QuickDocUpload.tsx, GlobalDropZone.tsx, LegalStatusPanel.tsx, ActionDialogs.tsx | ~10 (mostly N/A — see exclusions below) |

**Dashboard subtotal: ~95-105 distinct user-visible worker-name renders across ~50 page files + components.**

---

## Surface inventory — workforce-app (8 files)

Worker-name renders in T1-T4 admin tab components:

| File | Line | Render context |
|---|---|---|
| CareerTab.tsx | 36 | path card header |
| PostedNotifTab.tsx | 49 | notification card |
| EsspassTab.tsx | 42 | ESSPASS card |
| WellnessTab.tsx | 50 | wellness pulse card |
| AdvancesTab.tsx | 111 | advance request card |
| GpsCheckinTab.tsx | 156 | check-in row |
| BenchTab.tsx | 73 | bench entry card |
| ImmigrationTab.tsx | (type only) | — |

**Workforce-app subtotal: ~7-8 distinct renders.** Workforce-app likely has no destination either — would need its own `/workers/:id` route or external link to dashboard.

---

## Surfaces where link-out is N/A (~10 — exclude from Phase B sweep)

- **Toast messages** (`ActionDialogs.tsx:26, 104`) — ephemeral, no click target
- **PDF / CSV render** (`ComplianceReportModal.tsx:137`) — exports for printing/email
- **WorkerProfilePanel.tsx self-reference** (lines 285, 356) — already viewing this worker
- **Modal field labels / inputs** (`BulkUploadModal.tsx:231`, `ComplianceAlerts.tsx:130`, `AddWorkerModal`) — form inputs, not link targets
- **Intake extraction display** (`SmartDocumentDrop`, `QuickDocUpload`, `GlobalDropZone`) — worker is being CREATED, no profile to link to
- **CSV exports** (`HistoryPage.tsx:96`) — string serialization
- **File download names** (`DocumentApproval.tsx:181`, `WorkerProfilePanel.tsx:249`) — filename construction

---

## Worker-reference shape inconsistency (significant Phase B work)

Three shapes coexist:

| Shape | Example | Where common |
|---|---|---|
| `worker_name` (snake_case) | `<td>{s.worker_name}</td>` | API row data from PG (payroll_snapshots, hours_log, legal_alerts, legal_cases, audit_logs) |
| `workerName` (camelCase) | `<p>{doc.workerName}</p>` | TypeScript types camelCased on frontend (DocumentWorkflow, ComplianceAlerts) |
| `worker.name` (nested object) | `<span>{item.worker.name}</span>` | Joined responses (Dashboard.tsx:588, 697, 800) |

**Critical:** many surfaces render `worker_name` **without `worker_id` available in the same row** — examples include older payroll_snapshots, history rows. To make these clickable, the BACKEND response shape must project `worker_id` alongside `worker_name`. This is the backend half of AC-38 captured in the ledger note: *"Backend: API responses including worker_id should also project worker.id + worker.name as canonical reference shape."*

Spot-checking shows several legacy denormalized tables store `worker_id` as TEXT not UUID:

- `audit_logs.worker_id TEXT` (init-db.ts:845)
- `payroll_snapshots.worker_id TEXT` (init-db.ts:894)
- `notification_log.worker_id TEXT` (init-db.ts:868)

These may require an additional FK reconciliation step before linking works cleanly.

---

## Highest-traffic surfaces (priority order for Phase B)

What operators look at most often, ranked from operator-domain context:

1. **LegalAlerts.tsx** — daily-fire alerts (Yulia opens morning + on-demand; Day 28 validation confirmed)
2. **Dashboard.tsx (Workers page)** — root navigation point for both operators
3. **ComplianceAlerts.tsx** — Akshay's daily compliance view
4. **LegalImmigrationCommand.tsx** — Yulia case-overview surface (10+ sub-tables, highest-volume single page)
5. **HoursManagement.tsx** — Akshay weekly review
6. **HistoryPage.tsx** — payroll + audit history, both operators
7. **DocumentWorkflow.tsx + DocumentApproval.tsx** — Yulia case-document review (Manish-flagged surface)

Phase B should sweep these 7 first — they cover ~50% of total operator look-time despite being ~15% of file count.

---

## Verdict: YELLOW shading toward RED

**Why not GREEN:** 50+ dashboard pages + 8 workforce-app tabs is well above the AC-38 ledger note's "Phase A enumerate (~half day)" implicit assumption that this was a modest sweep.

**Why not full RED:** the surfaces follow patterns. A shared `<WorkerLink workerId={...} name={...} />` component should handle 80%+ of cases as drop-in replacement once the destination URL exists. The remaining 20% are denormalized-data surfaces that need backend response-shape work.

---

## Realistic Phase B effort revision

| Stage | Estimate |
|---|---|
| Build `<WorkerLink>` component + storybook-style test | 2-3h |
| **Pre-AC-38 dependency:** build `/workers/:id` route OR `/workers?focus=:id` deep-link | 2-4h (AC-31 Phase B scope, NOT AC-38) |
| Backend response-shape sweep — project worker_id alongside worker_name in ~10-15 endpoints | 4-6h |
| Frontend Phase B sweep — replace static text with `<WorkerLink>` across ~80-100 sites | 6-10h |
| Workforce-app sweep (if scope includes) | 2-3h |
| **Total realistic AC-38 Phase B** | **14-23h = 3-5 dedicated build sessions** |

Original ledger estimate was "~3-5 days." If full-time, the math holds; if part-time partner sessions (3-hour windows), closer to 5-8 sessions. The complexity-mix (component + route + backend + frontend) is now better characterized than the ledger note implied.

---

## Phase B gating rule

**AC-38 Phase B does NOT start until AC-31 Phase B has shipped the worker profile page + `/workers/:id` route (or equivalent deep-link).**

Why this gate:

- Hard technical precondition: links need a destination
- AC-31 Phase B itself is already gated on AC-35 operator interviews (per AC-31 Phase A audit)
- Therefore: AC-38 Phase B is double-gated — first AC-35 interviews, then AC-31 Phase B tabbed profile page, then AC-38 Phase B sweep

This is the right ordering. Trying to sweep links without a destination produces dead links; trying to build the destination without operator-validated tab priority produces a destination operators don't open.

---

## Phase B sequencing rule

When AC-38 Phase B starts:

1. **Build `<WorkerLink>` component first** — single atomic commit, with TypeScript types, accessibility (aria-label), and behaviour spec (open in same tab vs new tab, hover state, focus state).
2. **Backend response-shape sweep next** — single atomic commit per route file (10-15 commits). Make sure every API endpoint returning `worker_name` also projects `worker_id`.
3. **Frontend sweep in priority order** — atomic commits per surface-group:
   - Commit A: 7 high-traffic surfaces (LegalAlerts → Dashboard → ComplianceAlerts → LegalImmigrationCommand → HoursManagement → HistoryPage → DocumentWorkflow/DocumentApproval)
   - Commit B: legal/case context group (~10 more surfaces)
   - Commit C: compliance/ops group (~7 more surfaces)
   - Commit D: AI/analytics group (~10 more surfaces)
   - Commit E: notifications/intake/wellness group (~10 more surfaces)
   - Commit F: workforce-app sweep
4. Smoke-test after each commit — ensure links resolve correctly + no regression in surface render.

**One surface-group per commit; never a big-bang multi-group merge.**

---

## Anti-hallucination caveats

- "53 pages contain a worker reference" was a `wc -l` count, NOT a per-page manual verification of user-visible renders. Estimated 95-105 visible renders is a synthesis from spot-checking ~20 pages. Real count could be 70-130 — same order of magnitude, different precision. **Per-surface exact count confirmed during Phase B sweep.**
- "Many surfaces render `worker_name` without `worker_id`" based on type definitions in 4-5 files. Did NOT systematically verify which row shapes carry both. Phase A.2 follow-up if precise count needed.
- "Highest-traffic" priority order is from operator-domain context, NOT telemetry. If actual page-view counts contradict, defer to telemetry. The Day 28 click on `/legal-alerts` validates #1 in the priority list.
- Did NOT check workforce-app routing for any worker-detail route — assumed no destination exists, but did not exhaustively confirm.
- Polish character handling: no diacritic issues found in worker-name renders (interpolation via `{worker.name}` handles UTF-8 natively).
- Did NOT read 30+ route handler bodies to confirm which project `worker_id`. That's Phase B Step 2's first task per route.

---

## Status

- **Phase A:** complete (this document).
- **Phase B:** **double-gated** — first on AC-35 operator interviews, then on AC-31 Phase B shipping the worker profile page + route. Both gates must clear before AC-38 Phase B starts.
- **Phase C** (workforce-app destination + cross-app deep-link): deferred until AC-38 Phase B has landed on dashboard.

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
