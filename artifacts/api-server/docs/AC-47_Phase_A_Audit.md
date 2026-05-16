# AC-47 Phase A Audit — Time / Site Intelligence Aggregation

**Date:** 2026-05-16 (Day 30)
**Verdict:** GREEN shading toward YELLOW
**HEAD at audit:** `ad8a78e`
**Scope:** Read-only enumeration of time/site data primitives → aggregation gap → Phase B architecture proposal. Mirrors AC-31 + AC-38 Phase A pattern.
**Audit time:** ~60 min.

---

## Current state

Time/site data is **rich at the primitive level, absent at the aggregation level.** Five source tables exist (`gps_checkins`, `site_geofences`, `shifts`, `worker_availability`, `hours_log`) plus a generic `trust_scores` table. Per-worker read routes exist for each. But **no service combines them into per-worker or per-site time intelligence.** The existing `/gps/anomalies` is a thin SELECT of pre-flagged rows, not an aggregation. The existing `/analytics/heatmap` aggregates compliance status (document expiry), not time/site behavior. The existing `/v1/risk/worker/:id` is legal-domain risk (TRC/visa forecast), not attendance behavior.

AC-47 is the data-layer foundation for AC-41 (no-show engine) and AC-42 (reliability/points). Both downstream ACs need attendance signals AC-47 produces. AC-47 ungated: no operator interview, no legal review, no GDPR/channel decision required.

---

## Per-table inventory

| Table | In init-db.ts | Per-worker route | Frontend surface | Aggregation logic | What's missing |
|---|---|---|---|---|---|
| `gps_checkins` | line 518 — rich: check_in/out lat/lng/at + duration_minutes + **is_anomaly BOOL** + anomaly_reason TEXT | `GET /gps/history?workerId=` (gps.ts:226) + `GET /gps/anomalies` (gps.ts:243, thin) | `GpsTracking.tsx` (dashboard) + `GpsCheckinTab.tsx` (workforce-app) | inline `is_anomaly` flag set at checkin (gps.ts:137) + checkout (gps.ts:195) | per-worker aggregation; multi-checkin pattern detection; scheduled-vs-actual reconciliation |
| `site_geofences` | line 502 — geofence boundary + radius | `GET /geofences` (gps.ts:22, CRUD) | `GpsTracking.tsx` | none | site-level rollup (workers visited, breaches per site, avg duration) |
| `shifts` | line 2264 — site_name + shift_date + shift_slot + worker_ids JSONB + notes | `GET /shifts` (shifts.ts:14) + POST + PATCH | likely none as dedicated dashboard page | none | scheduled-vs-actual JOIN with gps_checkins; coverage analysis |
| `worker_availability` | line 2269 — worker_id + available_date (UNIQUE pair) | unclear — no `/availability` route found in grep | unclear | none | JOIN with shifts for coverage-gap detection |
| `hours_log` | line 2248 — worker_name TEXT (**no worker_id FK**) + month + hours numeric + status | `GET /hours?worker=` (hours.ts:65) + `/hours/my` (hours.ts:54) | `HoursManagement.tsx` + `TimesheetTab.tsx` | none — **monthly total only**, no per-shift granularity | per-shift detail must be derived from gps_checkins (hours_log shape too thin for overtime-spike detection) |
| `trust_scores` | line 1290 — worker_id + score INTEGER + breakdown JSONB + version | `routes/trust.ts` exists | `TrustScores.tsx` (dashboard) | scoring engine exists but driven by AI/trust signals — NOT attendance | reliability score driven by time/site attendance signals (SEPARATE concern from current trust_scores writer) |

---

## Per-vision-feature inventory

| Feature | Built | Partial | New build | Data sources | Effort |
|---|---|---|---|---|---|
| Geofence-ready attendance | ✓ | — | enhance with category | gps_checkins.is_anomaly | small |
| Wrong-site detection | partial | is_anomaly catches inline at checkin | dedicated per-worker stat + route | gps_checkins.is_anomaly + site_geofences | small |
| No-punch detection (scheduled but absent) | — | — | new (shifts ⋈ gps_checkins) | shifts + gps_checkins | medium |
| Early-leave detection | — | — | new (gps_checkins.duration_minutes < scheduled) | gps_checkins + shifts | medium |
| Overtime-spike detection | — | hours_log too thin (monthly aggregate, no per-shift) | derive from gps_checkins.duration_minutes vs expected shift length | gps_checkins | medium |
| Shift coverage gap | — | — | new (shifts ⋈ worker_availability) | shifts + worker_availability | medium |
| Suspicious pattern detection | — | only single-checkin anomaly flag | multi-checkin pattern analysis (e.g., 3+ wrong-site / 30d, lateness streak, weekend-only no-shows) | gps_checkins history | medium |
| Site-level heatmap | partial | `/analytics/heatmap` exists for COMPLIANCE (TRC/passport) | add time/site dimension (workers per site, breaches per site, avg duration) | site_geofences + gps_checkins | small |
| Reliability score (attendance-driven) | partial | `trust_scores` table exists; score is AI/trust-driven, not attendance | extend `trust_scores` with attendance signal OR new attendance-specific score | gps_checkins + shifts + trust_scores | medium |
| Attendance risk score | — | — | new derived score combining lateness + no-show + wrong-site + early-leave | aggregation of above signals | medium |
| Transport-issue tagging | — | — | manual tag or AI-classified `anomaly_reason` post-processing | gps_checkins.anomaly_reason | small |

**Summary:** 2 of 11 vision features built / 3 partial / 6 new build. Foundations strong; aggregation layer is the gap.

---

## Aggregation architecture proposal

**No existing route covers time/site aggregation.** Verified by grep:

- `/v1/intelligence/*` (intelligence.ts) — LEGAL_ROLES-gated; surfaces legal rejections + voivodeships. Different domain.
- `/v1/risk/worker/:id` + `/v1/risk/overview` (risk.ts) — LEGAL_ROLES-gated; calls `getWorkerRiskForecast` (legal document expiry forecast).
- `/analytics/heatmap` (analytics.ts:16) — site-level COMPLIANCE counts (TRC/passport/etc.).
- `/analytics/predictive` (analytics.ts:53) — per-worker DOCUMENT expiry forecast.
- **None aggregate time/site attendance behavior.**

### Proposed Phase B architecture

```
Service layer (new):
  computeWorkerTimeIntelligence(workerId, tenantId, rangeDays)
    → joins gps_checkins + shifts + worker_availability + site_geofences
    → returns {
        shifts_scheduled, attended, missed, late_count,
        early_leaves, wrong_site_count,
        anomaly_breakdown: {category → count},
        reliability_score: 0-100,
        trend_direction: "improving" | "stable" | "declining"
      }

  computeSiteTimeIntelligence(siteId, tenantId, rangeDays)
    → site-level rollup of same signals

Routes (new):
  GET /v1/workers/:id/time-intelligence?range=30d   (T1-T4 roles)
  GET /v1/analytics/time-intelligence/site/:siteId  (T1-T3 roles)
  GET /v1/analytics/time-intelligence/overview      (operator dashboard)

Operator surface:
  - ManagerHome.tsx widget: top-3 attendance-risk workers + site coverage gaps
  - NEW dashboard page TimeIntelligence.tsx for deep-dive
  - Per-worker view: AC-31 Phase B "Site & Hours" tab consumes this service

Worker-facing surface (read-only, no proactive comms — those gate on AC-43):
  - Worker sees own reliability score in Tier5Home or ProfileTab subsection
  - NO push / SMS / WhatsApp send from AC-47 (AC-43 owns proactive)

Data storage:
  - NO new tables required initially
  - Compute on-demand from existing 4 tables
  - OPTIONAL: attendance_summary materialized view if performance issue at scale (defer)
```

### Reliability-score overlap with AC-42 — decision point

`trust_scores` table EXISTS with `worker_id + score + breakdown JSONB`. Currently populated by `routes/trust.ts` with AI/trust-domain signals (not attendance). AC-42 (Reliability/points system) will need its own scoring engine.

**Three options** (decision belongs to AC-42 Phase B kickoff, NOT this audit):

- **Option A:** AC-47 attendance reliability writes a separate score column on workers or new table.
- **Option B:** AC-47 attendance reliability writes into trust_scores.breakdown JSONB as a category.
- **Option C (recommended):** AC-47 produces attendance facts; AC-42 reliability/points consumes them and computes points/rewards separately. Cleanest separation of concerns.

Recommend Option C — AC-47 Phase B can start without AC-42 existing.

---

## Verdict: GREEN shading toward YELLOW

**Why GREEN-leaning:**
- All 5 signal-source tables exist (gps_checkins is data-rich + has anomaly flag already)
- No new tables required initially
- Aggregation is a thin service layer
- No upstream gate (no operator interview, no legal review, no GDPR/channel decisions)
- Cleanest entry point for first per-AC Phase A from the Day 30 Scoping audit

**Two YELLOW caveats:**

1. **Data-presence-on-prod risk.** Mirrors Day 25 blueprint gap (legal_cases sparse on prod). Need to confirm `shifts` has data, `gps_checkins` has more than seed rows, `worker_availability` has entries. If prod data is light, time-intelligence surface ships empty — same risk as AC-31 Cases tab. **Mitigation:** Phase B first action = `SELECT COUNT(*)` per table on prod. Empty-state UX design mandatory.

2. **`hours_log` shape limitation.** Monthly-total grain + no worker_id FK means hours_log cannot be used for per-shift overtime detection. AC-47 must derive overtime from `gps_checkins.duration_minutes` vs scheduled shift length (from `shifts` table). This is fine if `shifts` table has scheduled-end data — needs verification at Phase B kickoff.

---

## Phase B effort estimate

| Stage | Effort |
|---|---|
| Service layer (`computeWorkerTimeIntelligence` + `computeSiteTimeIntelligence` + helpers) | 3-4h |
| Routes (3 new endpoints with tenant + role + range filtering) | 1-2h |
| Frontend: `TimeIntelligence.tsx` dashboard page + ManagerHome widget | 4-6h |
| Workforce-app: worker-facing read-only reliability display | 2-3h |
| Vitest tests for service layer | 1-2h |
| **Total** | **~11-17h = 2-3 dedicated build sessions** |

---

## Phase B gating rule

**AC-47 Phase B is UNGATED.** No operator interview required. No legal review required. No GDPR consent path required. No upstream-AC dependency.

**AC-47 Phase B UNLOCKS downstream:**

- **AC-41 (no-show engine)** consumes AC-47 attendance signals to fire no-show alerts.
- **AC-42 (reliability/points)** consumes AC-47 attendance facts to compute points (per Option C separation of concerns).
- **AC-44 (internal AI for lateness patterns / replacement / digest)** consumes AC-47 aggregated facts.
- **AC-31 Phase B "Site & Hours" tab** consumes `computeWorkerTimeIntelligence` for the per-worker drill-down view.

This makes AC-47 a leverage point: shipping its Phase B unblocks ~4 downstream ACs at the data-layer level.

---

## Phase B sequencing rule

When AC-47 Phase B starts:

1. **Pre-flight data presence check** — `SELECT COUNT(*)` per source table on prod. If `shifts` is empty or `worker_availability` is empty, surface as data-gap before any code is written.
2. **Service layer first** — `computeWorkerTimeIntelligence` as atomic commit. Pure compute, unit-testable, no DB writes.
3. **Routes second** — atomic commit per route. Smoke-test each with curl.
4. **Dashboard deep-dive page third** — `TimeIntelligence.tsx` as atomic commit. Empty-state design mandatory.
5. **ManagerHome widget fourth** — integration with existing surface.
6. **Workforce-app worker-facing fifth** — read-only display only (no proactive comms; those belong to AC-43).
7. **AC-42 integration** — defer to AC-42 Phase B; AC-47 produces signal only.

One commit per stage. Smoke-validate after each.

---

## Phase B first-action checklist (per stage)

Same discipline as AC-31 / AC-38 Phase A:

1. Read existing route handlers (gps.ts, shifts.ts, hours.ts) to confirm response shapes.
2. Verify `shifts.worker_ids` JSONB shape — is it `[{id, name, role}]` or just `[id, id]`?
3. Verify `worker_availability` write-path exists (who creates these rows? scheduled by whom?).
4. Confirm prod data presence (count rows in shifts, gps_checkins, worker_availability) before designing UI.
5. Re-read gps.ts:137-200 (anomaly detection rules) before extending with new categories.

---

## Anti-hallucination caveats

- **"Anomaly detection is inline at checkin/checkout"** — verified by reading gps.ts:137-139 + gps.ts:195-198. The is_anomaly write happens at INSERT/UPDATE time. The trigger logic (what conditions set `isAnomaly = true`) was NOT deep-read. Phase B first action MUST re-read those handlers to understand current rules before extending.
- **Effort estimates (11-17h)** assume `shifts.worker_ids` JSONB is queryable enough to JOIN against. If shape requires denormalization to a join table, add 2-3h.
- **"Data-presence on prod" caveat** is inferred from Day 25 blueprint gap pattern, NOT directly verified for shifts/gps_checkins counts on prod today. Phase B first action verifies.
- **`worker_availability` route NOT directly verified to exist** — no `/availability` route surfaced in grep. May be write-only via shift-create flow or by direct DB. Phase B first action clarifies.
- **`trust_scores` writer NOT deep-read** (just confirmed `routes/trust.ts` file exists). Whether it's safe to add attendance signals to its breakdown JSONB depends on existing schema constraints — AC-42 Phase B kickoff decision point, not AC-47's.
- **Per-vision-feature effort sizing (small/medium)** is t-shirt sizing, not hour estimate. Real per-feature effort confirmed at Phase B per-stage kickoff.

---

## Status

- **Phase A:** complete (this document).
- **Phase B:** **ungated.** Could start Day 31+ immediately if Manish approves. No upstream-AC or operator-interview dependency.
- **Downstream unblock:** AC-47 Phase B completion enables AC-41 + AC-42 + AC-44 + AC-31 Phase B "Site & Hours" tab at the data-layer level.
- **Worker-facing surface:** read-only display only; proactive comms gated on AC-43.

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
