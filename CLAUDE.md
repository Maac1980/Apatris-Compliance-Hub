# Apatris Compliance Hub

## Business Purpose
Apatris Compliance Hub is an industrial compliance and workforce management platform for Apatris — a staffing agency managing 200+ certified welders and construction workers across multiple sites in Poland. It handles worker compliance tracking (TRC, passport, BHP, work permits, contracts, medical exams, UDT certificates), payroll with verified Polish ZUS/PIT calculations, document management with AI OCR, GPS tracking, and multi-tier RBAC.

## GitHub Repository
`Maac1980/Apatris-Compliance-Hub`

## Deployment
- **Primary:** Replit (autoscale deployment, PNPM workspace)
- **Build:** `pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/workforce-app run build && pnpm --filter @workspace/apatris-dashboard run build`
- **Run:** `node artifacts/api-server/dist/index.cjs`
- **Health Check:** `GET /api/healthz`
- **Port:** 8080 internal → 80 external

## Tech Stack

### Backend
- **Runtime:** Node.js 24, TypeScript 5.9, Express 5
- **Database:** PostgreSQL 16 (Drizzle ORM, 25+ tables)
- **Auth:** JWT (15min + 30-day refresh), Email OTP 2FA, Mobile PIN (speakeasy TOTP)
- **Security:** Helmet, CORS, express-rate-limit, cookie-parser
- **AI:** OpenAI gpt-4o-mini (document OCR, compliance analysis, regulatory scan, immigration search)
- **Email:** Brevo SMTP / Resend / Nodemailer
- **SMS:** Twilio (SMS + WhatsApp)
- **PDF:** PDFKit (contracts, payslips, compliance reports)
- **Storage:** Cloudflare R2 (S3-compatible) or local filesystem
- **Scheduling:** node-cron (daily compliance alerts)
- **Logging:** Pino, Sentry
- **Testing:** Vitest (auth, payroll, GDPR, country compliance, ZUS tests)

### Frontend — Dashboard (`artifacts/apatris-dashboard/`)
- **Framework:** React 19, Vite 7.3, TypeScript
- **Styling:** Tailwind CSS 4, Radix UI (25+ primitives)
- **State:** TanStack React Query v5, React Context
- **Routing:** Wouter (URL-based SPA routing)
- **Charts:** Recharts
- **PDF:** jsPDF + jspdf-autotable
- **i18n:** i18next (English/Polish)
- **Design:** Dark theme, desktop-first responsive layout

### Frontend — Workforce App (`artifacts/workforce-app/`)
- **Same as dashboard + face-api.js for biometric auth**
- **5-tier RBAC:** T1 Executive, T2 Legal Head, T3 Tech Ops, T4 Coordinator, T5 Professional
- **PWA:** Installable mobile app with offline capability

### Monorepo Structure
```
/                              # pnpm workspace root
├── artifacts/
│   ├── api-server/            # Express API (100+ endpoints)
│   ├── apatris-dashboard/     # Admin dashboard (React)
│   ├── workforce-app/         # Worker mobile PWA (React)
│   └── mockup-sandbox/        # UI staging
├── lib/
│   ├── db/                    # Drizzle ORM schema & migrations
│   ├── api-zod/               # Shared Zod schemas
│   └── api-client-react/      # React API hooks (TanStack Query)
└── scripts/                   # Deployment scripts
```

## Features Built (22+)

### Core Workforce Management
1. **Worker Database** — 200+ worker profiles (60+ fields: contact, docs, rates, compliance, PESEL, IBAN)
2. **Bulk Worker Import** — CSV/Excel import with deduplication and validation
3. **Worker Profiles** — 5-section layout (Core Details, Polish Compliance, Identity/Legal, Welding Certs, Payroll)
4. **Worker Search & Filtering** — Full-text search, filter by specialization/status/site

### Compliance Management
5. **Document Tracking** — 8+ expiry fields (TRC, Passport, BHP, Work Permit, Contract, Medical, Oswiadczenie, UDT)
6. **Compliance Color Zones** — GREEN >60d, YELLOW 30-60d, RED <30d, EXPIRED
7. **Compliance Snapshots** — Daily automated snapshots (total/compliant/warning/critical/expired)
8. **Compliance Trend Charts** — Historical trend visualization with Recharts
9. **Real-time Alerts** — Email/WhatsApp notifications for critical & warning statuses
10. **Audit Logging** — Immutable trail of all actions (create/update/delete)

### Payroll System
11. **ZUS/PIT Calculator** — Accurate Polish net calculation (employee ZUS, health, PIT, employer ZUS)
12. **Monthly Payroll Ledger** — Inline-editable grid with hourly rate, hours, advances, penalties
13. **Payroll Commits** — Lock monthly payroll, generate snapshots, reset in Airtable
14. **Payslip Email Delivery** — HTML email payslips with detailed breakdown
15. **Bank CSV Export** — Polish banking format for direct transfers
16. **Accounting CSV Export** — 19-column CSV for accountants

### Document Management
17. **Document Workflows** — Upload → Review → Approve/Reject with versioning
18. **AI Document Scanning** — OpenAI Vision OCR for passport/contract/certificate extraction
19. **PDF Export** — Compliance reports and settlement PDFs with jsPDF

### Advanced Features
20. **Face Recognition** — Biometric login using face-api.js (128D embeddings)
21. **GPS Location Tracking** — Check-in/check-out with geofence validation (200m radius)
22. **Hours Tracking & Approval** — T5 submit, T1-T4 approve monthly hours
23. **Contract Management** — Generate/store/version contracts (Zlecenie/O Prace/B2B)
24. **Electronic Signatures** — Capture with timestamp & IP logging
25. **Power of Attorney (POA)** — Manage authorized signatories
26. **GDPR Compliance** — Consent records, data export/deletion, processing logs
27. **Posted Workers A1 Certificates** — EU Posted Workers Directive compliance
28. **Site Coordinators** — On-site supervisors with alert routing
29. **Multi-Tenant Support** — Full tenant isolation (data, branding, settings)
30. **Regulatory Intelligence** — AI-powered Polish law monitoring (work permits, ZUS, labor law, fines)
31. **Immigration Search Engine** — AI Q&A on Polish immigration law with confidence scores
32. **Analytics & Predictive** — Worker KPIs, compliance heatmaps, predictive analytics
33. **Client Portal** — Read-only access tokens for external client compliance viewing

## Environment Variables

### Required
```
DATABASE_URL=postgresql://user:password@localhost:5432/apatris
JWT_SECRET=<random-64-char-hex>
PORT=8080
```

### Admin Access
```
APATRIS_PASS_MANISH=<admin-password>
APATRIS_PASS_AKSHAY=<admin-password>
```

### AI Services
```
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
```

### Email (Brevo SMTP)
```
SMTP_USER=<brevo-smtp-user>
SMTP_PASS=<brevo-smtp-password>
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
```

### File Storage (Cloudflare R2, optional)
```
FILE_STORAGE=s3
S3_BUCKET=apatris-documents
S3_REGION=auto
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
```

## Database
- PostgreSQL 16 with Drizzle ORM
- 25+ tables: workers, documents, contracts, signatures, audit_logs, payroll_commits, payroll_snapshots, hours_log, mobile_pins, notification_log, document_workflows, face_encodings, a1_certificates, posting_assignments, site_geofences, gps_checkins, push_subscriptions, consent_records, gdpr_log, refresh_tokens, tenants, site_coordinators, admins, power_of_attorney, client_portal_tokens, regulatory_updates, immigration_searches
- Push schema: `cd lib/db && pnpm push`

## API Structure
- 100+ endpoints across 27 route files in `artifacts/api-server/src/routes/`
- Key route groups: auth, workers, hours, payroll, documents, document-workflow, contracts, signatures, compliance, country-compliance, gps, posted-workers, gdpr, face-auth, ai, analytics, admins, site-coordinators, tenants, history, logs, push, platform, files, settings, regulatory, immigration

## Dashboard Navigation
- URL-based routing via Wouter
- Pages: Workers (main), Payroll, Compliance Alerts, Contracts, Documents, GPS Tracking, Analytics, AI Copilot, Regulatory Intelligence, Immigration Search, History, Admin Settings
- i18n: English/Polish toggle (i18next)
- Dark theme with Apatris red (#C41E18) branding

## Workforce App (5-Tier RBAC)
- T1 (Executive): Full system overview, admin controls
- T2 (Legal Head): Legal compliance, contracts, signatures
- T3 (Tech Ops): Operational modules, site deployments, timesheets
- T4 (Coordinator): Worker queue, compliance alerts, document management
- T5 (Professional): Digital site pass, document reminders, hours submission

## Testing
- Vitest unit tests in `artifacts/api-server/src/*.test.ts`
- Run: `cd artifacts/api-server && npx vitest run`
- Test coverage: auth, payroll, GDPR, country compliance, ZUS calculations
