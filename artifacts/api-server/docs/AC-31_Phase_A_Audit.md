# AC-31 Phase A Audit — Worker Unified Profile Per-Entity Inventory

**Date:** 2026-05-14 (Day 28)
**Verdict:** YELLOW
**HEAD at audit:** `0a4c40c`
**Scope:** Read-only enumeration of worker-FK'd tables → existing per-slice routes → tab priority recommendation for `WorkerProfilePanel.tsx` Phase B.
**Audit time:** ~60 min.

---

## Current state

`artifacts/apatris-dashboard/src/components/WorkerProfilePanel.tsx:499`:

```ts
const [activeTab, setActiveTab] = useState<"profile" | "payroll-history">("profile");
```

Two tabs currently rendered — clickable triggers at lines 1139 + 1145. No tab-strip scaffold beyond that. 26+ tables FK'd to workers via `init-db.ts` are unsurfaced in this panel.

---

## Tier 1 — entities with existing per-slice routes (16)

| # | Entity | FK'd at init-db.ts | Per-slice route | Route file:line | Filter shape | Data on prod? | Tab candidate |
|---|---|---|---|---|---|---|---|
| 1 | `legal_cases` | 2413 | `GET /v1/legal/cases/:workerId` | legal-cases.ts:55 | path param | Seeded (5 INSERTs); Day 25 audit noted likely sparse | **Cases** |
| 2 | `legal_alerts` | 2825 | `GET /v1/legal/alerts/:workerId` | legal-alerts.ts:18 | path param | 20 alerts as of 2026-05-14 (Day 28 scan) | **Alerts** |
| 3 | worker files | 82 / 156 | `GET /workers/:id/files` | worker-files.ts:76 | path param | Likely yes | **Documents** |
| 4 | doc action log | 156 | `GET /workers/:id/doc-log` | worker-files.ts:172 | path param | Likely yes | merge → Documents |
| 5 | `worker_legal_snapshots` | 2364 | `GET /workers/:id/legal-status` | legal-status.ts:11 | path param | Yes | merge → Cases (or own) |
| 6 | legal-evidence (filings) | 2400 | `GET /workers/:id/legal-evidence` | legal-status.ts:136 | path param | Varies | merge → Documents/Cases |
| 7 | `onboarding_checklists` | 980 | `GET /onboarding/:workerId` | onboarding.ts:86 | path param | Varies | optional, defer |
| 8 | `immigration_permits` | n/a (joined) | `GET /immigration/worker/:workerId` | immigration.ts:31 | path param | Varies | merge → Cases/Documents |
| 9 | rejections analyses | n/a | `GET /v1/legal/rejections/:workerId` | rejections.ts:32 | path param | Sparse | merge → Cases |
| 10 | legal-intel (appeal / POA / authority / reasoning) | n/a | `GET /v1/legal-intel/{appeal,poa,authority-draft,reasoning}/:workerId` | legal-intelligence.ts:54-96 | path param | Varies | merge → Cases |
| 11 | legal-documents (suggested) | n/a | `GET /v1/legal/documents/worker/:workerId` | legal-documents.ts:45 | path param | Depends | merge → Documents |
| 12 | identity | 2911 | `GET /identity/:workerId` | identity.ts:68 | path param | Yes | merge → Profile (existing) |
| 13 | `hours_log` | 2248 | `GET /hours?worker=:id` | hours.ts:65 | **query param** | Yes | **Site & Hours** |
| 14 | `gps_checkins` | 518 | `GET /gps/history?workerId=:id` | gps.ts:226+228 | **query param** | Yes | merge → Site & Hours |
| 15 | posted_workers / a1_certificates | 461 / 480 | `GET /postings?workerId=:id` | posted-workers.ts:18 | query param | Sparse | merge → Documents |
| 16 | validate (consistency) | n/a | `GET /v1/workers/:id/validate` | worker-validation.ts:13 | path param | Computed | merge → Profile |

---

## Tier 2 — no per-slice worker route (10 gaps)

| # | Entity | Current state | What's needed |
|---|---|---|---|
| 17 | `contracts` | `GET /contracts` (contracts.ts:117) exists but NOT worker-filtered | retrofit `?worker_id=` (1h) or new path route |
| 18 | `signatures` | `GET /signatures/contract/:contractId` only | new `GET /signatures?worker_id=` or join via contracts |
| 19 | `certified_signatures` | `GET /signatures/certified` not worker-filtered | retrofit `?worker_id=` |
| 20 | `mos_packages` | POST-only at `/workers/:id/mos-package` | needs GET-by-worker if surfaced |
| 21 | `deadline_countdowns` | **NO route file found** | new endpoint needed |
| 22 | `case_notebook_entries` | by `:caseId` only (case-notebook.ts:12) | accessible via Cases drill-down — no direct worker route needed |
| 23 | `case_generated_docs` | by `:caseId` only (case-doc-generator.ts:45) | accessible via Cases drill-down — no direct worker route needed |
| 24 | `audit_logs` | no worker-filtered GET endpoint | new endpoint if surfaced |
| 25 | `leave_requests` | not surfaced per-worker | new endpoint if surfaced |
| 26 | `consent_records` / `gdpr_log` | not surfaced per-worker (privacy-sensitive — admin-only required) | deferred — privacy-sensitive |

---

## Proposed tabs (priority order)

**Existing — keep:**

1. **Profile** (existing)
2. **Payroll History** (existing)

**Proposed new (priority order):**

| # | Tab | Data sources | Effort | Empty-state risk | Operator alignment | North Star? |
|---|---|---|---|---|---|---|
| 3 | **Cases** | `/v1/legal/cases/:workerId` + (optional) `/v1/legal-intel/{reasoning,appeal}/:workerId` | 4-6h | **HIGH — prod likely sparse** | Yulia primary | **Yes** — gateway to case-event tables, AC-37 fork-point destination |
| 4 | **Documents** | `/workers/:id/files` + `/workers/:id/doc-log` + `/v1/legal/documents/worker/:workerId` (compose 3 sources) | 4-6h | Low | Both Yulia + Akshay | Partial |
| 5 | **Alerts** | `/v1/legal/alerts/:workerId` | 2-3h | **Low — confirmed populated today** | Yulia primary | Partial |
| 6 | **Site & Hours** | `/hours?worker=:id` + `/gps/history?workerId=:id` | 4-6h | Low | Akshay primary | Low |

**Deferred to Phase C (Tier 2 gaps):**

- Signatures (contracts + e-sig + certified) — needs Tier 2 retrofit
- Onboarding — small-value outside first 30 days
- Audit / Activity log — needs new endpoint

**Total Phase B effort:** ~14-21 hours = 2-3 dedicated build sessions for tabs 3-6.

---

## YELLOW verdict — three caveats

1. **Empty-state risk on Cases tab.** Day 25 blueprint gap audit (`project_blueprint_gap_audit.md` memory) noted "5 empty case-event tables on prod, 0/20 docs case-linked." Cases tab needs explicit empty-state design ("No active cases — start one via [link]") and ideally seed-work first; otherwise it ships looking broken even though the code is correct.

2. **Documents tab composes 3 sources.** Not a blocker, but requires a deliberate UI design decision — single chronological feed vs three sub-sections. Best made with operator input.

3. **AC-35 operator interviews must gate Phase B tab priority.** Cases → Documents → Alerts → Site/Hours is the audit's best read from ledger + seed data. Yulia's interview could surface a different priority (e.g., "I want Deadlines as a separate top-level tab"). The interview is the higher-leverage input — building tabs blind would waste 2-3 build sessions.

---

## Anti-hallucination caveats

- **Routes verified to EXIST** by grep against `router.get(...)` declarations.
- **Response shapes NOT verified.** Each route handler body was not read. The `GET /v1/legal/cases/:workerId` handler shape (does it return joined deadline/notebook count?) is unread. **Phase B first action per tab MUST be: read the route handler, confirm response shape, then design the tab UI around it.**
- Some Tier 1 routes may return only the row, not joins to related entities. If the Cases tab needs `deadline_countdowns` inline, that's an extra join + may push effort estimates up.
- Tab effort estimates assume no React component scaffolding issues. If the existing TabsTrigger pattern at lines 1139-1146 doesn't generalize cleanly to 6 tabs, add 1-2h for refactor.
- "27+ tables" from AC-31 ledger note was an estimate; this audit found 26 in `init-db.ts`. Close enough; not a material drift.

---

## Phase B gating rule

**AC-31 Phase B does NOT start until AC-35 operator interviews confirm tab priority.**

Why this gate:

- Audit-first discipline (Hard Boundary 12) — same pattern that worked Day 28 morning for AC-33.
- 2-3 build sessions is the cost of getting tab priority wrong; 60 min of interview is the cost of getting it right.
- This audit doc doubles as interview input: "When you click into a worker, you want to see these 4 things — yes / no / what's missing / what should be first?"

The Day 28 commit 3 interview sheets (`AC-35_Interview_Akshay.md` + `AC-35_Interview_Yulia.md`) already include Section 4 questions about per-worker drill-down — the answers there directly inform this tab priority.

---

## Phase B sequencing rule

**One tab per session, atomic commits.** Don't ship 4 tabs in one push.

Recommended Phase B order (post-interviews):

1. **Documents tab first** — lowest empty-state risk, both operators benefit, highest visibility-to-effort ratio. Validates the multi-source compose pattern.
2. **Alerts tab second** — smallest effort (single route), confirmed-populated data, fast win.
3. **Cases tab third** — requires empty-state design + seed validation; do after the compose pattern is proven.
4. **Site & Hours tab fourth** — Akshay-primary; ship after the three Yulia-priority tabs are stable.

Each tab gets its own atomic commit + deploy + smoke-validate cycle. No big-bang four-tab merge.

---

## Phase B first-action checklist (per tab)

When building any tab, the first action is verification, not coding:

1. Read the route handler body in the relevant file:line.
2. Confirm response shape (single row vs array vs joined object).
3. Note any auth-role or tenant-isolation requirements.
4. Sketch the tab UI against the real response shape.
5. Only then start the React component.

This prevents the "I built the tab against my mental model of the route, then the actual response broke it" failure mode.

---

## Status

- **Phase A:** complete (this document).
- **Phase B:** **gated** on AC-35 operator interviews.
- **Phase C** (Tier 2 entities — signatures / contracts retrofit / deadline endpoint / audit endpoint): deferred until Phase B has shipped at least 2 tabs.

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
