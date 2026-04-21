# Workflow Audit 1B — End-to-End Lawyer Flow (2026-04-21)

Read-only audit focused on the target workflow: lawyer uploads a document → AI reads/classifies/researches/synthesizes/drafts → lawyer reviews and sends. Goal: identify how close we are to a single orchestration endpoint and what's missing.

**Headline:** we have most of the pieces. One orchestration endpoint already exists (the 6-stage Legal Brief Pipeline) but it doesn't take a document as input. A second automatic flow exists (case status transition auto-generates a DRAFT document). To realize the user's vision we need one new endpoint that stitches: document intake → worker/case match → brief pipeline → case-doc-generator with a `goal` hint. Most of this is glue + minor modifications; little new code.

---

## 1. Current Flow — Text Diagram

### Path A — Generic document intake (today)
```
  POST /api/v1/document-intelligence/extract   (multipart + JSON)
       │
       ▼
  services/document-intelligence.service.ts::extractStructuredDocumentData()
       │   (synchronous Claude Vision OCR → type + extracted_fields + confidence)
       ▼
  matchWorkerMultiSignal()  — name/passport/PESEL/DOB/nationality match
       │   (auto-assigns worker_id if confidence ≥ 0.6)
       ▼
  INSERT document_intake
       columns: ai_extracted_json, ai_classification, ai_confidence,
                matched_worker_id, match_confidence, match_signals_json,
                linked_case_id (OPTIONAL, from body), status = "PENDING_REVIEW"
       │
       ▼
  HTTP response: {intake_id, extracted, suggested_worker}
       (all synchronous — AI runs BEFORE response)
       │
       ▼
  Lawyer reviews → POST /api/v1/document-intelligence/approve
       (optionally sets case_id, confirms worker, changes status to CONFIRMED)
       │
       ▼
  ❌ NOTHING ELSE AUTO-RUNS.  No research, no brief, no drafted output.
       The document sits in document_intake; no downstream AI chain fires.
```

### Path B — TRC document attach (today)
```
  POST /api/trc/cases/:id/documents   (JSON — docType, fileName, fileUrl, notes)
       │
       ▼
  INSERT trc_documents   (metadata only)
       │
       ▼
  ❌ NO AI. No extraction. No worker match. No research.
       Purely filing-cabinet metadata.
```

### Path C — Case status transition (today)
```
  PATCH /api/trc/cases/:id   (or another case-status route)
       │
       ▼
  legal-case.service.ts::updateCaseStatus()
       │
       ├──▶ refreshWorkerLegalSnapshot(worker, tenant)   [non-blocking]
       ├──▶ recordCaseInGraph(tenant, case, worker, ...) [non-blocking]
       └──▶ generateDocumentForStage(case, tenant, newStatus)   [non-blocking]
                   │
                   ▼
             case-doc-generator.service.ts
                   ├── Fetches up to 12 KB articles (legal_knowledge)
                   ├── Fetches up to 5 similar cases (knowledge-graph::findSimilarCases)
                   ├── Fetches up to 15 case notebook entries
                   ├── Calls Claude with PL + EN prompts
                   └── INSERT case_generated_docs  status = "DRAFT"
       │
       ▼
  PATCH returns success (before/independent of the AI work)
       │
       ▼
  GET /api/v1/vault/docs/queue   (lawyer sees new DRAFT in review queue)
```

### Path D — Explicit legal brief generation (today)
```
  POST /api/v1/legal/brief/generate    Body: {workerId, caseId?, rejectionText?}
       │
       ▼
  legal-brief-pipeline.service.ts::generateLegalBrief()
       │
       ├── Stage 1: Legal Research (Perplexity sonar-pro + Claude fallback)
       ├── Stage 2: Case Review (Claude)
       ├── Stage 3: Validation (Claude, deterministic checks first; HALTS pipeline if invalid)
       ├── Stage 4: Pressure Check (deterministic + Claude)
       ├── Stage 5: Worker Explanation (Claude, tone-calibrated by rejection category)
       └── Stage 6: English Appeal Translation (Claude)
       │
       ▼
  Response: LegalBriefResult (all stages + status COMPLETE | HALTED | FAILED)
       (synchronous — full pipeline runs before response; no SSE streaming of stages)
```

**Net observation:** Paths A and D don't connect. A uploaded document never auto-triggers the brief pipeline. The lawyer manually invokes each.

---

## 2. Legal Brief Pipeline — Input/Output Contract

**Signature** (`services/legal-brief-pipeline.service.ts:110`):
```ts
export async function generateLegalBrief(
  workerId: string,
  tenantId: string,
  generatedBy: string,
  caseId?: string,
  rejectionText?: string,
): Promise<LegalBriefResult>
```

**Inputs:** worker id (required), tenant id, actor, optional case id, optional free-text rejection.

**Does NOT accept a document reference** (no `documentId`, no `ocrText`, no `documentContent` parameter). If the rejection is in a PDF, the caller must pre-extract and pass the text as `rejectionText`.

**Internal fetches** (all from DB):
- `workers` row: `id, full_name, trc_expiry, work_permit_expiry, nationality, pesel, assigned_site, preferred_language`
- `getWorkerLegalSnapshot(workerId, tenantId)` — Art. 108 status, expiries, blockers (throws if unavailable)
- `legal_cases` row (by `caseId` if provided, else most recent for worker); throws if case worker_id mismatches
- `rejection_analyses` row (most recent for worker) if `rejectionText` not provided

**Output:** nested `LegalBriefResult` with all 6 stages + status (`COMPLETE | HALTED | FAILED`) + per-stage confidence. Halts on Stage 3 validation failure.

**Quality gates present:**
- Deterministic contradiction checks before AI validation
- Pipeline halts on any CRITICAL-severity validation issue
- Confidence penalty (≥0.15) if Perplexity unavailable
- Stage 2 caps confidence at 0.5 when no rejection text

---

## 3. Case Doc Generator — Trigger Model

**Two triggers exist today:**

### Trigger 1: automatic, on case status change
`services/legal-case.service.ts:274-281`:
```ts
const { recordCaseInGraph } = await import("./knowledge-graph.service.js");
await recordCaseInGraph(tenantId, caseId, existing.worker_id, existing.case_type, newStatus);
// ...
const { generateDocumentForStage } = await import("./case-doc-generator.service.js");
await generateDocumentForStage(caseId, tenantId, newStatus);
```
Both non-blocking. Failure logs only; the status PATCH still succeeds.

### Trigger 2: explicit HTTP
`routes/case-doc-generator.ts:55-65`:
```
POST /api/v1/vault/docs/generate   Body: { caseId, stage }
```
Lawyer clicks "generate" for a specific stage.

**Stage → doc type mapping** (hardcoded in `case-doc-generator.service.ts`):
```
NEW              → CASE_ASSESSMENT
DOCS_PENDING     → WORKER_NOTIFICATION (demand letter)
READY_TO_FILE    → APPLICATION_COVER_LETTER (+ MOS 2026)
FILED            → FILING_CONFIRMATION (UPO + Art. 108 protection)
UNDER_REVIEW     → STATUS_INQUIRY (to voivodeship)
DEFECT_NOTICE    → DEFECT_RESPONSE (14-day)
DECISION_RECEIVED → DECISION_ANALYSIS
REJECTED         → APPEAL_LETTER (odwołanie)
APPROVED         → COMPLIANCE_CONFIRMATION
```

**No other triggers.** No scheduler, no event listener, no document-upload auto-trigger.

---

## 4. `findSimilarCases` — Algorithm + Quality Assessment

### Algorithm (verbatim from `knowledge-graph.service.ts`)

```sql
-- Base query
SELECT n.id AS caseNodeId, n.label, n.properties,
  COALESCE(
    (SELECT e.properties->>'outcome' FROM kg_edges e
       WHERE e.source_id = n.id AND e.edge_type = 'RESULTED_IN' LIMIT 1),
    n.properties->>'outcome'
  ) AS outcome,
  n.properties->>'voivodeship' AS voivodeship,
  (n.properties->>'days_to_decision')::int AS daysToDecision
FROM kg_nodes n
WHERE n.node_type = 'CASE'
  AND n.properties->>'case_type' = $1    -- required match
  -- optional: n.properties->>'nationality' = $2
  -- optional: n.properties->>'voivodeship' = $3
ORDER BY n.created_at DESC LIMIT $N;
```

Similarity score in TypeScript:
```ts
let similarity = 50;                                         // base
if (nationality && props.nationality === nationality) +20;   // exact match
if (voivodeship && props.voivodeship === voivodeship) +20;   // exact match
if (r.outcome) +10;                                          // case has known outcome
// capped at 100
```

Cross-tenant: yes, but worker PII (`worker_name`, `worker_id`) is stripped when tenant differs; sets `anonymized: true`.

### Quality assessment (my judgement on the facts above)

**Strengths:**
- Cross-tenant pattern reuse works (valuable for a staffing agency with 200+ workers across sites)
- PII stripping for cross-tenant results is correct
- Outcome attribution via the `RESULTED_IN` edge is a clean graph pattern
- Simple, deterministic, explainable — no surprising matches

**Gaps:**
- **No semantic similarity.** A case with same substance but different `case_type` label won't match (e.g., "TRC rejection — formal defect" vs "Residence permit reapplication — incomplete docs" could share everything operationally but fail exact-equality match)
- Additive score ignores weighting (voivodeship match ≠ nationality match in real legal impact — the voivodeship determines the office interpreting the law; nationality affects legal basis)
- No consideration of rejection category overlap even though `rejection_intelligence.service.ts` already categorizes
- No consideration of timeline proximity / how recently the case was filed
- Case stage + outcome contradictions aren't filtered (e.g., "REJECTED + outcome=approved" from a bad data entry would still match)
- No dedup — same `caseNodeId` could appear if the graph has duplicate CASE nodes
- `ORDER BY n.created_at DESC` means newest wins ties, which isn't necessarily most-similar

**Recommendation:** **upgrade to hybrid (keyword + vector)** before heavy use, but not urgent for the orchestration endpoint. Short term: add rejection category as a fourth match attribute (worth ~15 points of weighted similarity). Longer term: embeddings over `properties->>'summary'` + KB articles in pgvector. See Section 11.

---

## 5. Existing Orchestration Inventory

**One genuine multi-step orchestration endpoint exists:**

| Endpoint | File:line | Stages | Input | Output |
|---|---|---|---|---|
| `POST /api/v1/legal/brief/generate` | `routes/legal-brief.ts:16` → `services/legal-brief-pipeline.service.ts:110` | 6 sequential Claude + Perplexity calls | `{workerId, caseId?, rejectionText?}` | `LegalBriefResult` (full brief + status + per-stage confidence) |

**Partial / adjacent:**

| Endpoint | Why not "full" orchestration |
|---|---|
| `POST /api/v1/vault/docs/generate` | Single-stage doc generation; pulls KB + similar cases but no research/validation/pressure-check loop |
| `POST /api/v1/document-intelligence/extract` + `/approve` | 2-step with manual approval in between; no drafting downstream |
| Automatic chain in `updateCaseStatus` (Path C above) | Internal only, not an HTTP endpoint; triggered on status change, not user action |

**Does a single endpoint today take (document) → classify + research + brief + draft → return final drafted doc?** **No.** The closest thing chains 6 AI stages but requires pre-extracted text input; drafting a final output document is a separate endpoint with no connection to the brief.

---

## 6. Perplexity Usage Map

**Only caller:** `services/legal-research.service.ts::callPerplexity()` (line 56). Invoked from `legal-brief-pipeline.service.ts::runStage1()`.

| Aspect | Setting |
|---|---|
| Model | `sonar-pro` |
| Temperature | 0.1 |
| `max_tokens` | 2048 |
| Auth | `Bearer ${process.env.PPLX_API_KEY}` |
| Rate limit | **10 calls/hour per tenant** (`lib/ai-rate-limiter.ts:16-18`) |
| Rate limit storage | In-memory `Map` (resets on deploy) |
| Response caching | **None.** Responses stored in `law_articles` table for audit, but no cache-hit lookup logic |
| Dedup | `query_used` column stores the search query for traceability; no dedup behavior |

**Implication for orchestration endpoint:** if our new endpoint does research as part of every call, we'll hit the 10/hour cap fast. Either (a) raise the limit, (b) add a cache layer keyed on `(tenantId, normalized_query)` with a 24h TTL, or (c) reuse cached `law_articles` rows when the query matches closely.

---

## 7. Document-to-Case Linking

**Worker match:** automatic and gated (confidence ≥ 0.6) in `extractStructuredDocumentData()` via `matchWorkerMultiSignal()`.

**Case match:** manual. Two paths:
- `POST /api/v1/document-intelligence/extract` body accepts an optional `caseId` (but UI has to supply it)
- `POST /api/v1/document-intelligence/approve` also accepts `caseId` (final lawyer step)

**TRC-specific path:** `POST /api/trc/cases/:id/documents` is metadata-only; the case_id comes from the URL, the document upload/extraction is out-of-band. If a lawyer uploads a rejection letter via `/extract`, then manually attaches it to a TRC case, the system does NOT then fire a brief pipeline.

**Implication for orchestration endpoint:** the "case linkage" step is a critical gap. For the target workflow (lawyer uploads rejection → auto-draft appeal), the caseId must either (a) be determined from the worker's most recent open case, (b) be selected by the lawyer as part of the upload call, or (c) be inferred via the extracted_fields (e.g., the AI already knows this is a "rejection decision" and can pick the most recent case with status = DECISION_RECEIVED or UNDER_REVIEW).

---

## 8. Output Document Writeback — Review Flow

**Table:** `case_generated_docs` (init-db.ts ≈3200). Key columns:
- `content_pl` + `content_en` (bilingual text)
- `legal_basis TEXT[]` (cited articles)
- `similar_cases_used`, `kb_articles_used TEXT[]`
- `ai_model`, `ai_confidence NUMERIC(5,2)`
- `status` — `DRAFT | UNDER_REVIEW | APPROVED | REJECTED | SENT`
- `reviewed_by`, `reviewed_at`, `review_notes`
- `sent_to`, `sent_at`

**Review routes** (`routes/case-doc-generator.ts`):
| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/vault/docs/queue` | List DRAFT + UNDER_REVIEW |
| GET | `/v1/vault/docs` | All generated docs (paged) |
| GET | `/v1/vault/docs/case/:caseId` | Docs for one case |
| POST | `/v1/vault/docs/generate` | Manual trigger (body: caseId + stage) |
| POST | `/v1/vault/docs/:id/approve` | DRAFT/REVIEW → APPROVED |
| POST | `/v1/vault/docs/:id/reject` | DRAFT/REVIEW → REJECTED |
| PATCH | `/v1/vault/docs/:id` | Edit content; sets status=UNDER_REVIEW |
| POST | `/v1/vault/docs/:id/send` | APPROVED → SENT (sent_to, sent_at) |
| GET | `/v1/vault/docs/:id/pdf` | Download as PDF |
| POST | `/v1/vault/docs/:id/email` | Email + mark SENT |

**Dashboard:** queue is surfaced in the generated-docs review pages; transition buttons wired to the routes above. Confidence: medium (not traced deeply in this audit).

**Implication for orchestration endpoint:** writeback is solved. Our new endpoint just needs to produce a new row in `case_generated_docs` with the right `doc_type + stage_trigger + content_pl + content_en + metadata` and it will flow into the existing review queue automatically.

---

## 9. Proposed Orchestration Endpoint — Design

### Goal
One endpoint that takes a document + worker/case context and returns a drafted output the lawyer can review, with SSE progress streamed per stage.

### Shape

```
POST /api/v1/legal/analyze-and-draft
```

**Name rationale:** `/legal/analyze-and-draft` — analyze the input, draft the output. Sits next to `/legal/brief/generate`, `/legal/copilot/ask`, `/legal/authority-pack/generate`. Use versioned `v1` for consistency.

### Input
```jsonc
{
  "documentId": "uuid",            // existing document_intake.id from /extract (REQUIRED)
  "workerId": "uuid",              // optional; falls back to document_intake.matched_worker_id or confirmed_worker_id
  "caseId": "uuid",                // optional; falls back to heuristic (see below)
  "goal": "appeal" | "authority_response" | "defect_fix" | "mos_package" | "status_inquiry" | "auto",
  "additionalContext": "string"    // optional — lawyer's one-line note (e.g., "urgent, client flies out Monday")
}
```

**`goal=auto`:** the endpoint classifies the document and picks the goal from extracted_fields:
- `rejection_decision` → `appeal`
- `defect_notice` → `defect_fix`
- `authority_inquiry` → `authority_response`
- TRC application nearing expiry + recent approval → `mos_package`
- anything else / unclear → return error with suggested manual `goal`

**`caseId` fallback order** when not provided:
1. `document_intake.linked_case_id` (if lawyer already linked)
2. Most recent open case for `workerId` matching doc type (e.g., rejection doc → case with status DECISION_RECEIVED or REJECTED)
3. Error — return HTTP 422 with a list of candidate cases for the lawyer to pick

### Internal pipeline

```
Stage 0 — Resolve context
  ├── Load document_intake by documentId
  ├── Resolve workerId (param → intake.matched_worker_id → intake.confirmed_worker_id → 422)
  ├── Resolve caseId (param → intake.linked_case_id → heuristic → 422)
  └── Resolve `goal` (param → classify_from_intake.ai_classification → 422)

Stage 1 — Document analysis  ── REUSE existing: extractStructuredDocumentData() was already run by /extract; just read intake.ai_extracted_json

Stage 2 — Similar cases      ── REUSE findSimilarCases(tenantId, caseType, nationality, voivodeship, 5)

Stage 3 — Legal Brief        ── CALL generateLegalBrief(workerId, tenantId, lawyerUserName, caseId, rejectionTextFromDoc)
  Stages 1–6 of brief pipeline run; HALTS on validation failure and surfaces to the caller.
  ── NEEDS MINOR MODIFICATION:
       Add an overload `generateLegalBrief(..., opts: { rejectionDocumentId?: string })` so we don't need to
       pull ai_extracted_json twice. Internal: if rejectionDocumentId provided, use that doc's extracted text
       as rejectionText input to Stage 1.

Stage 4 — Case Doc Generator ── CALL generateDocumentForStage(caseId, tenantId, stageFromGoal)
  stageFromGoal mapping:
    appeal             → "REJECTED"
    defect_fix         → "DEFECT_NOTICE"
    authority_response → NEW stage-equivalent, see below
    status_inquiry     → "UNDER_REVIEW"
    mos_package        → reuse mos-package.service.ts::generateMOSPackage() instead (different shape)

  ── NEEDS SMALL ADDITION:
       Either add "AUTHORITY_RESPONSE" stage→doc_type mapping in case-doc-generator, OR call
       authority-response.service.ts::generateAuthorityPack() as an alt branch when goal=authority_response.

Stage 5 — Synthesis + writeback
  ── INSERT case_generated_docs row with:
       doc_type = mapped from goal
       stage_trigger = "ORCHESTRATED"     // so the review queue can filter
       content_pl / content_en = from Stage 4 output
       metadata = {
         orchestration: { goal, documentId, similarCasesUsed, briefConfidence,
                          briefStatus: "COMPLETE" | "HALTED" }
       }
       status = brief.status === "HALTED" ? "UNDER_REVIEW" : "DRAFT"

Stage 6 — Emit intelligence event (SSE)
  ── emitIntelligenceEvent({ type: "doc_drafted", workerId, caseId, documentId })
       LegalCommandCenter.tsx SSE consumer picks this up → toast + queue refresh.
```

### Streaming (SSE)

Respond with `Content-Type: text/event-stream` and emit a JSON event at the end of every stage:
```
event: stage
data: { "stage": "similar_cases", "status": "started", "ts": "..." }

event: stage
data: { "stage": "similar_cases", "status": "complete", "count": 5, "confidence": 0.78 }

event: stage
data: { "stage": "legal_brief", "status": "started" }

event: stage
data: { "stage": "legal_brief", "status": "complete", "briefStatus": "COMPLETE", "confidence": 0.72 }

event: done
data: { "draftDocId": "uuid", "confidence": 0.71, "warnings": [...] }
```

Reuses the existing `lib/intelligence-emitter.ts` pattern. `LegalCommandCenter.tsx` already has an EventSource consumer (`pages/LegalCommandCenter.tsx:65`); we just need a new event type or a per-request event channel.

### Output
If sync (caller doesn't set `Accept: text/event-stream`):
```jsonc
{
  "draftDocId": "uuid",                // case_generated_docs.id — lawyer opens the review queue
  "caseId": "uuid",
  "workerId": "uuid",
  "goal": "appeal",
  "briefStatus": "COMPLETE" | "HALTED" | "FAILED",
  "similarCasesUsed": 4,
  "confidence": 0.71,                  // weighted: 0.4*brief + 0.3*doc-gen + 0.2*similar-avg + 0.1*intake
  "warnings": [
    "Brief stage 3 flagged: article citation not in research result",
    "Perplexity rate limit near ceiling (8/10 this hour)"
  ],
  "auditLogId": "uuid"                 // UPDATE_WORKER audit row from the draft insert
}
```

### Reuse inventory

| Piece | Status | Notes |
|---|---|---|
| `extractStructuredDocumentData()` | Reuse | Already ran during `/extract`; we just read the row |
| `matchWorkerMultiSignal()` | Reuse | Worker already auto-matched on intake |
| `findSimilarCases()` | Reuse | Keep but consider quality-upgrade later (see Section 11) |
| `generateLegalBrief()` | Minor mod | Accept `rejectionDocumentId` as an alternative input to `rejectionText` |
| `generateDocumentForStage()` | Small addition | Add `ORCHESTRATED` stage trigger (or accept a goal→stage map) |
| `generateAuthorityPack()` | Reuse as alt branch | When `goal=authority_response` |
| `generateMOSPackage()` | Reuse as alt branch | When `goal=mos_package` |
| `emitIntelligenceEvent()` | Reuse | Add `doc_drafted` event type; LegalCommandCenter already listens |
| `case_generated_docs` table + review routes | Reuse as-is | The writeback target is solved |

**New code needed** (estimate):
- 1 route file: `routes/analyze-and-draft.ts` (~180 lines)
- 1 orchestrator service: `services/analyze-and-draft.service.ts` (~250 lines — the 6-stage coordinator)
- Minor addition to `generateLegalBrief()` signature (~10 lines)
- Minor addition to `generateDocumentForStage()` goal routing (~15 lines)
- 1 new event type `doc_drafted` in `lib/intelligence-emitter.ts` (~5 lines)
- Tests (see Section 11)

---

## 10. Gap Summary — Biggest Obstacles

| # | Gap | Severity | Effort |
|---|---|---|---|
| 1 | **`generateLegalBrief()` can't take a document** — only pre-extracted text. The orchestration endpoint needs to either pre-extract or modify the signature. | Medium | 10–15 lines of code |
| 2 | **Case linkage is manual.** A document is uploaded but a case link is only set when the lawyer approves. Orchestration has to either require `caseId` in the call or implement the fallback heuristic (newest open case by doc type). | Medium | Heuristic logic + 422 response + UI for candidate selection |
| 3 | **Perplexity rate limit is tight (10/hour/tenant) with no cache.** An orchestration endpoint doing research on every call will saturate the bucket within a morning. | High for production; low for today's volume | Add DB-backed cache keyed on `(tenantId, normalized_query)` with TTL; reuse `law_articles` when query matches |
| 4 | **`findSimilarCases` is attribute-equality only.** For the user's vision of "deep research including similar cases," this will miss semantically similar cases with different labels. | Medium | Quick win: add rejection category as a 4th match attribute (~30 lines). Deeper: pgvector upgrade (multi-day). |
| 5 | **No document_intake → automatic downstream.** Today, uploading a document runs OCR but nothing else. The lawyer must manually trigger every downstream step. The orchestration endpoint fixes this by definition; but we should consider whether `/extract` itself should OPTIONALLY auto-fire the orchestrator. | Low (nice-to-have) | 1 body param on `/extract`; 1 line of dispatch |
| 6 | **Streaming UX consistency.** We have SSE consumer in `LegalCommandCenter` but not in `LegalBrief` or `TRCWorkspace`. Orchestration endpoint should work even if the caller is plain HTTP, not SSE. | Low | Graceful content-negotiation in route handler |
| 7 | **No tests on the orchestration path.** Prior audit confirmed 0 dedicated tests for top 3 AI services. A new orchestrator without tests is asking for silent regressions. | High if we ship; low to start | Integration test with stub Anthropic/Perplexity clients |

---

## 11. Quality Wins Not Tied to Orchestration

These stand on their own and improve every service, not just the new endpoint. Order by impact ÷ risk.

### High-value, low-risk
1. **Shared system prompt library.** Factor out the safety+tone preamble ("DRAFT only; never guarantee outcomes; cite only articles from research") into `lib/ai-prompts.ts`. Each service imports it and appends service-specific instructions. Eliminates drift observed in prior audit (e.g., "DRAFT only" vs "PROJEKT only" vs "draft for lawyer review"). Low risk because prompts are still per-service; just deduplicated.
2. **Perplexity response cache.** Table `ai_research_cache(tenant_id, query_hash, model, response_json, created_at)` with 24h TTL. Queried before `callPerplexity`. Reduces rate-limit pressure massively; improves latency on repeated queries. Low risk because existing callers continue to work; caching is transparent.
3. **Louder AI failure telemetry.** Today, `.catch(e => console.error(...))` swallows failures (we saw this exact bug on audit-log.ts:34 during encryption migration). Wrap Anthropic + Perplexity calls in a small helper that logs structured failure metadata + increments a counter. Low risk; catches the next silent bug.

### Medium-value, moderate-risk
4. **Vector RAG upgrade for KB + similar cases.** Install pgvector on the Neon branch. Generate embeddings (Anthropic has an embeddings model; or use open-source `gte-small`). Replace keyword-matching in `intelligence-router` Tier 1 and `findSimilarCases` with cosine distance over embeddings. Keep keyword as fallback. Medium risk because it's a schema change + an embedding pipeline; needs a backfill for existing 120+ KB articles and all CASE nodes.
5. **Confidence scoring standardization.** Introduce a uniform `{confidence: number, warnings: string[]}` return shape on every AI service. Today, Brief Pipeline has stage-level scores, Legal Intelligence has none, Case Doc Gen has a 3-tier heuristic. Moderate risk because it touches multiple services, but can be rolled out incrementally.

### Lower-priority polish
6. **Bouncer / intent classifier.** Replace the 18 regex intent patterns in `data-copilot.service.ts` with a small LLM call ("classify this query into one of: TRC, payroll, legal, compliance, other"). Improves routing accuracy. Moderate risk because it adds an LLM hop per copilot query (cost + latency); worth it only if we start seeing misroutings.
7. **AI service unit tests.** Stub out Anthropic + Perplexity clients; write integration tests for the 6-stage brief pipeline's halt condition, the `generateDocumentForStage` stage → doc_type map, and `findSimilarCases` cross-tenant PII masking. 0 today; 6 test files would cover most.
8. **Streaming from Claude itself.** Today Claude calls are all `stream: false`. For the worker explanation and appeal-letter stages, streaming tokens to the UI would massively improve perceived latency. Moderate risk because the backend has to switch to chunked transfer encoding end-to-end.

### Nice-to-have
9. **Wire `analyzeCaseIntelligence` to a dashboard panel.** One real orphan from Sub-phase 1A. The service produces a 7-section lawyer-focused analysis; a "Case Intelligence" tab on the case detail page would make it reachable.
10. **Auto-cleanup of old `document_intake` rows.** The intake table is write-heavy (every upload creates a row). No TTL/archival today. Add a nightly job to move rows older than 90 days with status=CONFIRMED to an archive table.

---

## Summary

- **We're ~80% of the way to the target workflow.** Document intake → OCR + worker match already runs automatically. Case status → DRAFT doc generation already runs automatically. The Legal Brief Pipeline exists as a 6-stage validator+drafter. The review queue + approve/reject/send lifecycle is solved.
- **What's missing is the connective tissue:** a single endpoint that takes a freshly-extracted document and orchestrates research + brief + doc-gen into a single DRAFT ready for lawyer review.
- **This is mostly glue, not new AI.** Reuse existing services; add one route + one coordinator + 3 small modifications + streaming events.
- **One true frontend orphan remains** (`analyzeCaseIntelligence`) — decide whether to wire or retire.
- **The biggest underlying quality debts** (shared prompt library, Perplexity cache, vector RAG) are valuable regardless of orchestration and can be done in parallel.

---

*Audit complete. No code changes. File uncommitted. Prod v290 / staging v13 untouched.*
