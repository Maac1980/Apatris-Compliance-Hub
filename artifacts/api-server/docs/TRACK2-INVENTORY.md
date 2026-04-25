# Track 2 Inventory — Blueprint vs Current Codebase

**Audit date:** 2026-04-25
**Blueprint:** `artifacts/api-server/docs/MASTER_BLUEPRINT.md` (commit `902117a`)
**Codebase commit at audit:** `902117a`

## Methodology

- Read 100+ `CREATE TABLE` declarations from `init-db.ts` (chunked); enumerated 156 actual tables on staging Neon via SSH (`SELECT FROM information_schema.tables`).
- Counted code surface: 131 route files, 72 service files, 112 dashboard pages.
- Targeted greps for blueprint concepts (`linked_case_id`, `lawyer_review`, `litigation_hold`, `redline`, `export_locked`, `retention_status`).
- Read key files: `legal-cases.ts` routes (7 endpoints), `legal-approval.ts` routes (2 endpoints), `legal_cases` schema.
- Confidence levels:
  - **HIGH** = verified by reading the actual implementation
  - **MEDIUM** = inferred from filename + structure + partial read
  - **LOW** = best guess; needs deeper investigation

## Codebase character (top-level finding)

This is **not a greenfield blueprint implementation**. It is a mature staffing-agency platform (workers, payroll, GPS, hostels, regulatory intelligence, document workflows) that already overlaps ~60% with the blueprint's "case-centered legal workspace" concept. The blueprint imagines fresh tables (`cases`, `case_documents`, `lawyer_reviews`); the codebase has functionally similar tables under different names (`legal_cases`, `legal_evidence`, `legal_approval` flag). **Most "what to build" is actually "what to thread together."**

---

## SECTION 1: ALREADY BUILT

### Database tables (mapping blueprint → existing)

| Blueprint table | Existing table | Code location | Confidence | Note |
|---|---|---|---|---|
| `cases` | `legal_cases` | `init-db.ts:2316+` | HIGH | Has case_type CHECK ('TRC','APPEAL','PR','CITIZENSHIP'), status, worker_id FK |
| `audit_logs` | `audit_logs` | `init-db.ts` (audit-log.ts:34+) | HIGH | Direct match; in active use across ~30 routes |
| `knowledge_base_sources` | `legal_knowledge` | `init-db.ts:1911` | HIGH | 12 KB articles seeded; embedding column added in Phase 1G-2 |
| `case_documents` (partial) | `legal_evidence`, `worker_files`, `document_intake` | `init-db.ts:3055+, 3083+` | HIGH | 3 separate tables hold document-like data; not unified |
| `ai_drafts` (partial) | `case_generated_docs`, `legal_briefs`, `authority_response_packs` | `init-db.ts:2659+, 3168+` | HIGH | 3 separate draft tables for different output types |
| `verification_runs` (partial) | `verification_tokens` | `init-db.ts` | MEDIUM | Token-based; not the per-claim verification the blueprint describes |
| `prompt_templates` (partial) | `prompt_templates` directory in `lib/document-schemas.ts` | `lib/document-schemas.ts` | MEDIUM | Not a DB table; lives as code |

### Important fields (from blueprint Section 6)

| Field | Existing location | Confidence |
|---|---|---|
| `case_type` | `legal_cases.case_type` | HIGH |
| `status` | `legal_cases.status` (NEW/PENDING/REJECTED/APPROVED), `document_intake.status` | HIGH |
| `confidence_score` | `document_intake.ai_confidence`, `rejection_analyses.confidence_score`, `ai_responses.confidence_score`, `IntakeResult.typeScopedConfidence` (B2) | HIGH |
| `approval_status` (as `is_approved`) | `case_generated_docs.is_approved`, `rejection_analyses.is_approved`, `authority_response_packs.is_approved` | HIGH |

### Architecture components (blueprint Section 5)

| Component | Existing | Confidence |
|---|---|---|
| Frontend (Next.js/React) | React 19 + Vite + Wouter, 112 pages | HIGH |
| Backend (Node.js API) | Express 5 on Node 24, 131 route files | HIGH |
| Postgres database | Neon Postgres 16 (staging + prod branches) | HIGH |
| Object storage | S3/R2 via `lib/file-storage.ts` (active in C1) | HIGH |
| Vector store | pgvector 0.8.0 + 4 embedding columns (Phase 1G-2) | HIGH |
| Audit logging service | `lib/audit-log.ts` + `audit_logs` table | HIGH |

### Blueprint differentiators (Section 9)

| # | Differentiator | Existing | Confidence |
|---|---|---|---|
| 4 | Deadline autopilot | `services/deadline-engine.service.ts`, `deadline_countdowns` table, `legal_alerts` table | HIGH |
| 9 | Quality gates | B2's `typeScopedConfidence` thresholds in `IntakeResult`; `confidence_gate` column on `document_intake` | HIGH |
| 11 | Multi-case analytics | `pages/IntelligenceDashboard.tsx`, `services/cross-worker-intelligence.service.ts` | MEDIUM |
| 12 | Role-based workqueues | `routes/legal-queue.ts`, `services/legal-queue.service.ts`, `pages/LegalQueue.tsx` | HIGH |
| 16 | Security controls | `requireAuth + requireRole`, encrypted PII columns (Phase 1F), tenant isolation everywhere | HIGH |
| 17 | Audit controls | `audit_logs`, `ai_audit_log`, `regulatory_audit_log`, `zus_audit_trail`, `document_action_log` | HIGH |

### Build-order phases (Section 14)

| Phase | Status | Evidence |
|---|---|---|
| Phase 1: schema, uploads, OCR, case page, document tagging | **Built** | document_intake (C1), Claude vision OCR, document-intelligence routes, LegalImmigrationCommand UI |
| Phase 2: fact extraction, issue spotting, retrieval, source linking | **Largely built** | `extractStructuredDocumentData` (B1+B2), `legal-research.service`, `legal-knowledge` table + embeddings |

### Other notable existing pieces

- Lifecycle steps 1-7 (create → upload → OCR → classify → extract → retrieve) all reachable today via existing routes/UI.
- Routes for legal cases: `GET /v1/legal/cases` (list/queue/pipeline), `POST /v1/legal/cases`, `PATCH /v1/legal/cases/:id` (`legal-cases.ts:15-83`).
- Approval endpoint: `POST /v1/legal/approve` (`legal-approval.ts:9`).

---

## SECTION 2: PARTIALLY BUILT

| Item | What exists | What's missing | Confidence | Note |
|---|---|---|---|---|
| **Case-document linkage** | `document_intake.linked_case_id` column (nullable); `caseId` accepted on extract route body | No UI to select a case at upload time; no `GET /cases/:id/documents` aggregate endpoint | HIGH | Plumbing present, threading missing |
| **Lawyer review** (Section 9.7) | `legal-approval.ts` has a 1-button approve endpoint; `is_approved` boolean on multiple tables | No "redline mode," no diff view, no source panel beside the draft, no per-paragraph review | HIGH | Approval is binary; review workflow is conceptual |
| **Source-linked answer engine** (Section 9.1) | `case_generated_docs.kb_articles_used[]`, `legal_briefs` references citations | Per-paragraph source provenance not enforced; no UI panel showing which source produced which sentence | MEDIUM | Data exists; UI surface absent |
| **Verification** (Section 9 + Prompt 8) | Pre-existing `verification_tokens` + B2's `typeScopedConfidence`; missing-fields detection in C1's `requires_review` | No "verification run" record per draft, no claim-level fact-checking against sources | MEDIUM | Light verification only |
| **Deadline autopilot** (Section 9.4) | `deadline_countdowns`, `legal_alerts`, `services/deadline-engine.service.ts` | Re-extraction on new uploads not wired; deadlines not surfaced on dashboard cohesively | MEDIUM | Engine exists; orchestration partial |
| **Counterargument generation** (Section 9.6) | `services/rejection-intelligence.service.ts` produces appeal drafts | "Strongest counterargument" not generated as a separate output | LOW | Inferred — full read of service required |
| **Template intelligence** (Section 9.10) | `lib/document-schemas.ts` (B1 schemas), `routes/contract-gen.ts`, `services/case-doc-generator.service.ts` | No per-clause version control table; no approved-clause library as such | MEDIUM | Templates exist as code, not as a DB-managed library |
| **Evidence completeness scoring** (Section 9.5) | `document_intake.completeness_score`, missing_fields_json | Score is per-document, not per-case (no aggregation across all of a case's docs) | HIGH | Per-doc only |
| **Knowledge graph / case memory** (Section 9.2) | `kg_nodes`, `kg_edges` tables, `services/knowledge-graph.service.ts`, `services/case-notebook.service.ts` | Empty on prod (0 rows in kg_nodes per Phase 1G-1 audit); not reading prior drafts to inform new ones | HIGH | Infrastructure present, dormant |
| **Workqueues** (Section 15: 7 queues) | Intake (`document_intake.status='PENDING_REVIEW'`), review/escalation (`legal-queue.ts`), archive (implicit) | No explicit named queues for OCR / Research / Draft / Archive; queueing is implicit via row state | MEDIUM | 1-2 of 7 explicit |
| **Phase 3 (drafting)** | Partial: `case-doc-generator.service.ts` builds case docs; `legal-brief-pipeline.service.ts` builds 6-stage briefs | Not unified into a single drafting orchestrator the way blueprint envisions | MEDIUM | Multiple isolated drafters |
| **Phase 4 (verification, lawyer review, redline)** | Partial: `legal-approval` flag, B2 confidence | No redline / diff / claim-verification UI | HIGH | Major gap |
| **Phase 5 (export, retention, archive)** | Partial: `obsidian_exports` table, PDF generation via `pdfkit` in some routes | No retention/litigation-hold workflow, no archive packaging, no export-version table | HIGH | Export is ad-hoc per route |

---

## SECTION 3: NOT BUILT

When ambiguous, classified here per the conservative-default rule.

### Database tables not present (under blueprint name OR equivalent)

| Blueprint table | Description of what's missing | Confidence (it doesn't exist) |
|---|---|---|
| `case_parties` | Party-roster table linking workers/employers/authorities to a case | HIGH — no equivalent grep hits |
| `document_chunks` | Chunked-text store per document for retrieval; no chunk table even though embeddings exist on whole-row level | HIGH |
| `extracted_facts` | Structured fact table separate from raw extraction JSON | HIGH — facts live inside `ai_extracted_json` blobs |
| `legal_issues` | Structured issue-spotting output table (severity, related_law, evidence_needed) | HIGH — no equivalent |
| `tasks` | Generic task table for case-level TODOs | HIGH — no equivalent |
| `export_versions` | Versioned export records (final draft + change log + approval date) | HIGH — exports are ad-hoc, not versioned |
| `retention_flags` | Retention status / litigation-hold per document or case | HIGH — zero hits for `litigation_hold`, `retention_status` across codebase |
| `case_sources` | Per-case source list (vs the global `legal_knowledge`) | HIGH |
| `source_links` | Per-statement source mapping for AI output traceability | HIGH |
| `model_runs` | Per-AI-call ledger (model, prompt version, input/output, cost) | MEDIUM — `ai_audit_log` partially covers but not at the granularity the blueprint asks |
| `security_events` | Security event log (failed logins, permission denials, etc.) | MEDIUM — `audit_logs` may cover; not separately structured |
| `access_logs` | Per-row access logging | MEDIUM — not enforced uniformly |
| `review_assignments` | Reviewer-to-case assignment table | HIGH — no equivalent |

### Important fields missing entirely

| Field | Confidence (missing) |
|---|---|
| `priority` | HIGH — not a column on legal_cases |
| `assigned_lawyer`, `assigned_operator` | HIGH — `assigned_to` exists on trc_cases only |
| `retention_status`, `litigation_hold`, `retention_end_date`, `evidence_preservation_required` | HIGH |
| `source_completeness_score` | HIGH — only per-document `completeness_score` exists, not per-case |
| `risk_level` | MEDIUM — exists on `identity_risk_level` (document_intake), not as a case-level field |
| `export_locked` | HIGH — zero hits |

### Lifecycle steps not built end-to-end

| Step | Status | Note |
|---|---|---|
| 8. Generate draft | Built per type but not from a unified case workspace | partial |
| 9. Verify claims and sources | NOT built as claim-level verification | conservative classify |
| 10. Route to lawyer review | NOT built as a routing flow with redline | conservative classify |
| 13. Archive the matter | NOT built — no archive flow, no archive table | HIGH missing |
| 14. Preserve logs and retention records | NOT built — retention not modeled | HIGH missing |
| 15. Enforce litigation hold | NOT built — no hold mechanism | HIGH missing |

### Mandatory operating rules NOT enforced (Section 8)

| Rule | Enforcement gap |
|---|---|
| Never let a case proceed without source linkage | NOT enforced — drafts can be created without source attribution |
| Never let a document be detached from its case | NOT enforced — `document_intake.linked_case_id` is nullable; many existing intakes have no case link |
| Never close a matter without audit history | NOT enforced — no "close matter" flow; no audit-history check |
| Never delete a record when litigation hold is active | NOT enforced — no litigation hold concept exists |
| Never allow export if verification failed | NOT enforced — no verification gate on exports |
| Never allow a draft to bypass lawyer review | Partially: `is_approved` exists but UI doesn't enforce |

### Differentiators NOT built

| # | Differentiator | Note |
|---|---|---|
| 3 | Litigation-hold automation | No hold mechanism whatsoever |
| 7 | Lawyer redline mode | No diff/redline UI |
| 8 | Version comparison | No draft version table; no diff |
| 13 | Source provenance panel | UI absent |
| 14 | Change log generation | Per-stage change log not generated |
| 15 | Exception routing | No automatic routing by trigger |

### Prompt templates (Section 12) status

| Prompt | Code? | Note |
|---|---|---|
| 1. Upload intake | **Built** as B1 `INTAKE_PROMPT_V2` in `lib/document-schemas.ts` | matches concept |
| 2. Case summary | NOT built as prompt | `case-intelligence.service.ts` does case analysis but not exactly this prompt |
| 3. Issue spotting | NOT built as a discrete prompt | `legal-engine.ts` has rule-based issue detection |
| 4. Retrieval | Conceptually present in `services/legal-research.service.ts` (Perplexity) and `lib/rag.ts` (vector retrieval, Phase 1G-3) | not exactly the blueprint shape |
| 5. Appeal draft | **Built** via `services/rejection-intelligence.service.ts::generateAppealLetter` | confirmed earlier |
| 6. Contract draft | **Built** via `services/case-doc-generator.service.ts`, `routes/contract-gen.ts` | |
| 7. Protocol draft | NOT built as a prompt | no equivalent service |
| 8. Verification | NOT built as a prompt | only confidence-bucket logic |
| 9. Lawyer review | NOT built as a prompt | |
| 10. Export | NOT built as a prompt | exports happen as raw PDFKit/HTML serialization |
| 11. Orchestrator | Partially: `services/ooda-orchestration.service.ts`, `legal-brief-pipeline.service.ts` (6-stage SSE) | not the lightweight orchestrator from blueprint |

---

## SECTION 4: DUPLICATES OR OVERLAPPING

| Concern | Locations | What each does |
|---|---|---|
| **Document tables overlap** | `documents` (init-db:82), `legal_documents`, `legal_evidence`, `worker_files`, `document_intake`, `case_generated_docs`, `trc_documents` | 7 different tables hold document-like data with overlapping but distinct schemas. No canonical "document of record." |
| **Case tables overlap** | `legal_cases` (the canonical), `trc_cases`, `legal_briefs` (cases-as-pipelines) | Three "case-like" tables; relationship between `legal_cases` and `trc_cases` exists via `legal_cases.trc_case_id` linkage column |
| **Audit log fragmentation** | `audit_logs`, `ai_audit_log`, `regulatory_audit_log`, `zus_audit_trail`, `document_action_log`, `regulatory_audit_log`, `automation_logs`, `webhook_logs` | 8 audit-style tables for different domains. Blueprint imagines one `audit_logs`. |
| **AI tracking overlap** | `ai_audit_log`, `ai_requests`, `ai_responses`, `model_runs` (blueprint, missing) | 3 AI-tracking tables; partial overlap |
| **Two parallel intake pipelines** | `document_intake.service.ts` (new pipeline, B1+B2+B3) vs `document-intelligence.service.ts` (also new — unified by Option A in 6f5ae06) | Recently unified — historical duplication, now thin shim. Documented in `docs/C1-SMOKE-CHECKLIST.md`. |
| **Approval table fragmentation** | `is_approved` boolean column on `case_generated_docs`, `rejection_analyses`, `authority_response_packs`, `ai_responses` | 4+ tables each carry their own approval flag; no central `lawyer_reviews` table |
| **Vector / knowledge tables** | `legal_knowledge` (KB), `kg_nodes` + `kg_edges` (graph), `knowledge_nodes` (separate?), `legal_evidence` (per-case), `law_articles` (Perplexity research) | 5 knowledge-ish stores |
| **Schema drift staging vs init-db.ts** | Staging has 156 tables; `init-db.ts` has ~145 CREATE TABLE statements (sampled, not exhaustive) | **Likely small drift** — could not enumerate exhaustively in budget; flagged for full reconciliation later |
| **Worker pages overlap** | `WorkerAvailability, WorkerIdentity, WorkerMatching, WorkerUpload, WorkerTimeline` | 5 scoped worker pages; no unified worker profile (per Day 8 audit) |
| **Dashboard pages overlap** | `Dashboard, ImmigrationDashboard, IntelligenceDashboard, RegulatoryDashboard, RoiDashboard, StrategyDashboard` | 6 dashboard variants for different stakeholder views |

---

## SECTION 5: SMALLEST NEXT IMPLEMENTATION STEP

### What to build

**A read-only `GET /api/v1/legal/cases/:id/timeline` endpoint that returns "everything connected to this case" in chronological order:**
- All `document_intake` rows where `linked_case_id = :id`
- All `case_generated_docs` rows where `case_id = :id`
- All `rejection_analyses` rows where `legal_case_id = :id`
- All `audit_logs` rows referencing the case
- All `legal_evidence` rows for the case
- Sorted by `created_at`, returned with `event_type` discriminator

### Why this and not something else

The blueprint's Section 18 final goal is **"one case contains all uploads, all answers are source-linked, all drafts are reviewable, all final outputs are lawyer-approved."** Every other candidate next step (worker profile page, redline UI, retention layer, prompt template registry) requires a backend that can answer "what belongs to this case?" — and that endpoint doesn't exist yet.

Other candidates considered and rejected:
- **Worker profile page (from Day 8 audit, Section 1):** valuable but bigger (60-90 min); requires this case-aggregation endpoint anyway as a building block.
- **Redline mode (blueprint 9.7):** requires draft-version table that doesn't exist; ~6h scope, too big for "smallest."
- **Litigation-hold layer:** would need 4 new tables + UI; weeks of work; lower priority than visible aggregation.
- **Threading `linked_case_id` through extract UI:** 1h scope but pointless without an endpoint that uses it.
- **Single read endpoint approach** delivers the **case-centric data view** that everything else depends on, with zero UI changes, zero new tables.

### Estimated effort: **2-3 hours**

- 30 min: route handler + tenant-scoping + 4 SELECT-and-merge queries
- 30 min: type definitions for `CaseTimelineEvent` discriminated union
- 60 min: tests (mocked DB)
- 30 min: staging deploy + curl smoke

### Blueprint items it unlocks

- Section 9.1 "Source-linked answer engine" — UI can finally render which source contributed to which event
- Section 9.13 "Source provenance panel" — same data shape feeds it
- Section 9.14 "Change log generation" — chronological event stream IS the change log
- Section 16 "Case review panel" — the "lawyer should see" list maps onto this single response
- Mandatory rule "Never let a document be detached from its case" — visible enforcement starts when the timeline is empty

### Existing code it builds on

- `legal_cases` table (init-db.ts:2316+)
- `routes/legal-cases.ts` (handler co-located)
- `document_intake.linked_case_id` column (already in use; `caseId` accepted on extract body)
- `case_generated_docs.case_id` FK (REFERENCES legal_cases ON DELETE CASCADE)
- `rejection_analyses.legal_case_id` FK
- Tenant isolation pattern from `routes/document-intelligence.ts` (the `WHERE tenant_id = $2` discipline)

### 5-stage loop sub-phases (natural split)

- **A — Investigation (read-only, ~20 min):** confirm FK shapes on the 4 source tables; verify which intakes today actually have `linked_case_id` populated on prod
- **B1 — Service layer (~40 min):** new `services/case-timeline.service.ts` with `getCaseTimeline(caseId, tenantId)` returning typed events
- **B2 — Route + types (~30 min):** `GET /v1/legal/cases/:id/timeline` in `routes/legal-cases.ts`
- **B3 — Tests (~60 min):** ≥5 tests covering happy path, empty case, tenant isolation, ordering, missing case
- **C — Deploy + smoke (~30 min):** staging deploy, curl-based smoke (no UI smoke required for read endpoint)

### What could go wrong

- **`linked_case_id` is sparsely populated today.** Old intakes have NULL. The endpoint returns "few or no events" for most existing cases. Not a bug; an honesty signal that case-document linkage is the real next bottleneck. Mitigate by surfacing the count of unlinked intakes.
- **`case_generated_docs.case_id` REFERENCES `legal_cases(id)` ON DELETE CASCADE** — querying it is safe, but the cascade rule means deleting a case wipes its drafts. Out of scope for this endpoint, but worth knowing.
- **`audit_logs` schema doesn't have a clean `case_id` column.** Audit rows reference `worker_id`, not case_id directly. Joining audit to case requires going through worker_id. Slight join cost; acceptable.
- **Blueprint Section 9.1 ("Source-linked answer engine") expects per-statement source linkage** that doesn't exist in any of these tables. Timeline shows event-level provenance, not statement-level. Honest gap to flag in the response shape.
- **Schema drift risk:** staging has 156 tables, init-db.ts ~145; small drift may include columns this endpoint depends on. Flagged in Section 4. NEEDS HUMAN REVIEW before taking dependencies on column existence.

---

## SECTION 6: ADDITIONAL ITEMS IN CODEBASE NOT IN BLUEPRINT

The codebase contains extensive functionality outside the blueprint's scope. Brief inventory:

### Valid extensions (staffing-agency core, not in blueprint)
- **Worker management** (60+ fields per worker): `workers` table, `worker_identities`, `worker_skills`, `worker_availability`, `worker_emails`, `worker_files`, `face_encodings` (biometric)
- **Payroll system**: `payroll_commits`, `payroll_snapshots`, `salary_advances`, `zus_filings`, `zus_audit_trail` — Polish ZUS calculations + bank/accounting CSV export
- **GPS tracking + geofences**: `gps_checkins`, `site_geofences`, `voice_checkins`
- **Hostels/housing**: `hostels`, `hostel_rooms`, `worker_housing`
- **Posted Workers Directive**: `a1_certificates`, `posting_assignments`, `posted_worker_notifications`, `esspass_records`
- **CRM**: `crm_companies`, `crm_deals`, `clients`
- **Multi-tenant SaaS**: `tenants`, `subscriptions`, `billing_history`, `white_label_agencies`, `agency_workers`
- **Site coordinators / 5-tier RBAC**: `site_coordinators`, `mobile_pins`, role-based access throughout

### Valid extensions (legal-AI beyond blueprint scope)
- **Vector RAG infrastructure** (Phase 1G-2 + 1G-3): pgvector + Voyage embeddings + `lib/rag.ts` retrieval functions for 4 corpora
- **Apatris identity prompt module** (Phase 1F-2): `lib/apatris-identity.ts` shared prompt builder
- **Regulatory intelligence pipeline** (extensive): 8+ tables for monitoring Polish gov sources
- **OOda decision-cycle engine**: `ooda_cycles`, `ooda_decisions`, `ooda_events`, `human_overrides` — orchestration substrate
- **Legal Brief Pipeline** (6-stage SSE streaming): `services/legal-brief-pipeline.service.ts`
- **Knowledge graph infrastructure**: `kg_nodes`, `kg_edges`, `services/knowledge-graph.service.ts` (currently dormant on prod)
- **Daily legal scan**: `services/daily-legal-scan.service.ts`, `legal_scan_runs`

### Possible accidental drift / unused cruft
- **5 separate Worker pages** (Availability/Identity/Matching/Upload/Timeline) without a unifying profile — flagged in Day 8 audit
- **Two intake pipelines until commit `6f5ae06`** — historical duplication; now reconciled but `document-intake.service.ts` and `document-intelligence.service.ts` both still exist as separate files
- **`Dockerfile.dashboard` and `artifacts/api-server/Dockerfile`** are orphaned (never invoked by Fly) — flagged in earlier session
- **`.changes` field on AuditEntry is `undefined: undefined`** in `audit-log.ts:93` — dead code from earlier P0-2 fix
- **Many "single-purpose dashboards"**: `RoiDashboard`, `StrategyDashboard`, `IntelligenceDashboard`, `RegulatoryDashboard`, `ImmigrationDashboard`, plus the main `Dashboard` — appears to be product-experiment accumulation, not a coordinated information architecture

### NEEDS HUMAN REVIEW

- Is the `legal_cases` table (case_type ∈ {TRC, APPEAL, PR, CITIZENSHIP}) intended as the canonical "case" or is `trc_cases` the operational reality? Current code suggests `legal_cases` is canonical with `trc_case_id` linkage column, but `trc-service.ts` writes to `trc_cases` directly.
- Are `documents` (init-db.ts:82) and `worker_files` (init-db.ts:3083) duplicating each other? Both store worker-related uploads with different schemas.
- Is the `kg_nodes`/`kg_edges` knowledge graph intended to be alive (Phase 1G-3 retrieval depends on it long-term) or has it been deprecated in favor of pgvector? Currently 0 rows on prod.
- Are `case_generated_docs`, `legal_briefs`, `authority_response_packs` actually three different output channels or three implementations of the same concept?

---

## Audit-quality honest assessment

**Confidently classified:**
- All 22 blueprint tables (mapped or marked missing)
- All 14 important fields (located or marked missing)
- All 17 differentiators (status assigned with confidence)
- 11 prompt templates (status assigned)
- All 6 build phases (status assigned)
- 7 workqueues (mapped to existing queue structures or marked missing)

**Lower confidence (sampled, not exhaustively read):**
- Did not deeply read all 72 services — many marked LOW or MEDIUM where filename suggested presence but I didn't confirm function-level details
- Did not enumerate every column on all 156 staging tables; relied on `init-db.ts` for column-level claims, which has known drift
- Did not exhaustively map all 11 dashboard pages tagged "Legal*" to specific blueprint UI features

**Methodology gaps:**
- No automated diff between `init-db.ts` CREATE TABLE statements and staging Neon's actual schema. Did counts only (156 tables on staging vs ~145 sampled in init-db.ts). **A full schema diff is recommended before any new schema work.**
- Did not verify `lawyer_reviews`-style tables have no equivalent under different naming (e.g., maybe `legal_approval` is broader than I assumed). Conservative classification means I may have under-counted "partially built."
- Did not read the actual SQL inside many service files; relied on grep on filenames and table-references.

**One blueprint item I genuinely couldn't classify:**
- Section 9.2 "Case memory layer — remember prior drafts, approved positions, prior objections, repeated issue patterns." This is a behavior, not a data model. Some pieces exist (`case_notebook_entries`, `kg_nodes`) but I cannot honestly say whether the behavior is wired anywhere. Marked as PARTIAL with caveat.

**Audit budget:** I deliberately stopped deep-reading once I had enough signal to populate the 6 sections honestly. Spending another hour on it would refine confidence levels but would not change the smallest-next-step recommendation.
