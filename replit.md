# Apatris Compliance Dashboard + Workforce App

## Overview

This project develops two distinct applications within a single monorepo:

1.  **Apatris Compliance Dashboard**: A desktop web application designed for comprehensive management of over 200 welders, handling ZUS/PIT payroll, and compliance alerts. It leverages an Airtable backend for data and JWT for authentication. This application serves as the primary compliance and administrative hub.

2.  **Workforce App**: A mobile-first staffing platform targeting industrial professionals. It features a robust 5-tier enterprise Role-Based Access Control (RBAC) system and includes functionalities for worker dossiers, document management, and timesheets.

The overarching vision is to streamline compliance procedures, improve workforce management efficiency, and provide a unified platform for both administrative staff and field professionals in the industrial sector.

## User Preferences

I prefer detailed explanations for complex features and architectural decisions.
I want iterative development with regular checkpoints for feedback.
Before making any major architectural changes or introducing new dependencies, please ask for my approval.
I prefer a clear, concise communication style focusing on technical details and proposed solutions.
I prefer that the agent does not make changes to files within the `lib/` directory without explicit instructions.
Do not make changes to the `artifacts/api-server/data/payroll-records.json` file.

## System Architecture

The project is structured as a pnpm monorepo, housing both the Apatris Compliance Dashboard (React + Vite + Tailwind CSS) and the Workforce App (React + Vite + Tailwind CSS). The backend for the Compliance Dashboard is an Express.js API server that acts as an Airtable proxy and handles compliance logic.

**UI/UX Decisions:**

*   **Apatris Compliance Dashboard:**
    *   **Desktop Layout (≥769px):** Features a full-width top navigation bar (`app-top-bar` 52px) with branding, main navigation tabs (Workers, Payroll Ledger, Compliance Alerts, History & Analytics), Admin Settings, and user chip/logout. Content fills the remaining viewport.
    *   **Mobile Layout (≤768px):** Top bar displays brand, user, and logout. A fixed bottom bar provides primary tab navigation (Workers, Ledger, Alerts, History).
    *   **Worker Table:** Searchable, filterable by specialization and compliance status. Rows are color-coded (Red for critical, Orange for warning, Green for safe). Clicking a row opens a side panel for the full worker profile and document vault.
    *   **Compliance Dashboard Styling:** Industrial branding matching the Compliance Dashboard.
*   **Workforce App:**
    *   **Mobile-First Design:** Optimized for mobile experience.
    *   **5-Tier RBAC:** Implements a granular role-based access control system with distinct access levels (Executive, Legal Head, Tech Ops, Coordinator, Professional), each having specific navigation and feature visibility. Access inheritance is implemented (e.g., Executive has access of all lower tiers).
    *   **Worker Dossier:** A 4-tab overlay (Profile, Documents, Hours, Finance) provides detailed worker information, with editable fields and approval workflows based on RBAC.
    *   **Filter Pills:** Uses `flex-wrap` for status filter pills to ensure multi-row display on small screens.

**Technical Implementations:**

*   **Authentication:** JWT-based authentication for the Compliance Dashboard. Email OTP 2FA is implemented for admin logins. Workforce app uses `sessionStorage` for role-based authentication with `useAuth` context.
*   **Persistent Storage & History Layer:** PostgreSQL database is provisioned with performance-indexed tables for `audit_logs`, `payroll_commits`, `payroll_snapshots`, `notification_log`, and `document_changes`.
    *   **Audit Log:** Comprehensive logging of actions and actors, filterable and stored permanently in PostgreSQL.
    *   **Payroll Commits:** Monthly payroll data is permanently recorded in `payroll_commits` and `payroll_snapshots` with detailed breakdowns.
    *   **Notification Log:** Records email and WhatsApp notifications.
    *   **History Page (`/history`):** Provides tabs for Payroll (expandable commits, CSV export), Analytics (trends, top earners, activity breakdown), Activity (filterable audit log), and Messages (notification log).
*   **Payroll Engine:**
    *   **Global Payroll Run Page (`/payroll`):** Features summary cards, an inline-editable data grid for hours, rates, advances, and penalties, with live `Calculated Netto` updates. Supports month picking and PDF export.
    *   **"Close Month & Save to Ledger":** Commits monthly payroll, snapshots worker data, resets monthly fields in Airtable, and logs an audit entry.
    *   **Payslip Email Delivery:** Automated HTML payslip emails are sent to workers with email addresses upon payroll commit.
    *   **ZUS/PIT Breakdown Toggle:** Shows detailed Polish payroll calculations (Employee ZUS, Health Insurance, estimated PIT) and Employer ZUS costs.
    *   **Bank CSV Export:** Generates a transfer list compatible with Polish online banking.
    *   **Accounting CSV Export:** Comprehensive CSV export with 19 columns for financial reconciliation.
    *   **Bulk Hours Entry:** Allows applying hours to multiple filtered workers simultaneously.
*   **Compliance Logic:**
    *   **Document Expiry Scanning:** The scheduler scans all 8 expiry fields from the `Welders` table (TRC, Passport, BHP, Work Permit, Contract, Medical Exam, Oświadczenie, UDT Certificate).
    *   **Compliance Statuses:** Defined as Critical (<30 days expiry), Warning (30-60 days expiry), Non-Compliant (BHP Expired or any document expired), and Compliant (>60 days expiry).
    *   **Automated Email Alerts:** Sends email alerts for both critical (RED/EXPIRED) and warning (YELLOW, 30-60 days) compliance statuses.
*   **Worker Profile Panel:** Organized into sections for Core Details, Polish Compliance Documents, Identity & Legal, EN ISO 9606 Welding Cert, and Payroll with advance deduction. Includes a "PIP Inspection Mode" for printable worker cards.
*   **Session Management:** 30-minute auto-logout via activity tracking.
*   **PDF Export:** Utilizes `jsPDF` and `jsPDF-autotable` for generating compliance reports and final settlement PDFs.

## External Dependencies

*   **Database:** PostgreSQL (for audit logs, payroll history, notification logs)
*   **External Data Source:** Airtable (via REST API) for core worker data, compliance documents, and various other fields.
*   **API Framework:** Express 5
*   **Frontend Framework:** React 19
*   **Build Tool:** Vite
*   **Styling:** Tailwind CSS v4
*   **Validation:** Zod (`zod/v4`), `drizzle-zod`
*   **API Codegen:** Orval (from OpenAPI spec)
*   **PDF Generation:** `jsPDF`, `jsPDF-autotable`
*   **Charting:** Recharts (for compliance trend charts)