# Apatris Compliance Hub

## Business Purpose
Apatris Compliance Hub is an industrial compliance and workforce management platform for Apatris — a staffing agency managing 200+ certified welders and construction workers across multiple sites in Poland. It handles worker compliance tracking (TRC, passport, BHP, work permits, contracts, medical exams, UDT certificates), payroll with verified Polish ZUS/PIT calculations, document management with AI OCR, GPS tracking, and multi-tier RBAC.

## GitHub Repository
`Maac1980/Apatris-Compliance-Hub`

## Deployment
- **Primary:** Fly.io (apatris-api at apatris-api.fly.dev). Deploy: `flyctl deploy --remote-only --app apatris-api` (rebuilds dist via Dockerfile remote builder from current main HEAD).
- **Deprecated:** Replit (autoscale deployment was used historically; migration to Fly completed; Replit project deleted Day 23 May 9, 2026).
- **Note (added Day 24):** Sentry M9 events that surfaced Day 22-23 were initially attributed to Replit zombie — that framing was incorrect. Actual source was apatris-api-staging on Fly running stale May 6 image, sharing SENTRY_DSN with prod. Staging suspended Day 24 (flyctl scale count 0 destroyed both machines; app shell preserved). When staging is needed again, deploy strategy decision pending per AC-28.
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
- **AI:** Anthropic Claude Sonnet 4.6 (50+ call sites — document OCR via vision, compliance analysis, contract generation, legal Q&A, immigration search, case lifecycle); Perplexity Sonar Pro / Sonar (regulatory intelligence, legal research routing). Keys: `ANTHROPIC_API_KEY`, `PPLX_API_KEY`. Provider abstraction in `src/services/ai/provider.ts` scaffolded for OpenAI/Gemini but not active.
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
│   ├── api-server/            # Express API (~688 endpoints across 131 route files)
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
ANTHROPIC_API_KEY=sk-ant-...           # Claude Sonnet 4.6 — primary AI
PPLX_API_KEY=pplx-...                  # Perplexity Sonar — regulatory/legal research
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
- ~150 tables: workers, documents, contracts, signatures, audit_logs, payroll_commits, payroll_snapshots, hours_log, mobile_pins, notification_log, document_workflows, face_encodings, a1_certificates, posting_assignments, site_geofences, gps_checkins, push_subscriptions, consent_records, gdpr_log, refresh_tokens, tenants, site_coordinators, admins, power_of_attorney, client_portal_tokens, regulatory_updates, immigration_searches, plus many additional case-event, regulatory, intelligence, payroll, and audit tables (full count via `grep -c "CREATE TABLE" artifacts/api-server/src/lib/init-db.ts`)
- Push schema: `cd lib/db && pnpm push`

## API Structure
- ~688 endpoints across 131 route files in `artifacts/api-server/src/routes/`
- Key route groups: auth, workers, hours, payroll, documents, document-workflow, contracts, signatures, compliance, country-compliance, gps, posted-workers, gdpr, face-auth, ai, analytics, admins, site-coordinators, tenants, history, logs, push, platform, files, settings, regulatory, immigration

## Dashboard Navigation
- URL-based routing via Wouter
- Pages: Workers (main), Payroll, Compliance Alerts, Contracts, Documents, GPS Tracking, Analytics, AI Copilot, Regulatory Intelligence, Immigration Search, History, Admin Settings
- i18n: English/Polish via canonical LanguageToggle component (mounted in AppShell post-Phase-4); default EN; localStorage key `apatris_lang`; i18n config at `src/i18n.ts` (note: directly under `src/`, not `src/lib/`)
- Dark theme with Apatris red (#C41E18) branding

## Workforce App (5-Tier RBAC)
- T1 (Executive): Full system overview, admin controls
- T2 (Legal Head): Legal compliance, contracts, signatures
- T3 (Tech Ops): Operational modules, site deployments, timesheets
- T4 (Coordinator): Worker queue, compliance alerts, document management
- T5 (Professional): Digital site pass, document reminders, hours submission
- i18n: English/Polish via canonical LanguageToggle component (with `compact?: boolean` prop variant; mounted in DashboardPage premium-header + ProfileTab settings card); default Polish (post-Phase-6 Part 2b honoring principle #16); fallbackLng EN; localStorage key `wf_lang`; i18n config at `src/lib/i18n.ts`

## Bilingual Architecture (post-Tier-1)

Tier 1 bilingual remediation closed 2026-04-30 (commit `0f3a8d6`). All five sub-tasks complete. The canonical bilingual architecture across both apatris-dashboard and workforce-app:

**Canonical components**
- Dashboard: `artifacts/apatris-dashboard/src/components/LanguageToggle.tsx` (extracted Phase 3, commit `035acb8`); mounted in AppShell.tsx (Phase 4, commit `f2e77d0`); primary-red color semantic.
- Workforce-app: `artifacts/workforce-app/src/components/LanguageToggle.tsx` (extracted Phase 5b-1, commit `89b5abd`); `compact?: boolean` prop variant (compact pill in DashboardPage premium-header `h-14`; default settings-card in ProfileTab); indigo-EN / red-PL color semantics.

**i18n configuration**
- Dashboard: `src/i18n.ts` (note: directly under `src/`, NOT `src/lib/`); default EN; fallbackLng EN; localStorage key `apatris_lang`.
- Workforce-app: `src/lib/i18n.ts`; default PL post-Phase-6 Part 2b (commit `e0d668f` honoring principle #16); fallbackLng EN; localStorage key `wf_lang`.

**Translation files**
- Dashboard `en.json`: 243 keys / 19 namespaces (post-Phase-7 with `immigrationSearch.*` added).
- Dashboard `pl.json`: 292 keys / 23 namespaces.
- Workforce-app `en.json`: 349 keys (post-Phase-6 Part 2a with 23 keys filled).
- Workforce-app `pl.json`: 366 keys.

**Conventions**
- Polish authoritative, English bridge (MASTER_PLAN principle #16, commit `5873fca` constitutional).
- New bilingual features: use `t()` calls in components; add keys to BOTH `en.json` and `pl.json`; use proper Polish diacritics (ł, ą, ę, ż, ó, ś, ć, ń, ź — NEVER ASCII transliteration); match existing `pl.json` terminology conventions (V3 convention search pattern from Phase 6 Part 2a + Phase 7 Part 2 Shape A).
- `isPl` boolean variable + manual EN/PL ternaries are the anti-pattern; use `t()` calls for UI text and `i18n.language?.startsWith("pl")` explicit ternary for data-content selection or API parameters.
- AppShell-mounted LanguageToggle is the authoritative UI for language switching; in-page EN/PL button clusters are anti-pattern.

**Tier 2 inheritance**
- `artifacts/apatris-dashboard/src/pages/RegulatoryIntelligence.tsx` (~17 isPl ternaries) — broader dashboard isPl anti-pattern.
- `artifacts/apatris-dashboard/src/components/LegalStatusPanel.tsx` (1 ternary in `L()` helper).
- Plural forms support (i18next plural feature).
- Comprehensive Polish translation review pass across full dashboard `pl.json`.

**Reference**
- Plan: `artifacts/api-server/docs/LANGUAGE_TIER1_REMEDIATION.md` (status: COMPLETE).
- Verification: `artifacts/api-server/docs/LANGUAGE_TOGGLE_VERIFICATION_v2.md` (closure document with 10 sections, claim-by-claim drift corrections from v1, full Phase Index).

## Track 0 Documentation

Build-phase documentation lives at `artifacts/api-server/docs/`. Key documents for AI assistants and future engineers:

- `MASTER_BLUEPRINT.md` — Original project blueprint (commit `902117a`); foundational planning record.
- `MASTER_PLAN.md` — Constitutional plan with non-negotiable principles (#16 Polish authoritative is most-cited).
- `TRACK2-INVENTORY.md` — Internal codebase audit (commit `902117a`); referenced extensively in audit Stage 1 findings.
- `LAYER_0_DESIGN.md` — Layer 0 architectural design.
- `LAYER_0_TESTABILITY.md` — Layer 0 testability framework.
- `CHECK_LAYER1_CASE_REFERENCE.md` — Layer 1 product decisions (commit `ed0b31d`).
- `LANGUAGE_TIER1_REMEDIATION.md` — Tier 1 bilingual remediation plan (status: COMPLETE 2026-04-30).
- `LANGUAGE_TOGGLE_VERIFICATION_v2.md` — Tier 1 closure document; truthful current-state successor to v1 (which had drift).
- `LANGUAGE_TOGGLE_VERIFICATION.md` — Original v1 (preserved for historical reference; superseded by v2 per Phase 1 erratum at commit `3a0f5e4`).
- `COUNSEL_HANDOFF_PACKET.md` — Engagement-ready packet at v1.0 (commit `27ff161`); send to Polish radca prawny + EU regulatory firm.
- `COUNSEL_PACKET_CONTACTS.md` — Counsel firm contact tracking.
- `EU_AI_ACT_ARTICLE_6_RESEARCH.md` — EU AI Act Article 6 regulatory research (commit `bf4d92b`).
- `STRATEGIC_RECOMMENDATIONS.md` — Six-track strategic recommendations from APATRIS Claude (added 2026-05-04 Day 17 as commit `2d20156`; refined Day 19 with Track 1 + Track 2 progress markers).
- `RECOVERY_PROCEDURES.md` — Five-surface recovery playbook (code, database, Fly app, configuration, cross-repo) with Item 2.3 staging rollback case study (added 2026-05-05 Day 18 as commit `3733aaf`, refined Day 19 with definitive root cause).
- `C1-SMOKE-CHECKLIST.md` — Smoke checklist artifact.
- `BUILD_INTEGRITY_AUDIT_*.md` (7 sub-files: DIMENSION_0/1/2/3/4/7 + OPERATIONAL_PASS) — audit working files; untracked by design.

## Testing
- Vitest unit tests in `artifacts/api-server/src/*.test.ts`
- Run: `cd artifacts/api-server && npx vitest run`
- Test coverage: auth, payroll, GDPR, country compliance, ZUS calculations
- Current count: **488 tests passing** (24 test files; api-server only — dashboard + workforce-app have no test infrastructure as of 2026-04-30)

## Type check state
- `npm run typecheck` (api-server): 159 strict errors remaining as of 2026-04-30 (down from 527 baseline on 2026-04-17)
- `pnpm tsc --noEmit` (apatris-dashboard): 18 strict errors as of 2026-04-30 (LegalImmigrationCommand.tsx + LegalQueue.tsx; unrelated to bilingual work)
- `pnpm tsc --noEmit` (workforce-app): 15 strict errors as of 2026-04-30 (React 19 + DOM ArrayBufferLike compatibility)
- Build + runtime not affected — errors are route/service layer type drift
- tsconfig overrides in `artifacts/api-server/tsconfig.json`: `noImplicitReturns: false`, `useUnknownInCatchVariables: false`

## Commit Messages
- Use the commit message text I provide VERBATIM
- Do NOT append Co-Authored-By trailers unless I explicitly include them
- Do NOT add emojis, signatures, or metadata not in my specified message

---

## Working Doctrine (durable — applies every session)

### Working conventions
- **Prompt format:** every instruction carries `IF / WHY / FOR WHAT` — the reasoning travels with the instruction.
- **Header:** every prompt opens with a `TO: / FROM: / SUBJECT:` header identifying who it's for.
- **Code boxes:** every command, URL, SQL block, and code snippet goes in its own copy-paste code box. No exceptions.
- **One prompt at a time:** never two parallel work-prompts in flight. When multiple items exist, one stepped prompt covering them, sequenced — not multiple separate prompts.
- **Implement what you learn:** corrections become permanent immediately, applied in the next instance — not the third.
- **Brevity:** explanations kill time. Prompts and responses stay to the point.
- **Time is in Manish's hand:** no calendar narration. Sessions are bounded by laptop-open / laptop-shut, not clocks. EOD is the physical act of Manish closing the laptop — chat-Claude may recommend ending, only Manish decides.
- **Estimates:** NEVER given in human-developer hours. The real constraint is Manish's thinking, review, and routing bandwidth. Scope is expressed as work units / milestones, not clock time.
- **Two-step ship discipline:** Phase B builds use scope-confirm GATE first (investigate + propose scope), then code-edit GATE second (apply + commit + verify). Prevents half-built commits. Proven twice Day 30 (AC-39 + AC-40 Wave 1 ships).
- **URL + login credentials in every deploy/ship response:** every deploy or ship message includes the production URL + login mechanism in copy-paste code boxes so Manish can smoke-test immediately. Mandatory per Day 30 rule.

### Team structure
Three roles:
- **Manish** — architect: decides, detects, routes. The detection and direction layer.
- **chat-Claude** — drafts prompts, applies systemic pressure, holds the session tracker, makes architecture calls. Manish is not asked to make architecture decisions.
- **Claude Code** — executes AND reviews / suggests / pushes back. Closest to the code. Suggestions are the default path. chat-Claude does not inject competing preferences on the work plan; chat-Claude may suggest, framed as a question — not a directive.

**Standing discipline:** chat-Claude asks Claude Code for its peer suggestion (`WHAT / WHY / FOR WHAT`) before locking a plan, then tests the chosen plan against it. Claude Code reasons as a peer, not a task executor.

No separate structural-review seat — Claude Code does review and suggestion directly.

**Cross-build observation (APATRIS-specific):** Manish operates multiple builds (APATRIS + EEJ + IWS + STPG). When an observation surfaces in one build that's relevant to another, treat it as legitimate routing input from Manish, not as a third party. The cross-build observation pattern is the discipline (caught Day 22-23 staging incident); it is NOT a fourth team role.

### /goal usage doctrine
`/goal` is the **exception**, not the default. Save-prompt / GATE (below) is the default APATRIS rhythm. `/goal` is chosen deliberately when one dedicated batch of substantial work has a verifiable end state — and it follows every rule below without negotiation.

- ONE `/goal` per scoped batch — never one mega-goal across an entire backlog. The batch has a clear finish line stated up front.
- Every `/goal` carries: (a) concrete numbered acceptance criteria the evaluator can check from surfaced output, (b) an explicit turn cap, (c) a scope/constraint section stating what NOT to touch.
- The `/goal` evaluator cannot call tools and cannot see deployed environments. It only judges what Claude Code surfaces in conversation. `/goal` completion is NOT the same as "verified working."
- **Two-layer verification:**
  - Layer 1 = what the evaluator + Claude Code can verify (compiles, tests pass, endpoint returns 200).
  - Layer 2 = what only Manish can verify (the feature works when used).
  - A `/goal` completing satisfies Layer 1 only. Manish's detection is Layer 2 and is mandatory between batches.
- **Workflow:** one `/goal` completes → Claude Code reports → Manish detects → next batch's `/goal`. Never chain batches without the Manish-detection gate.

### Save-prompt / GATE pattern (APATRIS current rhythm — Reconciliation R1)
Save-prompt / GATE STOP-AND-CONFIRM is the current per-commit workflow used Days 23-28:
- Each commit is preceded by a save-prompt carrying `WHY / FOR WHAT / PRE-EXECUTION / EXECUTION TASKS / GATE / HARD BOUNDARIES / ANTI-HALLUCINATION CHECK`.
- Each commit closes with a STOP-AND-CONFIRM gate and a 5-element self-review (What changed / Why this scope / Verification mechanism / What was NOT touched / Risk + honest gap).

**Relation to /goal — both coexist, with this boundary:**
- **Save-prompt / GATE** — atomic single-commit work (audits, doc updates, single deploys, ledger edits, Phase A scoping). Default mode for current APATRIS rhythm.
- **/goal** — substantial multi-step batches with concrete acceptance criteria (e.g., AC-31 Phase B building 4 tabs across sessions, AC-38 Phase B 50-surface sweep, multi-file refactors).
- Most APATRIS sessions to date are save-prompt / GATE. When a Phase B workstream opens, that batch may be wrapped in a `/goal`. Manish-detection gate applies in both — `/goal` completion ≠ Layer 2 verified.

**Cross-audit pattern threshold heuristic:** 2-footnote evidence triggers AC capture (AC-51 admin-route role-gating from AC-39 + AC-40 footnotes). 3-instance evidence on broader patterns triggers cross-cutting AC capture (AC-52 drift consolidation from AC-42 + AC-43 + AC-44 footnotes). Prevents findings getting lost in audit doc footnotes.

**Yulia legal-input batching:** legal-gated items across multiple ACs batch into a single consolidated Yulia conversation. Reduces operator-interruption count; concentrates legal expertise. Day 30 surfaced 8 items currently stacked (AC-50 + AC-39 cutoffs + AC-41 no-show penalty + AC-43 consent text + AC-43 sensitive messages + AC-42 penalty rules + AC-49 ClientContact consent + AC-45 Tier 3 approval).

### Persistent capture (Reconciliation R2)
Two distinct surfaces, NOT the same thing:

- **Migration Ledger** (`artifacts/api-server/docs/MIGRATION_LEDGER_PHASE_2.md`) — long-lived, single source of truth for Action Candidates (ACs) across the entire build. 38 ACs as of Day 28. Each AC has status (captured / operationally validated / CLOSED / SUPERSEDED). Append-only history; status notes appended inline. Survives every session.
- **PENDING SCOPE TRACKER** — session-scoped, pasted at the end of work prompts. Holds in-flight work for the current session that risks drift or compaction. NOT the AC ledger. When a tracker item resolves to a real candidate, it migrates into the Migration Ledger as an AC row.

Day EOD docs (`artifacts/api-server/docs/EOD/Apatris_Day{N}_EOD_{date}.md`) close each session by recording which ACs changed status that day + which session-level work landed. EOD doc is the link between session-level tracker and long-lived ledger.

### Tooling notes
- **Agent View** (`claude agents`) is the monitoring surface during long `/goal` runs.
- Use `claude agents --cwd <path>` to scope the session list — APATRIS and other builds (EEJ, IWS, STPG) live in separate directories.
- `/loop` (time-interval re-run) is distinct from `/goal` (run-until-condition). Substantial remediation work uses `/goal`, not `/loop`.
- `claude project purge` is destructive — never run without `--dry-run` first.

### Pre-deploy discipline
- `git ls-files --deleted` must return empty before any deploy — the deploy packages the local filesystem, not git HEAD; CI-green does not mean deploy-safe.
- CI green is CHECKED, never assumed.
- Fly deploy chain: `git status --short` → `git ls-files --deleted` → `flyctl deploy --remote-only --app apatris-api` → `flyctl status` → `curl /api/healthz` → `flyctl logs` (boot lines).

### Hard Boundaries
Hard Boundaries remain pre-conditional gates and hold at all times. The canonical list (HB 1-16) lives in `artifacts/api-server/docs/STRATEGIC_RECOMMENDATIONS.md` (established commits `0bc8e02` + `c2987af`; HB12 audit-first sub-discipline expanded at commit `d1ddc66`). HB12 (audit-first: grep enumeration before any fix) is the most-cited in Day 22-28 work.

This doctrine layer is additive — Hard Boundaries are NOT replaced by it; they continue as-is.

### APATRIS-specific patterns (preserve)
- **Audit-first sub-discipline (HB12):** grep enumeration before any fix. Cross-file pattern search is mechanism; honest fix scope matches grep findings. Caught Day 22 M9 sweep, Day 25 Job 12 schema-assumption, Day 26 Dockerfile location, Day 27 AC-34 manual-trigger discovery.
- **eod-health-check skill** (`artifacts/api-server/skills/eod-health-check/SKILL.md`): 6-zone Layer 1 sweep applied at EOD (Sentry / Prod / Scheduler / Database / Background jobs / Anomalies). Days 23-28 all closed with this ritual.
- **Operator-principle capture pattern:** when an operator-principle is named (e.g., AC-38 worker-link invariant), capture it as an AC in the ledger first, then scope Phase A audit, then gate Phase B on operator interview validation (AC-35 pattern).
- **AC lifecycle:** new candidates land as AC rows in `MIGRATION_LEDGER_PHASE_2.md` with description + M-phase tag. Status notes appended inline as the AC moves through `captured → operationally validated → CLOSED` (or `SUPERSEDED` when overtaken by a successor AC).
- **Verbatim commit messages:** preserve user-provided commit message text; do not append Co-Authored-By trailers unless explicitly included; do not add emojis or metadata not in the message. (Existing rule above; reinforced here.)

### Cross-build feature decisions — audit, refine, bidirectional flow

Both APATRIS and EEJ are Manish's companies. Cross-pollination is valid in both directions when business model overlaps.

**Principle** (Manish Day 31 verbatim): *"If we do an audit and find something on EEJ we do not copy we make it better and then EEJ had a concept and we made a product and then EEJ as well can strengthen the better version. Vice versa."*

**Architect cycle:**
1. Audit either codebase (APATRIS or EEJ)
2. Find a concept that exists on one side
3. Don't copy it — build a refined/better version where it's most needed
4. The refined version then flows back to strengthen the source codebase too

Both apps end at 100% — no "good enough" tier on either side.

**Business model filter:**
- EEJ-specific (job agency licensing, candidate placement, employer flows): stays EEJ
- APATRIS-specific (immigration/TRC, welding-ops, outsourcing contracts): stays APATRIS
- Shared domains (comms, AI orchestration, worker management, compliance, role gating, audit logs): cross-pollinate via the refine-and-flow-back pattern

**Layout/UX specific caveat:** APATRIS layout is operator-validated excellent (Manish Day 30: *"APATRIS layout is amazing and I love it"*); EEJ layout has been operationally painful to maintain (Manish Day 30: *"took me hours to fix"*). For layout/UX specifically: APATRIS leads, don't port EEJ's painful patterns. For architecture/features in shared domains: refine + flow both directions.

EEJ codebase accessible at `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/` per Day 30 filesystem audit. EEJ is not a "reference build" in the design-target sense; it's a sibling codebase where concepts can originate before refinement.

### Historical context (Reconciliation R3 — note, not active doctrine)
Earlier APATRIS sessions (pre-Day 28) used a four-role framing: Manish + chat-Claude + Apatris Claude (executor) + Holmes (cross-build reviewer). The current three-role framing folds Apatris-Claude-executor into "Claude Code" and removes Holmes as a separate seat. The cross-build observation pattern (the legitimate routing of observations between builds) is preserved as a discipline — see Team Structure above. Memory file `feedback_cross_build_observation.md` remains load-bearing for that pattern.

CLAUDE.md itself contains no Holmes references; this paragraph exists only to keep future sessions oriented when reading memory that does reference Holmes.

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
- Fly deploy: `flyctl deploy --remote-only --app apatris-api` (deploys current main HEAD; rebuilds dist via Dockerfile remote builder)

## MANDATORY VALIDATION FRAMEWORK

Every feature build MUST include a validation loop before completion.
Do NOT say "done" without running this framework.

### Pre-Build Checks
- Confirm no uncommitted changes from previous work
- Confirm all existing tests pass (134+)
- Confirm smoke test passes (22+ checks)

### Post-Build Validation (REQUIRED)

After every feature implementation, run:

1. **Unit Tests**: `cd artifacts/api-server && npx vitest run`
   - Must show 0 failures
   - Report exact count: "X/X tests pass"

2. **Build Verification**: Both backend + frontend must build clean
   - `npx tsx ./build.ts` (api-server)
   - `npx vite build` (apatris-dashboard)

3. **Smoke Test**: `./scripts/smoke-test.sh`
   - Must show "ALL CHECKS PASSED"

4. **Safety Validation** (for legal/AI/automation features):
   - Verify: 0 writes in read-only services
   - Verify: 0 external sends (email/WhatsApp/SMTP)
   - Verify: 0 approval bypasses
   - Verify: legal-engine.ts not modified
   - Verify: role protection on all new endpoints

5. **Scenario Simulation** (minimum 3 cases):
   - Happy path (normal usage)
   - Missing data / blocked path
   - Edge case or conflict path

6. **Regression Check**:
   - Confirm existing systems still work
   - Confirm no circular dependencies
   - Confirm no duplicate logic

### Validation Report Format
Report MUST include:
- What passed (with counts)
- What failed (with details)
- What is risky (needs manual testing)
- What was NOT tested (honest gaps)

### Payroll Validation (CRITICAL)
For any payroll/ZUS changes, verify these exact scenarios:
- 160h × 31.40 brutto = 3929.05 net (benchmark)
- Net 6400 @ 160h → gross 8444.23 (reverse)
- Net 5000 @ 160h → gross 6506.23 (reverse)
- Net 8800 @ 160h → gross 11766.69 (reverse)
- Forward and reverse must produce identical results

### Database Safety
- Verify: 0 destructive SQL (DROP TABLE/COLUMN/TRUNCATE)
- Verify: all new tables use CREATE TABLE IF NOT EXISTS
- Verify: all new columns use ADD COLUMN IF NOT EXISTS
- Count and report: total tables, total columns added

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
