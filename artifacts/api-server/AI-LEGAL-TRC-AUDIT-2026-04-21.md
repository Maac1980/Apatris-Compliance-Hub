# AI Legal + TRC Feature Set — Audit (2026-04-21)

Read-only audit of what EXISTS today. Not aspirational. Pre-refactor baseline.

Scope: every AI-powered service in `artifacts/api-server/src/services/` that touches legal/TRC workflows, plus the HTTP routes and dashboard pages wired to them.

Methodology: file-by-file read of 19 service files + route grep + Polish-term grep for TRC. Spot-verified file existence and key claims (TODO count, streaming flag presence) before writing.

---

## 1. AI Legal Services Inventory

19 services identified. 12 substantive (AI-invoking or large deterministic logic); 7 lighter-weight helpers.

### Core AI legal services (12)

| Service | File | Purpose | LLM | Invocation |
|---|---|---|---|---|
| Legal Intelligence | `services/legal-intelligence.service.ts` | Case research + appeal drafting + POA + authority letter + reasoning explainer. Five discrete AI-facing functions. | Claude Sonnet 4.6 + Perplexity `sonar-pro` | `routes/legal-intelligence.ts` (5 POST endpoints under `/api/v1/legal-intel/*`) |
| Legal Brief Pipeline | `services/legal-brief-pipeline.service.ts` | 6-stage sequential pipeline: research → case review → validation → pressure check → worker explanation → appeal translation. Halts on validation failure. | Claude Sonnet 4.6 + Perplexity `sonar-pro` | Route file not located in grep — may be unmounted. Service is fully written (~760 LOC). |
| Case Doc Generator | `services/case-doc-generator.service.ts` | Stage-triggered bilingual (PL/EN) document generation for 8 case lifecycle stages (NEW→REJECTED). Templates fallback if `ANTHROPIC_API_KEY` missing. | Claude Sonnet 4.6 | Internal service; called on case status transitions |
| Daily Legal Scan | `services/daily-legal-scan.service.ts` | Daily worker-snapshot comparison; emits status-change/risk-escalation/expiry-threshold alerts (60/30/14/7/1 day). Deterministic. | **None** | Scheduled via `lib/scheduler.ts` |
| Legal Copilot | `services/legal-copilot.service.ts` | Contextual Q&A grounded in a specific worker's data. Bilingual JSON output. | Claude Sonnet 4.6 (with pattern-matching fallback) | Implied `/api/ai/copilot` — route not cleanly located |
| Rejection Intelligence | `services/rejection-intelligence.service.ts` | Hybrid rule-first + AI-on-unclear classification into 6 categories (MISSING_DOCS, FORMAL_DEFECT, TIMING_ERROR, EMPLOYER_ERROR, LEGAL_BASIS_PROBLEM, OTHER_REVIEW_REQUIRED). | Claude Sonnet 4.6 (only on unclear cases) | Internal; rule-first short-circuits AI in most cases |
| Authority Response | `services/authority-response.service.ts` | Evidence-backed response pack for labour/immigration authority inquiries. DRAFT-only. | Claude Sonnet 4.6 | Internal; route wiring not fully verified |
| Knowledge Graph | `services/knowledge-graph.service.ts` | JSONB-backed nodes (WORKER, DOCUMENT, LEGAL_STATUTE, CASE, DECISION, URZAD, EMPLOYER) + typed edges. `findSimilarCases()` powers pattern retrieval. | **None** (deterministic graph) | Populated by case-doc-gen + brief-pipeline on transitions |
| Decision Explanation | `services/decision-explanation.service.ts` | Interprets existing AI output into structured `{verdict, confidence, reasons[], contradictions[], nextActions[]}`. Does not call AI itself. | **None** | Internal helper |
| Intelligence Router | `services/intelligence-router.service.ts` | 3-tier legal Q&A: KB (verified articles) → Perplexity (sourced) → Claude (synthesis). First confident tier wins; tracks `source_tier`. | Claude Sonnet 4.6 + Perplexity `sonar` + local KB | Implied `/api/intelligence/answer` — route wiring not verified |
| Case Intelligence | `services/case-intelligence.service.ts` | Full-state case analysis; 7-section output for 3 audiences (team/lawyer/client). Legal reference table with 20 Polish articles, document-completeness matrix, risk scoring. | Claude Sonnet 4.6 (narrative sections) | Internal |
| MOS Package | `services/mos-package.service.ts` | MOS 2026 readiness package: structured Annex 1 JSON + 9-point strategy brief. PDF generation delegated to frontend (jsPDF). Hardcoded employer: Apatris Sp. z o.o. NIP 5252828706. | **None** (deterministic) | Implied `/api/mos/generate` — route wiring not verified |

### Lighter-weight services (7)

| Service | File | Purpose | LLM |
|---|---|---|---|
| Regulatory Intelligence | `services/regulatory-intelligence.service.ts` | Extract compliance patterns from Polish law updates | Claude / Perplexity |
| Regulatory Classification | `services/regulatory-classification.service.ts` | Categorize new regulations applicable/not-applicable to workforce | Claude |
| Cross-Worker Intelligence | `services/cross-worker-intelligence.service.ts` | Aggregate risk patterns across cohorts (e.g., "9 Ukrainian workers expiring this week") | Claude (likely) |
| Document Intelligence | `services/document-intelligence.service.ts` | OCR + classification of intake documents | Claude Vision |
| Readiness Intelligence | `services/readiness-intelligence.service.ts` | PIP / inspection readiness scoring | Mix |
| Smart Document | `services/smart-document.service.ts` | Per-document intelligence pass | Mix |
| Data Copilot | `services/data-copilot.service.ts` | Intent-routed structured-data Q&A (18 regex intent patterns; NOT vector-based) | Claude |

**LLM provider breakdown:**
- Claude Sonnet 4.6: primary for ~8 services
- Perplexity `sonar-pro` / `sonar`: 3 services (Legal Intelligence, Legal Brief Pipeline, Intelligence Router)
- OpenAI / Gemini: scaffolded in `services/ai/provider.ts` but not active (per CLAUDE.md)
- Deterministic (no AI): Daily Legal Scan, Knowledge Graph, Decision Explanation, MOS Package

---

## 2. TRC-Specific Routes and Pages

### Backend HTTP routes

All in `artifacts/api-server/src/routes/trc-service.ts`:

| Method | Path | Line | Purpose |
|---|---|---|---|
| POST | `/api/trc/cases` | 31 | Create TRC case; auto-syncs to `legal_cases` |
| GET | `/api/trc/cases` | 15 | List by `status` / `workerId` query params |
| PATCH | `/api/trc/cases/:id` | 63 | Update; `syncTrcCaseToLegalCase()` on status change |
| DELETE | `/api/trc/cases/:id` | 106 | Soft or hard delete |
| GET | `/api/trc/cases/:id/documents` | 122 | List case documents |
| POST | `/api/trc/cases/:id/documents` | 135 | Attach document |
| PATCH | `/api/trc/documents/:docId` | 151 | Update status/notes; sets `reviewed_at` on approve/reject |
| GET | `/api/trc/cases/:id/notes` | 182 | Notebook entries |
| POST | `/api/trc/cases/:id/notes` | 195 | Append notebook entry |
| POST | `/api/trc/cases/:id/generate-checklist` | 212 | **AI-powered:** Claude generates JSON array of required docs (prompt: "Polish immigration law expert specializing in TRC") |
| POST | `/api/trc/cases/:id/send-checklist` | 256 | Email via Brevo SMTP |
| POST | `/api/trc/cases/:id/notify` | 289 | Status-change email |
| POST | `/api/trc/cases/:id/invoice` | 318 | Generate invoice JSON (not persisted) |
| GET | `/api/trc/summary` | 353 | Dashboard summary: total + by status + by type + expiring-soon |

**AI-powered TRC endpoint:** only one (`POST /cases/:id/generate-checklist`). All other TRC endpoints are CRUD/email/template.

### Frontend (dashboard) components

| File | Role |
|---|---|
| `components/LegalStatusPanel.tsx` | Worker legal snapshot display |
| `components/LegalExplainPanel.tsx` | Legal reasoning explanation UI |
| `components/WorkerLegalStatus.tsx` | Inline snippet embedded in worker detail pages |

**No dedicated `TrcPage.tsx` / `CaseDetailPage.tsx` found.** TRC case management UI is either embedded inside worker detail flows or not yet built. Wouter routes were not exhaustively traced — confidence: medium.

### Worker-table TRC field

`workers.trc_expiry` (date). Used across compliance scanning, scheduler expiry alerts, and worker detail rendering.

---

## 3. Top 3 AI Services — Deep Dive

### A. Legal Brief Pipeline — `services/legal-brief-pipeline.service.ts` (~760 LOC)

**Architecture:** 6 sequential stages, each a discrete LLM call with a distinct hardcoded system prompt. Stage 3 (Validation) can HALT the pipeline.

#### Stage 1 — Research (Perplexity + Claude fallback)
System prompt (hardcoded, verbatim):
> "You are an immigration lawyer assistant specializing in Polish law. You are NOT making legal decisions. You are NOT giving final legal advice. You must connect legal provisions to THIS specific case. If unsure, say 'uncertain' — do not guess. Identify relevant Polish immigration law: TRC provisions, Art. 108 continuity, deadlines, formal defects, appeals, Ustawa o cudzoziemcach, KPA procedures. Return ONLY valid JSON."

#### Stage 2 — Case Review (Claude)
> "You are a legal assistant helping a lawyer review a Polish immigration case. Do NOT override the legal snapshot. Do NOT invent facts. Use ONLY provided data and research. This is for lawyer review only."
> TASK: case summary, likely issue, map articles, appeal grounds, missing evidence, next steps, draft lawyer note, draft appeal outline.

#### Stage 3 — Validation (Claude)
> "You are a legal AI output validator. Do NOT generate new legal reasoning. ONLY validate.
> LEGAL SNAPSHOT (SOURCE OF TRUTH — do NOT contradict): [status, basis, risk, protection, TRC submitted, warnings].
> You MUST set `isValid: false` if: ANY claim contradicts the legal snapshot / ANY fact is invented / articles not relevant / actions inconsistent with legal status."

#### Stage 5 — Worker Explanation (tone-calibrated by rejection category)
> "You are writing a personal explanation for a worker named [FirstName] … TONE: [REASSURING|CALM|MODERATE|CAREFUL|NEUTRAL]. STRICT RULES: NO legal articles (no 'Art. 108', no 'KPA', no 'Ustawa'), NO legal jargon, NO internal codes, NO promises of success, short paragraphs, calm human tone, address worker by first name."

#### Input data (per call)
- Worker fields: `id`, `full_name`, `trc_expiry`, `work_permit_expiry`, `nationality`, `pesel`, `assigned_site`, `preferred_language`
- Legal snapshot (source of truth): `legalStatus`, `legalBasis`, `riskLevel`, `legalProtectionFlag`, `trcApplicationSubmitted`, `sameEmployerFlag`, `summary`, `warnings[]`, `requiredActions[]`
- Linked case (optional): `case_type`, `status`, `appeal_deadline`, `mos_status`
- Rejection analysis (optional): `category`, `explanation`, `likely_cause`, `appeal_possible`
- Free-form rejection text (optional)

#### Output format
Nested JSON: `{ stage1, stage2, stage3, stage4, stage5, stage6 }`. Each stage has its own typed shape.

#### Quality gates
- **Deterministic checks before AI validation**: status contradiction detection, article relevance cross-check, confidence inflation check, appeal-grounds consistency
- **Pipeline HALTS** if Stage 3 `isValid=false` or ANY CRITICAL severity issue
- **Confidence scoring** (0.0–1.0) per stage; Stage 1 penalized ≥0.15 if Perplexity unavailable; Stage 3 can force overall 0.5× if issues present
- **No-rejection-text guard**: Stage 2 caps confidence at 0.5 and zeroes appeal draft if rejection text absent

#### Test coverage
- `legal-engine.test.ts` (~60 lines) — tests deterministic engine, **not the AI pipeline**
- `legal-benchmark.test.ts`, `legal-status-extended.test.ts` — also deterministic rules
- **No dedicated brief-pipeline unit or integration test.**

---

### B. Legal Intelligence — `services/legal-intelligence.service.ts` (~338 LOC)

**Architecture:** 5 separate AI-facing functions, each with its own system prompt.

#### System prompts (verbatim, hardcoded)

**Perplexity (Case Research):**
> "Research Polish immigration and employment law. Focus on 2025-2026 changes. Cite official sources from isap.sejm.gov.pl, cudzoziemcy.gov.pl, udsc.gov.pl. Be specific about applicable articles and procedures."

**Claude (Case Research Analysis):**
> "You are a Polish immigration law analyst reviewing research for a specific case. All output is DRAFT for lawyer review. Never guarantee outcomes."

**Claude (Appeal Analysis):**
> "You are a Polish immigration law analyst. DRAFT only. Never guarantee success. Never invent article numbers. Use only articles from the research provided."

**Claude (Authority Letter):**
> "Draft formal Polish administrative correspondence. PROJEKT only. Proper KPA-compliant format."

**Claude (Legal Reasoning Explanation):**
> "You are explaining legal engine decisions. Be specific about which rules fired. DRAFT for internal review."

#### Input data
- Worker: `full_name`, `nationality`, `trc_expiry`, `work_permit_expiry`, `specialization`, `pesel`, `passport_number`
- Legal snapshot: `legalStatus`, `legalBasis`, `riskLevel`
- Rejection analysis (optional): `rejection_text`, `category`, `explanation`
- Case context (optional): case ID, type, voivodeship

#### Output format
- Research: `{ memo, providerStatus: { perplexity, claude } }`
- Appeal: `{ output: { appealGrounds[], missingEvidence[], relevantArticles[], appealDraftPl, appealDraftEn, workerExplanation, clientExplanation, provider_status } }`
- POA: `{ poa }` — **templated, non-AI**
- Authority draft: `{ draft: { contentPl, contentEn } }`
- Legal reasoning: `{ reasoning: { statusExplanation, applicableArticles[], whatCouldChange[], watchList[] }, snapshot }`

#### Quality gates
- Rate limiting via `checkAIRateLimit(tenantId, "perplexity"|"claude")`
- Error fallback: returns string markers `"[Perplexity 500]"` or `"[Error: …]"` on failure
- JSON extraction via regex `/\{[\s\S]*\}/` + `JSON.parse`; on failure, returns partial
- **No confidence scoring.** All output marked `requiresLawyerReview: true` by caller.

#### Test coverage
- **None.** No dedicated unit or integration test found.

---

### C. Case Document Generator — `services/case-doc-generator.service.ts` (~427 LOC)

**Architecture:** bilingual (PL/EN) generation keyed by case stage. 8 stage→doctype mappings.

#### System prompts (verbatim, hardcoded)

**Polish:**
> "You are a senior Polish immigration lawyer drafting formal legal documents. You work at an outsourcing company managing 200+ foreign workers in Poland. Your documents must be precise, legally sound, and reference specific Polish law articles. Use formal Polish legal language. Always cite: article number, full law name, and relevant paragraphs. Today's date: [ISO date]. [KB context] [Similar cases] [Notebook]"

**English:** same spirit, English legal drafting.

#### Stage → Document mapping (8 stages)

| Stage | Doc type | Cited articles |
|---|---|---|
| NEW | CASE_ASSESSMENT | Art. 108, Art. 87 |
| DOCS_PENDING | WORKER_NOTIFICATION (demand letter) | Art. 108 |
| READY_TO_FILE | APPLICATION_COVER_LETTER (+ MOS 2026) | Art. 108, Art. 104 KPA |
| FILED | FILING_CONFIRMATION (UPO + Art. 108 protection) | Art. 108 ust. 1 pkt 2 |
| UNDER_REVIEW | STATUS_INQUIRY (to voivodeship) | Art. 35–37 KPA |
| DEFECT_NOTICE | DEFECT_RESPONSE (14-day) | Art. 64 §2 KPA, Art. 7 KPA |
| DECISION_RECEIVED | DECISION_ANALYSIS | Art. 127, 129 §2, 138 KPA |
| REJECTED | APPEAL_LETTER (odwołanie) | Art. 127, 129 §2, Art. 7, 77, 80, 107 §3 KPA |

#### Input data
- Worker: `first_name`, `last_name`, `nationality`, `pesel`, `passport_number`, `date_of_birth`, `specialization`, `contract_type`, `trc_expiry`, `work_permit_expiry`
- Case: `case_type`, `status`, `stage`, `appeal_deadline`, `mos_status`
- KB articles (up to 12 ordered by category) as text context
- Similar cases (up to 5 from knowledge graph) with `similarity`, `outcome`, `voivodeship`, `daysToDecision`
- Notebook (up to 15 entries) — date, type, title, snippet

#### Output format
```ts
{
  id, case_id, worker_id, tenant_id,
  doc_type, stage_trigger, title,
  content_pl, content_en,
  legal_basis: string[],
  similar_cases_used: number,
  kb_articles_used: string[],
  ai_model, ai_confidence,
  status: "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SENT",
  reviewed_by, reviewed_at, review_notes,
  sent_to, sent_at,
  metadata
}
```

#### Quality gates
- Uses Anthropic SDK only if `ANTHROPIC_API_KEY` set; otherwise **template fallback** marked `[SZABLON — ...]` / `[TEMPLATE — ...]`
- Confidence scoring: 85 if AI-generated, 60 if template-with-KB, 40 if pure template
- **Liability disclaimer auto-appended** to every doc (PL `OŚWIADCZENIE`, EN `DISCLAIMER`): states Apatris does NOT provide legal assistance per Bar Act, only procedural acts per Art. 32–33 KPA
- Cross-links into knowledge graph: creates DOCUMENT node + edges to CASE node and cited LEGAL_STATUTE nodes

#### Test coverage
- **None.** No dedicated test file.

---

## 4. AI Quality Stack — What Exists vs. What Doesn't

### A. Hard system prompt (shared across services)
- **Present per service, NOT shared.**
- Each service defines its own prompt(s) inline. No central template/constant exported from a shared lib.
- Legal Intelligence has 5 distinct prompts; Brief Pipeline has 6 (one per stage); Case Doc Generator has 2 (PL + EN); Legal Copilot has one monolithic `SYSTEM_PROMPT` constant (~22 lines); Intelligence Router has 3 (one per tier).
- **Consequence:** no governance. Safety rules, tone, "never guarantee outcomes" style guard are repeated inline with drift (e.g., some prompts say "DRAFT only" in uppercase, others say "draft for lawyer review", others say "PROJEKT only"). No lint / test enforces consistency.
- Polish legal domain is hardcoded throughout — Ustawa o cudzoziemcach, KPA, Art. 108 referenced by name in multiple prompts, without abstraction.

### B. Bouncer / intent router
- **Present but naive.**
- `routes/ai-copilot.ts` — 6 hardcoded sub-agents (compliance, payroll, immigration, workforce, legal, finance). Routing is keyword-pattern matching (regex on intent names like `/ukrain/i`, `/pesel.*ukr/i`, `/deadline/i`).
- `services/intelligence-router.service.ts` — 3-tier fallback (KB → Perplexity → Claude). Tier is chosen by scoring, not by question-type classification. First tier with confidence ≥ threshold wins.
- `services/data-copilot.service.ts` — 18 regex intent patterns with hardcoded confidence scores (85 for match, 50 for fallback).
- **What's missing:** no ML classifier, no LLM-based intent router, no "is this query inside my domain?" guard, no dynamic agent discovery.

### C. RAG (retrieval-augmented generation)
- **Present but minimal. Keyword-based, not vector-based.**
- `legal_knowledge` table: `{tenant_id, title, content, category, source_name, source_url, tags}`. Manually curated.
- Retrieval in Case Doc Generator: pulls up to 12 KB articles ordered by category; appended as raw text into Claude prompt.
- Retrieval in Intelligence Router Tier 1: keyword matching (question split into >3-char words, articles scored by term presence, threshold-filtered at 30% coverage).
- Graph-based retrieval: `knowledge-graph.service.ts::findSimilarCases()` uses node properties + edge weights — **not embeddings**.
- Full-text search exists on `case_notebook_entries` via PostgreSQL `tsvector` + GIN index.
- **What's missing:** no vector embeddings, no pgvector/Pinecone/Chroma, no semantic search, no automatic KB ingestion, no cross-tenant anonymized pattern learning (referenced in comments but not implemented).

### D. Streaming
- **SSE endpoint present. No AI streaming.**
- `routes/intelligence-stream.ts`: `GET /api/intelligence/stream` emits `text/event-stream` with 30s keepalive. Subscribes to `lib/intelligence-emitter.ts`.
- **No producers found calling the emitter** — endpoint may have no active source.
- **Zero `stream: true` flags** in any Anthropic SDK call (verified via grep). Every Claude/Perplexity call is synchronous; full generation completes before HTTP response starts.
- Legal briefs, case documents, appeal letters — all block until fully generated (multi-second latency for users).

---

## 5. Gaps, TODOs, Stubs, Dead Code

### TODOs / FIXMEs / HACKs
- **Zero hits** across `services/*legal*.ts`. Code is clean in this regard.

### Route stubs / not-implemented
- **No** 501 responses, no `throw new Error("not implemented")`, no placeholder returns found across legal/TRC routes.

### Dead / unwired code — the big one
Several services have clear implementations but **no located HTTP route** wiring them to the frontend:
- `generateLegalBrief()` (`legal-brief-pipeline.service.ts`) — full 6-stage pipeline, no route found
- `askLegalCopilot()` (`legal-copilot.service.ts`) — no dedicated route located
- `answerQuestion()` (`intelligence-router.service.ts`) — no route located
- `generateMOSPackage()` (`mos-package.service.ts`) — no route located
- `buildAuthorityResponsePack()` (`authority-response.service.ts`) — route wiring partial/unclear
- `analyzeCaseState()` (`case-intelligence.service.ts`) — no route located

Confidence: medium. These may be wired via routes named non-obviously; the grep didn't surface them. But it's a real risk that the richest backend logic is not reachable from the dashboard.

### UI gaps
- No dedicated TRC case management page (`TrcPage.tsx`, `CaseDetailPage.tsx`, etc.) found in `apatris-dashboard/src/pages/`. TRC management is either embedded in worker detail flows or not yet built on the frontend.
- No real-time AI feedback in UI — all AI calls block; no `EventSource` client usage that would consume the SSE endpoint.

### Missing infrastructure
1. **Shared system prompt library** — every service hardcodes its own
2. **Confidence scoring consistency** — Brief Pipeline has stage-level scores; Legal Intelligence has none; Case Doc Gen has 3-tier heuristic
3. **RAG-to-vector upgrade** — keyword matching is fragile vs. embeddings
4. **LLM output validator** — only Brief Pipeline validates; other services do regex-extract-JSON and hope
5. **Streaming from AI** — UX will feel slow for any multi-second generation (appeal letters, multi-stage brief) until adopted
6. **Unit/integration tests for AI services** — 0 dedicated test files for the top 3 services
7. **Route wiring gap** — 6 substantive services may not be reachable from HTTP

---

## Summary Statistics

| Metric | Value |
|---|---|
| AI service files (substantive + helpers) | 12 + 7 = **19** |
| Services using Claude | 8+ |
| Services using Perplexity | 3 (Legal Intel, Brief Pipeline, Intelligence Router) |
| Services using OpenAI/Gemini | 0 (scaffolded, not active) |
| Deterministic "intelligence" services | 4 (Daily Scan, Knowledge Graph, Decision Explanation, MOS Package) |
| TRC backend endpoints | 14 (in `routes/trc-service.ts`) |
| TRC endpoints invoking AI | 1 (`generate-checklist`) |
| TRC-dedicated dashboard pages | 0 found |
| AI-streaming responses | 0 |
| SSE endpoints for AI events | 1 (`intelligence-stream.ts`, no verified producer) |
| Shared system prompt | No (per-service hardcoded) |
| Intent classifier | No (keyword regex only) |
| Vector RAG | No (keyword + graph only) |
| Dedicated AI service tests | 0 (top 3 services) |
| TODO/FIXME in legal services | 0 |

---

## What this means for a lawyer today

Based on what's wired end-to-end (route → service → frontend), a lawyer using the dashboard can today:
- Create/manage TRC cases via `/api/trc/cases/*` (CRUD works)
- Request an AI-generated document checklist for a case (one endpoint)
- Receive case status emails via Brevo
- Export invoices (JSON, not persisted)
- View worker legal snapshot in the Legal Status Panel

A lawyer **cannot** today via the dashboard (services exist but no confirmed UI):
- Trigger the 6-stage legal brief pipeline
- Chat with the Legal Copilot about a specific worker
- Run the 3-tier intelligence-router Q&A
- Generate an MOS readiness package on demand
- Build an authority-response pack
- See AI responses stream as they generate

This is the primary gap the "AI Legal stack" work will address: **the backend is richer than the frontend currently exposes**, and what is exposed is synchronous + template-heavy rather than AI-streamed + RAG-grounded.

---

*Audit complete. No code changes. File uncommitted.*
