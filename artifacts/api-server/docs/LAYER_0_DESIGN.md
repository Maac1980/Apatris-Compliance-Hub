# LAYER 0: LEGAL COMPREHENSION FOUNDATION DESIGN

## Frame

Layer 0 is the prerequisite beneath Layers 1-4. Without Layer 0, the writes (Layer 1) record fluent fiction; the evidence chain (Layer 2) preserves fiction; the scenarios engine (Layer 3) generates fiction with citations; the consent loop (Layer 4) records consent to fiction.

Layer 0 is the AI's structural obligation to follow Polish law and to learn from it continuously. This document specifies how legal knowledge is represented, how comprehension is verified, how arguments are constructed in two-sided form, how source linkage is enforced, how learning happens continuously across three streams, and how the boundary between AI drafting and lawyer sending is structurally protected.

This document was produced from the SUGGEST proposal returned in chat on 2026-04-26 and refined with four explicit refinements: (1) every architectural surface tagged with its sub-phase (v1 or v2), (2) cost mitigation embedded for Stream A in-flight engagement, (3) cost mitigation embedded for post-edit verification, (4) EU AI Act Article 6 elevated from unknown unknown to a dedicated pre-build gate.

The principles operationalized here are codified in MASTER_PLAN.md NON-NEGOTIABLE PRINCIPLES section: Refusal to fabricate; Law as argument-construction; AI completes / lawyer edits and sends; Continuous learning across three streams; Lawyer as adversarial tester; Honest confidence calibration; Source linkage; Legitimacy by construction.

## Companion Documents

| Document | Path | Commit |
|---|---|---|
| Master plan | `artifacts/api-server/docs/MASTER_PLAN.md` | f1c0152 |
| Layer 0 testability | `artifacts/api-server/docs/LAYER_0_TESTABILITY.md` | (saved next) |
| CHECK questions for Layer 1 sub-phase 1 | `artifacts/api-server/docs/CHECK_LAYER1_CASE_REFERENCE.md` | ed0b31d |
| Original master blueprint | `artifacts/api-server/docs/MASTER_BLUEPRINT.md` | 902117a |
| Track 2 inventory | `artifacts/api-server/docs/TRACK2-INVENTORY.md` | 739f592 |

## Deep Search — what already exists

Survey of the codebase at HEAD (commit f1c0152) for existing capabilities that support a law-bound learning AI.

| Element | Status | Evidence |
|---|---|---|
| Knowledge base spine (vector + structured) | partial | [VERIFIED] `legal_knowledge` table with `embedding`, `category`, `effective_date`, `last_verified`, `content_hash` (12 prod rows on v295); pgvector 0.8.0 installed |
| Polish-law pattern recognition | partial | [VERIFIED] `rejection-intelligence.service.ts:117-121` matches `brak formalny`, `wezwanie do uzupełnienia`, `termin na uzupełnienie` |
| Article-level citation comprehension | partial | [VERIFIED] `case-doc-generator.service.ts:95-100` `DEFECT_NOTICE` template references `Art. 64 §2 KPA`, `Art. 108 Ustawy o cudzoziemcach`, `Art. 7 KPA`, with 14-day deadline |
| Multi-stage pipeline with halt-on-comprehension-failure | existing precedent | [VERIFIED] `legal-brief-pipeline.service.ts:256` halts at STAGE_3 with `pipeline_halt_reason` — the Monica case behavior is a real code pattern, not aspirational |
| Confidence scoring | partial | [VERIFIED] `legal_briefs.overall_confidence`, `requires_review` flag |
| Mode switching (running vs appeal) | scaffolded | [VERIFIED] `intelligence-router.service.ts` exists; not yet enforcing AI-behavior delta between modes |
| Vector retrieval | exists | [VERIFIED] `lib/rag.ts` has 4 retrieval functions (`retrieveSimilarRejections`, `retrieveRelevantArticles`, `retrieveAppealTemplates`, `retrieveSimilarWorkers`) |
| Decision explainability | scaffolded | [VERIFIED] `decision-explanations` route + service exist |
| Knowledge graph | scaffolded | [VERIFIED] `knowledge-graph` route exists |
| Two-sided argument structure | absent | [VERIFIED] grep `opposing_argument`, `two.sided`, `adversarial`, `refute` returns zero hits |
| Outcome attribution | absent | [VERIFIED] no schema for which paragraphs were AI vs lawyer-edited; no outcome -> draft mapping |
| Probe / adversarial-test tracking | absent | [VERIFIED] no schema for lawyer-marked test edits |
| `population_class` distinction | absent | [VERIFIED] no field on workers/clients distinguishing internal/Annex-A/external |
| Lawyer-authorship token (boundary enforcement) | absent | [VERIFIED] `case_generated_docs.sent_to`/`sent_at` exist but unconstrained — no token mechanism preventing AI-initiated send |
| Verification-pass-after-lawyer-edit | absent | [VERIFIED] no second-AI-pass infrastructure |
| Legal article versioning | absent | [VERIFIED] `legal_knowledge.effective_date` exists but no `superseded_by` / version chain |

The legal stack is closer to Layer 0 than the gaps suggest — but the gaps are the load-bearing ones.

## Architectural Specification

Each architectural surface below is tagged with its sub-phase per Refinement 1. The sub-phase split is consolidated in the next section (v1 vs v2 Split).

### A. Legal knowledge representation

**Sub-phase: v1**

[DECISION] Three-store hybrid:

1. **Structured spine — `legal_articles` table (new):**
   ```
   id UUID PK
   statute_code TEXT     -- 'KPA', 'USTAWA_CUDZOZIEMCY', 'PPSA', 'ROZPORZADZENIE_X'
   article_number TEXT   -- '64', '114', '108'
   paragraph TEXT        -- '§2', NULL for whole article
   section TEXT          -- subsection if relevant
   full_text TEXT NOT NULL
   language TEXT         -- 'pl' (canonical) / 'en' (translation)
   effective_from DATE NOT NULL
   effective_to DATE     -- NULL = currently in force
   superseded_by UUID    -- FK self-reference for version chain
   citation_form TEXT    -- canonical citation string, e.g. 'Art. 64 § 2 KPA'
   ```
   Versioning: when law changes, a new row is inserted with `effective_from = amendment_date`, the prior version's `effective_to` is set, and a `superseded_by` linkage is created. Old rows are retained for historical-case analysis (a brief written under 2024 law must still cite the 2024 version).

2. **Vector store — `legal_articles_chunks` (new):**
   `legal_articles.id` referenced; `chunk_text`, `embedding vector(1024)`, `chunk_index`. HNSW cosine index. Chunked because some articles are long; retrieval hits the chunk and lifts the parent article for full context.

3. **Relationship graph — `legal_article_edges` (new):**
   `from_article_id UUID, to_article_id UUID, relation TEXT` where relation in `'cites' | 'amends' | 'repeals' | 'implements' | 'interpreted_by'`. Court decisions and authoritative interpretations attach as `to_article` nodes pointing to interpreted articles.

[DECISION] `legal_knowledge` (existing, 12 rows) is preserved as a generic-prose layer (background, summaries, advisory notes). It is **not** the article-level spine. The new table is. Migration: existing `legal_knowledge` rows that contain article text get extracted into `legal_articles`; the rest stays where it is.

[ESTIMATE-medium] Initial article corpus to populate: ~80-150 articles spanning Foreigners Act work-related sections, KPA procedural articles (35, 37, 64, 73, 129), PPSA appeals chapter, key implementing regulations. This is the legal-knowledge-extraction parallel project the master plan flags; the content extraction itself is not in Layer 0 build scope.

### B. Comprehension verification

**Sub-phase: v1**

[DECISION] New table `comprehension_tests`:
```
id UUID PK
test_name TEXT NOT NULL UNIQUE
test_prompt TEXT NOT NULL          -- the question or scenario
expected_concepts TEXT[] NOT NULL  -- legal concepts the answer must touch
expected_articles TEXT[] NOT NULL  -- citation_form strings the answer must cite
pass_threshold REAL NOT NULL       -- 0.0-1.0, weighted concept+article coverage
principle_tested TEXT NOT NULL     -- which of P1-P8 this test exercises
created_at, updated_at
```

And `comprehension_test_runs`:
```
test_id, ai_model, prompt_version, run_at,
ai_response_text, concept_coverage REAL, article_coverage REAL,
score REAL, passed BOOLEAN, failure_reason TEXT
```

[DECISION] Tests run automatically in three triggers:
1. CI on any change to legal-related service files or prompts
2. On `legal_articles` updates (refresh confirms AI still answers correctly under new law)
3. Manually via dashboard "Run Layer 0 verification"

Failures block deploy via the standard pre-deploy gate.

[DECISION] Scoring uses an LLM-judge pattern: a separate Claude call evaluates "did response_text reference each expected_concept, citing each expected_article, with reasoning consistent with Polish law." Judge model differs from drafter to reduce shared-blind-spot risk.

### C. Argument construction (two-sided)

**Sub-phase: v2**

[DECISION] New schema on `legal_briefs` (or a child table `case_arguments`):
```
case_id, argument_id,
side TEXT CHECK (side IN ('our','opposing')),
position_text TEXT NOT NULL,
legal_basis_articles UUID[] NOT NULL  -- FK to legal_articles
strength_assessment TEXT CHECK (strength_assessment IN ('strong','medium','weak')),
strength_reasoning TEXT NOT NULL,     -- why this strength was assigned
counter_argument_id UUID              -- FK to the paired opposing/our argument
```

For every `our` argument, a paired `opposing` row must exist. Constraint: `our.counter_argument_id = opposing.id AND opposing.counter_argument_id = our.id`. The pipeline cannot finalize a case strategy without paired arguments.

[DECISION] Three-state output of argument generation:
- **Strong:** `our.strength = 'strong'`, `opposing.strength in ('weak','medium')` — proceed with confidence.
- **Weak:** `our.strength in ('weak','medium')`, `opposing.strength = 'strong'` — surface concerns, honest viability assessment, suggest alternatives.
- **None:** AI cannot generate `our.position_text` with non-null `legal_basis_articles` — refusal mode triggered (see surface I).

[DECISION] Legitimacy by construction is enforced at schema: `legal_basis_articles UUID[] NOT NULL` with array-length check `array_length(legal_basis_articles, 1) >= 1`. If the AI cannot cite at least one article, the row cannot be inserted — refusal happens at the insert boundary, not as a downstream filter.

### D. Source linkage enforcement

**Sub-phase: v1**

[DECISION] Four-layered enforcement:

1. **Schema:** `case_arguments.legal_basis_articles UUID[] NOT NULL`. `case_generated_docs.cited_articles UUID[] NOT NULL`. Every legal output row has a non-null array of FK references to `legal_articles`.

2. **Prompt:** AI prompts include the contract `Each claim must be followed by [art:<UUID>] inline. Claims without article references will be rejected by the validator and you will be asked to retry.` This is operationally familiar — the existing `INTAKE_PROMPT_V2` for B1 follows this pattern.

3. **Post-generation validator:** new service `lib/citation-validator.ts` (not yet existing) parses AI output for `[art:UUID]` markers, verifies each UUID resolves to an active `legal_articles` row, returns `{valid: bool, unmapped_uuids: [...], orphan_claims: [...]}`. Validator runs before the AI output is committed to the `case_arguments` / `case_generated_docs` row. Failed validation -> re-prompt or refusal.

4. **Drift detection:** scheduled job nightly compares `case_arguments.legal_basis_articles` against `legal_articles.effective_to`. If a cited article is now superseded for a still-open case, flag for lawyer review.

### E. Continuous learning architecture (three streams)

#### E.A — Stream A: in-flight engagement during lawyer editing

**Sub-phase: v2**

[DECISION] Real-time loop:
- Lawyer opens AI-drafted document in editor.
- Editor maintains a WebSocket (or SSE) to backend.
- On `paragraph_save` event, payload `{original_text, edited_text, paragraph_id, surrounding_context}` is sent to AI evaluation tool.
- AI evaluation returns `{verdict: 'strengthens'|'weakens'|'neutral', reasoning: text, citations: [art_uuid], confidence: 'high'|'medium'|'low'}`.
- Verdict surfaced in side panel.
- Lawyer can: accept verdict, override (with reason captured), ignore (no action).
- `engagement_events` table captures every exchange.

Cost mitigation in v2: Stream A in-flight engagement is opt-in per editing session, not always-on. The lawyer toggles 'AI watch mode' before starting an editing session. Default is off. When on, paragraph_save events are debounced with a minimum 30-second window between same-paragraph events. A manual 'ask AI to review' button is always available regardless of toggle state. This pushes Stream A from implicit always-on cost to explicit opt-in cost.

#### E.B — Stream B: outcome attribution after case closure

**Sub-phase: v2**

[DECISION] Outcome learning loop:
- Trigger: case status changes to `APPROVED`, `REJECTED`, or `DISMISSED`.
- Background job analyzes the final document: paragraph-level diff between AI original and lawyer final.
- Each paragraph is attributed: `'ai_unchanged' | 'lawyer_edited' | 'lawyer_added' | 'lawyer_deleted'`.
- Outcome record links: `(case_outcome, paragraph_attribution_summary, ai_confidence_at_draft, lawyer_overrides_count)`.
- Weekly aggregation feeds calibration: which AI-confidence levels correlate with positive outcomes? Which paragraph types (factual, legal, deadline) get edited most? Are edits substantive or stylistic?

[DECISION] Cross-layer dependency: Stream B requires Layer 1 writes to be firing first (so we have `lawyer_edited` data to attribute) and Layer 2 outbound communications schema (so we know what was actually sent). Stream B implementation is therefore late in v2.

#### E.C — Stream C: continuous legal knowledge refresh

**Sub-phase: v1 (manual) and v2 (automation)**

[DECISION] v1 manual-curation workflow:
- A curated RSS / monitor list of authoritative Polish sources is maintained: `sejm.gov.pl` (statutes), `dziennikustaw.gov.pl` (Dz.U. — published laws), `nsa.gov.pl` (court decisions), `udsc.gov.pl` (administrative practice).
- A legal expert reviews changes from the monitor list weekly.
- On confirmation, the legal expert manually triggers ingestion: insert a new `legal_articles` row, link to predecessor via `superseded_by`, re-vectorize, alert lawyers about open cases that cite the affected article.
- Audit trail captured in `legal_articles_ingestions` table.

[DECISION] v2 automation:
- Scrapers / API clients per source.
- Detect amendments via content-hash diffs.
- Legal-language NLP for amendment detection.
- Human-in-the-loop review remains mandatory before insertion (the human reviews machine-detected candidates rather than monitoring sources cold).
- Frequency: daily for high-traffic statutes, weekly for full sweep.

[ESTIMATE-low] v2 automation is the hardest single piece in Layer 0. Polish authoritative sources lack good APIs; scraping is fragile; legal-language NLP for amendment detection is non-trivial. v1 ships manual; v2 incrementally automates per-source as scrapers mature.

### F. In-flight engagement during editing (UI / tool surface)

**Sub-phase: v2**

[DECISION] Tool surface inside editor:
```typescript
tool: evaluateLawyerEdit
input: { paragraph_id, original_text, edited_text, case_context }
output: {
  verdict: 'strengthens' | 'weakens' | 'neutral',
  reasoning: string,
  cited_articles: string[],  // citation_form strings
  confidence: 'high' | 'medium' | 'low',
  alternative_suggestion?: string  // optional alternative if AI thinks edit weakens
}
```

[DECISION] UI: side panel shows AI verdict next to edited paragraph. Verdict badge (green/yellow/red). Click to expand reasoning. "Override" button captures the lawyer's reason for keeping the edit despite AI concern. Override events feed into the probe-correction queue (see surface H) if the override pattern reveals a Layer 0 gap.

[DECISION] Throttling: only fires on `paragraph_save` (debounced) or on explicit lawyer "ask AI" button. Avoids noise during active typing.

[DECISION] Honest confidence surfacing:
- `high` -> green badge, "AI has high confidence"
- `medium` -> yellow badge, "Concerns flagged, please review"
- `low` -> grey badge, "Trade-off worth considering"
- AI prompt explicitly trained on the contrast: false-high (obstruction), false-low (obsequiousness). Test prompts in surface B exercise this calibration.

### G. Symmetric error verification (post-edit AI re-read)

**Sub-phase: v2**

[DECISION] After lawyer marks "ready to send":
1. Document enters `verification_pending` state.
2. A different model (e.g., if Sonnet drafted, Opus reviews; or vice-versa; or a Gemini cross-check) reads the lawyer-finalized document.
3. Different prompt: explicitly adversarial — "Find unsupported claims, contradictions, missing citations, weak legal basis, factual errors. Do not approve. Find concerns."
4. Concerns surfaced to the lawyer with severity (`high`/`medium`/`low`).
5. Lawyer can: address each concern, override individual concerns (with reason), or override all (with reason).
6. Override decisions logged in `verification_overrides` table.
7. After overrides resolved, document promotes to `ready_to_send`.
8. Aggregate analytics: which concern categories get overridden most? Are some always overridden (suggesting the verification prompt is too aggressive)? Are some never overridden (suggesting they catch real errors)?

[DECISION] This is **not** a contradiction of "lawyer is the gate." The lawyer can override every concern. The system records the override. The verification surface adds friction proportional to risk — slow when the AI is concerned, frictionless when it is not.

Cost mitigation in v2: post-edit verification is mandatory by document type rather than universal. Mandatory verification for appeals, pressure letters (ponaglenia under KPA Art. 37), and the first substantive submission to authority (the wezwanie response under KPA Art. 64). Optional verification for cover letters and status updates. Skipped verification for routine email follow-ups, calendar invites, and internal Slack messages.

### H. Probe support (lawyer as adversarial tester)

**Sub-phase: v2**

[DECISION] UI: lawyer marks an edit as a probe via a flag. Probe payload:
```
probe_id UUID
case_id, lawyer_user_id, paragraph_id
expected_catch TEXT  -- "AI should reject this because it cites wrong article"
introduced_error_type TEXT  -- 'wrong_article' | 'wrong_basis' | 'removed_evidence' | 'misstated_deadline'
created_at
```

[DECISION] Workflow:
- Lawyer marks the probe before editing.
- Lawyer makes the deliberate wrong edit.
- Stream A fires normally (AI evaluates the edit).
- AI's verdict + reasoning are recorded.
- After lawyer review, scoring: did AI catch the error?
- `probe_results` table: `(probe_id, ai_verdict, ai_caught_error BOOLEAN, scoring_lawyer_user_id, scored_at)`.
- Failed probes (AI didn't catch) -> entered into `comprehension_tests` table as new test cases for future regression.
- Failed-probe pattern alerts: if 3+ probes in same category fail in a quarter, escalate to "Layer 0 correction sub-phase needed."

[DECISION] This makes production work the test set. Avoids the "tests pass but real cases fail" anti-pattern.

### I. Refusal mode

**Sub-phase: v1**

[DECISION] Refusal is a structured state, not silence:
```
case_state TEXT CHECK (case_state IN (
  'in_progress',
  'refused_no_argument',           -- no legal basis can be cited
  'refused_subtype_unknown',        -- Stage 2 wezwanie not yet received
  'refused_required_docs_missing', -- case unfilable today
  'refused_comprehension_gap',     -- AI flagged its own knowledge as insufficient
  'halted_for_lawyer_review',      -- Monica-pattern: AI can produce but won't ship
  'closed_positive', 'closed_negative', 'closed_dismissed'
))
```

[DECISION] Refusal record schema:
```
refusal_id, case_id, refusal_type, refused_at,
articles_checked UUID[],
alternative_pathways_proposed JSONB,
what_would_be_needed_to_proceed TEXT NOT NULL
```

The `what_would_be_needed_to_proceed` field is non-null. Refusal isn't a dead end — it's a structured request for inputs.

[VERIFIED] This pattern has precedent in the codebase: `legal-brief-pipeline.service.ts:256` halts at STAGE_3 with `pipeline_halt_reason`. The Monica case demonstrates correct behavior. Layer 0 generalizes this pattern across all argument-generating surfaces.

### J. Population-aware reasoning

**Sub-phase: v1 (schema field only) and v2 (full prompt parameterization)**

[DECISION] v1 schema field:
Add `population_class` to workers (and a parallel `clients` table for external clients):
```
population_class TEXT CHECK (population_class IN (
  'internal',          -- Apatris employee, Apatris-controlled chain
  'prospective_annex_a',  -- forward-looking commitment via Annex A
  'external_client'    -- self-arranged, lawyer is advisory
))
```

The field is captured at intake. Reporting and filtering use it from day one. Prompt logic does not yet branch on it in v1.

[DECISION] v2 prompt parameterization:
AI prompts include `[POPULATION_CONTEXT]` block:
- For `internal`: "Apatris controls accommodation, address-update chain, document collection. If a document is missing, flag for Apatris collection action."
- For `prospective_annex_a`: "Worker is committing to Apatris but currently elsewhere. Address tracking flips to Apatris control on transition date. Annex A is the binding instrument."
- For `external_client`: "Lawyer is advisory. Do not assume document control. Frame all action items as 'lawyer recommends client to do X'. Cannot assume timely document delivery."

Different scenarios engine outputs per population. An external client gets paths framed as "options for the client to choose"; an internal worker gets paths framed as "Apatris workflows to execute." Same legal mechanics, different agency.

### K. Boundary enforcement (lawyer-only-send)

**Sub-phase: v1**

[DECISION] Five-layered structural guarantee:

1. **Code path separation:** all send-capable code (email service, postal API, API-to-authority adapters) lives in `lib/outbound/`. AI service code is forbidden from importing from `lib/outbound/` — enforced via lint rule (`no-restricted-imports`) in CI.

2. **Token gate:** every send function requires a `lawyer_authorship_token` parameter (UUID). Functions without a valid token throw — no soft fallback.

3. **Token issuance:** tokens are generated only by a UI action (lawyer clicks "send" in editor). Generated server-side with: `(lawyer_user_id, document_id, action_type, expires_at_5_minutes_from_now, used: false)`. Single-use; on send the row is marked `used = true` and cannot be reused.

4. **Outbound communications schema (Layer 2 dependency):** `outbound_communications` table has `lawyer_user_id NOT NULL`, `lawyer_authorship_token UUID NOT NULL`, `sent_at NOT NULL`. Insert fails without all three.

5. **Audit lint:** scheduled job grep-audits the codebase for any send-shaped function call (e.g., `nodemailer.send`, `s3.send`, `fetch(...mail...)`) that does not have a `lawyer_authorship_token` in the call site. Findings block deploy.

[DECISION] This guarantees structurally — not by discipline — that the AI cannot send. The boundary is in the type system and the lint rules, not in the prompt.

[DECISION] Cross-layer dependency: K depends on the `outbound_communications` table that Layer 2 builds. v1 of K therefore ships the token gate, code path separation, token issuance, and audit lint, with the schema field being added to whatever outbound table exists at v1 time and migrated to the unified `outbound_communications` table when Layer 2 ships.

## v1 vs v2 Split

Consolidated view of which architectural surfaces ship in which sub-phase.

| Surface | v1 | v2 | Notes |
|---|---|---|---|
| A. Legal knowledge representation | ✓ | | Structured spine + chunks + relationships |
| B. Comprehension verification | ✓ | | Test table + LLM-judge scoring + CI gate |
| C. Two-sided argument construction | | ✓ | Paired schema, three-state generation |
| D. Source linkage enforcement | ✓ | | All four enforcement layers |
| E.A Stream A (in-flight engagement) | | ✓ | Opt-in per editing session, debounced |
| E.B Stream B (outcome attribution) | | ✓ | Depends on Layer 1+2 data |
| E.C Stream C (legal knowledge refresh) | ✓ manual | ✓ automation | v1 is manual curation; v2 incrementally automates |
| F. In-flight UI surface | | ✓ | Side panel, tool call, throttled |
| G. Post-edit verification | | ✓ | Mandatory by document type |
| H. Probe support | | ✓ | Lawyer-as-tester, failed probes -> tests |
| I. Refusal mode | ✓ | | Structured state + record |
| J. Population-aware reasoning | ✓ field | ✓ prompt | v1 captures the field; v2 branches on it |
| K. Boundary enforcement | ✓ | | All five layers, token gate from day one |

v1 commitment: A, B, D, E.C (manual), I, J (field), K. The v1 minimum that distinguishes "law-bound" from "not law-bound."

v2 expansion: C, E.A, E.B, E.C (automation), F, G, H, J (prompt). The v2 layer adds two-sided reasoning, continuous learning, and lawyer-in-the-loop testing.

## EU AI Act Pre-Build Gate

Before Layer 0 v1 build begins, an EU AI Act Article 6 conformity assessment must be completed. Polish-law-supporting AI in immigration is likely classified as high-risk. Specific architectural requirements may emerge from this assessment that revise this design.

**Status: pending.**

The assessment must answer six research questions:

1. Is APATRIS's AI legal-decision-support classified as high-risk under Article 6?

2. If yes, what specific conformity assessment requirements apply?

3. What architectural elements are required (logging, override traceability, human oversight UI, transparency)?

4. Are any v1 surfaces (B, D, I, K) insufficient for compliance?

5. What documentation must accompany the system at deployment?

6. What ongoing compliance monitoring is required?

This is a pre-build gate. v1 implementation cannot begin until the six answers are recorded and any architectural revisions are integrated into this design document.

The gate sits between SUGGEST approval and CHECK pass for the first Layer 0 sub-phase. If the conformity assessment surfaces architectural changes, this design is updated and the master plan's Layer 0 section is revised accordingly.

## Buffer and Rating

**Rating: 65/35.**

Operational commitment (65%): the v1 surfaces named above (A, B, D, E.C manual, I, J field, K) deliverable in approximately 6 weeks of focused work, against current codebase realities and the master plan's cost-cap escalation rule.

Buffer (35%): protects against:

- Stream C v1 manual curation workflow taking longer than expected because the legal expert review cadence is not yet established.
- Schema-level enforcement on `legal_basis_articles UUID[] NOT NULL` causing AI retry loops if the article corpus is not yet populated. Mitigation: ship the schema with deferred constraint enforcement (warning log) for the first two weeks while the article corpus is being populated, then flip to hard NOT NULL.
- Token-gate boundary enforcement (K) requiring CI lint rule changes that other teams may not anticipate. Mitigation: announce the lint rule one week before activation; provide a migration grace window.
- LLM-judge scoring (B) producing inconsistent verdicts during early calibration. Mitigation: human review of judge verdicts for the first 30 test runs; calibrate the judge prompt before the gate is activated.
- EU AI Act Article 6 assessment surfacing architectural changes that retroactively expand v1 scope.

Two-sided reasoning on the rating:

- Argument *for* 65/35: Layer 0 is foundational and must be done well; over-promising is worse than over-delivering. The buffer items above are real known-unknowns. A 35% buffer is genuinely needed.

- Argument *against* 65/35: it could be 75/25 if Stream C v1 is scoped explicitly to "legal expert reviews three sources weekly, no scraping infrastructure" and the EU AI Act assessment is moved fully outside Layer 0 v1 (run in parallel, results applied to v2). In that scope, the work becomes more predictable and the buffer can shrink. Current 65/35 reflects honest uncertainty about UI integration timing and the EU AI Act unknown unknown, not laziness on commitment.

What the buffer does not cover: the parallel Polish-law-content extraction work (~80-150 articles ingested into `legal_articles`). That is its own multi-month sub-phase, not Layer 0 itself.

## Survivability

A future engineer with no context should be able to:

1. **Read** `MASTER_PLAN.md`, `LAYER_0_DESIGN.md` (this document), `LAYER_0_TESTABILITY.md` — understand intent, principles, design without reading code.

2. **Read** schema migrations for `legal_articles`, `legal_articles_chunks`, `legal_article_edges`, `case_arguments`, `comprehension_tests`, `comprehension_test_runs`, `engagement_events`, `verification_overrides`, `probe_results`, and the `outbound_communications` schema fields (added to whatever outbound table exists at v1 ship) — understand the data model.

3. **Read** `lib/citation-validator.ts`, `lib/argument-pair-builder.ts`, `lib/refusal-record.ts` — understand the enforcement logic.

4. **Run** `pnpm test:layer-0` — execute the comprehension test suite without setup beyond DB connection.

5. **Read** `lib/outbound/README.md` — understand the boundary enforcement rules and the lint rule that protects them.

[DECISION] All five must be true at v1 ship. If any fails, the build hasn't met the survivability principle.

## Argue-Against

The strongest case that this design is wrong, premature, or over-scoped:

1. **It's over-scoped for v1.** Three streams of continuous learning + two-sided arguments + three populations + post-edit verification + probe support is a lot to ship simultaneously. The v1 vs v2 split mitigates this — but even v1 (A, B, D, E.C manual, I, J field, K) is six weeks of focused work, and that estimate may be optimistic for a build pace that has not yet shipped Layer 0-class infrastructure.

2. **Schema-level enforcement may be brittle.** `legal_basis_articles UUID[] NOT NULL` with `array_length >= 1` is a hard gate. If the AI gets stuck in retry loops because it cannot find the right article, the system blocks. The alternative — soft enforcement with a confidence flag — is less rigorous but more shippable. The buffer mitigation (deferred enforcement for two weeks) is a compromise.

3. **The probe-support pattern (H) is novel and unproven.** No legal-AI vendor I know of has lawyers deliberately introducing wrong edits as production tests. It is a great idea conceptually, but operationally it adds cognitive load on lawyers who are already busy. Lawyer adoption may be 10%, not 100%. v2 placement reflects this risk.

4. **Stream C automation (v2 portion) is the right idea but the wrong layer.** Polish-law amendment detection is a multi-quarter project on its own. Putting it inside Layer 0 v2 risks Layer 0 v2 ship date. Could be its own parallel track from day one, with Layer 0 v2 consuming whatever exists.

5. **Two-sided argument generation (C) is a research problem.** Asking the AI to generate a credible opposing argument requires the AI to know what an authority's case officer would say. This is harder than the our-side argument because it is not what the AI is incentivized to produce. v2 placement reflects this — but quality may be uneven for v2 first ship.

6. **The verification-pass-after-edit (G) is double-counting LLM cost.** Every send becomes 2 LLM calls. The cost mitigation (mandatory only for appeals, pressure letters, wezwanie response; optional or skipped for lower-stakes documents) makes this tractable for v2 ship — but the cost-tier discipline must be enforced from day one of v2 or the cost runs away.

**Honest assessment:** the v1-minimum scope (A, B, D, E.C manual, I, J field, K) is the right move. The v2 expansion is the right *direction*, not the right next-week scope. The 65/35 buffer covers the known v1 risks; v2 will have its own buffer applied at v2 SUGGEST time.

## Unknown Unknowns

(Note: EU AI Act Article 6 was the original 6th unknown; per Refinement 4 it has been elevated to its own dedicated section above and removed from this list.)

1. **What "Annex A" formally is.** The case examples reference Annex A, but no codebase artifact mentions it. The legal mechanics, formal name, governing article, content requirements, post-MOS regulatory evolution — all undocumented in the repo. Manish or chat-Claude legal research must fill this before Layer 0 prompts can model it.

2. **Polish-law citation format consistency.** `Art. 64 §2 KPA` vs `Art. 64 § 2 KPA` vs `Art. 64 ust. 2 KPA` (ustęp = paragraph in Polish legal style) — does the system require canonical format? Lawyers may type any of three forms. The citation validator (D) needs to canonicalize; canonicalization rules are unknown.

3. **Court decision integration.** The design mentions court decisions feeding `legal_article_edges` as `interpreted_by`. But Polish court decisions (NSA, WSA) are voluminous and uneven in citation format. How are they ingested? Manual? Automated? Volume unknown.

4. **MOS portal interaction.** "MOS" appears in case examples but its formal meaning in this context (online application portal? regional office? something else?) is unclear from codebase or master plan. Layer 0 design assumes Polish administrative authorities communicate via mail / personal pickup / e-Doręczenia; if MOS is the primary channel, that changes Stream C ingestion.

5. **Lawyer concurrency.** Stream A in-flight engagement assumes one lawyer editing at a time. Multi-lawyer collaboration patterns (junior drafts, senior reviews) need a different state machine.

6. **RODO data minimization on probe results.** Probe data captures the lawyer's deliberate errors. Is that lawyer-performance data subject to GDPR Article 88 (employment context)? Retention rules? Unknown.

7. **Prompt-version management.** Layer 0 depends on stable prompts. As prompts evolve, `comprehension_tests` must be re-run against new prompt versions. The schema needs `prompt_version` first-class, but no infrastructure for prompt versioning exists today (master plan deferred `prompt_templates` table). Tension.

8. **Vector embedding model drift.** Voyage `voyage-multilingual-2` embeddings are used today. If the model upgrades or deprecates, all `legal_articles_chunks.embedding` must be re-computed. Migration path undocumented.

9. **Lawyer probe-fatigue.** Even if 100% lawyer adoption of probes is unrealistic (per Argue-Against point 3), at lower adoption rates the failed-probe-correction loop may not generate enough signal to actually correct Layer 0 gaps. Threshold for "useful signal" unknown.

## Master Plan Integration Status

Commit f1c0152 ("docs: integrate Layer 0 into master plan with v1/v2 sub-phases and new principles") integrated Layer 0 into MASTER_PLAN.md. The master plan now contains:

- A new "LAYER 0: LEGAL COMPREHENSION FOUNDATION" section before Layer 1.
- The dependency line "Layer 1 cannot start until Layer 0 v1 is complete" added to the architecture section.
- Five new principles in NON-NEGOTIABLE PRINCIPLES: Law as argument-construction; AI completes / lawyer edits and sends; Continuous learning across three streams; Lawyer as adversarial tester; Honest confidence calibration.
- The execution loop's test-scenarios paragraph now includes "the Layer 0 comprehension test suite must pass before deploy" for legal-comprehension-touching features.
- The architecture renamed from FOUR-LAYER to FIVE-LAYER consistently throughout the document.

This design document is referenced from the master plan's Layer 0 section (the master plan's Layer 0 section names this file at its current path).

The Layer 0 testability set is documented separately at `artifacts/api-server/docs/LAYER_0_TESTABILITY.md` (saved next).
