# BUILD INTEGRITY AUDIT — Dimension 4: Real Case Data Flow

**Audit date:** 2026-05-01
**Session:** 2 of 5 (Dimensions 2 + 4)
**Status:** 🟡 **VERIFIED with directional alignment — phase-appropriate, write-path-richer-than-expected**
**Author:** APATRIS Claude (executor + active reviewer); Manish + chat-Claude (last source of truth); Holmes not involved this session.

This document is the read-only record of Dimension 4 findings. NOT committed in Session 2. Working draft until full audit synthesis (Session 5).

---

## D4-1 — 15 case lifecycle steps verification (per ASSUMPTION 2)

`MASTER_BLUEPRINT.md` Section 7 documents 15 sequential lifecycle steps. Confirmed exact match with ASSUMPTION 2 — 15 numbered steps, sequential ordering, no branching documented.

Per-step implementation evidence (search across `artifacts/api-server/src` for code paths matching each step's verb):

| # | Step | Implementation evidence | Status |
|---|---|---|---|
| 1 | Create case | `services/legal-case.service.ts:createCase()` + `routes/legal-cases.ts: POST /v1/legal/cases` | ✅ implemented |
| 2 | Add parties | No `case_parties` table; no `addParties` function. **Workers and case are 1:1 via `worker_id` FK on `legal_cases`.** Multi-party cases not modeled. | 🟡 partial — single-worker model only |
| 3 | Upload documents | `routes/document-intake.ts` + `services/document-intake.service.ts` + S3/R2 file storage; PDF persistence per `feat(intake)` commits Days 41-42 | ✅ implemented |
| 4 | OCR and classify files | Claude Vision + multi-stage extraction (B1+B2+B3 unified per commit `6f5ae06`); per-type completeness scoring; discriminated-union document schema | ✅ implemented |
| 5 | Attach documents to the case | `legal_evidence.worker_id` FK; `case_generated_docs.case_id` FK; `worker_files.worker_id` FK. **Documents attach to worker, not directly to case** in legal_evidence; case_generated_docs attaches via case_id | ✅ implemented (with naming asymmetry) |
| 6 | Extract facts, deadlines, and issues | `Stage1Result.proceduralNotes`, deadline_countdowns table, `services/deadline-engine.service.ts`, fact extraction in document-intelligence.service.ts | ✅ implemented |
| 7 | Retrieve law and templates | `services/legal-research.service.ts`, `services/intelligence-router.service.ts` (3-tier KB → Perplexity → Claude), `legal_knowledge` table (12 KB articles seeded), pgvector embeddings | ✅ implemented |
| 8 | Generate draft | `services/case-doc-generator.service.ts` + `services/legal-brief-pipeline.service.ts` (6-stage pipeline) | ✅ implemented |
| 9 | Verify claims and sources | Stage 3 of pipeline (`runStage3` validation) checks for invented facts, consistency; `requiresLawyerReview: true` always set | ✅ implemented |
| 10 | Route to lawyer review | `legal-queue.ts` + `LegalQueue.tsx` page; case status `UNDER_REVIEW`; case_generated_docs `status='DRAFT' → 'UNDER_REVIEW'` | ✅ implemented |
| 11 | Approve or revise | `case_generated_docs.is_approved`, `routes/legal-approval.ts: POST /v1/legal/approve`, `routes/document-workflow.ts` workflow | ✅ implemented |
| 12 | Export final output | `routes/files.ts`, PDF export via jsPDF, `pages/LegalDocuments.tsx`. **No `export_locked` column** on cases — export is permission-gated by role, not row-locked | 🟡 partial — export works but no export-lock column per blueprint Section 6 |
| 13 | Archive the matter | No explicit archive table. Cases reach terminal status (`APPROVED` / `REJECTED`) and remain in `legal_cases` indefinitely. **No archived_at column.** | 🟡 partial — terminal status reached but no formal archive lifecycle |
| 14 | Preserve logs and retention records | `audit_logs`, `regulatory_audit_log`, `ai_audit_log`, `zus_audit_trail`, `document_action_log` — 5 audit log tables. **No `retention_status` / `retention_end_date` columns** on cases per blueprint Section 6 | 🟡 partial — logs preserved; retention policy fields absent |
| 15 | Enforce litigation hold if required | **Zero matches** for `litigation_hold | litigationHold | preservation`. No litigation-hold mechanism implemented. | 🔴 missing |

**Aggregate status:** 9 of 15 steps fully implemented (✅), 5 partial (🟡), 1 missing (🔴). Steps 12-15 cluster around retention/archive/litigation-hold — these are **deliberate gaps** because retention discipline is a compliance feature that requires legal counsel input (per `EU_AI_ACT_ARTICLE_6_RESEARCH.md` and `MASTER_PLAN.md` Layer 0/2 design). The build has stronger AI/extraction/draft layers (steps 6-11) than retention/litigation layers (steps 12-15).

This pattern is **not drift** — it's a strategic build choice. The depth concentrates where the North Star demands (case AI reasoning), not where compliance audit demands (retention enforcement). Both matter; sequencing is deliberate.

ASSUMPTION 2 holds with one nuance: the 15 steps are documented as "sequential" but in code, several occur in parallel/non-blocking (e.g., status change at step 10 triggers steps 6, 11, and kg_* writes simultaneously per `legal-case.service.ts:260-282`). The sequencing is logical-conceptual, not strict-temporal.

## D4-2 — 14 important case fields verification (per ASSUMPTION 3)

`MASTER_BLUEPRINT.md` Section 6 documents 14 "Important fields" for cases. Confirmed exact match with ASSUMPTION 3.

Per-field presence check across `init-db.ts`:

| Field | Present? | Where (if anywhere) |
|---|---|---|
| `case_type` | ✅ present | `legal_cases.case_type CHECK ('TRC','APPEAL','PR','CITIZENSHIP')` |
| `status` | ✅ present | `legal_cases.status` (post-ALTER 9-state machine: NEW/DOCS_PENDING/READY_TO_FILE/FILED/UNDER_REVIEW/DEFECT_NOTICE/DECISION_RECEIVED/APPROVED/REJECTED) |
| `priority` | 🟡 elsewhere | Not on `legal_cases`. Found on `predictive_risk` (line 1261, default 'medium') and a regulatory simulation table (line 3294, INTEGER default 3). Cases inherit priority indirectly via blocker_type / sla_deadline / pressureLevel. |
| `assigned_lawyer` | 🔴 absent | Zero occurrences in `init-db.ts`. No assignment column on `legal_cases`. |
| `assigned_operator` | 🔴 absent | Zero occurrences. |
| `retention_status` | 🔴 absent | Zero occurrences. |
| `litigation_hold` | 🔴 absent | Zero occurrences. |
| `retention_end_date` | 🔴 absent | Zero occurrences. |
| `evidence_preservation_required` | 🔴 absent | Zero occurrences. |
| `approval_status` | 🟡 elsewhere | Analog exists: `case_generated_docs.is_approved BOOLEAN`, `case_generated_docs.status CHECK ('DRAFT','UNDER_REVIEW','APPROVED','REJECTED','SENT')`, `authority_response_packs.is_approved`, `rejection_analyses.is_approved`. Approval is per-document, not per-case. |
| `source_completeness_score` | 🟡 elsewhere | Analog exists: `document_intake.ai_confidence`, `document_intake.confidence_gate`, B2 typeScopedConfidence per commit `114e537 feat(intake): add per-type completeness scoring`. Per-document, not per-case. |
| `confidence_score` | 🟡 elsewhere | On `regulatory_updates`, `ai_responses`, `rejection_analyses`, `legal_briefs.overall_confidence`, `case_generated_docs.ai_confidence`. Per-AI-output, not a case-level rollup. |
| `risk_level` | 🟡 elsewhere | On `worker_legal_snapshots`, `authority_response_packs`, `predictive_risk`. Per-output, not on `legal_cases`. |
| `export_locked` | 🔴 absent | Zero occurrences. Export gated by role permission, not row-locked. |

**Aggregate:**
- 2 of 14 fields present on `legal_cases` (case_type, status)
- 5 of 14 present elsewhere as analogs on related tables (priority, approval_status, source_completeness_score, confidence_score, risk_level)
- 7 of 14 absent entirely (assigned_lawyer, assigned_operator, retention_status, litigation_hold, retention_end_date, evidence_preservation_required, export_locked)

**ASSUMPTION 3 reality-vs-plan mismatch:**
- **EXPECTED:** 14 documented case fields are implemented
- **FOUND:** 2/14 present on cases, 5/14 present elsewhere as analogs, 7/14 absent
- **REASONABLE INTERPRETATION:** Per `TRACK2-INVENTORY.md` (commit 739f592, 2026-04-25), the actual schema deliberately diverges from blueprint by consolidating into different tables (e.g., `approval_status` → per-document `is_approved` instead of per-case status). The 7 absent fields (assignment, retention, litigation hold, export lock) cluster around **compliance/operational discipline that hasn't been built yet** — they're deliberate scope choices, not drift, but they ARE gaps relative to the blueprint Section 6 spec.
- **RECOMMENDATION:** Document as "deliberate divergence with retention/operational gap" rather than "drift." The build has stronger AI/case-reasoning fields than retention/operational fields. Tier-2 stabilization candidate: either implement the 7 absent fields OR update `MASTER_BLUEPRINT.md` to reflect the actual schema choices.

**Litigation hold flagged separately (Session 5 synthesis input):**

Litigation hold (one of 7 absent fields) is flagged separately from the cluster: retention, evidence preservation, and archive can wait for counsel guidance because they're internal policy decisions. Litigation hold responds to external triggers (preservation orders, subpoenas) that arrive on someone else's timeline. For a firm handling foreign worker immigration cases including potentially adversarial cases against the Polish state, preservation orders are not theoretical. Litigation hold should land FIRST among the 7 absent fields, not last — counsel-engagement priority, not deferred.

## D4-3 — Dummy case end-to-end trace

**DB-access limitation:** As in Sub-test D (Session 1), no live DB connection in this audit session. `Monica Barahona Varon` appears in test fixtures (4 .ts files) but not as a seeded `legal_cases` row that we can verify via SQL. Code-path trace only.

**Trace using code paths:**

1. **Create case** (`POST /api/v1/legal/cases`): `legal-cases.ts:65-83` validates case_type, calls `createCase(workerId, tenantId, caseType, notes)`. Inserts row in `legal_cases` with status='NEW'. ✓
2. **Initial status: NEW** — case present in `legal_cases` queue. `getActiveCases()` returns it. `getUrgencyQueue()` orders it.
3. **Upload documents** → `routes/document-intake.ts` → `services/document-intake.service.ts` → S3 + `worker_files` row + `document_intake` row with `confidence_gate` flag.
4. **OCR/extract** → `services/document-intelligence.service.ts` runs Claude Vision, populates `document_intake.extracted_data JSONB`.
5. **Attach to case** → `legal_evidence` row with `worker_id` (NOT `case_id` directly — design choice). Cross-reference via worker.
6. **Generate brief** (`POST /api/v1/legal/brief/generate`): `services/legal-brief-pipeline.service.ts:generateLegalBrief()` runs 6-stage pipeline:
   - Loads worker + snapshot + most-recent legal_case + most-recent rejection_analysis
   - Stage 1-4 persist to `legal_briefs.stage1_research_json` through `stage4_pressure_json`
   - Stage 5-6 persist into `legal_briefs.final_brief_json`
7. **Status change to UNDER_REVIEW** (`PATCH /api/v1/legal/cases/:id`): `updateCaseStatus(caseId, tenantId, "UNDER_REVIEW")` triggers (per `legal-case.service.ts:260-282`):
   - `case-notebook.service.ts:logStatusChange()` → `case_notebook_entries` row
   - `case-sync.service.ts:syncLegalCaseToTrcCase()` (only on APPROVED/REJECTED)
   - **`knowledge-graph.service.ts:recordCaseInGraph()` → kg_nodes + kg_edges write (HOOK 1 verification — see below)**
   - `case-doc-generator.service.ts:generateDocumentForStage()` → AI document generation per stage trigger
8. **Lawyer reviews brief at `/legal-brief` route** → `LegalBrief.tsx:473 lines` — single-brief UI per Sub-test D. Approve/reject → `case_generated_docs.is_approved`.
9. **Status to APPROVED/REJECTED** triggers terminal-status logic in `recordCaseInGraph`: creates `DECISION` node + `RESULTED_IN` edge with outcome metadata + `days_to_decision` derived; `legal_cases` updated; `trc_cases` synced.
10. **No archive transition.** Case remains in `legal_cases` table indefinitely; no `archived_at` column. Per D4-1 step 13.

**Trace status:** End-to-end the pipeline fires through. Where it breaks for North Star (multi-scenario reasoning) was documented in Session 1 Sub-test D — Layer 3 stage absent. Where it breaks for compliance/retention is documented in D4-1 steps 12-15 — those are deliberate gaps.

## D4-4 — Cross-table case integrity

| Relationship | FK status | Orphan-record risk |
|---|---|---|
| `legal_cases.worker_id → workers(id)` | `ON DELETE CASCADE` | None — case deleted with worker |
| `legal_cases.tenant_id → tenants(id)` | `ON DELETE CASCADE` | None |
| `legal_evidence.worker_id → workers(id)` | `ON DELETE CASCADE` | None for worker; **legal_evidence does not directly reference legal_cases.id** — evidence ties to worker, not case. If a case is deleted but worker remains, evidence persists across worker's case history. Design choice; not orphaning per se. |
| `case_generated_docs.case_id → legal_cases(id)` | `ON DELETE CASCADE` | None |
| `case_notebook_entries.case_id → legal_cases(id)` | `ON DELETE CASCADE` | None |
| `authority_response_packs.legal_case_id → legal_cases(id)` | `ON DELETE SET NULL` | **Orphan-eligible** — if case deleted, response pack survives with NULL case_id. Intentional? — likely yes; response packs may have value beyond the case (cross-case knowledge). |
| `legal_briefs.case_id` | **NOT a FK** in current schema (worker_id is FK; case_id is plain UUID; no constraint) | **Orphan risk** — if `legal_cases` row deleted, `legal_briefs.case_id` becomes a dangling reference. |
| `kg_edges.source_id / target_id → kg_nodes(id)` | `ON DELETE CASCADE` | None — edges deleted when nodes deleted |
| `trc_cases.tenant_id` | `TEXT NOT NULL` (NOT a UUID FK to tenants) | Type-mismatch with rest of schema; documented inconsistency |

**Findings:**
- Most case-related FKs have proper CASCADE semantics
- **`legal_briefs.case_id` lacks FK constraint** — dangling reference possible if cases are deleted. **Relocated to Production fixes pending category** (see Verdict section).
- **`legal_evidence` ties to worker not case** — design choice with cross-case-evidence implication. Not a defect but worth documenting.
- **`authority_response_packs.legal_case_id ON DELETE SET NULL`** — intentional cross-case retention pattern.
- **`trc_cases.tenant_id` is TEXT not UUID** — type inconsistency with the rest of the multi-tenant schema. **5-minute investigation needed before final classification:** is `trc_cases.tenant_id` (TEXT) used in JOINs against UUID-typed `tenant_id` columns elsewhere? If yes, every JOIN has implicit type coercion (performance + possibly correctness implications) — elevate to **Production fixes pending**. If purely cosmetic — keep at Tier-2. Investigation folded into operational pass scope (d) below.

## D4-5 — Forward-build capture (Layer 3 implications)

When Layer 3 (scenarios engine) is built, the following lifecycle / field changes will be needed:

**Lifecycle step that gains scenarios surfacing:** Most likely between Step 7 (Retrieve law and templates) and Step 8 (Generate draft) — once law is retrieved and facts are extracted, Layer 3 generates 3-5 candidate paths BEFORE the draft locks to one. Alternatively, between Step 9 (Verify claims) and Step 10 (Route to lawyer review) — generate scenarios after validation, present to lawyer with multi-pathway choice.

**Fields that would evolve to support multiple scenarios:**
- `legal_briefs.stage5_alternatives_json JSONB` — Pattern A (inline). Each row holds 3-5 candidate path structures.
- OR new `case_scenarios` table with FK to `legal_cases.id` — Pattern B (separate). Each row is one candidate path; lawyer can flag preferred via additional column.
- `legal_evidence.applicable_scenarios INTEGER[]` (or JSONB array of scenario IDs) — to tag evidence to specific scenarios.
- `case_generated_docs.scenario_id UUID NULL` — to support per-scenario doc variants.

**kg_* substrate readiness (HOOK 1 — see below):** The pattern-similarity substrate is in place AND active per Hook 1 verification. Layer 3's "calibrated forecasts grounded in firm's actual historical case data" can leverage `findSimilarCases` from `knowledge-graph.service.ts:130` directly.

## HOOK 1 — kg_* auto-population verification (per Session 2 Part E)

**Question:** Does write-path actually exercise the `kg_*` substrate, or is it rich but inert?

**Verification:** `legal-case.service.ts:272-276` performs dynamic import + invocation of `recordCaseInGraph` from `knowledge-graph.service.ts` on every `updateCaseStatus()` call:

```ts
// Record in knowledge graph (non-blocking)
try {
  const { recordCaseInGraph } = await import("./knowledge-graph.service.js");
  await recordCaseInGraph(tenantId, caseId, existing.worker_id, existing.case_type, newStatus);
} catch { /* non-blocking */ }
```

**`recordCaseInGraph()` (knowledge-graph.service.ts:197-252):**
- Finds or creates a `CASE` node (kg_nodes) with case_id, worker_id, case_type, status as JSONB properties
- Finds or creates a `WORKER` node
- Creates `WORKER → HAS → CASE` edge in kg_edges
- On terminal status (APPROVED/REJECTED), creates `DECISION` node + `RESULTED_IN` edge with outcome and days_to_decision metadata
- All operations idempotent (find-or-create pattern)

**Verdict on Hook 1:** ✅ **Substrate is rich AND active.** Auto-population fires on every case status change. Layer 3 cost-reducing assessment from Session 2 PART D is **CONFIRMED**, not refuted.

**Caveat:** Wrapped in try/catch with `// non-blocking` comment. If `recordCaseInGraph` throws (DB error, kg_nodes constraint failure), the case lifecycle continues silently. Same silent-failure pattern as init-db.ts catch blocks (Dimension 2 finding) and the parallel `case-notebook.service.logStatusChange`, `case-sync.service.syncLegalCaseToTrcCase`, and `case-doc-generator.service.generateDocumentForStage` calls.

This means: **kg_* IS auto-populated, but auto-population is best-effort, not guaranteed.** A staging-DB query would clarify how often (if ever) auto-population has failed silently. That's the same operational pass as Session 1's `agent_queries` observability — recommend running both in one staging-inspection pass **between Session 3 and Session 4** (revised from "before Session 5" per Session 2 close Integration 5; see Operational Pass Scope section near end of file).

**Hook 1 update to Session 1 Layer 3 forward-build path:** confirmed cost-reducing, with caveat that "best-effort substrate population" should be considered when Layer 3 queries kg_* — Layer 3 should handle "kg_* node missing for this case" gracefully (likely populate on-demand if missing).

## HOOK 2 — Write-path-vs-schema-depth (per Session 2 Part E)

**Question:** Which clusters have rich schema but thin write paths? Confirms or refutes the "schema-rich, write-path-poor" framing.

**Findings:**

| Cluster | Schema depth | Write path depth | Verdict |
|---|---|---|---|
| Workforce core | Rich (workers + 9 sub-tables, profile_embedding) | Rich (workers-db.ts + many service write paths; bulk import; embedding population) | **Schema and write paths balanced** |
| Compliance | Rich (documents + workflow + audit_logs + alerts) | Rich (intake services + workflow service + alert pipeline + cron jobs) | **Balanced** |
| Payroll | Rich (commits + snapshots + ZUS audit + advances) | Rich (payroll service + ZUS calculator + payslip generation) | **Balanced** |
| Immigration / Legal Cases | Very rich (~30+ tables, deepest ALTER history) | **Very rich for case lifecycle (legal-case.service triggers 4 downstream services on status change); thin for retention/litigation hold (no implementation per D4-1 steps 13-15)** | **Mostly balanced; retention layer thin (deliberate)** |
| Knowledge Graph (`kg_*`) | Rich (nodes + edges + typed enums + similarity logic) | **Active write path on case status change (Hook 1 verified)** + read path via findSimilarCases. NOT yet active write paths from document-intake or AI brief generation. | **Schema rich, write path partial** — kg_* fires from case lifecycle but not from all event sources that could enrich it |
| Knowledge Nodes (`knowledge_nodes` flat) | Thin schema (one table, 7 columns) | One write path: `POST /api/ai/index` rebuilds the table from scratch | **Schema thin, write path matches; not the issue** |
| OODA (`ooda_cycles` + `ooda_decisions` + `ooda_events`) | Rich (3-table structure with stage advancement + decision recording) | `services/ooda-engine.service.ts` (advanceStage, recordDecision, createOrGetCycle) + `services/ooda-orchestration.service.ts` orchestrator. **Verify whether actually invoked from case lifecycle** | **Schema rich; write path needs verification** — orchestrator exists but invocation surface unclear |
| Regulatory Intelligence | Rich (9 tables) | Rich (9+ regulatory-* services + cron-driven `daily-legal-scan.service.ts`) | **Balanced** |
| Embeddings | 4 vector(1024) columns + HNSW indexes | `services/legal-research.service.ts` populates embeddings via `feat(rag): retrieval library` (commit `6ced45d`); document-intake auto-populates rejection embeddings | **Balanced** |
| Test scenarios (`test_scenarios`, `test_scenario_runs`) | Schema present | Schema present, route exists at `/v1/test-scenarios/`. Used for regulatory rule testing per Session 1. | **Balanced (limited scope)** |

**Verdict on Hook 2:** The **"schema-rich, write-path-poor"** framing from the prior project_blueprint_gap_audit memory is **PARTIALLY REFUTED**. The case lifecycle fan-out at `legal-case.service.ts:260-282` is a fat write path triggering 4 downstream services on every status change. The primary residual gap is in **retention/litigation/archive layer** (D4-1 steps 12-15) — those write paths don't exist because the schema fields don't exist. Schema and write paths are co-absent there, not asymmetric.

A more accurate reframe: **"schema-rich, retention-layer-poor"** — the depth concentrates on AI/case-reasoning surfaces (richest write paths) and thins out at compliance/operational discipline layers (no schema, no write path). This is consistent with the build's North Star (multi-scenario AI for case reasoning) and the deliberate Layer 0/Layer 2 sequencing (compliance + evidence chain come AFTER case scaffolding).

The kg_* "write path partial" finding (active from case lifecycle, inactive from document intake / AI brief generation) is the most actionable remediation candidate — adding kg_* writes from document-intake and brief generation would densify the graph for richer findSimilarCases output. Tier-2 stabilization-eligible.

## Verdict

🟡 **VERIFIED with directional alignment — phase-appropriate, write-path-richer-than-expected**

The case data flow is **substantially implemented** and **richer than the prior `schema-rich, write-path-poor` framing suggested.** End-to-end pipeline fires; case lifecycle cascades to 4 downstream services on status change (kg_*, case-notebook, case-sync, case-doc-generator); kg_* substrate is auto-populated and active.

Gaps are concentrated and **deliberate**:
1. **Retention/litigation/archive layer** (D4-1 steps 12-15, D4-2 fields 7-10): not implemented; reflects strategic sequencing of AI reasoning before compliance discipline. (Litigation hold flagged separately as counsel-engagement priority — see D4-2 section.)
2. **Multi-scenario reasoning** (Sub-test D from Session 1): Layer 3 unbuilt, gated on Layer 0 v1, gated on EU AI Act counsel review.
3. **Multi-party cases**: not modeled; cases are 1:1 with worker. Likely fine for immigration cases (one foreigner per case); would matter for B2B disputes / multi-defendant cases.
4. **`legal_briefs.case_id` lacks FK constraint** — dangling reference risk. **Relocated to Production fixes pending category — see below.**
5. **`kg_*` densification strategy** — substrate active from case lifecycle only; document-intake and brief-generation paths don't write. **Relocated to Build-sequencing findings #3 in DIMENSION_3.md per Session 2 close Integration 2.**

These gaps are not contradictions of architecture; they are forward-build sequencing or compliance-deferral choices.

## Production fixes pending (real gaps; smaller than Build-sequencing decisions; not documentation lag)

This category surfaces concrete production-quality fixes that are smaller than Build-sequencing decisions but more substantive than Tier-2 documentation lag. They are real gaps in shipped behavior or schema integrity. Recommend addressing before Layer 3 build begins so Layer 3 doesn't inherit them.

**Operational hygiene work scheduled separately from audit work.** Three immediate priorities (per operational pass close):
- Staging reactivation (unblocks future operational pass items a, b)
- DB pool quick-fix (Production fixes #3, one-line config change)
- 61977ad bug cluster sweep (Production fixes #2, sub-30-minute fix)

These are remediation tasks, NOT audit work. Schedule as capacity allows. None block Session 4 launch.

1. **`legal_briefs.case_id` FK constraint missing.** Briefs hold AI reasoning, legal arguments, citations. Disconnected briefs (after case deletion) become useless or risky. Single-ALTER fix. Cost of unfixed scales with brief volume. Recommend: address before Layer 3 build begins. (Unchanged from Session 2.)

2. **`61977ad` schema-assumption bug cluster** (re-scoped at operational pass GATE-OP-3 from "Escalation engine SQL bug"). 8 broken SQL queries across 4 new api-server files from commit `61977ad` (2026-04-13). Files: `escalation-engine.service.ts` (2 queries), `routes/public-verify.ts` (3 queries), `services/weekly-digest.service.ts` (2 queries), `services/push-sender.service.ts` (1 query). 5 of 10 features in commit have broken SQL paths: public verification (#1), escalation engine (#5), weekly digest (#6), client portal (#7), push service (#4). Two column-name patterns: `workers.first_name`/`last_name` (7 queries; `workers` schema has only `full_name`) and `notification_log.message` → should be `message_preview` (1 query). All 4 files have been silent-failing for 19 days with zero feedback loop. Sub-30-minute fix sweep recommended. **Origin:** `61977ad` commit message claimed "Complete feature build — no gaps, no stubs" — empirically false on inspection. Reveals "shipped fast without DB-validation pre-merge" pattern.

   **Origin context (Session 3 Dimension 1 D1-PRIORITY-A; elevated and re-scoped at GATE-OP-3):** Item (h) of operational pass found 4 of 4 NEW api-server files from this commit contain schema-assumption bugs, not just escalation engine. Pattern characterization in BUILD_INTEGRITY_AUDIT_OPERATIONAL_PASS.md item (h)-6.

   Single sweep fix path: replace `first_name, last_name` references with `full_name` (or `split_part(full_name, ' ', 1)` if first-name display is needed); replace `notification_log.message` with `message_preview`. Sub-30-minute change covers all 8 broken queries. Recommend: address before Layer 3 build begins so the 5 affected features become functional.

3. **DB connection pool errors recurring on prod** (D7-2 (d) MULTI-METHOD finding; Pre-D1 Verification 2 OUTCOME C; **root cause CONFIRMED via operational pass item (g)**). `[DB] Unexpected pool client error: Connection terminated unexpectedly` recurring at steady ~206/24h (operational pass measured; revised down from earlier ~240/24h projection), both machines, scheduler-correlated timing. **Root cause:** Neon serverless aggressive idle-close mismatched with pg-pool warm-connection retention (`min: 2 + idleTimeoutMillis: 30_000 + allowExitOnIdle: false`). Errors are `Connection terminated unexpectedly` (Neon-side close pattern), not network failure or load saturation.

   **Longstanding-not-recent-regression reframe (Session 3 Dimension 1 D1-PRIORITY-C):** Pool config unchanged since commit `9db39cb` ("perf(scale): connection pool upgrade") — same `max:20, min:2, idleTimeoutMillis:30_000, connectionTimeoutMillis:5_000, allowExitOnIdle:false` has shipped for weeks. Errors have been recurring since the upgrade landed; only became visible in audit when MULTI-METHOD verification ran. NOT a recent regression. Sentry-blindness of `pool.on("error")` callbacks is the systemic gap that hid the duration.

   Four remediation options (per operational pass item (g)-5):
   - **Option A — `min: 0`:** drop warm connections; trades cold-start latency for stability. Lowest risk, lowest effort.
   - **Option B — reduced `idleTimeoutMillis` to ~10-15s:** force pg-pool to close before Neon does. Same effect; preserves warm connections under active load.
   - **Option C — periodic `SELECT 1` keepalive:** keeps connections actively used. Adds steady query load; obscures rather than fixes the mismatch.
   - **Option D — Neon Pooler endpoint:** switch `NEON_DATABASE_URL` to `-pooler` host suffix; PgBouncer-based pooling at the Neon edge handles idle-close transparently. Requires Fly secret rotation; may have prepared-statement implications.

   **Recommend Option A or B (one-line config change).** Apply, monitor for 24h, before Layer 3 adds more scheduled load on the same pool.

4. **Daily regulatory scan failing on DB timeout** (D7-2 (d) finding). `[Scheduler] Regulatory scan/snapshot error: Error: Connection terminated due to connection timeout` observed at daily cadence on both machines (~6/24h, 1 per machine per day, both fail). The `startDailyRegulatoryScan` cron IS firing on schedule but failing 100% of the time on connection-timeout. Symptom of root cause #3 (DB pool instability). **May resolve when #3 DB pool fix lands** — connectionTimeoutMillis 5_000 expires because pg-pool can't hand out a fresh connection in time when Neon-closed warm connections are stale. Validate post-fix #3 before classifying as resolved.

5. **`trc_cases.tenant_id` + `worker_id` TEXT-vs-UUID type tightening** (operational pass item (d), bounded-impact qualifier). `trc_cases.tenant_id TEXT NOT NULL` outlier vs codebase's UUID FKs to `tenants(id)`. Most usage (49 grep hits) doesn't clash types — single-table WHERE filters use parameter binding; JOINs are typically on UUID `id` columns. **One cross-type JOIN found at `services/legal-evidence-ocr.service.ts:204`** with explicit `::text` casts on both sides:
   ```sql
   LEFT JOIN trc_cases tc ON tc.worker_id = le.worker_id::text AND tc.tenant_id = le.tenant_id::text
   ```
   **Bounded impact:** single site, pre-filtered driver table, explicit casts. Lower priority than security findings. **Origin:** Airtable record-ID legacy preserved when rest of schema went UUID-FK to `tenants` table. Long-term remediation: ALTER `trc_cases.tenant_id` to UUID with FK + `trc_cases.worker_id` to UUID with FK; data already canonical UUID form per existing usage; type-tightening migration, not data migration.

6. **`routes/messaging.ts` XOR encryption replaced with AES-256-GCM via `lib/encryption.ts`** (operational pass item (e)). `routes/messaging.ts:9-23` uses XOR with SHA256-hashed `JWT_SECRET`, fallback hardcoded `"apatris-msg-key"`. Comment explicitly says `"production should use AES"` — TODO-shipped-to-prod that never returned. Hardcoded fallback key means if `JWT_SECRET` unavailable, every messaging payload encrypted with hardcoded string in source — obfuscation, not encryption. Messaging payloads can carry PII (worker conversations may include PESEL, passport refs, salary discussions, legal-case status). **Higher priority than #5 because security posture is materially different.** Single-site fix: replace XOR with `lib/encryption.ts` AES-256-GCM path; same `APATRIS_ENCRYPTION_KEY` infrastructure can be reused. Recommend: address before Layer 3 build OR before counsel engagement, whichever comes first.

(Future audit dimensions may add entries to this category.)

ASSUMPTION 4 holds: Session 1's verdict (YELLOW with directional alignment, phase-appropriate, Pattern Y confirmed) is preserved at Session 2 close. Dimensions 2 + 4 confirm the build's execution quality is **sound for the documented architecture**. The schema is truthful (Dimension 2). The case data flow exercises the schema deliberately (Dimension 4). Where it doesn't, sequencing is documented.

## Cross-dimension recharacterization — Session 1 verdicts unchanged

Dimension 4 findings do NOT change Session 1's verdicts. They:
- Confirm Pattern Y by tracing the actual end-to-end flow
- Confirm North Star directional alignment (Layer 3 is the missing piece, not the architecture)
- Refine "schema-rich, write-path-poor" to the more accurate "schema-rich, retention-layer-poor"
- Confirm kg_* auto-population is active (informational refinement to PART D's tentative cost-reducing assessment)

Dimension 2's CROSS-DIMENSION recharacterization (the kg_* + knowledge_nodes split, applied to DIMENSION_3.md Sub-test B) stands.

## Operational Pass Scope (Sunday 2026-05-03, BETWEEN Session 3 AND Session 4)

Per Session 2 close Integration 5: operational pass timing revised from "before Session 5 synthesis" to **BETWEEN Session 3 AND Session 4**. Per Session 3 close Element 4: **scheduled for Sunday 2026-05-03** (the day after Session 3 close). Reasoning: Session 4 (Dimensions 5+6 — build philosophy + documentation truthfulness) shifts from execution quality to alignment with documented intent. Production usage data sharpens Session 4 judgment. `kg_*` health verification grounds documented-vs-actual assessment empirically. Silent-failure trace spot-check informs build philosophy assessment. The Sunday scheduling lets Session 4 launch with operational pass findings already in hand.

**Operational pass scope (8 checks, one staging-DB inspection):**

(a) **`agent_queries` observability pass** — `SELECT COUNT(*) FROM agent_queries; SELECT * FROM agent_queries ORDER BY created_at DESC LIMIT 20;` Captures: AI Copilot usage volume, query patterns, agent_used distribution, response latencies. Three outcomes shape Session 4: zero usage = synthesis acknowledges capability assessment without empirical use; real usage = synthesis prioritizes Layer 3 sequencing based on observed behavior; specific patterns = synthesis shapes Layer 3 design around real-world usage.

(b) **`kg_*` auto-population health query** — verify nodes + edges exist for recently-updated cases; verify DECISION nodes + RESULTED_IN edges exist for terminal-status cases. `SELECT node_type, COUNT(*) FROM kg_nodes WHERE tenant_id = $1 GROUP BY node_type; SELECT edge_type, COUNT(*) FROM kg_edges WHERE tenant_id = $1 GROUP BY edge_type; SELECT * FROM kg_nodes WHERE node_type = 'CASE' ORDER BY created_at DESC LIMIT 20;` Captures whether the best-effort auto-population pattern actually persists data or fails silently.

(c) **Silent-failure trace spot-check** — across init-db.ts catch blocks (Dimension 2 lines 2332/3625/3646/3669/3692/3711) and case lifecycle fan-out best-effort patterns (legal-case.service.ts:260-282). Sample staging logs for `[init-db]` warnings; sample for non-blocking failures across `case-notebook`/`case-sync`/`recordCaseInGraph`/`generateDocumentForStage`. Captures whether silent-failure pattern is empirically harmless or hides real degradation.

(d) **`trc_cases.tenant_id` type investigation** — 5-minute check: grep all SQL JOINs against `trc_cases` for tenant_id usage; identify any JOINs that compare TEXT `trc_cases.tenant_id` against UUID `tenants.id` or other UUID `tenant_id` columns. If type-coerced JOINs exist → elevate to Production fixes pending. If no cross-table tenant_id JOIN → keep at Tier-2 cosmetic.

(e) **Daily regulatory scan DB-timeout investigation** (D7-2 (d) finding) — sample `flyctl logs --app apatris-api -n` filtered for `[Scheduler] Regulatory scan` over a 7-day window; quantify failure rate (every fire? intermittent? correlated with pool errors?). Confirm whether failures correlate with the DB pool errors (operational pass scope item g below) or are an independent failure mode in `daily-legal-scan.service.ts`. Outcome shapes whether the fix is "fix DB pool" or "fix scan-specific timeout / retry logic."

(f) **kg_* densification empirical baseline** — count `kg_nodes` and `kg_edges` populated solely from case-status-change auto-population (Hook 1 path) on staging/prod. Used to scope Build-sequencing #3 (kg_* densification strategy in DIMENSION_3.md): if substrate is already dense from case lifecycle alone, additional write triggers from document-intake / brief-generation are deferrable; if sparse, they become Layer-3-blocking.

(g) **DB connection pool root-cause investigation** — Neon dashboard inspection (server-side idle-timeout setting, connection-count metrics over 24h, idle-disconnect logs) + correlation with pg-pool config in `lib/db.ts:15-23`. Confirm root-cause hypothesis from Pre-D1 Verification 2 OUTCOME C (Neon aggressive idle-close vs pg-pool warm-connection retention). Pick one quick-fix candidate (min:0, reduced idleTimeoutMillis, keepalive query, or `@neondatabase/serverless` driver migration) for staging trial.

(h) **Commit `61977ad` spot-check — surface other shipped-without-DB-exercise features** (per Session 3 Dimension 1 D1-PRIORITY-A elevated finding, Production fixes pending #2). The escalation engine SQL bug (`w.first_name does not exist`) shipped silently in this 13-files / 1,669-insertions commit dated 2026-04-13. **Other features bundled into the same commit may share the same characteristic.** Spot-check scope:
   - Enumerate the 13 files changed in `61977ad` (`git show --stat 61977ad`)
   - For each NEW service file or route file in that commit, grep for column references in SQL strings against the `workers` table (or other tables touched)
   - Cross-reference each referenced column against current `init-db.ts` schema
   - Flag any other file in the commit that references columns that don't exist
   - Flag any service that contains SQL but has zero test coverage (pre-merge DB exercise was likely absent)
   
   Outcome shapes Session 4 build philosophy assessment: a single bug is an isolated incident; multiple bugs from the same commit suggest a build-discipline gap that informs Dimension 5 verdict. Read-only repo grep + git inspection only — no execution, no DB writes.

All eight checks except (g)'s Neon dashboard step are read-only SELECTs on staging/dummy DB and read-only repo / log inspection. Hard boundaries: no production DB writes, no DML/DDL, no Fly secret changes, no deploys. (g)'s Neon dashboard inspection is read-only metric review.

## Audit metadata

- File: `BUILD_INTEGRITY_AUDIT_DIMENSION_4.md`
- NOT committed in Session 2 — working draft until full audit synthesis
- Hard boundaries respected: read-only repo, no commits, no DML/DDL, no DB connections, no migration runner invocation
- DB-access limitation: trace via code paths only; staging-DB observability pass scheduled BETWEEN Session 3 and Session 4 per Operational Pass Scope above
