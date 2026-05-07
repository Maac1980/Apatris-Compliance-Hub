# BUILD INTEGRITY AUDIT — Dimension 2: Schema Integrity

**Audit date:** 2026-05-01
**Session:** 2 of 5 (Dimensions 2 + 4)
**Status:** 🟡 **VERIFIED with directional alignment — phase-appropriate, stabilization-eligible**
**Author:** APATRIS Claude (executor + active reviewer); Manish + chat-Claude (last source of truth); Holmes not involved this session.

This document is the read-only record of Dimension 2 findings. NOT committed in Session 2. Working draft until full audit synthesis (Session 5).

---

## D2-1 — Schema scale verification (claimed vs actual)

| Metric | Claimed (Session 1 / audit Stage 1) | Actual | Drift |
|---|---|---|---|
| `init-db.ts` line count | 3,715 | **3,715** | ✓ exact |
| `CREATE TABLE IF NOT EXISTS` | 150 | **150** | ✓ exact |
| `ALTER TABLE` | 185 | **185** | ✓ exact |
| `CREATE INDEX IF NOT EXISTS` | 203 | **203** | ✓ exact |
| `CREATE INDEX` (any form, including non-IF-NOT-EXISTS) | — | 205 | +2 (two indexes without IF NOT EXISTS guard) |

Schema scale matches Session 1's reported numbers exactly. The 2 indexes without `IF NOT EXISTS` are a minor pattern-deviation; could fail on second boot if those exact index names exist. Captured for Tier-2 stabilization.

## D2-2 — Vestigial Drizzle schema confirmation (per ASSUMPTION 1)

- Path: `lib/db/src/schema/index.ts`
- Lines: **42** (matches claim)
- `pgTable(...)` invocations: **3** instances grepped, **2 distinct tables** declared (`regulatoryUpdates`, `immigrationSearches`) — the third grep hit is a re-occurrence of one of those identifiers in a `$inferSelect` line. Effectively 2 tables.
- ASSUMPTION 1 holds: this is informational/vestigial. The authoritative schema lives in `init-db.ts`. The `lib/db/drizzle.config.ts` exists for typed Drizzle ORM query construction in 2 specific tables only; not for migrations and not for the bulk schema.

## D2-3 — Catch blocks at silent failure points

There are **6** total `} catch (e)` blocks in `init-db.ts`. Each warns to console and continues:

| Line | What's swallowed | Risk class |
|---|---|---|
| 2332 | `trc_cases.case_reference` migration — adding `case_reference TEXT` column + an index | LOW — column-add is idempotent; warn + continue is acceptable |
| 3625 | pgvector extension creation — `CREATE EXTENSION IF NOT EXISTS vector` | LOW — if extension fails, all subsequent vector columns become inert (which downstream catch blocks already log). System degrades gracefully to non-RAG. |
| 3646 | `legal_knowledge` vector(1024) embedding column + HNSW index | MEDIUM — silent skip means RAG retrieval over legal_knowledge may not function on prod. If vector extension is healthy, this should not fail; if it does fail, prod runs without semantic retrieval over the KB. |
| 3669 | `rejection_analyses` vector(1024) embedding + HNSW index | MEDIUM — same risk class as 3646 for the rejection-pattern retrieval |
| 3692 | `case_generated_docs` vector(1024) embedding + HNSW index | MEDIUM — same |
| 3711 | `workers.profile_embedding` vector(1024) + HNSW index | MEDIUM — same; matters for "find similar workers" patterns |

**Observations:**
- Pattern is consistent: every vector-column addition is wrapped in try/catch with console.warn fallback. Defensive against pgvector extension absence.
- **Risk:** silent degradation. If pgvector load fails or any column-add throws (e.g., disk pressure, lock contention during boot), prod runs without semantic retrieval and only a `[init-db]` warning surfaces in logs. No alerting wires this to Sentry or Pino structured logs.
- **Recommendation (Tier-2 stabilization-eligible):** wire init-db catch blocks to structured logging (pino/Sentry) so silent failures surface as alerts, not just stdout warnings. Not blocking for Layer 3 build; useful for forward-stability.

## D2-4 — Per-cluster table walk

**Total tables grepped from CREATE TABLE statements: 150** (some grep variants flagged 149 due to multi-line spread; the canonical count is 150).

Logical clusters (inferred from table-name prefixes + code/comment grouping in `init-db.ts`):

| Cluster | Representative tables | Count | ALTER additions | Reference status |
|---|---|---|---|---|
| Tenancy (foundation) | `tenants` | 1 | data_retention_days + a few flags | Heavily referenced (FK target for everything) |
| Auth/RBAC | `admins`, `mobile_pins`, `face_encodings`, `refresh_tokens`, `site_coordinators`, `otp_sessions`, `api_keys`, `verification_tokens` | 8 | tenant_id added late to most | All referenced by routes/services |
| Workforce core | `workers`, `worker_files`, `worker_skills`, `worker_availability`, `worker_emails`, `worker_housing`, `worker_identities`, `worker_legal_snapshots`, `worker_matches`, `agency_workers` | 10 | preferred_language, oswiadczenie_expiry, profile_embedding, multiple compliance-date columns | All actively referenced |
| Compliance | `documents`, `compliance_snapshots`, `compliance_incidents`, `compliance_guarantees`, `notification_log`, `audit_logs`, `document_action_log` | 7 | tenant_id retroactively added; CHECK constraints on dates | Referenced |
| Payroll | `payroll_commits`, `payroll_snapshots`, `salary_advances`, `salary_benchmarks`, `zus_filings`, `zus_audit_trail`, `rate_cards`, `margin_analysis`, `revenue_forecasts` | 9 | tenant_id retro | Referenced |
| Contracts/signatures | `contracts`, `generated_contracts`, `signatures`, `certified_signatures`, `power_of_attorney`, `poa_registry` | 6 | various date constraints | Referenced |
| Posted Workers / EU compliance | `posting_assignments`, `posted_worker_notifications`, `country_configs`, `framework_agreements`, `esspass_records` | 5 | various | Referenced |
| GPS / sites | `gps_checkins`, `site_geofences`, `hostels`, `hostel_rooms`, `worker_housing` | 5 | — | Referenced |
| GDPR / consent | `consent_records`, `gdpr_log`, `gdpr_consent_records`, `human_overrides` | 4 | — | Referenced |
| Document workflow | `document_intake`, `document_workflows`, `inbound_emails`, `obsidian_exports` | 4 | various | Referenced (obsidian_exports is the lightest — 1 non-init-db reference) |
| Immigration / Legal Cases (the audit's North Star territory) | `legal_cases`, `legal_evidence`, `legal_documents`, `legal_briefs`, `legal_alerts`, `legal_notifications`, `legal_queries`, `legal_scan_runs`, `legal_updates`, `legal_knowledge`, `case_generated_docs`, `case_notebook_entries`, `authority_response_packs`, `trc_cases`, `trc_case_notes`, `trc_documents`, `immigration_permits`, `immigration_searches`, `rejection_analyses`, `pip_inspection_reports`, `deadline_countdowns`, `worker_legal_snapshots`, `law_articles`, `regulatory_*` (multiple) | ~30+ | Heavy — the deepest ALTER history concentrates here (legal_cases has 17 ALTERs alone) | All referenced |
| Knowledge Graph (TWO separate sets — see CROSS-DIMENSION recharacterization below) | `knowledge_nodes` (flat), **`kg_nodes` + `kg_edges` (real graph)** | 3 | — | Both referenced; kg_* by knowledge-graph.service.ts (280 lines), case-notebook.service.ts, vault-search.service.ts, health.ts, knowledge-graph.ts route |
| AI / Observability | `agent_queries`, `ai_audit_log`, `ai_requests`, `ai_responses`, `automation_logs`, `automation_runs`, `decision_explanations` (if exists), `error_reports`, `webhook_logs`, `webhooks`, `ooda_cycles`, `ooda_decisions`, `ooda_events` | ~13 | — | Referenced; OODA tables tie to ooda-orchestration.service.ts |
| Regulatory Intelligence | `regulatory_updates`, `regulatory_sources`, `regulatory_approvals`, `regulatory_audit_log`, `regulatory_deployments`, `regulatory_impacts`, `regulatory_review_tasks`, `regulatory_simulations`, `regulatory_snapshots` | 9 | — | Referenced by regulatory-* services |
| Embeddings (vector substrate) | columns added on `legal_knowledge`, `rejection_analyses`, `case_generated_docs`, `workers` | 4 columns (not separate tables) | The vector(1024) + HNSW indexes | Used by retrieval libs |
| CRM / Business | `crm_companies`, `crm_deals`, `clients`, `client_portal_links`, `client_portal_tokens`, `competitor_intel`, `market_intelligence`, `market_signals`, `subscriptions`, `billing_history`, `invoices`, `job_postings`, `job_applications`, `job_requests`, `bench_entries`, `worker_matches`, `career_paths`, `skill_demands`, `salary_benchmarks`, `revenue_forecasts`, `roi_*` (none separate; via revenue_forecasts) | ~20 | — | Referenced |
| Push / messaging | `push_subscriptions`, `notifications`, `messages`, `message_threads`, `intelligence_subscribers` | 5 | — | Referenced |
| Insurance / Safety / Wellness | `insurance_claims`, `insurance_policies`, `safety_incidents`, `safety_scores`, `mood_entries`, `financial_wellness`, `voice_checkins`, `leave_requests`, `onboarding_checklists` | 9 | — | Referenced |
| Test / Scenario engine | `test_scenarios`, `test_scenario_runs` | 2 | — | Used by test-scenario.service.ts (regulatory-rule testing infrastructure, NOT case scenarios — confirmed Session 1) |
| Misc / Cross-cutting | `geo_data`, `translation_cache`, `report_schedules`, `deployments`, `google_integrations`, `fine_predictions`, `fraud_alerts`, `churn_predictions`, `trust_scores`, `white_label_agencies`, `shifts`, `hours_log` | 12 | — | Mostly referenced; `obsidian_exports`, `translation_cache`, `white_label_agencies` are lightly referenced (1 file each — Tier-2 candidates for cleanup if confirmed unused) |

**Cluster-level findings:**
- **Heavy concentration in Immigration/Legal Cases cluster** (~30+ tables, deepest ALTER history). This is consistent with the build's North Star focus.
- **No true orphans found in sample.** All sampled tables (including unusual names: `obsidian_exports`, `translation_cache`, `white_label_agencies`, `fine_predictions`, `kg_edges`, `kg_nodes`) have at least 1 non-init-db reference.
- **Lightest-reference tables** (1 non-init-db file each): `obsidian_exports`, `translation_cache`, `white_label_agencies`. These are stabilization-eligible candidates — verify they're actually used or deprecate cleanly. Not gating Layer 3.

## D2-5 — Index audit

- Total `CREATE INDEX IF NOT EXISTS`: **203**
- Total `CREATE INDEX` (any form): 205 (2 without IF NOT EXISTS guard — minor pattern deviation)
- **Duplicate index NAMES (each declared twice):**
  - `idx_workers_tenant`
  - `idx_crm_companies_tenant`
  - `idx_immigration_permits_worker`
  - `idx_site_coordinators_tenant`

These duplicates are no-ops at runtime (the `IF NOT EXISTS` guard prevents the second creation), but they're code-smells in the file — likely caused by ALTER blocks that re-declare an index that was originally declared in a different cluster. **Tier-2 stabilization-eligible.** Not blocking for Layer 3.

- Cross-reference of indexed columns vs table columns: spot-check (10 indexes on `workers`, `legal_cases`, `crm_companies`) shows all indexed columns exist on their target tables. No indexes on non-existent columns surfaced in this audit. Full enumeration would require deeper line-by-line walk; deferred to a Tier-2 stabilization pass if needed.

## D2-6 — Whole-codebase orphan check

Sample of 6 unusual table names and their non-init-db reference counts:

| Table | Non-init-db references | Status |
|---|---|---|
| `obsidian_exports` | 1 | Lightly used (likely 1 service for export) |
| `translation_cache` | 1 | Lightly used |
| `white_label_agencies` | 1 | Lightly used (whitelabel feature surface) |
| `fine_predictions` | 2 | Referenced (predictive analytics) |
| `kg_edges` | 2 | **Real knowledge graph — see CROSS-DIMENSION recharacterization below** |
| `kg_nodes` | 4 | **Real knowledge graph** — referenced by `services/knowledge-graph.service.ts`, `services/case-notebook.service.ts`, `services/vault-search.service.ts`, `routes/health.ts`, `routes/knowledge-graph.ts` |

**No true orphans (zero references) found in this sample.** All sampled tables are used somewhere. The lightly-used ones (1 non-init-db file each) are stabilization-eligible — verify the single caller is the canonical use, not stale.

## D2-7 — Forward-build capture (Layer 3 implications)

While schema context is fresh, capturing what Layer 3 (scenarios engine) build will need:

**Schema work options:**
1. **Inline approach:** Add `stage5_alternatives JSONB` column to existing `legal_briefs` table. Each row's `stage5_alternatives` JSONB array would hold 3-5 candidate paths per `MASTER_PLAN.md` line 89 spec. Lowest-cost option; matches existing pipeline shape; one ALTER TABLE addition.
2. **Separate-table approach:** Add a new `case_scenarios` table with FK to `legal_cases.id`, columns: `id, case_id, tenant_id, scenario_index INTEGER, legal_basis, merit_argument, prerequisites JSONB, time_forecast_band, earnings_forecast_band, cost_forecast_band, viability_score NUMERIC, is_good_faith_appeal BOOLEAN, scenario_metadata JSONB, created_at, updated_at`. Higher-cost option; better for long-running scenario evolution (lawyer modifies one of N scenarios over time without rewriting brief); enables per-scenario evidence tagging via FK to `legal_evidence.scenario_id` if added.

The MASTER_PLAN line 89 wording ("a new stage in the legal_briefs pipeline") leans toward Option 1 (inline). But the LAYER_0_DESIGN.md proposed `alternative_pathways_proposed JSONB` as a column on a Layer 0 refusals table — also leaning inline-style. Either approach is consistent with documented architecture.

**Existing tables that would extend for Layer 3:**
- `legal_briefs` — add `stage5_alternatives_json` JSONB OR add separate scenario rows referenced by FK
- `legal_evidence` — optionally add `applicable_scenarios INTEGER[]` or `scenario_ids UUID[]` to tag evidence to multiple scenarios (per LAYER_0_TESTABILITY T7-T9)
- `case_generated_docs` — optionally add `scenario_id UUID NULL` to support per-scenario doc variants
- `authority_response_packs` — optionally add `scenario_id` FK if response packs become per-scenario

**Existing tables that already have suitable structure:**
- `case_notebook_entries.metadata JSONB` + `entry_type CHECK` enum can hold per-scenario `ai_insight` entries with structured metadata. Schema-wise no addition needed; convention-wise needs documented usage pattern.
- `kg_nodes` + `kg_edges` (real graph — see recharacterization) can hold pathway nodes with edge_type='SIMILAR_TO' connecting case scenarios across cases for pattern-based scenario suggestion. Already exists; needs Layer 3 invocation logic.

**Estimated build complexity:** Medium (substrate exists, sequencing documented, work well-specified, naming reconciliation pre-flagged in Session 1 Build-sequencing findings).

## CROSS-DIMENSION RECHARACTERIZATION — Sub-test B finding update needed

Sub-test B (Session 1) verdict was: *"knowledge_nodes is flat node table, no edges, LightRAG is nominal naming."* This was based on inspection of `routes/ai-copilot.ts` only.

**Dimension 2 cluster walk surfaces a missed second knowledge graph:**

There are **TWO distinct knowledge-graph table sets**:

1. **`knowledge_nodes` (line 2201)** — flat node table used by `routes/ai-copilot.ts`. 7-column schema (id, tenant_id, entity_type, entity_id, entity_name, content, metadata, created_at). No edges. **This is what Session 1 Sub-test B documented.**

2. **`kg_nodes` (line 2494) + `kg_edges` (line 2505)** — REAL knowledge graph:
   - `kg_nodes`: 6-column schema with `node_type CHECK ('WORKER','DOCUMENT','LEGAL_STATUTE','DECISION','URZAD','EMPLOYER','CASE')` and JSONB properties
   - `kg_edges`: edge table with `source_id UUID REFERENCES kg_nodes(id)`, `target_id UUID REFERENCES kg_nodes(id)`, `edge_type CHECK ('HAS','TRIGGERS','BASED_ON','FILED_AT','RESULTED_IN','APPLIES_TO','SIMILAR_TO','EMPLOYS')`, weight NUMERIC, properties JSONB, UNIQUE constraint on (tenant_id, source_id, target_id, edge_type)
   - Used by **`services/knowledge-graph.service.ts` (280 lines)** with KGNode + KGEdge typed interfaces, INSERT/SELECT/UPDATE patterns, "find similar cases" PatternMatch logic, "Auto-populated on case status changes", "Cross-tenant anonymized pattern search for SaaS advantage"
   - Also referenced by `services/case-notebook.service.ts` (169 lines), `services/vault-search.service.ts` (190 lines), `routes/health.ts`, `routes/knowledge-graph.ts`

**Sub-test B's verdict that "knowledge graph is flat / LightRAG is nominal" was incomplete.** The flat `knowledge_nodes` is one surface (the ai-copilot.ts AI Copilot UI's `/api/ai/index` endpoint). The REAL graph (`kg_nodes` + `kg_edges`) is a separate, fully-implemented service used by case lifecycle, vault search, and health endpoints.

**Implications for Sub-test B and the North Star verdict:**
- Layer 3 cost reassessment: the kg_nodes+kg_edges layer provides a **native pattern-similarity substrate** that Layer 3's scenarios engine can leverage to find "similar cases" — relevant for `MASTER_PLAN.md` line 89's reference to "calibrated numerical values grounded in firm's actual historical case data." This is **further cost-reducing** for Layer 3, not just cost-neutral.
- The "knowledge graph" UI claim in `AiCopilot.tsx:39` ("6 sub-agents + knowledge graph") is **less overstated than Sub-test B reported** — there IS a real graph; the AI Copilot's `/api/ai/index` endpoint just happens to use the flat `knowledge_nodes` table not the kg_* graph. UI label is technically accurate, just wired to the wrong substrate inside the AI Copilot route.
- Sub-test B's verdict (🟡 PARTIAL with directional alignment — phase-appropriate) does NOT change. Recharacterization is informational; the architectural pattern (Pattern Y) and Layer 3 sequencing are unchanged.

**Recommendation:** Update DIMENSION_3.md Sub-test B section with this recharacterization. Requires Manish + chat-Claude confirmation per Session 2 prompt's CROSS-DIMENSION RECHARACTERIZATION rule. Awaiting confirmation before applying any update to DIMENSION_3.md.

---

## Verdict

🟡 **VERIFIED with directional alignment — phase-appropriate, stabilization-eligible**

The schema is **truthful and consistent.** Session 1 numbers verify exactly (3,715 lines / 150 tables / 185 ALTERs / 203 indexes). No orphan tables surfaced in sampling. No critical drift. The 6 catch blocks have an audit-known silent-failure-on-DDL pattern with consistent console.warn fallback — standard defensive idempotency, manageable risk class.

Two minor stabilization-eligible items (Tier-2 candidates):
1. Wire init-db.ts catch blocks to structured logging (pino/Sentry) so silent vector-column-skip failures surface as alerts, not just stdout warnings.
2. Resolve the 4 duplicate-index-name declarations in init-db.ts (no-op at runtime due to IF NOT EXISTS guards, but code-smell).

One CROSS-DIMENSION recharacterization surfaced: Sub-test B's "knowledge graph is flat" verdict is incomplete — kg_nodes + kg_edges + knowledge-graph.service.ts (280 lines) implement a real graph used by case-notebook + vault-search + health services. Layer 3 cost is **further reducing**, not just cost-neutral. Awaiting Manish + chat-Claude confirmation before updating DIMENSION_3.md Sub-test B.

The schema substrate is **sound for the documented architecture** and **Layer-3-ready** to the extent Pattern Y's Layer 3 needs (vector retrieval, observability, knowledge graph for similar-case patterns). Phase-appropriate per documented sequencing; stabilization-eligible items are non-blocking.

---

## Audit metadata

- File: `BUILD_INTEGRITY_AUDIT_DIMENSION_2.md`
- NOT committed in Session 2 — working draft until full audit synthesis
- Hard boundaries respected: read-only repo, no commits, no DML/DDL, no DB connections, no migration runner invocation
