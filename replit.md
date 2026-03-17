# Apatris Compliance Dashboard

## Overview

Full-stack compliance portal for managing 200+ welders. Built as a pnpm workspace monorepo with TypeScript.

## Implemented Features

### Persistent Storage & History Layer (Complete)
- **PostgreSQL database provisioned** with 5 tables: `audit_logs`, `payroll_commits`, `payroll_snapshots`, `notification_log`, `document_changes` — all with performance indexes.
- **Audit log** migrated from JSON file to PostgreSQL — unlimited permanent history, filterable by action type and actor.
- **Payroll commits** permanently recorded: each month commit saves to `payroll_commits` + per-worker snapshot to `payroll_snapshots` with full ZUS/PIT/netto breakdown.
- **Notification log**: payslip emails auto-logged at commit; WhatsApp messages logged via `POST /api/history/notifications`.
- **History page** (`/history`) with 4 tabs:
  - **Payroll** — every commit expandable to show full worker breakdown table + CSV export per commit
  - **Analytics** — monthly gross/netto trend bars, top 10 earners all-time, action type breakdown chart
  - **Activity** — filterable audit log table (action type + actor filters)
  - **Messages** — notification log with channel badges (payslip/email/WhatsApp)
- **History nav button** added to Dashboard header (purple, between Payroll and Admin Settings).
- New API routes: `GET /api/history/commits`, `GET /api/history/commits/:id`, `GET /api/history/analytics`, `GET /api/history/audit`, `GET/POST /api/history/notifications`.

### Final Version Upgrade (All Complete)
- **Email OTP 2FA**: Admin logins (manish/akshay) now require a 6-digit one-time code sent to their email after password verification. Falls back to direct login if SMTP is not configured so no lockout risk. Coordinators are not affected.
- **ZUS/PIT breakdown toggle in Payroll**: "ZUS View" button shows Employee ZUS (13.71%), Health Insurance (9%), estimated PIT (12% with KUP) columns per worker — Polish umowa zlecenie law. Values are additive over existing gross/advance/penalties.
- **Bank CSV export**: "Bank CSV" button in PayrollPage generates a transfer list (Name, Site, Netto, "Wynagrodzenie za [month]" title, IBAN placeholder) ready to import into any Polish online banking batch payment portal.
- **Payslip email delivery**: At month commit (`POST /payroll/commit`), an HTML payslip email is automatically sent to every worker who has an email address in Airtable. CommitResult now includes `payslipsSent` count.
- **Mobile card view**: Dashboard now shows a touch-friendly card list on phones/small tablets (md:hidden) with Name, Status badge, Site, TRC/Passport day badges, and tap-to-open. Desktop table is unchanged (hidden md:block).
- **Audit log expanded**: Action types now include `PAYROLL_COMMIT` and `ADMIN_LOGIN` for full audit coverage.

### Core T001–T007 (All Complete)
- **T001** Session timeout: 30-min auto-logout via activity tracking
- **T002** Contract expiry in scheduler alerts alongside TRC/Passport/BHP
- **T003** Per-site dashboard view with compliance score per site
- **T004** Notification history log (JSON + API + Admin UI)
- **T005** Activity audit log (JSON + API + Admin UI)
- **T006** Compliance trend chart (recharts LineChart, daily snapshots)
- **T007** PDF export via jsPDF + jsPDF-autotable in ComplianceReportModal

### Polish Labour Law Compliance Upgrade (Complete)
14 new Airtable fields added and mapped:
- **Polish Compliance Docs**: Medical Exam Expiry, Oświadczenie Expiry, UDT Cert Expiry, RODO Consent Date, PUP Filed Date
- **Identity & Legal**: PESEL, NIP, Visa Type, ZUS Status (singleSelect: Registered/Unregistered/Unknown)
- **EN ISO 9606 Welding Cert**: Welding Process, Material Group, Thickness Range, Position
- **Payroll**: Advance field — deducted from gross for final net salary display

### WorkerProfilePanel Sections
- Core Details (TRC, BHP, Passport, Contract, Email, Phone, Site)
- Polish Compliance Documents (Medical/Oświadczenie/UDT/RODO/PUP)
- Identity & Legal (PESEL, NIP, ZUS Status, Visa Type)
- EN ISO 9606 Welding Cert (Process, Position, Material Group, Thickness)
- Payroll with advance deduction (Admin only — gross → advance → final net)
- PIP Inspection Mode: printable card with all docs + welding cert + signature block
- **Payroll History Tab** (Admin only): table of all past payroll records, lifetime totals, "Print Final Settlement PDF" button (A4 PDF with worker info, full payroll table, signature lines)

### Monthly Payroll Engine (Complete)
- **New Airtable field**: `Penalties` (number, precision 2) added to Workers table
- **Payroll Records Store**: `artifacts/api-server/data/payroll-records.json` (UUID-keyed records)
- **Global Payroll Run page** (`/payroll`): 
  - Summary cards: Workers, Total Hours, Gross Payroll, Deductions, Total Netto
  - Inline-editable data grid: click any Hours/Rate/Advances/Penalties cell to edit in place
  - Live "Calculated Netto" column updates instantly on edit
  - Totals footer row
  - Month picker, PDF export of the full grid
- **Close Month & Save to Ledger** ("Zamknij Miesiąc"):
  - Confirmation modal with full summary before committing
  - Snapshots every worker's payroll into `payroll-records.json`
  - Resets MONTHLY_HOURS, Advance, Penalties to 0 in Airtable for all workers
  - Writes audit log entry
- **Worker Payroll History tab** in WorkerProfilePanel (Admin only)
- **Dashboard nav button**: green "Payroll" button (Admin only) → `/payroll`

### Additional Features (All Complete)
- **Employer ZUS cost display**: New "Total Empl. Cost" column in ZUS view — shows Apatris's total employer burden per worker (gross + employer ZUS: emerytalne 9.76% + rentowe 6.5% + wypadkowe 1.67% + FP 2.45% + FGŚP 0.10% = 20.48%). Employer rates configurable in ZUS Rates modal. Footer totals and ZUS banner both show employer summary.
- **Automated expiry email alerts (YELLOW)**: Daily compliance scan now sends email alerts for YELLOW (30–60 day) warnings, not just RED/EXPIRED. Previously only critical/expired docs triggered emails.
- **Full worker expiry field scanning**: Scheduler now scans all 8 expiry fields from the WELDERS table (TRC, Passport, BHP, Work Permit, Contract, Medical Exam, Oświadczenie, UDT Certificate) — not just the Documents table and contract dates. Any field within 60 days triggers a log entry; within 30 days or expired triggers an email.
- **Bulk payroll hours**: "Bulk Hours" button in the payroll grid toolbar. Click to enter hours value, then "Apply to X" saves that value for all currently visible (filtered) workers at once. Respects search and site filter. Press Enter or Escape to confirm/cancel.
- **Accounting CSV export**: New "Accounting" button in payroll header. Exports a comprehensive CSV with 19 columns per worker: Name, PESEL, NIP, Site, Hours, Rate, Gross, Employee ZUS, Health Insurance, KUP, Tax Base, PIT-2 status, Est. PIT, Net After Tax, Advance, Penalties, Net Pay, Employer ZUS, Total Employer Cost. Uses BOM for Excel compatibility.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **API framework**: Express 5
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **External Data**: Airtable (via REST API, server-side)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/       # Express API server — Airtable proxy + compliance logic
│   └── apatris-dashboard/# React + Vite frontend — compliance dashboard
├── lib/
│   ├── api-spec/         # OpenAPI spec + Orval codegen config
│   ├── api-client-react/ # Generated React Query hooks
│   ├── api-zod/          # Generated Zod schemas from OpenAPI
│   └── db/               # Drizzle ORM (not used — Airtable is the data source)
├── scripts/              # Utility scripts
└── pnpm-workspace.yaml
```

## Key Features

- **Login screen** — `admin@apatris.com` / `apatris2024`
- **4 Stats Cards** — Total Workers, Critical (<30 days), Upcoming Renewals (30-60 days), Non-Compliant
- **Worker Table** — Searchable, filterable by Specialization (TIG/MIG/ARC) and Compliance Status
- **Color-coded rows** — Red (critical), Orange (warning), Green (safe)
- **Side Panel** — Click any row for full worker profile + Document Vault
- **Action Buttons** — Notify Worker (email/SMS) and Renew Document per row
- **Compliance Report** — Generate report button with modal summary

## Airtable Integration

Secrets required:
- `AIRTABLE_API_KEY` — Personal Access Token
- `AIRTABLE_BASE_ID` — Base ID (starts with `app`)
- `AIRTABLE_TABLE_NAME` — Table name (default: `Welders`)

Expected Airtable field names (flexible mapping):
- Name / Full Name / Worker Name
- Specialization / Type / Welding Type
- TRC Expiry / TRC_Expiry
- Work Permit Expiry / Work_Permit_Expiry
- BHP Status / BHP_Status
- Contract End Date / Contract_End_Date
- Email, Phone
- Passport (attachment field)
- Contract (attachment field)

## Deployment Notes

- **Build**: Replit runs `pnpm --filter @workspace/apatris-dashboard run build` (Vite → `dist/public/`) and `pnpm --filter @workspace/api-server run build` (esbuild CJS → `dist/index.cjs`)
- **Run**: `node artifacts/api-server/dist/index.cjs` from workspace root — listens on `$PORT`, serves API at `/api` and React frontend (SPA) from static files.
- **Vite config**: `PORT` and `BASE_PATH` are optional (defaults: `3000` / `/`) so deployment build never crashes.
- **Data files**: `notif-log.ts`, `snapshot.ts`, `payroll-records.ts`, `site-coordinators.ts` use `process.cwd()` as anchor for the `data/` dir — works correctly in both dev (`tsx`) and production (bundled CJS).
- **Express 5 wildcard**: SPA catch-all uses `"*splat"` pattern (required by path-to-regexp v8+).

## Compliance Logic

- **Critical**: any document expires in < 30 days
- **Warning**: any document expires in 30-60 days
- **Non-Compliant**: BHP Status = "Expired" OR any document already expired
- **Compliant**: all documents > 60 days from expiry

## API Endpoints

All at `/api`:
- `GET /workers` — list all workers (search/spec/status/site/showArchived filters)
- `GET /workers/stats` — dashboard stats
- `GET /workers/report` — compliance report
- `GET /workers/:id` — worker detail
- `PATCH /workers/:id` — update worker (renew document, workerStatus, etc.)
- `POST /workers/:id/notify` — send notification
- `POST /workers` — create new worker (Admin only)
- `DELETE /workers/:id` — delete worker (Admin only)
- `GET /payroll/current` — all workers with payroll fields + live calculations
- `PATCH /payroll/workers/:id` — update hourlyRate / monthlyHours / advance / penalties
- `POST /payroll/commit` — close month: snapshot all workers, reset fields to 0
- `GET /payroll/history/:workerId` — payroll records for a worker
- `GET /payroll/history` — all payroll records
- `GET /site-coordinators` — list coordinators (no password hashes)
- `POST /site-coordinators` — add coordinator (name, email, password, assignedSite)
- `PATCH /site-coordinators/:id` — update coordinator (name, password, assignedSite)
- `DELETE /site-coordinators/:id` — remove coordinator
- `GET /settings/status` — SMTP config status + admin password env-var status
