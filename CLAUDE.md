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

---

## ROADMAP — Phase 1-3 Execution Plan

### Owner: Manish Shetty
### Companies: Apatris, EEJ (Euro Edu Jobs), IWS, STPG
### Workers: 200+ certified welders across Poland, Ireland, Germany

---

## RULES (MUST FOLLOW)
- Always use pnpm not npm
- Always build dist before pushing
- Always test ZUS formula: 160h × 31.40 = 3929.05 net
- Never use DROP TABLE — only CREATE TABLE IF NOT EXISTS
- Never break existing features
- Use NEON_DATABASE_URL for Apatris database connection
- Push to `main` branch for Apatris
- After every change: build dist → copy to artifacts → commit → push
- Replit deploy: `git fetch origin main && git reset --hard origin/main`

---

## PHASE 1 — WEEK 1: Core Business Tools (21 Features)

### 1. CRM Module
- Client list: company name, NIP, contact person, email, phone, industry
- Deal pipeline: Lead → Proposal → Negotiation → Won → Active
- Activity log per client (calls, emails, meetings, notes)
- Link clients to workers assigned to them
- Dashboard widget showing pipeline value and conversion rate

### 2. Client Portal
- Read-only access for clients to see their workers' compliance status
- Document expiry dashboard per client
- Worker profiles visible to their employer
- Secure token-based access (no login required)

### 3. Worker Self-Service Portal
- Workers login with PIN/biometric
- See own documents, expiry dates, payslips
- Submit hours, request leave, upload documents
- View assigned site and schedule

### 4. Google Workspace Integration (Gmail, Calendar, Drive, Chat)
- MCP Server: google-workspace
- Auto-send compliance alerts via Gmail
- Schedule interviews in Google Calendar
- Store contracts in Google Drive
- Team chat notifications in Google Chat

### 5. WhatsApp Alerts via Twilio
- MCP Server: twilio
- Send document expiry reminders to workers via WhatsApp
- Payslip delivery via WhatsApp
- Shift assignment notifications
- Two-way messaging (worker can reply)

### 6. AI Contract Generator
- Generate Umowa Zlecenie / Umowa o Pracę from worker data
- Auto-fill: name, PESEL, IBAN, rate, site, dates
- Polish legal templates with RODO clause
- PDF generation with signature fields
- One-click send to worker for e-signature

### 7. Worker Matching AI
- Client requests: "5 TIG welders, Cork, next Monday"
- AI searches available workers by: specialization, location, documents, experience
- Match score 0-100 based on fit
- One-click assign and notify

### 8. Predictive Compliance
- AI predicts which documents will expire in 30/60/90 days
- Risk scoring per worker (green/yellow/red)
- Auto-trigger renewal reminders
- PIP inspection readiness score

### 9. Salary Prediction AI
- Predict market rate for role + location + experience
- Compare worker salary to market median
- Suggest adjustments for retention
- Trained on Polish market data

### 10. Legal Change Predictor
- Monitor Polish government gazette (Dz.U.)
- Predict impact of upcoming legislation on workforce
- Alert when new law affects work permits, ZUS, or labor code
- Auto-update compliance checklists

### 11. Revenue Forecasting
- Predict monthly revenue based on active contracts
- Worker utilization rate tracking
- Margin analysis per client
- Cash flow projection

### 12. Onboarding Checklist
- Step-by-step new worker setup
- Document collection tracker
- ZUS registration reminder
- Site safety briefing confirmation
- Auto-create worker profile when checklist complete

### 13. Invoice Auto-Send
- Generate Faktura VAT monthly per client
- Calculate: hours × rate × workers + VAT 23%
- Auto-send via email on 1st of month
- Track payment status (sent → paid)

### 14. Salary Advance Request
- Worker requests advance via mobile app
- Manager approves/rejects
- Deducted from next payroll automatically
- Limit: max 50% of earned amount

### 15. Voice Check-in
- Worker calls a phone number to check in/out
- Twilio Voice API records timestamp + caller ID
- Auto-matches to worker by phone number
- Replaces manual GPS check-in for sites without internet

### 16. Worker Mood Tracker
- Weekly pulse survey (1-5 scale) via mobile app
- "How are you feeling at work this week?"
- Aggregate mood scores per site
- Alert manager when site mood drops below threshold

### 17. ESSPASS Integration
- Track EU digital social security pass
- Verify posted worker status
- Auto-check A1 certificate validity
- Integration with EU ESSPASS portal when available

### 18. ZUS/DRA Tax Filing Auto
- Generate ZUS DRA declaration monthly
- Calculate all contribution amounts per worker
- Export XML for ZUS e-Płatnik submission
- Track filing status (draft → submitted → confirmed)

### 19. Multi-Country Support
- Ireland: Revenue.ie tax rules, PRSI contributions
- Germany: Sozialversicherung, Lohnsteuer
- Czech Republic: ČSSZ contributions
- Country-specific payroll calculators
- Work permit rules per country

### 20. Site Safety AI
- AI scans uploaded site photos for safety violations
- PPE detection (helmet, gloves, glasses)
- Incident reporting with photo evidence
- Safety score per site

### 21. Competitor Price Monitor
- Track competitor pricing for welding services
- Alert when market rates change
- Pricing recommendation engine
- Win/loss analysis on proposals

---

## PHASE 2 — ENTERPRISE ARCHITECTURE

### Model Routing
- Simple queries → Gemini Flash (fast, cheap)
- Complex reasoning → Claude Sonnet (accurate)
- Private data → Llama on AWS Bedrock (secure)
- Image scanning → Claude Vision
- Real-time search → Perplexity API

### Sub-Agent Architecture
- Main agent receives request
- Spawns sub-agents in parallel:
  * Compliance sub-agent → checks documents
  * Payroll sub-agent → calculates ZUS
  * Immigration sub-agent → searches law changes
  * Notification sub-agent → sends WhatsApp/email
- Results aggregated and returned to user

### AWS Bedrock Integration
- Run models privately for sensitive worker data
- PESEL, IBAN, passport data never leaves AWS
- Auto-scale based on agency count

### Google Vertex AI
- AutoML for worker matching
- Demand forecasting for staffing needs
- Salary prediction model trained on Polish market data

### MCP Servers
- google-workspace → Gmail, Calendar, Drive, Chat
- twilio → WhatsApp, SMS, Voice
- stripe → Billing, invoices
- neon → Direct database queries
- github → Auto deployment

---

## PHASE 3 — SaaS PLATFORM

### Multi-Tenant SaaS
- Any staffing agency can sign up at apatris.io
- Starter €199/month (25 workers)
- Professional €499/month (100 workers)
- Enterprise €999/month (unlimited)
- White-label option for large agencies

### API Marketplace
- Public API for third-party integrations
- Webhook system for real-time events
- SDKs for Python, Node.js, .NET
- Partner program for HR software vendors
