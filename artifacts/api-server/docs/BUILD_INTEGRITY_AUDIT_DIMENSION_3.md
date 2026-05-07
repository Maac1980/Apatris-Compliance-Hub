# BUILD INTEGRITY AUDIT — Dimension 3: Multi-Scenario AI Architecture (THE NORTH STAR TEST)

**Audit date:** 2026-05-01
**Session:** 1 of 5 (Dimensions 0 + 3)
**Status (working):** 🟡 Sub-test A complete; B/C/D pending

This document is the read-only record of Dimension 3 findings. NOT committed in Session 1. Working draft until full audit synthesis.

---

## Sub-test A — 6 Sub-agents check

### Verdict: 🟡 **PARTIAL with directional alignment — phase-appropriate**

The 6 sub-agents the prompt expected (Compliance, Payroll, Immigration, Workforce, Legal, Finance) **exist by exact name but in non-canonical form**: they are entries in a keyword-dispatch object inside a single route file, NOT discrete `XxxAgent.ts` class/module files. **This is the correct shape under Pattern Y (thin agents, thick pipeline orchestrator) per Sub-test C's architectural pattern decision.** Agents are scoped data providers; reasoning lives at the orchestration layer (Claude synthesis + future Layer 3 pipeline stage). Current state is phase-appropriate per the documented 5-layer architecture, not drift.

### Reality-vs-plan mismatch (escalation format)

- **EXPECTED (per prompt):** 6 sub-agents named Compliance/Payroll/Immigration/Workforce/Legal/Finance, possibly as `XxxAgent` classes/files in an `agents/` directory.
- **FOUND (in actual repo):** 6 agents matching exact names BUT defined as keyword-dispatch entries inside a single 175-line route file at `artifacts/api-server/src/routes/ai-copilot.ts`. No discrete files. No `agents/` directory. No `subAgent` / `sub_agent` references anywhere except `AiCopilot.tsx` UI copy.
- **REASONABLE INTERPRETATION:** The intent (6-agent decomposition, exact names) is realized. The form (dispatch table object vs class-based agents) is non-canonical. The agents exist but they are **data routers, not reasoning agents** — each runs ONE SQL query against its domain table; no multi-step reasoning, no scenario branching.
- **RECOMMENDATION:** Classify as "partial" rather than "built" because they don't perform agent-style multi-step reasoning. The distinction matters for the North Star test: data-fetching dispatch ≠ scenario-aware reasoning.
- **AWAITING confirmation** before proceeding to Sub-test B.

### Detailed findings

**Primary search (D3A-1):** Zero `*Agent.ts` files anywhere. Zero `agents/` directories. Zero `subAgent` / `sub_agent` references.

**Fallback search (D3A-1-FALLBACK):** Surfaced agent-purposed files (compliance.ts, payroll.ts, immigration.ts, etc.) but none are agents. Workforce-named files: zero. Finance-named files: zero. Notification: only `notification.service.ts` (notifier service, not agent).

**Discovery via UI surface:** `artifacts/apatris-dashboard/src/pages/AiCopilot.tsx:39` reads:
> "6 sub-agents + knowledge graph — ask anything about your workforce"

This UI claim led to the backend at `artifacts/api-server/src/routes/ai-copilot.ts`.

### The actual 6-agent implementation

`artifacts/api-server/src/routes/ai-copilot.ts:9-67` defines:

```ts
const AGENTS: Record<string, { name: string; keywords: string[]; queryFn: ... }> = {
  compliance: { name: "Compliance Agent", keywords: ["permit", "expir", "trc", "compliance", "bhp", "medical", ...], queryFn: ... },
  payroll:    { name: "Payroll Agent",    keywords: ["salary", "payroll", "zus", "tax", "pay", "rate", ...],     queryFn: ... },
  immigration:{ name: "Immigration Agent",keywords: ["immigra", "visa", "work permit", "trc", "a1", ...],         queryFn: ... },
  workforce:  { name: "Workforce Agent",  keywords: ["worker", "available", "bench", "match", "skill", ...],      queryFn: ... },
  legal:      { name: "Legal Agent",      keywords: ["law", "legal", "regulation", "kodeks", "gdpr", ...],        queryFn: ... },
  finance:    { name: "Finance Agent",    keywords: ["revenue", "margin", "invoice", "profit", "cost", ...],      queryFn: ... },
};
```

The 6 names match exactly. The structure is:
1. User query arrives at `POST /api/ai/query`
2. `routeQuery(q)` keyword-matches the question against each agent's keywords array → returns matched agent IDs (default: `["workforce", "compliance"]` if nothing matches)
3. Matched agents run their `queryFn` in **parallel** (`Promise.all`)
4. Each `queryFn` is a **single SQL query** + light formatting:
   - compliance → `SELECT ... FROM immigration_permits WHERE status='active' LIMIT 10`
   - payroll → `fetchAllWorkers()` + reduce gross totals
   - immigration → `SELECT title, content FROM legal_knowledge WHERE category IN ('TRC','Work Permit',...) LIMIT 5`
   - workforce → `fetchAllWorkers()` + `SELECT COUNT(*) FROM bench_entries`
   - legal → `SELECT ... FROM legal_knowledge ORDER BY category LIMIT 10` then keyword filter
   - finance → `SELECT COUNT/SUM FROM invoices` + `SELECT AVG margin_pct FROM margin_analysis`
5. Results are synthesized by Claude Sonnet 4.6 (`anthropic.messages.create`) with a generic "Synthesise the agent results below" system prompt
6. Returns `{ answer, agentsUsed: string[], responseTimeMs }`
7. Logs to `agent_queries` table

### Per-agent classification

| Agent | Classification | Reason | Form |
|---|---|---|---|
| **Compliance** | 🟡 partial | Single SQL lookup; no multi-step reasoning; no scenario logic | Dispatch entry in object literal |
| **Payroll** | 🟡 partial | Aggregation reduce; one calculation; static | Dispatch entry |
| **Immigration** | 🟡 partial | KB lookup with category filter; no synthesis | Dispatch entry |
| **Workforce** | 🟡 partial | Worker count + bench + sites distribution; single batch | Dispatch entry |
| **Legal** | 🟡 partial | KB keyword filter; no scenario reasoning | Dispatch entry |
| **Finance** | 🟡 partial | Two aggregation queries; no forward-looking analysis | Dispatch entry |

**Classification rule applied:** "partial" because the intent and naming are correct, but the agents are **data fetchers** not **reasoning agents**. None branch by scenario. None hold state between queries. None do multi-step planning. None invoke another agent. The synthesis happens in a single Claude call AFTER all agents return — Claude gets concatenated SQL results and writes prose.

### Invocation pattern (D3A-3)

**Caller:** the AI Copilot dashboard page `artifacts/apatris-dashboard/src/pages/AiCopilot.tsx`. Routed at the dashboard's `/ai-copilot` (or equivalent) per `App.tsx`.

**Mounted:** `routes/index.ts` mounts `routes/ai-copilot.ts` at `/api`. Endpoints: `POST /api/ai/query`, `GET /api/ai/queries`, `POST /api/ai/index`, `GET /api/ai/status`.

**The agents are NOT invoked as part of case processing.** They are accessible only through the AI Copilot UI (a separate dashboard page) — there is no code path that processes a `legal_cases` record by dispatching to these agents. This matters for the North Star test: case work is the use case the agents were designed for, but the agents are wired to a generic Q&A surface, not to case processing.

### Knowledge graph indexing

`POST /api/ai/index` re-builds the knowledge graph: deletes all `knowledge_nodes` for the tenant, then re-indexes:
- All workers (`SELECT * FROM workers` → INSERT into knowledge_nodes with `entity_type='worker'`)
- All permits (`SELECT * FROM immigration_permits`)
- All clients (`SELECT * FROM crm_companies`)

This is a flat-table indexing, NOT a graph (no edges, no relationships). The "knowledge graph" UI label refers to this flat node table. This will be probed in Sub-test B (LightRAG).

### Documentation cross-reference (D3A-4)

| Doc | What it says about sub-agents | Match with code? |
|---|---|---|
| `CLAUDE.md` line 469-477 (PHASE 2 section) | Lists **4 sub-agents**: Compliance, Payroll, Immigration, **Notification**. Forward-looking "ENTERPRISE ARCHITECTURE" section. | **Mismatch.** Code has 6 different agents (Compliance, Payroll, Immigration, **Workforce, Legal, Finance**) — Notification is not in the code's agent set; Workforce/Legal/Finance are. |
| `MASTER_PLAN.md` | Zero references to Compliance/Payroll/Immigration/Workforce/Legal/Finance sub-agents. Only mentions "build agent" (chat-Claude / APATRIS Claude execution pattern). | **Silent.** Sub-agents not part of the constitutional plan. |
| `MASTER_BLUEPRINT.md` | Zero references to sub-agents (regex `\\bagent\\b` returns 0 matches). | **Silent.** |
| `AiCopilot.tsx:39` UI text | "6 sub-agents + knowledge graph — ask anything about your workforce" | **Match.** UI agrees with code. Most accurate doc surface. |

**Drift summary:**
- Code says 6 agents (compliance, payroll, immigration, workforce, legal, finance)
- CLAUDE.md says 4 different agents (compliance, payroll, immigration, notification) under PHASE 2 forward-looking
- MASTER_PLAN.md and MASTER_BLUEPRINT.md silent on agents
- UI says 6 sub-agents (matches code)

### What this means for the North Star test

The 6 sub-agents are **technically present, functionally limited.** They satisfy the surface claim ("we have 6 agents") but they are not the agentic-reasoning architecture the North Star anticipates. None of these data fetchers:
- Holds case context across multiple turns
- Branches by scenario (e.g., "if marriage occurs during appeal period, ...")
- Builds pathway hypotheses (e.g., "Pathway A: continue current TRC track. Pathway B: start spousal TRC track. Pathway C: pivot to humanitarian protection.")
- Invokes other agents recursively
- Maintains a working memory across questions

For multi-scenario AI for legal case work, "6 sub-agents in parallel returning concatenated SQL results to Claude for synthesis" is the wrong architectural shape. Claude is doing the reasoning; the agents are data sources.

This is **not a North Star failure on its own** — it depends what Sub-tests B (LightRAG), C (case scaffolding for scenarios), and D (end-to-end trace) reveal. If LightRAG provides the multi-scenario reasoning AND the case schema supports multiple pathway hypotheses AND the lawyer surface presents scenarios as choices, then the AI Copilot's flat-dispatch agents may just be the wrong UI surface (a generic Q&A page) and the multi-scenario logic lives elsewhere.

If Sub-tests B, C, D show the same flat single-answer pattern, that's a North Star drift signal.

---

## Sub-test B — LightRAG knowledge graph status

(Pending GATE A confirmation before execution)

---

## Sub-test C — Case scaffolding for scenarios

(Pending)

---

## Sub-test D — End-to-end trace test

(Pending — most critical sub-test)

---

## Sub-test C — Case scaffolding for scenarios

### Verdict: 🟡 **PARTIAL with directional alignment — phase-appropriate**

The schema does NOT support holding multiple scenarios per case today. **This is deliberate, not drift.** Multi-scenario substrate is deliberately deferred to Layer 3 per the documented 5-layer architecture. Current state is mid-build per deliberate sequencing; the schema is consistent with Pattern Y's roadmap; remediation = forward-build of Layer 3 after prerequisites (Layer 0 v1, gated on EU AI Act counsel review) land, NOT corruption-correction. Multi-scenario substrate is documented in MASTER_PLAN.md as **Layer 3: Scenarios Engine** — a future stage of the planned 5-layer architecture (Layer 0 → Layer 1 → Layer 2 → Layer 3 → Layer 4). Layer 3 is gated on Layer 0 v1, which is gated on EU AI Act counsel review per `EU_AI_ACT_ARTICLE_6_RESEARCH.md`.

### Detailed schema findings

**D3C-1 — `legal_cases` (line 2397):** Single state machine. Columns:
- `case_type CHECK ('TRC','APPEAL','PR','CITIZENSHIP')` — single enumeration, one of four
- `status CHECK ('NEW','PENDING','REJECTED','APPROVED')` — single state machine, four states
- `appeal_deadline`, `next_action`, `notes` — single track
- ALTER additions (lines 2415-2485): trc_case_id, mos_status, mos_submission_date, mos_receipt_url, login_gov_pl_verified, e_signature_method, pr_eligible, blocker_type, blocker_reason, stage_entered_at, sla_deadline, voivodeship, mos_fee_pln, mos_employer_sig_status — all single-track operational state

**No scenario columns. No pathway_options. No alternative_scenarios. No life_change_triggers. No pivot_state. No branch_state.**

**D3C-2 — `legal_evidence` (line 2382):** `source_type CHECK ('UPO','MOS','TRC_FILING','IMMIGRATION_RECEIPT')` — single source-type enumeration. No `scenario_id`, no `applicable_scenarios`, no `pathway_id`. Evidence ties to worker_id but cannot be tagged to multiple scenarios.

**D3C-3 — `case_generated_docs` (line 2671):** `case_id`, `doc_type`, `stage_trigger`, `content_pl/content_en`, `status` (single), `legal_basis TEXT[]`, `ai_confidence`. **No `scenario_id`, no `version_for_scenario`, no `pathway_variant`.** Each doc is one doc; there's no schema pattern for "this doc applies under Scenario A but not Scenario B."

**D3C-4 — `legal_briefs` (line 3183):** A 4-stage AI processing pipeline:
- `stage1_research_json` (research)
- `stage2_review_json` (review)
- `stage3_validation_json` (validation)
- `stage4_pressure_json` (pressure-test)
- `final_brief_json` (synthesized output)
- `overall_confidence`, `is_valid`, `requires_review`, `pipeline_halted_at`, `pipeline_halt_reason`, `rejection_text`

**This is a temporal pipeline, NOT scenario branches.** No `argument_for_scenario`, no `scenario_pivot_logic`. Each brief flows through 4 stages and produces ONE final brief, not 3-5 scenario candidates.

**D3C-5 — `authority_response_packs` (line 2700):** `legal_conclusion` (single), `legal_basis` (single), `risk_level` (single), `response_text_pl/en/uk`, `evidence_links_json`, `citation_refs_json`, `worker_facts_json`. **No `trigger_scenario`, no `response_for_scenario`, no `pathway_id`.** Single conclusion, single basis, single response.

**D3C-6 — Cross-table scenario substrate:**
- Whole-`init-db.ts` grep for `scenario|pathway|branch|pivot` returns 4 hits, all in `test_scenarios` and `test_scenario_runs` tables (line 3438, 3446) — **regulatory testing infrastructure, NOT case scenario substrate**
- Whole-codebase grep for `generateScenarios | predictPathways | lifeChange | pivotPathway | scenarioTrigger | case_pathway | caseScenario` → **0 matches** across all `.ts` / `.tsx` files
- **Confirmed: zero multi-scenario substrate exists in code today**

**D3C-7 — Closest existing patterns that COULD support scenarios (with retrofit):**
- `case_notebook_entries` (line 2520): flexible event log with `entry_type CHECK ('auto','manual','document','status_change','alert','ai_insight')` and `metadata JSONB`. Could theoretically hold scenario hypotheses as `ai_insight` entries with structured JSONB metadata `{scenario_id, pathway_type, trigger_event}`. No schema enforcement and no convention for this; whether actually used this way is a query-the-data question (deferred to Sub-test D).
- `legal_briefs.stage4_pressure_json`: pressure-test stage is the closest brief-pipeline stage to multi-pathway argumentation by name. Whether it actually produces multiple pathway arguments or single-track pressure analysis is unknown without service-layer inspection (deferred to Sub-test D).

### The substrate question — answered

**Q: Does the schema support multi-scenario reasoning today?**
A: **NO.** Definitive. Zero multi-scenario substrate. Single-track schemas across legal_cases, legal_evidence, case_generated_docs, legal_briefs, authority_response_packs. case_notebook_entries is theoretically retrofittable but neither schema-enforced nor demonstrably used for scenarios.

**Q: Is this drift or deliberate?**
A: **Deliberate.** The 5-layer architecture documented in `MASTER_PLAN.md` and `LAYER_0_DESIGN.md` explicitly sequences:
- Layer 0: Legal comprehension foundation (gated on EU AI Act counsel review)
- Layer 1: case_reference writes
- Layer 2: Evidence chain at send-time
- **Layer 3: Scenarios engine — a NEW stage in the legal_briefs pipeline (`stage5_alternatives`) that generates 3-5 candidate paths per case**
- Layer 4: Consent loop

`MASTER_PLAN.md` line 89: *"Layer 3: Scenarios engine. The new stage in the legal_briefs pipeline that generates three to five candidate paths per case, each carrying mandatory legal basis citation, mandatory merit argument text, prerequisites, time forecast, earnings forecast, cost forecast, net benefit, viability score, and good-faith-appeal flag."*

`MASTER_PLAN.md` line 97: *"Without Layer 0, the writes (Layer 1) record fluent fiction. The evidence chain (Layer 2) preserves fiction. The scenarios engine (Layer 3) generates fiction with citations. The consent loop (Layer 4) records consent to fiction."*

`LAYER_0_DESIGN.md` line 294 proposes a column `alternative_pathways_proposed JSONB` for the future Layer 0 refusals table — this is the only place "alternative pathways" appears as a schema proposal, and it's in **planned future Layer 0 work**, not current schema.

`LAYER_0_TESTABILITY.md` (T7-T9, T17 etc.) contains comprehension tests explicitly for multi-pathway reasoning (Family-TRC pathway, Annex A pathway, Sponsor pivot, combined pathways). These tests are the **specification** for what Layer 0 + Layer 3 must demonstrate — NOT what the current build does. The Calder/Vijay sponsor-pivot scenario (T9 line 125) is exactly the North Star test case.

**Q: Which architectural pattern is being targeted?**
A: **Pattern Y (thin agents, thick orchestrator/pipeline).** Strong evidence:
- `legal_briefs` already structured as a multi-stage pipeline (stage1_research → stage2_review → stage3_validation → stage4_pressure → final_brief). MASTER_PLAN line 89 names Layer 3 as "**a new stage in the legal_briefs pipeline**" — explicitly extending the pipeline pattern.
- The 6 sub-agents (Sub-test A) are scoped data providers, not reasoning agents — consistent with Pattern Y.
- Claude does the synthesis at the orchestrator/pipeline level (per ai-copilot.ts line 91-104).
- Layer 3's design (legal basis, merit argument, prerequisites, forecast bands, viability score, good-faith-appeal flag) is a structured **output schema** for the pipeline stage, not a per-agent capability.

The current architecture is consistent: thin domain providers (the 6 sub-agents in ai-copilot.ts) + multi-stage pipeline orchestrator (legal_briefs) + Claude synthesis. Layer 3 extends this with a 5th pipeline stage producing scenario arrays.

This means: Sub-test A's "🟡 partial because agents are data fetchers not reasoning agents" was **not a North Star failure** — it was the correct shape under Pattern Y. The reasoning was always meant to live in the pipeline / Claude orchestration layer, not in the agents.

### Architectural decision input for GATE C

**Recommendation for Manish + chat-Claude:**

The architectural pattern being targeted is **Pattern Y (thin agents, thick pipeline orchestrator)**, evidenced by:
- legal_briefs 4-stage pipeline structure (already built)
- MASTER_PLAN's Layer 3 explicitly described as "a new stage in the legal_briefs pipeline"
- 6 sub-agents shaped as data providers (Sub-test A finding)
- Claude positioned as synthesis layer at orchestration level

**The substrate gap is the missing Layer 3 stage**, not a pattern mismatch. Sub-test A's "data routers, not reasoning agents" is the correct shape for Pattern Y. The reasoning will live in `stage5_alternatives` of the legal_briefs pipeline once Layer 3 is built.

**This means:**
- Pattern Y is the correct architectural target.
- Sub-test A's finding is recharacterized: agents are correctly scoped data providers; the reasoning gap is in the orchestrator/pipeline layer (Layer 3, not yet built).
- Sub-test B (LightRAG) becomes informational rather than gating: even if LightRAG is wired, the multi-scenario reasoning won't manifest without Layer 3.
- Sub-test D will likely show: end-to-end trace produces single-answer output today because Layer 3 doesn't exist; substrate is single-track because the architecture sequences scenarios after legal-comprehension foundation.

### CLAUDE.md PHASE 2 sub-agent list — Tier-2 documentation alignment to deliberate architecture

CLAUDE.md PHASE 2 (line 469-477) lists 4 sub-agents: Compliance, Payroll, Immigration, **Notification**. Code + Track 0 docs (MASTER_PLAN.md, LAYER_0_DESIGN.md, LAYER_0_TESTABILITY.md) describe Pattern Y with 6 agents: Compliance, Payroll, Immigration, **Workforce, Legal, Finance**.

**Reframe:** The architecture clarified through Track 0 documentation (most of which landed Days 44-49 per Dimension 0 timeline). CLAUDE.md PHASE 2 wasn't updated to match. This is **documentation-update lag**, not deliberate divergence. The Track 0 + code alignment is the deliberate architecture; CLAUDE.md is the lagging artifact.

**Tier-2 remediation:** Update CLAUDE.md PHASE 2 to match Track 0 + code (the 6 case-reasoning-domain agents that actually shipped). Operational tooling (Notification, etc.) belongs elsewhere — likely the existing notification.service.ts mention or Track 1 operational documentation. Does not block this audit.

---

## Sub-test B — LightRAG knowledge graph status

### Verdict: 🟡 **PARTIAL with directional alignment — phase-appropriate** — knowledge_nodes table present but flat; LightRAG is nominal naming, not implemented; pgvector retrieval is the actual substrate

### Detailed findings

**D3B-1 — `knowledge_nodes` table:** ✅ Present at `init-db.ts:2201`. Comment at line 2199 explicitly says `// knowledge_nodes (LightRAG)`. Schema:
```sql
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_name TEXT,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Critical observation:** node-only schema. **No `knowledge_edges` table, no `relationships` table, no `entity_links` table.** This is structurally NOT a graph — it's a flat node table labeled "LightRAG" by comment.

**D3B-2 — `agent_queries` table:** ✅ Present at `init-db.ts:2217`. Logs every AI Copilot query:
```sql
CREATE TABLE IF NOT EXISTS agent_queries (
  id UUID, tenant_id UUID, user_id TEXT, query TEXT NOT NULL,
  agents_used JSONB DEFAULT '[]', results JSONB DEFAULT '{}',
  final_answer TEXT, response_time_ms INTEGER DEFAULT 0, created_at TIMESTAMPTZ
);
```

**D3B-3 — LightRAG MCP / config:**
- `.mcp.json` has 7 MCP servers configured: postgres, github, fetch, context7, playwright, memory, sentry. **No `lightrag` MCP server.**
- Whole-codebase grep for `lightrag | LightRAG | light_rag` → **1 hit only**, in `init-db.ts:2199` comment. Zero references in any `.ts` / `.tsx` production code.
- LightRAG is **NOT installed, NOT configured, NOT a dependency, NOT invoked**.

**D3B-4 — AI Copilot dashboard page:** ✅ Present. Mounted at `/ai-copilot` route via lazy import (`App.tsx:35` + `App.tsx:214-215` ProtectedRoute). UI surface advertises "6 sub-agents + knowledge graph" (Sub-test A finding).

**D3B-5 — Runtime invocation of LightRAG:**
- Whole-codebase grep for `lightrag.query | LightRAG.query | lightrag_query | MCP.*lightrag` → **0 matches**.
- `knowledge_nodes` IS referenced at runtime — but only by `routes/ai-copilot.ts` (POST `/api/ai/index` re-builds the flat table; GET `/api/ai/status` counts nodes by type).
- The "knowledge graph" UI label refers to flat node indexing of (workers, permits, clients), NOT a graph with edges and traversal.

**D3B-6 — pgvector retrieval substrate (orthogonal finding):**

While LightRAG is absent, `init-db.ts` (lines 3640-3712 and earlier) DOES define real semantic retrieval substrate via pgvector:
- `legal_knowledge.embedding vector(1024)` + HNSW index
- `rejection_analyses.embedding vector(1024)` + HNSW index
- `case_generated_docs.embedding vector(1024)` + HNSW index
- `workers.profile_embedding vector(1024)` + HNSW index

**This is the real retrieval layer.** It's pgvector + HNSW, not LightRAG, but it provides semantic retrieval over legal articles, prior rejections, generated docs, and worker profiles. The Sub-phase 1G-2 commits in Dimension 0's inflection scan (Day 41-42, `43ab0c2 feat(rag): vector RAG infrastructure`, `6ced45d feat(rag): retrieval library`) confirm this was the deliberate retrieval substrate.

### Documentation alignment

The `MASTER_PLAN.md` and `LAYER_0_DESIGN.md` describe Layer 3 as a pipeline stage that draws on prior cases and verified articles — the architectural shape for retrieval is **vector-based with calibration from historical case data**, not graph-based. LightRAG was a label that didn't translate into installed software; pgvector is what actually shipped.

### Layer 3 Implications subsection (per Refinement 2)

**LightRAG status as Layer 3 cost driver:**

| Aspect | Current state | Layer 3 cost implication |
|---|---|---|
| Knowledge graph entities | Flat node table (workers, permits, clients indexed) | **Cost reducer for Layer 3 entity awareness** — Layer 3 can inherit existing flat-node entity indexing for "what entities are involved in this case?" lookups. |
| Knowledge graph edges (relationships) | **Absent** | **Cost-neutral for Layer 3** — Pattern Y's Layer 3 doesn't actually need a graph structure; it needs ranked retrieval of relevant prior cases / articles / pathways. pgvector handles this. The "knowledge graph" UI label is aspirational; Layer 3 design (per `MASTER_PLAN.md` line 89) doesn't depend on it. |
| LightRAG runtime | **Not installed, not configured, not invoked** | **Cost-neutral for Layer 3** — Layer 3 doesn't list LightRAG as a dependency. The Layer 3 spec calls for "the firm's actual historical case data" calibration which is a structured-data extraction problem, not a graph problem. |
| pgvector retrieval substrate | **Built (Days 41-42 sub-phase 1G-2 commits)** | **Cost reducer for Layer 3** — Layer 3 can leverage existing vector embeddings + HNSW indexes on legal_knowledge, rejection_analyses, case_generated_docs, workers. The retrieval layer the scenarios engine needs is already there. |
| `agent_queries` observability | **Built** — logs every AI Copilot query with agents_used + results + final_answer + response_time_ms | **Cost reducer for Layer 3** — observability infrastructure already in place. Layer 3's calibration (forecast bands → calibrated numerical values per `MASTER_PLAN.md` line 89) can leverage agent_queries as one observability source. |
| Knowledge graph UI claim drift | "6 sub-agents + knowledge graph" UI label vs flat node table reality | **Cosmetic only** — does not affect Layer 3 cost. Tier-2 doc-correction item: either build edges (more work) OR rename UI to match reality ("AI Copilot with knowledge index"). The scenarios engine doesn't depend on this. |

**Layer 3 net cost impact:** **Cost-neutral to slightly cost-reducing.** The retrieval substrate Layer 3 actually needs (pgvector + HNSW + agent_queries observability) is already built. The "LightRAG" label is nominal — its absence doesn't block Layer 3.

**The real Layer 3 cost drivers are NOT LightRAG-related:**
1. Layer 0 v1 prerequisite (gated on EU AI Act counsel review — biggest external dependency)
2. Layer 1 case_reference writes (per `CHECK_LAYER1_CASE_REFERENCE.md`'s 7 product decisions)
3. Layer 2 evidence chain at send-time
4. Then Layer 3 stage5_alternatives spec implementation — backend pipeline stage + structured output schema + lawyer-review UI surface
5. Calibration corpus extraction from firm's historical case data (multi-month parallel project per `MASTER_PLAN.md` line 211)

LightRAG status does not appear in any of these cost drivers. The Sub-test B finding is informationally clarifying (knowledge graph UI claim is ahead of build) but not gating for Layer 3.

### Reality-vs-plan mismatches (Sub-test B)

- **EXPECTED:** LightRAG configured as MCP server; knowledge graph wired into runtime
- **FOUND:** LightRAG not installed, not configured, not invoked; knowledge_nodes is a flat node table labeled "LightRAG" by comment only; the real retrieval substrate is pgvector + HNSW indexes
- **REASONABLE INTERPRETATION:** The "knowledge graph" label was UI/UX naming ahead of build; the actual retrieval architecture is vector-based, which aligns with Pattern Y and Layer 3's spec. Drift is cosmetic, not structural.
- **RECOMMENDATION:** Verdict is 🟡 partial with directional alignment, phase-appropriate. Knowledge_nodes + agent_queries tables are useful infrastructure for Layer 3; LightRAG label correction is a Tier-2 documentation/UI item. NOT a blocker for the North Star.

### Sub-test B summary

| Dimension | Finding |
|---|---|
| `knowledge_nodes` table | ✅ Present, flat (no edges), wired to ai-copilot.ts |
| `agent_queries` table | ✅ Present, observability captured |
| LightRAG MCP server | ❌ Absent (not in `.mcp.json`; not in any code) |
| LightRAG runtime invocation | ❌ Absent (zero `lightrag.query` references) |
| AI Copilot dashboard page | ✅ Present at `/ai-copilot`, lazy-loaded |
| pgvector retrieval substrate (orthogonal) | ✅ Built (Days 41-42 sub-phase 1G-2 commits, HNSW indexes on 4 tables) |
| "Knowledge graph" UI claim | 🟡 Overstated — flat node table labeled as graph; real graph would need edges |

**Layer 3 implication:** Cost-neutral. Layer 3's actual retrieval needs (pgvector + HNSW + observability) are already in place. LightRAG absence is not a blocker.

### INFORMATIONAL UPDATE (from Session 2 Dimension 2 schema walk)

Session 1 Sub-test B inspected `routes/ai-copilot.ts` only and characterized the knowledge graph substrate as "flat node table; LightRAG is nominal naming." Session 2 Dimension 2's cluster walk surfaced a missed second knowledge-graph layer.

Two distinct knowledge-graph table sets exist:

1. **`knowledge_nodes` (flat)** — used only by `routes/ai-copilot.ts`. This is what Sub-test B documented.

2. **`kg_nodes` + `kg_edges` (REAL graph)** — used by `services/knowledge-graph.service.ts` (280 lines), `services/case-notebook.service.ts`, `services/vault-search.service.ts`, `routes/health.ts`, `routes/knowledge-graph.ts`. Has typed `NodeType` enum (WORKER/DOCUMENT/LEGAL_STATUTE/DECISION/URZAD/EMPLOYER/CASE), `EdgeType` enum (HAS/TRIGGERS/BASED_ON/FILED_AT/RESULTED_IN/APPLIES_TO/SIMILAR_TO/EMPLOYS), edge weight, JSONB properties, UNIQUE constraint, INSERT/SELECT/UPDATE patterns, PatternMatch find-similar-cases logic, auto-population on case status changes.

Verdict on Sub-test B does NOT change (🟡 PARTIAL with directional alignment, phase-appropriate). Architectural pattern (Pattern Y) unchanged. Layer 3 sequencing unchanged.

Recharacterization is informational/quality, not verdict-altering. The "knowledge graph" UI claim is technically accurate — there IS a real graph. The wiring inside `routes/ai-copilot.ts` queries the wrong substrate (flat `knowledge_nodes` instead of `kg_*`).

---

## Sub-test D — End-to-End Trace Test (the North Star functional verdict)

### Verdict: 🟡 **PARTIAL with directional alignment — phase-appropriate**

The end-to-end pipeline produces **single-answer output today**, not multi-scenario output. **This is consistent with the architectural sequencing — Layer 3 (the scenarios engine) is the documented future stage that produces multi-pathway output, and it has not yet been built.** The substrate is in place; the connecting logic for multi-scenario reasoning is the deliberately-deferred Layer 3 work.

### Trace findings

**D3D-1 — Find a dummy case for tracing:**
- Cannot run live `SELECT` — no DB credentials configured in this audit session and the prompt's hard boundary forbids production DB connection.
- Repo-only inspection: `seed-modules.ts` exists; the audit's mentioned "Monica Barahona Varon" appears in test fixtures (`document-schemas.test.ts`, `document-intake.service.test.ts`, `document-intelligence.service.test.ts`, `smart-document.service.ts`).
- **Gap noted:** Sub-test D could not exercise the pipeline against a real seeded case. Findings derive from code/route/UI inspection, not runtime trace.

**D3D-2 — Trace step 1 — Case retrieval:**
- Route: `routes/legal-cases.ts` exposes 6 endpoints: `GET /v1/legal/cases` (list), `GET /v1/legal/cases/queue` (urgency), `GET /v1/legal/cases/pipeline` (counts), `GET /v1/legal/cases/deployability/:workerId`, `GET /v1/legal/cases/:workerId` (per-worker), `POST /v1/legal/cases` (create), `PATCH /v1/legal/cases/:id` (status).
- Service: `services/legal-case.service.ts` (337 lines) implements an **8-stage state machine** for case lifecycle: `NEW → DOCS_PENDING → READY_TO_FILE → FILED → UNDER_REVIEW → DEFECT_NOTICE → DECISION_RECEIVED → APPROVED/REJECTED`. Hard/soft blocker classification.
- Retrieval loads case + status + blocker + stage_entered_at; **does NOT load multiple scenario branches** because no scenario substrate exists per Sub-test C.

**D3D-3 — Trace step 2 — AI extraction (case context):**
- `legal-brief-pipeline.service.ts` line 160: `const caseData = buildCaseData(worker, snapshot, legalCase, latestRejection, rejectionText);` — builds a structured case data string that flows into the pipeline.
- The extraction loads ONE worker, ONE legal case, ONE rejection, ONE rejectionText. Single-track context, no scenario fork.

**D3D-4 — Trace step 3 — Multi-scenario prediction (MOST CRITICAL):**

The legal_briefs pipeline is actually **6 stages** (correcting Sub-test C's 4-stage report — only 4 stages have dedicated DB columns; stages 5 and 6 are in-memory and persist to `final_brief_json`):

| Stage | Function | Output type | Multi-scenario? |
|---|---|---|---|
| 1 | Legal Research (Perplexity + Claude) | `Stage1Result` — applicable articles, procedural notes, common patterns | **No** — single article set, single research direction |
| 2 | Case Review (Claude) | `Stage2Result` — caseSummary, likelyIssue, articleApplication, **appealGrounds** (string array), missingEvidence, nextSteps, lawyerReviewDraft, **appealOutlineDraft** | **No** — `appealGrounds` are arguments for THE existing appeal, not alternative pathways. Single appeal direction. |
| 3 | Validation (Claude) | `Stage3Result` — isValid, issues, riskLevel, requiresReview, notes | **No** — validates stages 1+2 against fabrication; binary pass/fail |
| 4 | Pressure Check | `Stage4Result` — pressureLevel, deadlineRisk, immediateActions, delayImpact, daysUntilDeadline | **No** — single deadline analysis |
| 5 | **Worker Explanation** (NOT scenarios engine) | `Stage5Result` — greeting, whatHappened, whyItWasNegative, whatWeAreDoing, whatYouNeedToDo, timeline, reassurance, contactInfo, **toneCalibration** ("REASSURING"/"CALM"/"MODERATE"/"CAREFUL"/"NEUTRAL") | **No** — layman-language explanation in worker's preferred language; single explanation |
| 6 | English Translation | `Stage6Result` — englishAppealText, translationNotes, structuralChanges, alignedWithPolish | **No** — single translation |

**The current Stage 5 is worker-facing explanation**, NOT the scenarios engine. The MASTER_PLAN.md line 89 spec for Layer 3 (`stage5_alternatives` producing 3-5 candidate paths) does NOT yet exist in the code. **The naming "stage5" in current code conflicts with the planned "stage5_alternatives" — when Layer 3 is built, it will likely insert at a different stage number (e.g., stage 7, or insert between stage 4 and current stage 5 with renumbering).**

**No stage in the current pipeline produces multiple pathways. No stage produces "marriage to Polish/EU citizen", "promotion enabling stronger employer documentation", "family arrival opening reunification path", "job change to larger sponsor".** The pipeline analyzes ONE direction (the existing case), not multiple alternatives.

**D3D-5 — Trace step 4 — Lawyer review surface:**
- `pages/LegalBrief.tsx` (473 lines). Header comment: "Legal Brief — 4-stage AI legal intelligence pipeline UI" (also stale; pipeline is 6 stages).
- Single brief per workerId, single rejectionText input.
- Stage-by-stage display (`activeStage` state).
- **Zero "scenario" / "pathway" / "alternative" / "option" references in UI.** Lawyer sees ONE brief output, not multiple scenario candidates with options to choose from.
- This UI surface is what would be replaced/extended when Layer 3 lands — currently shows single AI recommendation.

**D3D-6 — Trace step 5 — Pivot scaffolding:**
- Whole-codebase grep for `pivotPathway | switchBasis | case.pivot | alternative.path | sponsor.pivot` → **0 matches.**
- No code path handles "if scenario X occurs, update case to pathway Y" (e.g., if marriage to Polish citizen happens, switch from work-TRC to family-TRC — which is exactly LAYER_0_TESTABILITY.md test T7's specification).
- Cases evolve through the 8-stage state machine via `PATCH /v1/legal/cases/:id` status transitions, NOT through scenario pivots. The state machine is single-track.

**D3D-7 — Synthesis:**

Per-step status:
| Step | Status | Notes |
|---|---|---|
| Case retrieval | 🟡 single-track | 8-stage state machine; no scenario branches |
| AI extraction | 🟡 single-track | One case, one rejection, one direction |
| Multi-scenario prediction | 🔴 absent | 6-stage pipeline; none produces multiple pathways |
| Lawyer review surface | 🟡 single-track | One brief shown; UI not designed for multi-scenario choice |
| Pivot scaffolding | 🔴 absent | No pivot logic; state machine only |

**Where does the flow exist?** The pipeline architecture exists (Pattern Y) and runs end-to-end producing a complete legal brief.

**Where does it break for the North Star?** The break is at the **prediction stage** — none of the 6 pipeline stages produces 3-5 candidate paths with the structure MASTER_PLAN.md line 89 specifies (legal basis, merit argument, prerequisites, forecasts, viability score, good-faith-appeal flag). The Stage 2 `appealGrounds` is the closest analog — but it's arguments for the existing appeal, not alternative case pathways.

**D3D-9 — Life-change pathway test (the North Star's literal language):**

Given a `legal_cases` record at REJECTED status (appeal stage), does the system surface multiple distinct life-change pathways via any path on any surface?

| Pathway type | Surfaced today? |
|---|---|
| Marriage to Polish/EU citizen → switch from work-TRC to family-TRC (Foreigners Act Art. 158-159, per LAYER_0_TESTABILITY T7) | **No** — no code path proposes this |
| Promotion enabling stronger employer documentation → strengthen current appeal | **No** — no code path proposes this |
| Family arrival opening reunification pathway | **No** — no code path proposes this |
| Job change to larger sponsor → fresh application via Annex A (per LAYER_0_TESTABILITY T9 Calder/Vijay scenario) | **No** — no code path proposes this |

**Three-outcome verdict (per Refinement 4):**

✅ Match: **"NO, BUT THE SUBSTRATE EXISTS"** — North Star is partially built; missing the connecting Layer 3 logic.

But more precisely: **the substrate is in place AND Layer 3 is documented as the deliberately-deferred next layer.** Framing this as "drifted — reconnect existing pieces" understates the situation; the Layer 3 connector was never built. Framing it as "missing — build the layer that was skipped" is closer but still incomplete because the layer wasn't skipped, it was **explicitly sequenced after Layer 0 v1 + Layers 1-2**.

**Most accurate framing: "NOT YET BUILT — phase-appropriate per documented sequencing."** The Layer 3 scenarios engine is on the roadmap (`MASTER_PLAN.md` line 89), gated on Layer 0 v1, which is gated on EU AI Act counsel review (per `EU_AI_ACT_ARTICLE_6_RESEARCH.md` and the engagement-ready `COUNSEL_HANDOFF_PACKET.md` v1.0 at commit `27ff161`).

**D3D-10 — agent_queries table inspection (per Refinement 5):**
- Cannot run live `SELECT` against staging/dummy DB — no DB credentials configured in this audit session; flyctl ssh not invoked per hard-boundary discipline.
- Repo-only finding: `agent_queries` schema is at `init-db.ts:2217` (Sub-test B finding); insertion happens at `routes/ai-copilot.ts:111-113` after every `/api/ai/query`. Logged columns: `tenant_id, user_id, query, agents_used, results, final_answer, response_time_ms, created_at`.
- **Gap noted:** observability data exists but cannot be inspected from repo alone. If `agent_queries` is empty or near-empty in staging, that's itself a signal — the AI Copilot has not been used in anger; the audit is testing capability that was never exercised.
- Recommend follow-up: run `SELECT COUNT(*) FROM agent_queries; SELECT * FROM agent_queries ORDER BY created_at DESC LIMIT 20;` against staging via flyctl ssh + psql in a separate operational pass. **Not blocking for this audit's verdict.**

### Reality-vs-plan mismatches (Sub-test D)

- **EXPECTED:** End-to-end trace will produce multi-scenario output if the architecture is aligned
- **FOUND:** End-to-end trace produces single-answer output today; multi-scenario stage (Layer 3) is documented as planned but unbuilt
- **REASONABLE INTERPRETATION:** This is **phase-appropriate** per the documented 5-layer sequencing. Layer 0 v1 must land first (gated on EU AI Act counsel review). Layers 1-2 follow. Layer 3 (scenarios engine) is the 4th of 5 layers. The current code is mid-build at Layer 0 prerequisite stage; downstream layers including Layer 3 are deliberate forward work, not drift.
- **RECOMMENDATION:** **YELLOW with directional alignment, phase-appropriate.** Architecture is aligned with North Star. Substrate is in place. Single-answer current state is expected at this build phase. Remediation path = forward-build of Layer 3 after prerequisites land, NOT corruption-correction.
- **Surprising findings warranting Manish + chat-Claude review:** None contradicting the Pattern Y architectural decision from GATE C. Sub-test D's finding is consistent with the expected outcome named at GATE C.

### Sub-test D summary

| Aspect | Finding |
|---|---|
| Pipeline architecture | Pattern Y, 6-stage pipeline (research → case review → validation → pressure → worker explanation → English translation) |
| Stage that produces multi-scenario output | **None today** — the documented Layer 3 (`stage5_alternatives` per MASTER_PLAN line 89) is unbuilt |
| Naming collision risk | Current code already uses Stage 5 for worker explanation; Layer 3 will need different stage number when built |
| Lawyer review UI | Single-brief surface, no scenario-choice UI |
| Pivot scaffolding | Absent (state machine only) |
| Life-change pathways | None of 4 North Star pathway types (marriage, promotion, family arrival, job change) surface today |
| Substrate existence | Yes (Pattern Y pipeline + pgvector retrieval + legal_briefs + case schema) |
| Verdict | 🟡 PARTIAL with directional alignment — phase-appropriate. Architecture aligned; Layer 3 deliberately deferred |
| `agent_queries` observability | Cannot inspect without DB access; gap noted for follow-up operational pass |

---

## Session 1 Synthesis

| Dimension | Sub-test | Verdict | Severity |
|---|---|---|---|
| 0 | Timeline | ✅ Verified | Informational |
| 3 | A — 6 sub-agents | 🟡 PARTIAL with directional alignment — phase-appropriate | Phase-appropriate |
| 3 | B — LightRAG | 🟡 PARTIAL with directional alignment — phase-appropriate | Cosmetic UI label drift; cost-neutral for Layer 3 |
| 3 | C — Schema scenario substrate | 🟡 PARTIAL with directional alignment — phase-appropriate | Deliberate deferral to Layer 3 |
| 3 | D — End-to-end trace | 🟡 PARTIAL with directional alignment — phase-appropriate | **NORTH STAR VERDICT: aligned, deferred to Layer 3** |

**The North Star is preserved.** Architecture (Pattern Y + 6-stage pipeline + pgvector retrieval + 6-agent data providers) is consistent with multi-scenario AI for legal case work. The current single-answer reality is expected at this build phase. Remediation path = forward-build of Layer 3 after Layer 0 v1 lands (gated on EU AI Act counsel review). NOT a corruption-correction situation.

### Tier-2 follow-ups identified (non-blocking)

> **Renumbering note (updated Session 2):** Stage 5 collision was relocated from Tier-2 #4 to **Build-sequencing findings** during Session 1 close integrations. Item formerly #2 (AI Copilot wiring / "Knowledge graph" UI claim correction) was relocated to **Build-sequencing findings** during Session 2 GATE 2 cross-dimension recharacterization, as it spans both today's wiring and Layer 3 build planning. Items renumbered accordingly. Future references to Tier-2 numbers should reference the post-relocation numbering below.

1. CLAUDE.md PHASE 2 sub-agent list update (lagging documentation; Track 0 + code alignment to deliberate architecture)
2. `LegalBrief.tsx` UI header comment update ("4-stage" → "6-stage")
3. **`agent_queries` observability pass — DEFERRED to future operational pass after staging reactivation** (revised at operational pass GATE-OP-1 from Sunday 2026-05-03 timing; staging Fly app `apatris-api-staging` was suspended; production DB excluded by hard boundary; no read-only target available). Original Session 2 close framing (data feeds roadmap, three-outcome classification) preserved for the future pass. Folded into Tier-2 #7 staging reactivation precondition.

4. **`dist/` gitignore hygiene** (per Session 3 close Element 5). Compiled artifact `dist/public/assets/purify.es-CovBOfck.js` shows as `D` (deleted) in `git status` at session start, indicating built dashboard assets have been previously tracked OR are tracked-and-being-deleted. The `dist/` tree in the api-server build is committed in places (`artifacts/api-server/dist/` referenced by `node artifacts/api-server/dist/index.cjs` per CLAUDE.md), but compiled frontend bundles with content-hashed filenames (`purify.es-CovBOfck.js`) should not be tracked — they regenerate on every Vite build with new hashes, producing churn. Tier-2 stabilization candidate: audit each `dist/` directory's `.gitignore` posture; track build artifacts deliberately needed for runtime (api-server `dist/index.cjs`) and ignore pure frontend compile output (dashboard / workforce-app `dist/public/assets/*`). Not blocking; not a build-correctness issue; orderly hygiene cleanup before Layer 3 build adds further compile artifacts.

5. **Systemic structured-logging upgrade via Pino-Sentry transport** (operational pass GATE-OP-2 Element 3 / item (f)). Addresses 5 silent-failure sites in one fix: `pool.on("error")` callback (`lib/db.ts:25-27`), legal-case fan-out catches (`legal-case.service.ts:260-282`), `init-db.ts` catch blocks (lines 2332/3625/3646/3669/3692/3711), cron handler swallows (escalation engine + regulatory scan), Sentry init silent catch (`/* Sentry is optional */` in `index.ts:7-15`). Single architectural fix, 5-site impact, addresses both vocal-fail-with-logger (errors logged to stdout but invisible to Sentry) and silent-fail-no-logger (errors swallowed with no logger anywhere) observability categories from operational pass GATE-OP-1 item (c)-3. Pattern: `logger.error({err, ...}, "[Service] non-blocking failure")` inside catches + Pino-Sentry transport for upstream alerting.

6. **`SENTRY_AUTH_TOKEN` runtime-vs-build scope investigation** (operational pass item (f)). `SENTRY_AUTH_TOKEN` is present in the running Fly machine env (per item (f) machine env check) but typically a build-time-only secret used for source-map uploads to Sentry. Verify whether the token is needed at runtime by the deployed `@sentry/node` SDK; if not, remove from runtime Fly secrets and scope to CI/build env only. Secret-minimization hygiene; not blocking.

7. **Staging environment reactivation** (operational pass Hygiene-1). `apatris-api-staging` Fly app was suspended (per Session 3 D7-4); operational pass items (a) `agent_queries` observability and (b) `kg_*` auto-population health both deferred to a future pass after staging reactivation. **Pattern:** operational hygiene deferred long enough that audit work itself is now blocked. Reactivation is precondition for the deferred items AND for safe Layer 3 build-time experimentation against representative-but-non-prod data. Operational hygiene work, not architectural; schedule as capacity allows.

### Build-sequencing findings (visibility for forward-build coordination)

These findings need to be visible when Layer 3 build begins, NOT buried in Tier-2 documentation-cleanup batches. Surfaced separately so they appear clearly at Layer 3 build start (post Layer 0 v1, post counsel review).

1. **Pipeline naming reconciliation (Stage 5 collision).** When Layer 3 lands, `MASTER_PLAN.md` line 89's `stage5_alternatives` spec collides with current code's `Stage5Result` (worker-facing explanation; greeting + whatHappened + toneCalibration). Naming convention must be decided BEFORE Layer 3 build starts to avoid late discovery during mid-pipeline modification — an expensive moment to decide naming. Likely resolutions: (a) renumber current Stage 5 + 6 to 6 + 7 and insert Layer 3 at Stage 5; (b) keep current numbering and call Layer 3 `stage7_alternatives`; (c) other. Decision is forward-build coordination input, not architectural drift.

2. **Knowledge graph substrate wiring decision (TODAY + Layer 3).** `kg_nodes`+`kg_edges` contains the real graph substrate (typed nodes/edges, similarity logic, auto-population on case status changes). `knowledge_nodes` is flat. Two timeframe-linked issues:

   **TODAY:** AI Copilot endpoint (`/api/ai/index` in `routes/ai-copilot.ts`) wires to flat `knowledge_nodes` substrate, not `kg_*`. Users hitting AI Copilot expecting graph-quality results get flat-table output. Real gap, not just doc drift.

   **LAYER 3 BUILD START:** Layer 3 (scenarios engine) needs to query the right substrate. Decision required on (a) which substrate Layer 3 queries, (b) whether substrates should be reconciled or remain split, (c) whether AI Copilot rewiring happens as Tier-2 fix or as part of Layer 3 build.

   These decisions are linked: solving today's wiring without considering Layer 3 risks rework. Solving Layer 3 without addressing today's wiring leaves a gap. Recommend resolving as one decision when Layer 3 build planning begins, with optional earlier intervention if AI Copilot accuracy becomes urgent.

3. **`kg_*` densification strategy.** Decision required when Layer 3 build begins on which write triggers to add (document-intake, brief-generation, others) to densify the graph for similarity quality. What gets stored in `kg_*` shapes what Layer 3 queries return; adding triggers shapes graph topology. Layer 3 similarity logic depends on what's there. Coordinate with Build-sequencing finding #2 (knowledge graph substrate wiring) — these are linked decisions.

4. **Voyage embedding service wiring (Layer 3 dependency).** Voyage embedding code (`lib/rag.ts`, `lib/embeddings.ts`) is committed as "library only, no service wired" per commits `43ab0c2` + `6ced45d`. `APATRIS_VOYAGE_API_KEY` Fly secret is intentionally absent at this build phase. Decision required when Layer 3 build begins on (a) when to wire the service, (b) whether Voyage is the final embedding vendor or interim, (c) coordination with kg_* densification strategy (Build-sequencing finding #3) since both inform Layer 3 retrieval architecture. Recharacterized from Production fixes pending per Session 3 Dimension 1 D1-PRIORITY-B finding (deliberate phased rollout, not drift).

(Future audit dimensions may add entries to this category.)

### Layer 3 Forward-Build Path (captured at Session 1 close)

Layer 3 (scenarios engine) build path, documented while Session 1 investigation inputs are fresh:

- **Schema work:** `stage5_alternatives JSONB` on `legal_briefs` OR separate scenario table (decision pending)
- **Pipeline modification:** insert at appropriate stage; resolve Stage 5 naming collision (see Build-Sequencing Findings)
- **Substrate dependency:** cost-REDUCING (revised from cost-neutral per Session 2 Dimension 2 cluster walk finding). `kg_nodes`+`kg_edges` substrate exists with typed nodes/edges, similarity logic, and PatternMatch find-similar-cases capability. Pattern-similarity substrate directly maps to `MASTER_PLAN.md` line 89's "calibrated numerical values grounded in firm's actual historical case data." DEPENDENCY: this cost-reducing assessment assumes `kg_*` auto-population on case status changes works as `services/knowledge-graph.service.ts` implies. Dimension 4 will verify whether write paths exercise this auto-population, or whether the substrate is rich but inert. If verification fails, cost assessment shifts back toward neutral or higher.
- **Prerequisite:** Layer 0 v1 lands (gated on EU AI Act counsel review per `EU_AI_ACT_ARTICLE_6_RESEARCH.md` and engagement-ready `COUNSEL_HANDOFF_PACKET.md` v1.0 at commit `27ff161`)
- **Estimated build complexity:** medium-low (pending Dimension 4 verification of `kg_*` auto-population). Substrate exists, sequencing documented, work well-specified.

This forward-roadmap value is captured at Session 1 close to inform Session 5 synthesis. Inputs were gathered during Sub-tests A, B, C, D investigation; documented here while context is current.

### Open meta-question for future audit sessions

Session 1 verified **internal consistency** (implementation matches documented architecture). It did NOT verify **external optimality** (architecture is the right architecture for the North Star).

The Track 0 documentation grounds architectural decisions in stated risks (`MASTER_PLAN.md` line 97), legal AI risk research (`EU_AI_ACT_ARTICLE_6_RESEARCH.md`), and EU AI Act compliance reasoning. The 5-layer sequencing has documented justification. Pattern Y (thin agents + thick orchestrator) has structural merits for auditability. The pipeline maps to lawyer workflow. The pgvector retrieval substrate matches legal use cases.

**These are defensible choices, not certain ones.** External optimality cannot be definitively tested without:
- Counsel review of architectural choices (gated on EU AI Act counsel engagement)
- Domain expertise in legal AI design (specialists exist beyond chat-Claude / APATRIS Claude)
- Real production usage data (not yet available; `agent_queries` needed)
- Comparison against other legal AI architectures (research not done)

This question belongs to **Session 4 (Dimensions 5 + 6 — build philosophy + documentation truthfulness)** and **Session 5 (Dimension 8 — synthesis)**. APATRIS Claude will not adjudicate external optimality; that judgment is Manish + chat-Claude territory after relevant inputs are available.

### Audit metadata

- Files written: `BUILD_INTEGRITY_AUDIT_DIMENSION_0.md`, `BUILD_INTEGRITY_AUDIT_DIMENSION_3.md`
- Both files NOT committed in Session 1 — working drafts until full audit synthesis (Session 5)
- DB-access limitation surfaced (D3D-1, D3D-10) — repo-only inspection used; live trace deferred to operational pass
- Hard boundaries respected throughout: read-only repo, no commits, no DML/DDL, no DB connections, no migration runner invocation, no installs, no deploys
