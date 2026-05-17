# AC-58 Phase A — EU AI Act + GDPR Art 22 + Kodeks pracy 2026 Compliance Scaffolding Audit

**Date:** Day 31, 2026-05-17
**Scope:** Phase A audit of 7 regulatory + technical scopes (a-g) per AC-58 ledger row (commit `c1687eb`)
**Status:** Single blocking node for every downstream AI feature ship per AC-55 synthesis (commit `dd4871e`)
**Hard deadline:** 2 August 2026 — EU AI Act high-risk obligations enforce — ~11 weeks from today
**Phase B gate:** Yulia legal-input session (Monday) unlocks legal-interpretation gates per scope

---

## Per-scope findings (a-g)

### Scope (a) — GDPR Article 22(1) + 22(3): meaningful human review

| Aspect | Current state | File:line evidence | Net-new for compliance |
|---|---|---|---|
| Decision-explanation infrastructure | **PARTIAL — strong foundation exists** | `services/decision-explanation.service.ts:1-50` (727 lines) — produces `DecisionExplanation` interface with `decision: HALTED|WARNING|REQUIRES_REVIEW|PROCEED|ESCALATE`, `confidence: 0-100`, `reasons[]`, `missing_inputs[]`, `contradictions[]`, `next_actions[]`, `human_review_required: boolean`. **SAFETY note in service:** "NEVER alters underlying decisions" — read-only translator | Hook this service into AI-message send path; surface `human_review_required` in approval queue UI |
| Existing review services | ~13 service files touching `approval_required|human_review|requires_review` | `services/regulatory-review.service.ts`, `services/regulatory-classification.service.ts`, `services/legal-copilot.service.ts`, `services/legal-brief-pipeline.service.ts`, `services/legal-answer.service.ts`, `services/legal-ai-explanation.service.ts`, `services/document-intelligence.service.ts`, `services/test-scenario.service.ts`, `services/ooda-orchestration.service.ts`, `services/regulatory-snapshot.service.ts`, `services/decision-explanation.service.ts` | No central queue; no `decision_records` table; no contest-the-decision worker UI |
| audit_logs action enum | 27+ action types — **NONE AI-decision-specific** | `lib/audit-log.ts:8` enum has `UPDATE_WORKER|CREATE_WORKER|UPLOAD_DOCUMENT|...PLAINTEXT_PII_VIEWED|PLAINTEXT_PII_ACCESS_DENIED` | Extend with `AI_DECISION_RENDERED`, `AI_DECISION_APPROVED`, `AI_DECISION_OVERRIDDEN`, `AI_DECISION_CONTESTED`, `HUMAN_REVIEW_COMPLETED` |
| Contest pathway | **ABSENT** | No grep matches for worker-facing decision-contest API | Net-new: `POST /api/worker/decision/:id/contest` + UI surface |

**Post-SCHUFA requirement:** review must be substantive (read AI output + verify against context + sign with rationale), not formal click-through. Current `human_review_required` flag is necessary but not sufficient — needs UI workflow that forces substantive engagement.

### Scope (b) — EU AI Act Article 6 + Annex III: high-risk classification + conformity assessment

| Aspect | Current state | File:line evidence | Net-new for compliance |
|---|---|---|---|
| AI call site inventory | **~30 files** call Anthropic/Claude across routes + services + lib | 30 files via `grep @anthropic-ai|new Anthropic|claude-3|claude-sonnet|messages.create`: routes (matching, contract-gen, immigration, trc-service, legal, legal-kb, regulatory, ai-copilot, intelligence-feed, analytics, salary, signals, skills-gap, careers, frameworks, competitors, translate, public-verify, safety, document-intake, system-test, worker-email, workers), services (ai-provider, legal-intelligence), lib (bilingual, complianceAI, claude-schema, whatsapp, init-db) | Net-new: AI use registry + Annex III classification per use case + Annex IV technical file skeleton |
| AI provider abstraction | **PARTIAL — AC-52 drift confirmed** | Two ai-provider files exist (AC-52 drift): `services/ai-provider.ts` + `services/ai/provider.ts` | Net-new: AC-52 consolidation + registry attaches to consolidated provider |
| Annex III high-risk triggers | **Untyped — no classification exists** | None of the 30 AI call sites carry a risk-classification tag | Net-new: per-callsite risk label (`annex_iii_employment`, `annex_iii_profiling`, `low_risk`, `out_of_scope`) — likely 15-20 sites trigger Annex III |
| Conformity documentation | **ABSENT** | No `EU_AI_ACT_ARTICLE_6_RESEARCH.md` reference in code (doc exists in `/docs/`) | Net-new: technical file per Annex IV — risk management system, data governance, technical robustness, human oversight, transparency |

**Pre-Yulia best-effort classification (per Annex III categories AI Act Phase 3 research surfaced):**
- **High-risk likely:** matching (worker placement), contract-gen (employment contract terms), regulatory-classification (decision logic), legal-copilot (advice to operators making worker decisions), document-intelligence (decisions on worker documents), salary (rate decisions), regulatory-review (worker compliance)
- **High-risk profiling-always:** legal-brief-pipeline (per-worker profiling), legal-answer (worker-context Q&A), regulatory-snapshot (per-worker risk profile)
- **Lower-risk likely:** translate, ai-copilot (operator-only chat), legal-kb (knowledge retrieval), system-test, signals
- **Yulia must confirm** definitive Annex III classification per use case

### Scope (c) — EU AI Act Article 26(7): worker pre-deployment notification + acknowledgement

| Aspect | Current state | File:line evidence | Net-new for compliance |
|---|---|---|---|
| Existing consent infrastructure | **PARTIAL — gdpr.ts has 7 consent types, NONE AI-specific** | `lib/gdpr.ts:5` CONSENT_TYPES: `data_processing|document_storage|gps_tracking|biometric_data|payroll_processing|cross_border_transfer|marketing_communications`. Schema at `init-db.ts:321` `consent_records` table | Net-new: add `ai_processing` consent type + `ai_deployment_notification` (separate from consent — notification is mandatory regardless of consent) |
| ai_deployment_notifications table | **ABSENT** | No grep matches | Net-new schema |
| Worker notification UI | **ABSENT** | No worker-facing pre-deployment-AI notification flow | Net-new: one-time worker onboarding screen + acknowledgement record |
| Worker representative notification | **ABSENT** | No grep matches for `worker_representative|union|works_council` | Net-new: representative notification surface (may be optional if no union — Yulia to advise) |

### Scope (d) — EU AI Act Article 86: right to explanation of decision logic

| Aspect | Current state | File:line evidence | Net-new for compliance |
|---|---|---|---|
| Explanation generation service | **STRONG FOUNDATION — `decision-explanation.service.ts`** | 727 lines; structured `DecisionExplanation` object with reasons/missing_inputs/contradictions/next_actions/severity/human_review_required; SAFETY note: read-only translation, never alters decisions | This service IS the Art 86 substrate. Needs hooks for worker-facing API + UI |
| Worker-facing explanation API | **ABSENT** | No `/api/worker/decision/:id/explain` endpoint | Net-new: API endpoint + SLA tracking (1 month per typical regulatory framing) |
| Explanation UI | **ABSENT** | No worker-facing "why was this decision made about me" page | Net-new: UI in Help tab or Profile tab |
| Per-AI-decision retention | **PARTIAL — audit_logs covers actions, not AI inputs** | `audit-log.ts:36-95` writes structured records but no AI-specific input/prompt capture | Net-new: `ai_decision_log` table capturing prompt + key inputs + decision path per AI run |

### Scope (e) — Posted Workers Directive 2018/957: PIP notification + written worker info

| Aspect | Current state | File:line evidence | Net-new for compliance |
|---|---|---|---|
| Posted-worker notifications | **PARTIAL — 7-country system exists** | `routes/posted-notifications.ts:1-116`: COUNTRY_SYSTEMS map for BE/NL/PL/LT/SK/CZ/RO with required docs + portals. Endpoints: GET requirements/:country, GET notifications, POST notifications. `posted_worker_notifications` table at `init-db.ts:2049` (worker_id, worker_name, host_country, start_date, end_date, notification_ref, status='draft', submitted_at) | Net-new: automated PIP submission for PL host (manual today); worker written-info template + delivery + acknowledgement |
| PIP (Polish Labour Inspectorate) automation | **MANUAL today** | `COUNTRY_SYSTEMS.PL.portal='pip.gov.pl'`; no API integration | Net-new: investigate PIP electronic submission format (e-PUAP? CSV? web form?); automate if API exists, else template + scheduling for manual |
| Worker written-info template | **ABSENT** | No grep matches for `posting_written_info|written_notification_template` | Net-new: bilingual template (PL authoritative + worker native) covering: country / duration / currency / monetary+in-kind benefits / return conditions per Phase 3 Posted Workers Directive citation |
| Worker acknowledgement of written info | **ABSENT** | No `posting_info_acknowledged` field on posting_assignments | Net-new: acknowledgement record (timestamp + worker signature/PIN/biometric per Kodeks pracy 2026 identifiability standard) |
| pip-readiness.service.ts | EXISTS — readiness scoring, not notification | `services/pip-readiness.service.ts:1-50` (229 lines): PIP audit-readiness score 0-100; deducts for expired docs/permits/certs | Out of scope for AC-58 — different feature |

### Scope (f) — Kodeks pracy January 27 2026 amendments: electronic form requirements

| Aspect | Current state | File:line evidence | Net-new for compliance |
|---|---|---|---|
| Leave-request flow (AC-39 Wave 1) | **PARTIAL — schema landed, integrity gaps** | `init-db.ts:1246` `leave_requests` table with `notice_timing_days INTEGER` column (added Day 30); `routes/self-service.ts:152-185` POST handler uses `countWorkdays` + writes `notice_timing_days` via Math.floor. **Identifiability:** worker_id from JWT (`resolveWorker(req)`) — passes identifiability per Kodeks pracy 2026 standard if JWT chain is auditable. **Integrity:** no submission_hash; no signature; no audit_logs write | Net-new: `submission_hash` (SHA-256 of payload) + `submission_signature` (JWT-derived OR mobile PIN OR biometric reference) + `appendAuditLog` write on each leave submission |
| Other ~15 electronic-form-eligible actions | **NOT INVENTORIED** | Kodeks pracy 2026 covers: leave requests, individual schedules, time-off-for-overtime, monitoring notifications, BHP confirmations + ~10 more | Net-new: inventory pass against APATRIS endpoints; flag each as in-zone / not-in-zone |
| Retention policy | **GENERIC** | `consent_records` + `audit_logs` exist but no per-leave-request retention rule documented | Net-new: per-document-type retention specified (Yulia confirms periods) |
| RODO compliance baseline | EXISTS via `gdpr.ts` + `consent_records` | `lib/gdpr.ts:1-50` | Inherits — no net-new on baseline |

### Scope (g) — MessagingTab encryption upgrade: XOR → crypto-grade

| Aspect | Current state | File:line evidence | Net-new for compliance |
|---|---|---|---|
| **MAJOR FINDING: already migrated to AES-256-GCM** | **NEW writes use proper crypto; XOR only as legacy-read fallback** | `routes/messaging.ts:4` imports `encrypt as aesEncrypt, decrypt as aesDecrypt, isEncrypted from "../lib/encryption.js"`; line 9-11 comment: "Encryption: AES-256-GCM via lib/encryption.ts for new writes. Legacy XOR fallback on read for messages encrypted before this migration. Migration: Option (i) — no batch re-encrypt; legacy rows stay readable via fallback path." Lines 13-30: `legacyXorDecrypt` + `encrypt`/`decrypt` wrappers. `lib/encryption.ts:1-40` (132 lines): AES-256-GCM via Node `crypto`, `enc:v1:` prefix, IV 12 bytes, key 32 bytes from `APATRIS_ENCRYPTION_KEY` env (64 hex chars, strict validation) | **Significant scope reduction.** Original ledger entry assumed XOR-everywhere; reality is AES-everywhere-new, XOR-legacy-read-only. Net-new: backfill migration to re-encrypt legacy rows with AES + retire `legacyXorDecrypt` fallback |
| Migration of legacy rows | **NOT STARTED** | Comment confirms "no batch re-encrypt" per migration Option (i) | Net-new: backfill script: read legacy XOR rows → decrypt via legacyXorDecrypt → re-encrypt via aesEncrypt → write back → log conversion |
| Key management | **GOOD — env-var-driven with test fallback** | `lib/encryption.ts:10-26`: `APATRIS_ENCRYPTION_KEY` required in non-test env; 64-hex-char strict validation; cached after first resolve | No changes needed |
| E2E vs at-rest decision | At-rest (server-managed key) today; no E2E | `encryption.ts` uses single server key | **Decision pending Yulia:** E2E (client-keys, GDPR-stronger but operationally harder) vs at-rest (current, server can decrypt for legal compulsion). Recommend at-rest for v1 + document the trade-off |

---

## Surface contracts

### Schemas — net-new tables

```
-- Scope (a) + (d): AI decision record + explanation log
CREATE TABLE IF NOT EXISTS ai_decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  worker_id UUID,
  ai_use_case TEXT NOT NULL,              -- e.g. "regulatory-review", "contract-gen", "matching"
  annex_iii_classification TEXT,          -- "high_risk_employment" | "high_risk_profiling" | "low_risk" | "out_of_scope"
  prompt_hash TEXT,                       -- SHA-256 of prompt for replay/audit
  inputs_summary JSONB,                   -- key inputs (PII-sanitized) for explanation
  decision_verdict TEXT,                  -- "HALTED|WARNING|REQUIRES_REVIEW|PROCEED|ESCALATE"
  confidence INTEGER,                     -- 0-100
  reasons JSONB,                          -- DecisionExplanation.reasons[]
  human_review_required BOOLEAN NOT NULL DEFAULT false,
  human_reviewer TEXT,
  human_review_completed_at TIMESTAMPTZ,
  human_review_rationale TEXT,            -- substantive review per post-SCHUFA requirement
  contested_at TIMESTAMPTZ,
  contested_by_worker_id UUID,
  contest_outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ai_decision_worker ON ai_decision_log(worker_id);
CREATE INDEX idx_ai_decision_review ON ai_decision_log(human_review_required, human_review_completed_at);
CREATE INDEX idx_ai_decision_tenant ON ai_decision_log(tenant_id);

-- Scope (c): AI pre-deployment worker notification + acknowledgement
CREATE TABLE IF NOT EXISTS ai_deployment_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL,
  ai_use_cases JSONB NOT NULL,            -- list of AI uses the worker is being notified about
  notification_template_version TEXT NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivery_channel TEXT,                  -- "in_app" | "email" | "whatsapp" + per Category C preference
  acknowledged_at TIMESTAMPTZ,
  acknowledgement_method TEXT,            -- "click" | "pin" | "biometric"
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ai_deploy_worker ON ai_deployment_notifications(worker_id);

-- Scope (c): add ai_processing consent type (extend gdpr.ts enum + already-existing consent_records table)
-- ALTER not needed on consent_records (consent_type is TEXT); just add to CONSENT_TYPES const

-- Scope (e): Posted-worker written-info delivery + acknowledgement (extends posting_assignments)
ALTER TABLE posting_assignments
  ADD COLUMN IF NOT EXISTS written_info_template_version TEXT,
  ADD COLUMN IF NOT EXISTS written_info_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS written_info_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pip_submission_ref TEXT,
  ADD COLUMN IF NOT EXISTS pip_submitted_at TIMESTAMPTZ;

-- Scope (f): leave_requests integrity + identifiability
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS submission_hash TEXT,
  ADD COLUMN IF NOT EXISTS submission_signature TEXT,
  ADD COLUMN IF NOT EXISTS identifiability_method TEXT;     -- "jwt" | "mobile_pin" | "biometric"
```

### API contract sketches

```
-- Scope (a) — Art 22 review queue + contest
GET    /api/admin/ai-decisions/pending-review            -- T1/T2 review queue
POST   /api/admin/ai-decisions/:id/review                -- substantive review with rationale (per SCHUFA)
GET    /api/worker/decisions                             -- worker sees own AI decisions
POST   /api/worker/decisions/:id/contest                 -- Art 22(3) contest pathway

-- Scope (c) — Art 26(7) pre-deployment notification
GET    /api/worker/ai-notification/pending               -- one-time onboarding check
POST   /api/worker/ai-notification/:id/acknowledge       -- record acknowledgement

-- Scope (d) — Art 86 explanation
GET    /api/worker/decisions/:id/explanation             -- structured DecisionExplanation
POST   /api/worker/decisions/:id/request-detailed-explanation  -- triggers SLA (1 month)

-- Scope (e) — Posted-worker written-info + PIP automation
POST   /api/admin/posting/:id/deliver-written-info       -- generates + sends bilingual template
POST   /api/worker/posting/:id/acknowledge-written-info  -- worker confirms receipt
POST   /api/admin/posting/:id/submit-pip                 -- automated or scheduled PIP submission

-- Scope (f) — Kodeks pracy 2026 integrity (extends existing POST /self-service/leave)
POST   /api/self-service/leave                           -- existing; backend adds submission_hash + signature + audit write
GET    /api/worker/leave/:id/integrity-proof             -- worker can request integrity verification
```

### UI surface requirements

- **Dashboard (T1-T4 admin):** new AI Decision Review Queue page (Art 22) — substantive review form with rationale text required; AI Use Registry admin page (Art 6 + Annex III classification); Posting Written-Info admin form (Art e)
- **Workforce-app (T5 worker):** one-time AI deployment notification screen on first post-AC-58 login (Art 26(7)); decision history page in ProfileTab (Art 22 + Art 86); contest-decision flow accessible from decision detail (Art 22(3)); posting written-info acknowledgement screen (Art e); explanation request UI in Help tab
- **Both:** leave-submission flow gets integrity-proof confirmation (Scope f)

---

## Phase B work-unit map for AC-58

| WU | Scope | Description | Files / touch points | Dependencies | Effort | Reg checkpoint |
|---|---|---|---|---|---|---|
| WU-58-1 | (b) | AI use registry doc + classification | new `docs/AC-58_AI_Use_Registry.md`; tag each of 30 AI sites | Yulia Annex III decision (item 9 sub-a) | medium | Art 6 + Annex III ✓ |
| WU-58-2 | (a) + (d) | `ai_decision_log` table + write hooks | `init-db.ts` + new `lib/ai-decision-log.ts` wrapper; hook into `decision-explanation.service.ts` callers | WU-58-1 (classification labels) | medium | Art 22 + Art 86 + Art 12 retention ✓ |
| WU-58-3 | (a) | T1/T2 review queue UI + substantive review form | new dashboard route; queue component; review form requires rationale (per SCHUFA) | WU-58-2 | medium | Art 22 ✓ |
| WU-58-4 | (a) | Worker contest-decision flow | new workforce-app component + `/api/worker/decisions/:id/contest`; routes to T2/T3 escalation | WU-58-2 + WU-58-3 | small | Art 22(3) ✓ |
| WU-58-5 | (c) | `ai_processing` consent type + `ai_deployment_notifications` table + acknowledgement | `lib/gdpr.ts` enum extension; `init-db.ts` new table | Yulia notification text (item 9 sub-c) | small | Art 26(7) ✓ |
| WU-58-6 | (c) | Worker one-time AI deployment notification UI | new workforce-app first-login modal; bilingual PL/EN | WU-58-5 | small | Art 26(7) ✓ |
| WU-58-7 | (d) | Worker explanation API + UI | new `/api/worker/decisions/:id/explanation` endpoint hooking `decision-explanation.service.ts`; Help tab UI | WU-58-2 | small | Art 86 ✓ |
| WU-58-8 | (d) | Detailed-explanation SLA tracker (1 month) | scheduler cron + reminder logic | WU-58-7 | small | Art 86 ✓ |
| WU-58-9 | (e) | Worker written-info bilingual template + delivery | new template in `lib/templates/posting-written-info.ts`; integration with `posted-notifications.ts` POST handler | Yulia content text (item 9 sub-e) | medium | Posted Workers ✓ |
| WU-58-10 | (e) | Worker acknowledgement of written info | extend `posting_assignments` columns; new worker-app component | WU-58-9 | small | Posted Workers ✓ |
| WU-58-11 | (e) | PIP automation (PL host) — research + implement OR schedule manual | investigation: e-PUAP / web form / CSV; implementation per finding | Yulia PIP submission format (item 9 sub-e) | medium-large (depends on API availability) | Posted Workers ✓ |
| WU-58-12 | (f) | leave_requests integrity columns + write path | `init-db.ts` ALTER; `routes/self-service.ts:152-185` extend; `lib/audit-log.ts` AI_DECISION_RENDERED + LEAVE_SUBMITTED actions | Yulia integrity-evidence requirements (item 9 sub-f) | small | Kodeks pracy 2026 ✓ |
| WU-58-13 | (f) | Inventory pass — 15 personnel actions vs APATRIS endpoints | grep + audit + flag in-zone vs not-in-zone | none | small | Kodeks pracy 2026 ✓ |
| WU-58-14 | (g) | Backfill migration: legacy XOR rows → AES | new script `scripts/backfill-message-encryption.ts`; transaction-per-batch; verify-and-log | none (XOR fallback already in place; backfill is non-blocking) | medium | RODO at-rest ✓ |
| WU-58-15 | (g) | Retire `legacyXorDecrypt` fallback post-backfill | remove fallback path in `messaging.ts`; remove function | WU-58-14 complete | small | RODO at-rest ✓ |
| WU-58-16 | (b) | Annex IV technical file skeleton (conformity doc) | new `docs/AC-58_Annex_IV_Technical_File.md` covering risk management / data governance / technical robustness / human oversight / transparency | WU-58-1 + Yulia conformity guidance | medium | Art 6 + Annex IV ✓ |

**Total: 16 Phase B work units.** Effort split: 8 small / 7 medium / 1 medium-large.

---

## Yulia session decision list (per scope)

| Session order | Scope | Decision question | Blocks |
|---|---|---|---|
| 1 (open) | (b) Art 6 + Annex III | Confirm classification per 30 AI use cases — which trigger `high_risk_employment` vs `high_risk_profiling` vs `low_risk` vs `out_of_scope`? Pre-Yulia best-effort table in Scope (b) above. | WU-58-1, WU-58-2, WU-58-16 |
| 2 | (f) Kodeks pracy 2026 | Specific evidence required for integrity + identifiability on electronic form? Is JWT-derived worker_id sufficient identifiability OR do certain action types require mobile PIN OR biometric step-up? Retention periods per action type? | WU-58-12, WU-58-13 |
| 3 | (c) Art 26(7) | Notification text (PL authoritative + EN bridge) per Tier-1 doctrine principle #16. Must include: which AI uses, what data they process, what decisions they inform, worker rights. | WU-58-5, WU-58-6 |
| 4 | (a) Art 22 | Substantive-review specifics: per-message review vs per-template (post-SCHUFA — formal sign-off invalid). Rationale-text minimum quality bar? Reviewer training requirements? | WU-58-3, WU-58-4 |
| 5 | (d) Art 86 | Reasoning surface granularity — prompt verbatim disclosure vs structured summary? SLA: 1 month standard or APATRIS-specific tighter? Per-message vs per-decision-class? | WU-58-7, WU-58-8 |
| 6 | (e) Posted Workers — content | Written-info template content per item — country / duration / currency / monetary+in-kind benefits / return conditions. Polish-authoritative template draft? | WU-58-9, WU-58-10 |
| 7 | (e) Posted Workers — PIP submission | PIP electronic submission format (e-PUAP? CSV upload? web form only?). Manual scheduling timeline if no API. | WU-58-11 |
| 8 | (a) + (c) | Worker representative notification — does APATRIS have workers organized in a union or works council that requires representative-level Art 26(7) notification? If yes, channel + cadence. | WU-58-5 design adjustment |
| 9 (close) | cross-cutting | Conformity assessment scope: does APATRIS need third-party notified body (Article 43) OR can self-assess per Article 43(2) "internal control" for Annex III categories where applicable? | WU-58-16 + downstream conformity work |

**Session structure:** open with scope (b) Annex III classification (broadest, unlocks most downstream); then scope (f) Kodeks pracy 2026 (AC-39 shipped & in regulated zone — most time-sensitive verification); then scopes (c)+(a) (related — notification then review); then (d) (explanation surface); then (e) Posted Workers cluster (2 items); close with cross-cutting conformity scope.

---

## Cross-AC integration points

| Existing AC | Hook into AC-58 | Touch point |
|---|---|---|
| **AC-39** Worker Leave tab | WU-58-12 integrity hooks added to AC-39 Wave 1 leave handler | `routes/self-service.ts:152-185` POST handler |
| **AC-40** MessagingTab | WU-58-14/15 message encryption backfill | `routes/messaging.ts:13-30` legacy XOR retirement |
| **AC-43** Worker-facing AI registry | WU-58-2 ai_decision_log write hook + WU-58-7 explanation API; WU-58-3 review queue consumes AI-43-produced decisions | AC-43 Phase B work units |
| **AC-44** Internal AI orchestration | WU-58-2 ai_decision_log write hook for orchestration decisions; WU-58-1 classification per orchestration use case | AC-44 Phase B work units |
| **AC-45** Client-facing AI / Tier 3 approval | WU-58-3 review queue surfaces Tier 3 client-facing approval; substantive-review form required | AC-45 Phase B work units |
| **AC-46** Worker issue/complaint engine | WU-58-7 explanation surface in Help tab consumes AC-46 issue context | AC-46 Phase B work units |
| **AC-55** Communication System | WU-58-2 hooks in AC-55 Category B WU-B1 send path; WU-58-7 explanation per message in AC-55 Category B WU-B2 approval queue; WU-58-14/15 encryption backfill closes AC-55 Category A WU-A5 (which escalated to AC-58) | AC-55 Categories B+D Phase B |
| **AC-49** ClientContact consent | WU-58-5 ai_processing consent extension may extend to ClientContact entities (Yulia decision needed) | AC-49 Phase A audit + Phase B |
| **AC-52** AI provider drift | WU-58-1 AI registry forces AC-52 resolution (cannot classify across two providers) | AC-52 resolution Phase B |

**Critical: 7 of 8 existing comms-domain ACs gain AC-58 hooks.** AC-40 is the only one that doesn't need new hooks (just encryption backfill).

---

## Hard timeline assessment — can 2 August 2026 be met?

**Today (2026-05-17) → Aug 2 2026:** approximately **11 weeks** (77 days).

**Critical path for high-risk AI (must ship before Aug 2):**
1. **Yulia session** (Monday) → unlocks legal-interpretation gates → ~1 work-block
2. **WU-58-1 AI use registry + classification** → required before WU-58-2 → ~1-2 work-blocks
3. **WU-58-2 ai_decision_log + write hooks** → infrastructure for everything else → ~2-3 work-blocks
4. **WU-58-3 review queue UI + substantive review form** → Art 22 enforcement floor → ~2 work-blocks
5. **WU-58-5 + WU-58-6 Art 26(7) notification + worker UI** → workers must be notified BEFORE AI deployment continues → ~1-2 work-blocks
6. **WU-58-7 worker explanation API + UI** → Art 86 enforcement → ~1-2 work-blocks
7. **WU-58-16 Annex IV technical file skeleton** → conformity doc → ~1-2 work-blocks
8. **WU-58-12 Kodeks pracy 2026 leave integrity** → AC-39 Wave 1 already in regulated zone → ~1 work-block

**Critical-path work-block estimate: 10-14 work-blocks** (out of 11 weeks remaining). Tight but feasible IF Yulia session lands this week and Phase B Wave 1 starts immediately after.

**Can defer to post-deadline (lower priority):**
- WU-58-4 worker contest flow (Art 22(3) is required but worker-initiated; can ship within 30 days of deadline)
- WU-58-8 detailed-explanation SLA tracker (1-month SLA gives buffer)
- WU-58-9/10/11 Posted Workers items (separate regulatory clock, not Aug 2 enforced)
- WU-58-13 inventory pass (Kodeks pracy 2026 — already in force; can audit-and-fix in-place)
- WU-58-14/15 encryption backfill (legacy XOR fallback works; backfill is hygiene not compliance-gate)

**Risk:** if Yulia session slips past Monday, every downstream WU compresses. Recommend **Monday session is non-negotiable**.

**Risk:** WU-58-11 PIP automation effort depends on whether e-PUAP / pip.gov.pl API exists. Worst case: schedule manual submissions with reminder cron. Not Aug 2 blocking.

**Verdict:** **Aug 2 2026 deadline is feasible** for high-risk AI features IF: (1) Yulia session lands Monday, (2) Phase B Wave 1 starts immediately after with WU-58-1, (3) save-prompt/GATE rhythm holds at 1-2 commits per work-block, (4) no novel scope adds.

---

## Anti-hallucination caveats + open questions

### Speculative / partial-evidence claims (flagged)

- **"30 AI call sites" figure** — counted via grep matches on `@anthropic-ai|new Anthropic|claude-3|claude-sonnet|messages.create`; some files may contain multiple call sites (true count of sites likely 40-60+). Real number surfaces in WU-58-1.
- **Pre-Yulia best-effort Annex III classification** — based on Phase 3 EU AI Act Annex III categories (hiring/performance/promotion/termination/task-allocation/monitoring/profiling). Yulia decision is authoritative; my classification is starting-point only.
- **"Critical path 10-14 work-blocks" estimate** — pre-Phase-B guess; real number shifts after Yulia session locks scope.
- **Worker representative notification (Art 26(7))** — assumed APATRIS has no organized union/works council. Manish/Yulia to confirm.
- **"1-month SLA for Art 86 detailed explanation"** — citation from Phase 3 was "typical regulatory framing" not Art 86 verbatim. Yulia to confirm legal requirement.
- **Posted Workers Directive PIP automation feasibility (WU-58-11)** — I did not confirm pip.gov.pl has electronic submission API; worst-case is manual scheduling.
- **Conformity assessment self-assessment vs notified body (Art 43)** — depends on which Annex III sub-categories APATRIS triggers; Yulia legal call.
- **Scope (g) "largely complete" finding** — based on reading `routes/messaging.ts:4-30` + comment claiming AES-256-GCM migration done. Did NOT runtime-verify that all NEW writes actually flow through aesEncrypt vs falling back somewhere. Worth verification in WU-58-14 prep.

### Open questions for Manish (architect calls)

1. **Yulia session timing confirmation** — Monday 2026-05-18? Earlier? Later? Critical path depends on it.
2. **Phase B Wave 1 first WU** — recommendation is WU-58-1 (AI use registry — broadest unblocker). Acceptable?
3. **Worker representative notification scope** — does APATRIS have any organized worker representation that requires Art 26(7) representative-level notification? Affects WU-58-5 design.
4. **PIP automation investment** — invest in research/implementation (WU-58-11 medium-large) OR ship as scheduled-manual (small)?
5. **Conformity assessment approach** — pre-decision: self-assess via Article 43(2) internal control (where applicable) OR plan for notified body (more cost + time)?
6. **Encryption backfill priority** — ship in Phase B (hygiene) OR park indefinitely (legacy XOR fallback works)?
7. **Worker contest flow (WU-58-4) priority** — ship by Aug 2 OR within 30 days after (Art 22(3) is required but workers-initiated, gives buffer)?

### Open questions for Yulia (legal-input session — full list in Section above)

9 decision questions enumerated in "Yulia session decision list" section. Each blocks one or more Phase B WUs.

---

## Status

- **AC-58 Phase A audit complete** — 7 scopes (a-g) inventoried with file:line evidence, surface contracts sketched, Phase B work unit map (16 WUs) defined, Yulia session decision list finalized (9 items in scope-prioritized order), critical-path timeline assessed against Aug 2 2026 deadline
- **MAJOR finding:** Scope (g) encryption is **largely complete** — messaging.ts already on AES-256-GCM via lib/encryption.ts; only backfill + fallback retirement remains. Significant scope reduction vs ledger assumption
- **STRONG foundation finding:** Scope (a) + (d) have substantial substrate via `decision-explanation.service.ts` (727 lines, read-only safety-marked) — Art 22 + Art 86 build on existing pattern, not greenfield
- **CRITICAL dependency:** Yulia session unlocks 8 of 9 Phase B WUs; AC-58 cannot start Phase B Wave 1 without it
- **Timeline verdict:** Aug 2 2026 deadline **feasible** for high-risk AI scope IF Yulia lands Monday + Phase B starts immediately + no novel scope adds
- **Ready for:** Manish architect decisions on 7 open questions → Yulia legal-input session → AC-58 Phase B Wave 1 (WU-58-1 AI use registry)
- **Hard Boundaries respected** — Phase A audit only; no code, no schema, no AC capture; regulatory citations cite actual articles (GDPR Art 22, EU AI Act Art 6/26(7)/86/43, Posted Workers Directive 2018/957, Kodeks pracy Jan 27 2026 amendments)
