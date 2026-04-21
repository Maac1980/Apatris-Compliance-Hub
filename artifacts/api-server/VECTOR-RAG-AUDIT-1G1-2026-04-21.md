# Vector RAG — Investigation & Design (1G-1, 2026-04-21)

Read-only investigation of vector retrieval as the grounding layer for Apatris's legal AI stack. This is **not** a fix plan — it's a baseline + design so the next sub-phase can execute with eyes open.

**Headline:** pgvector is available on the Neon branch (`0.8.0`, not installed). Cold-start is the real constraint — not infrastructure, not cost. Prod has 12 KB articles, 5 rejection analyses, 4 HALTED briefs, 0 knowledge-graph nodes, 0 generated docs. Retrieval quality will be marginal for the first ~500 cases. The right play is to stand up the infrastructure now, seed aggressively from Apatris's own legal knowledge + publicly-retrievable appeal templates, and accept that the system gets materially better over the first 6–12 months as cases accumulate.

---

## 1. Current Data Inventory (production snapshot, 2026-04-21 17:17 UTC)

| Table | Rows | Signal |
|---|---|---|
| `workers` | 31 | Test cohort; real ~200-worker roster lives outside prod today |
| `workers` with `trc_expiry` non-null | 26 | Usable for similar-worker retrieval |
| `workers` with encrypted PESEL | 25 | Encryption infrastructure is live |
| `legal_knowledge` (KB) | **12** articles | Categories: MOS 2026 (3), Article 108 (2), Work Permit (2), PIP, Employer, ZUS, Schengen, EES |
| `legal_knowledge` avg content length | 416 chars | Short — each article is roughly 1 paragraph |
| `rejection_analyses` | 5 | All 5 have `rejection_text` populated (≥100 chars) — **these are the closest thing to real seed data** |
| `legal_briefs` | 4 | All HALTED (from Wave 1 + schema-fix testing; not real outputs) |
| `case_generated_docs` | 0 | No drafted documents stored yet |
| `document_intake` | 7 | All classified as `UNKNOWN` — OCR pipeline hasn't had real documents |
| `kg_nodes` (knowledge graph) | **0** | Despite graph infra being built, prod graph is empty |
| `legal_cases` | 5 | 4 PENDING, 1 REJECTED |

### Quality assessment

**Usable for Vector RAG seeding (day 1):**
- 12 `legal_knowledge` articles — short but categorically covering the core domain
- 5 `rejection_analyses` with text — exactly the "past rejection" type we need for retrieval Type A
- 26 workers with TRC data — profile embeddings for Type D seed

**Not yet usable:**
- `kg_nodes` at 0 is the big surprise. The graph was built on staging (3 nodes existed pre-tests) but is empty on prod. Any "similar cases" retrieval plan that depends on the graph has to seed it first.
- `case_generated_docs` at 0 means no appeal-template seed data. Type C ("successful appeal templates") must bootstrap from external content, not internal.
- `document_intake` at 7 rows all-UNKNOWN means the OCR-to-structured-classification pipeline hasn't exercised real documents. Any "similar upload" retrieval must wait for real uploads.

**User's context aligns:** 5,000+ historical positive decisions exist but are archived/paper — not practically reachable without a dedicated digitization project. Growing prospectively from today + whatever recent cases are digital is the right move.

---

## 2. pgvector Availability on Neon

```
pg_available_extensions: { name: "vector", default_version: "0.8.0", installed_version: null }
```

**Available, not installed.** Neon supports pgvector on all paid plans without additional charge. Installation is a single command:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

After install, we can add vector columns:
```sql
ALTER TABLE legal_knowledge ADD COLUMN embedding vector(1024);
CREATE INDEX ON legal_knowledge USING hnsw (embedding vector_cosine_ops);
```

**No plan change required. No vendor lock-in beyond Neon (if we ever migrate off Neon, pgvector is also available on AWS RDS, Supabase, Azure Postgres, and self-hosted Postgres 14+).**

---

## 3. Embedding Provider Decision

### Evaluated options

| Provider / model | Dim | Price (/1M tokens) | Polish? | Legal-domain tuning | Anthropic partnership |
|---|---|---|---|---|---|
| **Voyage `voyage-multilingual-2`** | 1024 | ~$0.12 | ✅ trained multilingual | Strong on domain text | ✅ officially recommended partner |
| Voyage `voyage-law-2` | 1024 | ~$0.06 | English-heavy | ✅ **legal-specialized** | ✅ |
| Voyage `voyage-3` | 1024 | ~$0.06 | Primarily English | General | ✅ |
| OpenAI `text-embedding-3-small` | 1536 | $0.02 | Multilingual (English-trained) | No | ✗ |
| OpenAI `text-embedding-3-large` | 3072 | $0.13 | Multilingual | No | ✗ |
| Cohere `embed-multilingual-v3` | 1024 | $0.10 | ✅ **strong Polish** | No | ✗ |
| Self-host `BGE-m3` / `paraphrase-multilingual-mpnet` | 768–1024 | $0 (infra cost) | Good | No | N/A |

### Recommendation: **Voyage `voyage-multilingual-2`**

Reasons:
1. **Polish support** is first-class (multilingual trained, not English-repurposed)
2. **Anthropic-recommended partner** — aligns with our existing Claude stack
3. **1024 dim** is pgvector-friendly and balances storage/quality
4. **Cost is negligible** — see below
5. Single API pattern to add (similar to existing `ANTHROPIC_API_KEY` / `PPLX_API_KEY` pattern)

**Alternative worth considering:** if Voyage `voyage-law-2` adds Polish coverage in a future release, switch. Legal-specialized embeddings typically outperform general-purpose ones by ~15–20% on retrieval-relevance benchmarks for legal text.

**Self-host is NOT recommended** at this scale — infrastructure burden, re-embedding overhead, and operational complexity don't pay back until embedding volume is 10× current projection.

### Cost estimate

Embedding 1,000 documents at ~500 tokens each = 500K tokens:

| Provider | One-time cost for 1K docs | Cost for 5K docs | Monthly ongoing (100 new/month @ 500 tokens) |
|---|---|---|---|
| Voyage `voyage-multilingual-2` | **$0.06** | $0.30 | $0.006 |
| OpenAI `text-embedding-3-small` | $0.01 | $0.05 | $0.001 |
| Cohere `embed-multilingual-v3` | $0.05 | $0.25 | $0.005 |

**Cost is a rounding error at any scale we'd realistically hit in 2 years.** The choice is 100% about Polish + legal quality, not budget.

### New Fly secret required
```
APATRIS_VOYAGE_API_KEY=<key>
```
Deployed to both staging + prod via `fly secrets set`. Same pattern as `ANTHROPIC_API_KEY`.

---

## 4. Retrieval Design — 4 Types

Each type serves a distinct question the legal pipeline is asking. Design decisions:

### Type A — Similar Rejections ("have we seen this rejection grounds before?")

- **Corpus:** `rejection_analyses.rejection_text` + any rejection OCR in `document_intake.ai_extracted_json -> 'rejection_text'`
- **Embedding subject:** the rejection text body itself (after PII anonymization — see §7)
- **Metadata stored on the row:** `category` (from analyses), `authority_name`, `decision_date`, `outcome_if_known`, `nationality`, `case_type`
- **Match scoring:** cosine similarity; filter by `outcome IS NOT NULL` if the query is "how did we beat this?"; top-5
- **Cold start size:** 5 today → useful at ~50; reliable at ~200
- **Use site:** Legal Brief Pipeline Stage 2 (`runStage2`, inject into `stage1Context`)

### Type B — Relevant Articles ("which Polish law articles apply to this fact pattern?")

- **Corpus:** `legal_knowledge.content` + title
- **Embedding subject:** `title + "\n\n" + content` (one embedding per article; content is short, no chunking needed at current lengths)
- **Metadata:** `category`, `source_name`, `source_url`, `tags[]`
- **Match scoring:** cosine; top-10; boost articles cited in similar past briefs (when we have that data)
- **Cold start size:** **12 today — usable immediately** (KB is the most-ready seed)
- **Use sites:** Legal Brief Stage 1 (`runStage1`, supplement Perplexity); Case Doc Generator (replace line 153-156 category-order LIMIT-12 query); Legal Copilot (augment context)

### Type C — Successful Appeal Templates ("how have we beaten this rejection before?")

- **Corpus:** `case_generated_docs WHERE status = 'APPROVED' AND doc_type = 'APPEAL_LETTER'` + seed templates
- **Embedding subject:** `content_pl` (PII-anonymized)
- **Metadata:** `legal_basis[]` (cited articles), `outcome`, `days_to_decision`, `voivodeship`
- **Match scoring:** cosine; pre-filter on `outcome = 'APPROVED'`; top-3
- **Cold start problem:** **0 records today.** Must bootstrap from external seed before this type is usable.
  - Option (i): Apatris pastes in 10–20 anonymized real appeal templates from their 13-year archive (even paper ones, transcribed)
  - Option (ii): Use public Polish case law (isap.sejm.gov.pl court decisions, NSA rulings) as initial exemplars
  - Option (iii): Generate synthetic templates via Claude using the KB articles as source, mark them clearly as `synthetic: true` and retire them as real data accumulates
- **Recommendation:** (i) + (ii). Synthetic (iii) is a trap — the system will retrieve synthetic patterns that reinforce existing AI biases.

### Type D — Similar Workers ("has a worker like this had a similar case before?")

- **Corpus:** `workers` rows with completed cases (composed "profile text" at embedding time)
- **Embedding subject:** a constructed profile string like `"<nationality> <specialization> in <voivodeship>, TRC <status>, work_permit <type>, case outcome: <outcome>"`
- **Metadata:** `worker_id`, `case_outcome`, `risk_level`, `days_in_country`, `nationality`
- **Match scoring:** cosine + filter by has-completed-case; top-5
- **Cold start size:** 31 today (26 with case data) → useful at ~50; reliable at ~200
- **Use sites:** Case Intelligence Service (`analyzeCaseIntelligence`); Case Doc Generator supplementary context; Knowledge Graph `findSimilarCases` replacement

### Embedding pipeline (shared across all 4 types)

```
content → anonymize → embed (voyage-multilingual-2) → store vector(1024) → hnsw index
                                                                          ↓
                                                               retrieval: cosine topK
```

- **Write triggers:** on INSERT/UPDATE of embedded columns, schedule an embedding job (async, fire-and-forget with retry queue)
- **Batch mode:** backfill existing rows via one-shot `embed-all.ts` script (similar pattern to `backfill-pii.ts`)
- **Deduplication:** same content should produce the same embedding — cache by `content_hash` (SHA-256 of normalized content) to avoid re-billing

---

## 5. Integration with Existing Services

Specific file:line insertion points from the Explore research:

### Legal Brief Pipeline (`services/legal-brief-pipeline.service.ts`)
- **Stage 1 (`runStage1`)** — after Perplexity call, before Claude: augment `caseData` user message with Type B (relevant articles) result. Injection ~line 442 (user message construction).
- **Stage 2 (`runStage2`)** — inject Type A (similar rejections) + Type C (successful appeals) results into `stage1Context` variable construction. Injection ~line 526.
- **Fallback behavior:** if retrieval returns <3 hits with similarity >0.7, mark as low-confidence and proceed with Perplexity-only (current behavior). Gracefully degrades.

### Knowledge Graph (`services/knowledge-graph.service.ts`)
- **`findSimilarCases()` (lines 138–192):** replace the attribute-equality algorithm with **hybrid** — attribute filter first (case_type, nationality), then vector rerank by `kg_nodes.properties->>'label'` + summary. Keep the current `PatternMatch[]` return shape (backward-compat).
- **Risk:** this function is consumed by Case Doc Generator (line 169). Wrap the new implementation behind a feature flag (`RAG_GRAPH_ENABLED`) so we can flip it off if quality regresses.

### Legal Copilot (`services/legal-copilot.service.ts`)
- **`buildWorkerLegalContext` (lines 54–129):** after structured context assembly, call `retrieveRelevantKBArticles(question, legalStatus, caseType, limit=3)` (Type B) and inject into the `ctx` object.
- **Honors existing safety prompt:** Copilot's strict "ONLY structured data" rule means retrieved articles must be treated as *context provided*, not as new facts. The Layer 3 safety rule "Do NOT invent facts" covers this naturally.

### Case Doc Generator (`services/case-doc-generator.service.ts`)
- **KB article retrieval (lines 149–162):** replace `ORDER BY category LIMIT 12` with vector-similarity top-12 on Type B. Biggest quality win per LOC.
- **Similar cases (line 169):** depends on Knowledge Graph upgrade.
- **Notebook semantic search (lines 178–186):** optional — swap chronological for semantic top-K. Non-blocking enhancement.

**All integration points are non-breaking if retrieval service falls back gracefully to existing logic when pgvector extension is missing or the embedding API is down.**

---

## 6. Bootstrap / Cold-Start Strategy

### Day 1 seed
| Type | Seed content | Count |
|---|---|---|
| B (articles) | All 12 existing `legal_knowledge` rows | 12 |
| A (rejections) | All 5 existing `rejection_analyses.rejection_text` | 5 |
| C (appeal templates) | **Apatris contributes** 10–20 anonymized real appeals from archive (even paper → transcribed) + 5–10 public Polish case-law exemplars | 15–30 |
| D (workers) | 26 workers with case data | 26 |

**Day 1 total index:** ~55–70 embedded rows. Useful for Types B and D; marginal for A; functional-but-thin for C.

### Quality trajectory (projected)

| Cases indexed | Type A quality | Type B quality | Type C quality | Type D quality | Lawyer's experience |
|---|---|---|---|---|---|
| 70 (day 1) | thin — 1–2 hits per query | solid | thin | solid | "System sometimes finds useful articles" |
| 100 | usable | solid | usable | solid | "System suggests articles, occasional case" |
| 500 (~6 mo) | **solid** | solid | **usable** | solid | "System is a genuine second opinion" |
| 1,000 (~12 mo) | strong | strong | **solid** | strong | "System catches things I'd miss" |
| 5,000 (~3 yr) | excellent | excellent | excellent | excellent | "Feels like a senior associate who has seen everything" |

### Fallback when retrieval is thin

Every retrieval function returns a `{ results, confidence, reason }` shape:
- `confidence === "high"` — ≥3 hits with similarity ≥0.7 → inject into Claude context
- `confidence === "low"` — <3 hits or max similarity <0.7 → log + pass empty to Claude + lean harder on Perplexity (Stage 1 already does this)
- `confidence === "none"` — no hits at all → log + skip retrieval block entirely

This matches the graceful degradation pattern already in Legal Brief Pipeline Stage 1 (when Perplexity is unavailable, confidence gets penalized by 0.15).

---

## 7. GDPR + Data Governance

Embedded content from `rejection_analyses`, `case_generated_docs`, and `workers` profiles will contain PII (PESEL, IBAN, worker names). The existing AES-256-GCM encryption pattern protects `pesel` / `iban` / `passport_number` at rest, but **does not protect embedding-subject text** which is typically longer-form case narrative.

### Two approaches evaluated

**Approach A — Anonymize-before-embed (recommended)**

```
rejection_text: "Pan Jan Kowalski (PESEL 85010112345) z Polski otrzymał decyzję..."
                                     ↓ anonymize
anonymized:     "[WORKER_NAME] ([PESEL]) z [NATIONALITY] otrzymał decyzję..."
                                     ↓ embed
vector(1024):   [0.12, -0.34, ...]
                                     ↓ store
db row:         { id, original_text_ref, anonymized_text, embedding, metadata }
```

On retrieval, join back to the original row via `original_text_ref` and apply existing `maskForRole(role)` before returning to the service. The embedding never contained PII to begin with.

- **Pros:** embedding index contains zero PII; safe if DB leaks; matches Apatris's existing defense-in-depth pattern
- **Cons:** embedding quality slightly reduced (names sometimes semantically matter in legal context; `"Pan Jan Kowalski"` vs `"[WORKER_NAME]"` loses a tiny bit of signal)
- **Implementation cost:** reuse + extend `sanitizePiiFromAuditText()` from `audit-log.ts` — it already knows PESEL + IBAN regex patterns; add name regex (NER-lite) and passport-number pattern

**Approach B — Embed full text + permission-gated retrieval**

- Embed the raw text (no anonymization)
- Retrieval endpoints enforce `tenant_id` + role-based access
- Encryption at rest on the text column (reuses existing pattern); embedding vector is NOT directly encrypted (vectors are numeric, don't leak like text)
- **Risk:** embedding-inversion attacks exist academically. Practical risk is low, but the pattern "embed plaintext PII" is hard to defend in a GDPR audit

### Recommendation: **Approach A** for `rejection_analyses`, `case_generated_docs`, `workers`. **Approach B** (no anonymization needed) for `legal_knowledge` — it's public-law content with no PII.

Existing `audit-log.ts::sanitizePiiFromAuditText` already handles PESEL + IBAN redaction. Extending to names + passport numbers is ~30 LOC of regex additions.

**Pre-launch checklist:**
- [ ] Draft a 1-page DPIA addendum covering vector embeddings + retrieval
- [ ] Verify the embedded rows join back correctly across `maskForRole` boundaries
- [ ] Audit: run a test that embeds 10 rejection texts and greps the stored `anonymized_text` for PESEL/IBAN/name patterns — expect zero matches
- [ ] Consider: for cross-tenant retrieval of "similar cases" (per existing `findSimilarCases` cross-tenant behavior with PII stripping), the anonymized text is already tenant-safe. Just preserve the existing `anonymized: true` flag pattern.

---

## 8. Effort Estimate (honest)

### Phase 1 — Infrastructure + embedding pipeline (1 week)
- `CREATE EXTENSION vector` + HNSW index DDL for 4 target tables (migration via init-db)
- `lib/embeddings.ts` — Voyage API wrapper (similar shape to `lib/claude-schema.ts`)
- `lib/embeddings.test.ts` — stubbed API + error handling tests
- `lib/pii-anonymize.ts` — extend existing `sanitizePiiFromAuditText` with name + passport regex
- `APATRIS_VOYAGE_API_KEY` added to Fly secrets (staging + prod)
- Background job: on INSERT/UPDATE of `legal_knowledge.content` / `rejection_analyses.rejection_text` / `case_generated_docs.content_pl`, enqueue embedding
- One-shot backfill script for existing rows (echoes `backfill-pii.ts` pattern)
- **Deliverable:** every insertable corpus column has embeddings; retrieval functions not yet written
- **Risk:** async job queue — Apatris doesn't have one yet. Options: inline (simplest), `pg-boss` (adds dep), Fly Machines (heavier). Inline is fine at current volume.

### Phase 2 — 4 retrieval types (1–2 weeks)
- `lib/rag.ts` — 4 functions: `retrieveSimilarRejections`, `retrieveRelevantArticles`, `retrieveAppealTemplates`, `retrieveSimilarWorkers`
- Each returns `{ results, confidence, reason }` shape
- `lib/rag.test.ts` — integration tests with fixture embeddings
- Seed Type C templates: work with you to anonymize + index 15–30 exemplars
- **Deliverable:** retrieval API is callable but no service wired

### Phase 3 — Service integration (2 weeks, one service at a time)
- Legal Brief Pipeline Stages 1 + 2 — inject Type A + B — deploy to staging — smoke replay
- Knowledge Graph `findSimilarCases` hybrid replacement — feature flag — staging smoke
- Legal Copilot context augmentation — staging smoke
- Case Doc Generator KB swap — staging smoke
- **Deliverable:** staging runs with RAG. Prod deploy is a separate gate.

### Phase 4 — Quality tuning (ongoing, months 2–6)
- Metrics: lawyer-accept rate on retrieved articles; false-positive rate on "similar rejection" suggestions; retrieval coverage (% of queries with high-confidence hits)
- Tuning levers: similarity threshold, top-K, hybrid weight (attribute filter vs vector), recency decay
- Re-embedding passes when we tune the embedding-subject construction (e.g., "embed title+content" vs "embed just content")
- Periodic: embed provider review (is voyage-law-2 Polish-ready yet?)

### Total calendar
- **Phase 1 + 2:** ~3 weeks engineering to first retrieval-backed staging smoke
- **Phase 3:** ~2 more weeks to full integration
- **Phase 4:** continuous; first real-data-driven iteration at month 2–3

### Honest risks (flagged)

1. **Cold-start period is 3–6 months of marginal Type A/C quality.** Don't over-promise day-1 appeal-template retrieval. Messaging: "The system starts useful and gets sharper every month."
2. **Embedding-provider lock-in.** If we switch from voyage-multilingual-2 to voyage-law-2 later, everything needs re-embedding. Cost is cheap but dev cycle is a few hours. Plan: normalize the embedding wrapper so swapping providers is one constant change.
3. **Retrieval relevance is never "done."** Unlike schema-enforced output, retrieval quality is a gradient. Need lawyer-feedback UI ("this suggestion was helpful / not helpful") to drive iteration.
4. **Maintenance burden.** New content must be embedded. If Voyage API is down, retrieval degrades. Need monitoring + retry queue.
5. **Vendor continuity.** Voyage is a smaller company than OpenAI/Anthropic/Cohere. Acquisition or pivot risk is non-zero. Mitigation: the `lib/embeddings.ts` wrapper should make provider swap a 1-file change.
6. **PII drift.** Even with anonymization, case narratives contain subtle identifiers ("the plumber from the Gdansk shipyard filed for TRC in December 2023 via WSO-III-..."). The regex anonymizer catches PESEL/IBAN but not domain-inference attacks. Treat retrieval as internal-tooling, never public-facing.
7. **Graph is empty.** `kg_nodes` at 0 rows was a surprise. If RAG depends on graph at all, the graph has to be populated first. Safer: make Types A/B/D independent of graph; use graph as optional boost for Type C when it exists.
8. **5,000-case archive is not realistically accessible.** The real leverage from 13 years of history is blocked behind digitization effort. Don't design the system to depend on that archive becoming available; design it to grow prospectively and surface value at 500 cases.

---

## Summary

- **Infra:** pgvector 0.8.0 available on Neon; one `CREATE EXTENSION` command away
- **Provider:** Voyage `voyage-multilingual-2` — strongest Polish + Anthropic-partner alignment + negligible cost
- **Retrieval types:** 4 distinct types, each with clear corpus + embedding subject + metadata; Type B (articles) is ready from day 1; Type C (appeal templates) is the cold-start bottleneck
- **Data reality:** 12 KB articles + 5 rejection analyses + 26 workers with case data = day-1 seed. Real quality curve starts at ~500 indexed cases (~6 months prospective growth)
- **GDPR:** anonymize-before-embed pattern, extending the existing `sanitizePiiFromAuditText` pattern
- **Integration:** 4 insertion points identified; all non-breaking with graceful fallback
- **Effort:** ~5 weeks to staging-wide integration; ongoing tuning thereafter

**Recommended next step:** Sub-phase 1G-2 Phase 1 only — stand up the infrastructure (pgvector, embedding wrapper, backfill script) with no service wired. Same pattern as 1F-1 Phase 1 with the apatris-identity module: ship the foundation, prove it in isolation, integrate incrementally.

---

*Investigation complete. No code changes. File uncommitted. Prod v291 / staging v15 untouched.*
