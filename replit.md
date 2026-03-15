# Apatris Compliance Dashboard

## Overview

Full-stack compliance portal for managing 200+ welders. Built as a pnpm workspace monorepo with TypeScript.

## Implemented Features

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
