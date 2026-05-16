# AC-39 Phase A Audit — Worker Leave Tab Improvements

**Date:** 2026-05-16 (Day 30)
**Verdict:** YELLOW (base GREEN-functional; cumulative improvement scope reaches YELLOW range)
**HEAD at audit:** `dcc4a7c`
**Scope:** Read-only feature-by-feature audit of `LeaveTab.tsx` + `/api/self-service/leave` + `leave_requests` table against vision Section 3. Mirrors AC-31 / AC-38 / AC-47 Phase A pattern.
**Audit time:** ~50 min.

---

## Current state summary

**LeaveTab is fully functional today.** A worker can:
- Submit a leave request (type: annual/sick/unpaid; date range; optional reason)
- See own request history with pending/approved/rejected status badges
- See empty state when no requests exist

**Backend has 4 endpoints:**
- `POST /api/self-service/leave` — worker submits (self-service.ts:135)
- `GET /api/self-service/leave` — worker's own history (self-service.ts:160)
- `GET /api/leave` — admin/manager list all (self-service.ts:190)
- `PATCH /api/leave/:id` — admin approve/reject (self-service.ts:203)

**Schema is thin but functional.** `leave_requests` table (init-db.ts:1246) has core columns (worker_id, worker_name, leave_type, start_date, end_date, days, reason, status, reviewed_by, reviewed_at, created_at) — all CRUD-supported, no gap.

The base "request + approve" flow is **shipped and complete.** AC-39 is therefore not a "build leave tab"; it's "extend a working leave tab with vision improvements."

---

## Per-feature inventory (against vision Section 3)

| Vision feature | Built | Partial | New build | Existing surface | Effort |
|---|---|---|---|---|---|
| Planned leave request | ✓ FULL | — | — | LeaveTab.tsx:50-72 form + POST self-service.ts:135 | none |
| Request history | ✓ FULL | — | — | LeaveTab.tsx:80-100 list + GET self-service.ts:160 | none |
| Status pending/approved/rejected | ✓ FULL | — | — | LeaveTab.tsx:82-94 badges + schema `status` column + PATCH self-service.ts:203 | none |
| Sick leave / urgent absence | partial | `leave_type=sick` exists | NO urgent / same-day path; NO file upload for sick note | LeaveTab.tsx:60 type selector | medium (2-3h) |
| Lateness reporting | — | — | new type + UX flow + maybe separate route | none | medium (2-3h) |
| Holiday balance display | — | — | new `leave_balance` column or per-worker entitlement table + calculation service + UI block | none | medium (3-4h) |
| File upload for proof (sick note, doctor's certificate) | — | — | schema column + multer endpoint + UI file input + storage routing | none — `documents` table exists but not wired to leave | medium (2-3h) |
| Rule-driven cutoff checking ("annual leave needs N days notice") | — | — | service-side validation + frontend disable + warning + Yulia legal input on Polish rules | none | medium (2-3h, **legal-gated**) |
| Notice timing score (days between submission and start date) | — | — | compute at POST + display in list + sort/filter | none | small (1-2h) |

**Plus implicit gaps surfaced during read:**

| Implicit gap | Surface | Effort |
|---|---|---|
| i18n missing on LeaveTab | hardcoded English strings: "Leave", "Cancel", "Request", "No leave requests", "Submit" | small (30-60 min) |
| Day calculation naive | `Math.ceil((end - start) / 86_400_000) + 1` — no weekend or Polish public-holiday exclusion (self-service.ts:146) | small (1-2h, depends on holidays table existing) |
| No request edit/cancel after submit | worker cannot withdraw a pending request | small (1h, PATCH route + UI button) |
| No conflict-check on submit | overlapping date ranges accepted; double-booking possible | small (1h, validation in POST handler) |
| No rich error messaging | toast only; no inline field errors | small (1h) |

---

## Tier breakdown

**Tier 1 — built, working, no improvement needed (3 features):**
- Planned leave request
- Request history
- Status pending/approved/rejected (with manager approval flow)

**Tier 2 — built, needs polish/UX improvement (1 feature):**
- Sick leave — type exists but no urgent/same-day path or proof upload

**Tier 3 — schema/route exists, frontend missing:**
- None. All gaps are backend + frontend together.

**Tier 4 — net-new, requires backend + frontend build (5 features + 5 implicit gaps):**
- Lateness reporting flow
- Holiday balance display
- File upload for proof
- Rule-driven cutoff checking (legal-gated)
- Notice timing score
- Implicit: i18n sweep, day calculation accuracy, edit/cancel, conflict-check, error UX

---

## Phase B effort estimate

| Stage | Effort |
|---|---|
| Notice timing score (quick win, no schema) | 1-2h |
| i18n sweep on LeaveTab | 30-60 min |
| Day calculation accuracy (weekend + Polish holidays) | 1-2h |
| Request edit/cancel + conflict-check + error UX | 1-2h |
| File upload for sick note proof (schema column + multer + UI) | 2-3h |
| Holiday balance display (column or table + service + UI) | 3-4h |
| Lateness reporting flow (new type + UX + maybe route) | 2-3h |
| Rule-driven cutoff checking (legal input + service + UI) | 2-3h |
| **Total** | **~12-17h = 2-3 dedicated build sessions** |

**Verdict reasoning:** Base tab is GREEN-functional today; cumulative improvement scope crosses YELLOW threshold (8-15h). Many of the gaps are individually small and can ship as atomic per-improvement commits, so the work feels more incremental than a single YELLOW-scale workstream.

---

## Phase B sequencing rule

Recommend incremental atomic-commit-per-improvement, ordered by effort + dependency:

1. **Notice timing score** (1-2h) — quick win, no schema change.
2. **i18n sweep** (30-60 min) — quick win, separate small commit, brings tab to PL/EN parity.
3. **Day calculation accuracy** (1-2h) — affects all existing + future requests; worth landing early. Requires Polish public-holidays table or library.
4. **Request edit/cancel + conflict-check + error UX** (1-2h) — polish of the existing flow.
5. **File upload for sick note proof** (2-3h) — schema column + multer + UI; first net-new feature.
6. **Holiday balance display** (3-4h) — entitlement tracking; service + UI; design decision: per-worker column on workers vs separate `leave_balance` table.
7. **Lateness reporting flow** (2-3h) — new leave_type or separate route; design decision: separate UX or extend leave-request flow.
8. **Rule-driven cutoff checking** (2-3h) — **legal-gated on Yulia confirming Polish rules** (Polish Labour Code Art. 152-173 govern annual leave entitlement + notice requirements). Service validation + frontend disable + warning.

One commit per improvement; smoke-validate after each.

---

## Phase B gating rule

**Items 1-5 + 7 are UNGATED.** Could ship Day 31+ in any order. No operator interview required, no legal review required.

**Item 6 (holiday balance display)** is unblocked but benefits from operator clarification: what's the entitlement model (20 days annual standard? per-worker contract? prorated for part-year?). Worth a 5-minute Manish + Yulia clarification before Phase B starts on this item.

**Item 8 (rule-driven cutoff checking)** is **legal-gated on Yulia input** — same gate pattern as AC-50 (penalty engine). Polish Labour Code Art. 152-173 govern annual leave notice. Yulia confirms what the cutoff rules legally are; THEN the engine enforces them. Building configurable rules without legal input risks configuring an illegal cutoff.

---

## Phase B first-action checklist (per item)

Same discipline as AC-31 / AC-38 / AC-47 Phase A:

1. Re-read `LeaveTab.tsx` + relevant route handler before any edit.
2. Confirm route response shape — `Leave` interface (id + leave_type + start_date + end_date + days + status + reason) is what the frontend expects; verify backend INSERT projects all fields.
3. For schema changes: add column with `ADD COLUMN IF NOT EXISTS` (per CLAUDE.md database safety rule).
4. For file upload: confirm `documents` table can be reused vs needs new attachment table; check existing multer setup in `worker-files.ts` for the pattern.
5. For i18n: add keys to BOTH `en.json` and `pl.json` per CLAUDE.md Bilingual Architecture; use proper Polish diacritics (ł, ą, ę, ż, ó, ś, ć, ń, ź); follow V3 convention search pattern.

---

## Anti-hallucination caveats

- **"LeaveTab is fully functional"** — verified by reading the 104-line component end-to-end. Form + list + state + mutation + invalidation + empty/loading states all present and wired.
- **"4 backend routes"** — verified by reading self-service.ts:135-216. Each route's role + tenant-scoping behavior NOT deep-audited (role gating absent on the worker-facing routes is fine; admin-facing `/leave` GET + PATCH at lines 190+203 have no `requireRole(...)` filter — they only check `requireAuth`, which means any authenticated user could read/PATCH ALL tenant leaves. Possible role-gating gap worth surfacing to a separate security audit if not intentional. Out of AC-39 Phase A scope but flagged.)
- **Polish Labour Code Art. 152-173** referenced as the legal-cutoff source — domain knowledge, not verified against current law text. Yulia confirms before Phase B item 8 builds.
- **Day calculation** flagged as naive (`Math.ceil`) but verified by reading self-service.ts:146. Polish public holidays handling NOT verified to exist anywhere in codebase — Phase B item 3 first action confirms.
- **"documents table exists but not wired to leave"** — `documents` table exists per init-db.ts:82 (verified during AC-31 Phase A audit). Whether it's reusable for leave-proof attachments vs needs new table is a Phase B item 5 design decision.
- **Effort estimates** are t-shirt sized per item. Real per-item effort confirmed at Phase B per-commit kickoff.

---

## Cross-AC notes

- **AC-39 item 8 (rule-driven cutoff)** shares a legal-input gate with **AC-50 (penalty/reward engine)**. Yulia legal-input session can scope both at once: Polish Labour Code Art. 87 + 108 (penalties) + Art. 152-173 (leave). Recommend batching the Yulia legal-input conversation.
- **AC-39 item 5 (file upload)** could reuse the `worker-files.ts` multer pattern. AC-31 Phase B (Documents tab) will exercise the same pattern at a different scope.
- **AC-39 item 7 (lateness reporting)** has overlap with **AC-41 (no-show engine)**. Lateness reported by worker (AC-39) is different signal source from lateness detected by no-show engine (AC-41 from gps_checkins). Both should converge to same `attendance` schema/store — Phase B kickoff design decision when both ACs reach build.

---

## Status

- **Phase A:** complete (this document).
- **Phase B:** **UNGATED for 7 of 8 items.** Item 8 (rule-driven cutoff) gated on Yulia legal input.
- **Recommended Day 31+ posture:** items 1-4 are atomic small commits that can ship between bigger workstreams (notice score + i18n + day accuracy + polish). Items 5-7 are 2-4h each; ship as dedicated sessions. Item 8 waits on Yulia.
- **Cross-AC awareness:** legal-input batching with AC-50; file-upload pattern share with AC-31 Phase B; lateness signal convergence with AC-41 Phase B.

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
