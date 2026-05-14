# AC-34 — Job 12 Daily Legal Scan — Operations Guide

**Status:** Operationally validated 2026-05-14 on production v302.
**Audience:** Yulia, Manish, or any Admin-role operator.
**Lifespan:** Active workaround until AC-33 v303 deploys (then cron path goes live automatically; this button remains useful for on-demand scans).

---

## Purpose

Fire the worker permit-renewal legal scan daily on production v302 while the AC-33 v303 cron deploy is pending. This is the manual-trigger path that exposes Job 12's output to humans via the dashboard.

Until v303 deploys, the scheduled 04:00 UTC cron continues to run in `dryRun=true` mode and writes nothing. The dashboard button described here calls the same scan service in **live mode** and writes alerts to the `legal_alerts` table.

---

## Daily steps (~10 seconds)

1. **Log into the APATRIS dashboard** (fingerprint auth, as usual).
2. **Navigate to Legal Alerts** — `/legal-alerts`, accessible via the Legal Immigration Command navigation.
3. **Click the red "Run Scan Now" button** (top-right of the page, Play icon).
4. **Toast confirms:** `Scan complete — N alert(s) generated`.
5. **Alerts table below auto-refreshes** with the full breakdown.

That's it. No Terminal, no token, no curl.

---

## What the page shows after the scan

- **Top counters:** total / unread / CRITICAL / HIGH (also COMPLIANT / WARNING / CRITICAL / EXPIRED breakdown depending on view).
- **Filter tabs:** ALL / RED / EXPIRED / YELLOW / GREEN — toggle to focus on what matters.
- **Per-worker per-document table:** worker name + document type + status + days remaining + expiry date, color-coded, sorted by urgency (most urgent first).
- **Mark-as-read** per alert; unread count badge at the top of the page.
- **Auto-refresh:** the alerts list polls every 30 seconds, so re-clicking the button is rarely needed within the same session.

---

## When to run it

Once per day, morning recommended (mirrors what the 04:00 UTC cron will do once v303 is live). Re-running is harmless — the scan is idempotent for a given day's worker state, and the UI will simply re-confirm existing alerts.

---

## Validation record

- **Date:** 2026-05-14 (Day 28).
- **Environment:** production v302 (Fly app `apatris-api`, image `deployment-01KRB4JQTNA9PGEVG9SXRWPZQY`).
- **Result:** "Scan complete — 20 alert(s) generated."
- **Page state after scan:** 21 COMPLIANT / 1 WARNING / 3 CRITICAL / 4 EXPIRED counters; full table populated and sorted correctly.
- **Data note:** the current alert set reflects seed-data workers (Andrzej Zieliński, Piotr Wiśniewski, etc.). When real workers populate the schema, the same page surfaces their real expiring permits identically — no further code or config changes required.

---

## Under the hood (for reference)

- **Page:** `artifacts/apatris-dashboard/src/pages/LegalAlerts.tsx`
- **Button → mutation:** `LegalAlerts.tsx:113` → `scanMutation` (line 61).
- **API call:** `POST api/v1/legal/scan/run` with admin auth headers.
- **Route handler:** `artifacts/api-server/src/routes/legal-alerts.ts:38` — `requireAuth, requireRole("Admin")`.
- **Service:** `artifacts/api-server/src/services/daily-legal-scan.service.ts:76` — `runDailyLegalScan(tenantId?: string, dryRun: boolean = false)`. Route calls with single arg, so `dryRun` defaults to `false` → LIVE mode → writes to `legal_alerts`.

The 04:00 UTC scheduled cron path is separate (`scheduler.ts:688` → `startDailyLegalScan(dryRun)`) and is currently invoked with `dryRun=true` on v302. The flag flip to `false` is committed (commit `de62035`) but lives on a HEAD newer than v302; it ships with v303 once AC-33 build-pipeline issues are resolved.

---

## When this guide becomes obsolete

Once AC-33 is resolved and v303 deploys:

- The 04:00 UTC cron runs in live mode automatically every day.
- The dashboard button remains available for **on-demand** scans (e.g., after a known permit change mid-day, or for ad-hoc verification).
- Daily manual clicking is no longer required.

Keep this document in `docs/` as historical record of the workaround pattern; mark the top status line "SUPERSEDED by AC-33" once cron is live.
