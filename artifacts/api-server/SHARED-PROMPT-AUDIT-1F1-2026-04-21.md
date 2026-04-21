# Shared System Prompt — Investigation & Design (1F-1, 2026-04-21)

Read-only audit + design proposal. Goal: decide whether to unify the 19 hardcoded system prompts scattered across AI services into a single layered `getApatrisSystemPrompt()` module.

**Headline:** there is strong drift in tone/safety language across the 19 prompts. A shared identity + safety layer would meaningfully reduce drift and would be low-risk to adopt incrementally, but it will **not** reduce total tokens — the value is consistency, not cost.

---

## 1. All System Prompts Inventoried

19 distinct prompts across 14 service files + 2 route files. Five are schema-enforced (tool_use); 14 still use raw fetch + JSON.parse in the callers. Corrections vs prior audits: `authority-response.service.ts` has **zero AI calls** (verified; rule-based only).

| # | File:line | Purpose | Tool | LLM | Approx tokens |
|---|---|---|---|---|---|
| 1 | `services/legal-intelligence.service.ts:119` | Case research analysis | raw fetch | Claude | ~75 |
| 2 | `services/legal-intelligence.service.ts:174` | Appeal grounds analysis | raw fetch | Claude | ~50 |
| 3 | `services/legal-intelligence.service.ts:197` | Polish appeal draft (PROJEKT) | raw fetch | Claude | ~45 |
| 4 | `services/legal-intelligence.service.ts:204` | PL→EN appeal translation | raw fetch | Claude | ~40 |
| 5 | `services/legal-intelligence.service.ts:273` | Authority letter draft | raw fetch | Claude | ~40 |
| 6 | `services/legal-intelligence.service.ts:305` | Legal reasoning explainer | raw fetch | Claude | ~35 |
| 7 | `services/legal-brief-pipeline.service.ts:437` | Stage 1 — Research | **tool_use** | Claude | ~180 |
| 8 | `services/legal-brief-pipeline.service.ts:513` | Stage 2 — Case Review | **tool_use** | Claude | ~220 |
| 9 | `services/legal-brief-pipeline.service.ts:620` | Stage 3 — Validation | **tool_use** | Claude | ~200 |
| 10 | `services/legal-brief-pipeline.service.ts:790` | Stage 5 — Worker explanation (tone-calibrated) | **tool_use** | Claude | ~150 |
| 11 | `services/legal-brief-pipeline.service.ts:840` | Stage 6 — PL→EN translation | **tool_use** | Claude | ~140 |
| 12 | `services/case-doc-generator.service.ts:229` | Polish doc generation | raw SDK | Claude | ~120 |
| 13 | `services/case-doc-generator.service.ts:238` | English doc generation | raw SDK | Claude | ~100 |
| 14 | `services/legal-copilot.service.ts:194` | Worker-scoped Q&A copilot | raw fetch | Claude | ~450 |
| 15 | `services/rejection-intelligence.service.ts:238` | Rejection triage (on unclear) | raw fetch | Claude | ~200 |
| 16 | `services/intelligence-router.service.ts:88` | Tier 2 routing (Perplexity) | raw fetch | Perplexity | ~80 |
| 17 | `services/intelligence-router.service.ts:133` | Tier 3 routing (Claude synth) | raw SDK | Claude | ~110 |
| 18 | `services/regulatory-extraction.service.ts:51` | Extract regulation metadata | raw fetch | Claude | ~180 |
| 19 | `services/regulatory-classification.service.ts:133` | Classify regulation relevance | raw fetch | Claude | ~140 |
| 20 | `services/case-intelligence.service.ts:253` | Case-intelligence appeal drafter | raw fetch | Claude | ~160 |
| 21 | `routes/translate.ts:88` | Multi-language translate | raw SDK | Claude | ~50 |
| 22 | `routes/contract-gen.ts:62` | Contract clause generation | raw SDK | Claude | ~100 |

**Total prompt tokens across all services:** ~2865 tokens. Average per prompt: ~130 tokens. Longest: Legal Copilot (~450). Shortest: translate.ts (~50).

---

## 2. Per-Prompt Attribute Extraction (Summary Table)

The full per-prompt attribute table is in the Explore research notes (identity / domain / output-format / safety / tone). Key observations:

| Attribute | Dominant phrase | Appears in |
|---|---|---|
| **Identity framing** | "Polish immigration lawyer" / "immigration law analyst" / "expert" | 11 of 22 prompts |
| **Domain scoping** | "Polish immigration law" / "Ustawa o cudzoziemcach" | 15 of 22 |
| **Safety: DRAFT** | "DRAFT only" / "PROJEKT only" / "draft for lawyer review" | 7 of 22 (with lexical drift) |
| **Safety: no invention** | "Do NOT invent facts" / "Do NOT invent articles" | 5 of 22 |
| **Safety: snapshot is truth** | "Do NOT override snapshot" / "Use ONLY provided data" | 4 of 22 |
| **Safety: no guarantees** | "Never guarantee outcomes" / "Never guarantee success" | 2 of 22 |
| **Output format: JSON** | "Return ONLY valid JSON" | 7 of 22 (15 pre-1C-1.5) |
| **Tone: professional** | "professional" / "formal" | 8 of 22 |

---

## 3. Common Patterns — Appear in 10+ Prompts

These are candidates for the shared base:

1. **Apatris legal-assistant identity.** Variants like "Polish immigration lawyer", "immigration law analyst", "legal assistant", "legal expert" appear in ≥15 of 22 prompts. Lexical drift: "analyst" vs "assistant" vs "expert" is not meaningful — they're all the same role.

2. **Polish immigration law domain context.** Ustawa o cudzoziemcach, KPA, Art. 108, TRC, voivodeship, UdSC — these tokens appear in ≥15 prompts in various combinations. Often a service names only the subset relevant to it, inconsistently.

3. **"Output requires lawyer review".** Stated as "DRAFT only", "PROJEKT only", "for lawyer review", "internal use only", "requires lawyer review" in ≥10 prompts. Same intent, five different phrasings. Some prompts omit it entirely despite producing outputs that absolutely require review (e.g., rejection-intelligence triage).

4. **"Don't invent / don't guarantee / use only provided data".** Five variants across 10+ prompts. Semantically identical but drifted in wording. Some say "Do NOT invent facts"; others "Do NOT invent article numbers"; others "Use only articles from research provided"; some combine multiple.

5. **Citation style expectation.** Several prompts say "cite specific Polish law articles" or "Always cite: article number, full law name, and relevant paragraphs". Not consistently stated across prompts that should cite.

---

## 4. Variant Patterns — Appear in 5–10 Prompts

1. **Schema-enforced JSON output.** 5 prompts (Legal Brief Pipeline) use `tool_use`; rest use "Return ONLY valid JSON" as a directive. Post-1C-1.5 we should standardize on tool_use for JSON services.
2. **"Never guarantee outcomes".** 2 prompts state it explicitly; 10+ should. Gap.
3. **Language policy.** 3 prompts explicitly handle bilingual output (copilot, translate, some in legal-brief); rest are implicit.
4. **Authority-structure references.** Wojewoda/UdSC/Szef UdSC appear in 6 prompts unevenly.

---

## 5. Unique Per-Service Patterns (Stay Per-Service)

These are NOT candidates for shared — they're stage/service-specific and should remain inline:

1. **Stage 5 tone-calibration map** (MISSING_DOCS→REASSURING, FORMAL_DEFECT→CALM, etc.) — specific to worker explanation by rejection category.
2. **Stage 5 "no legal jargon" rules** — explicit bans on Art. 108, KPA, voivodeship, TRC strings. Only applies to worker-facing communication.
3. **Stage 5 first-name addressing** — "Address the worker by first name" is worker-UX specific.
4. **Stage 3 validator mode** — "Do NOT generate new legal reasoning. ONLY validate." This is a validator-specific suppression of the generate-mode default.
5. **Stage 6 translation preservation rules** — "PRESERVE all legal meaning", "Do NOT add or remove arguments". Translator-specific.
6. **Legal Copilot's data-only constraint** — stricter than other services; copilot must refuse to answer what's not in the provided data.
7. **Contract-gen clause structure** — explicit list of required fields (preamble, scopeOfWork, paymentTerms, obligations, termination, rodoClause, zusClause).
8. **Regulatory classification enums** — specific severity + updateType enums bound to compliance semantics.
9. **MOS package employer constants** — Apatris Sp. z o.o. NIP 5252828706. Specific to the company, not a generic shared identity.
10. **Case-doc stage→article mapping** — hardcoded article lists per stage (NEW→Art. 108+87, REJECTED→Art. 127+129§2+KPA 7/77/80/107§3 etc.).

**Takeaway:** keep audience-specific tone profiles (worker vs lawyer vs validator vs translator) as parameterized inputs to the shared builder, not as fully-per-service blobs.

---

## 6. Proposed Shared Module Architecture

### File location
`artifacts/api-server/src/lib/apatris-identity.ts`

### Signature
```ts
export type ApatrisAudience =
  | "lawyer"       // precise legal language, full citations, dense
  | "worker"       // plain language, no jargon, first-name address
  | "validator"    // validation-only, no new reasoning
  | "translator"   // preserve meaning + article refs
  | "auditor"      // compliance/audit stance, conservative on severity
  | "classifier";  // short-form triage, enum outputs

export type ApatrisLanguage = "pl" | "en" | "bilingual";

export type ApatrisTone =
  | "neutral" | "formal-legal" | "reassuring"
  | "calm" | "moderate" | "careful";

export interface ApatrisPromptOpts {
  audience: ApatrisAudience;
  language?: ApatrisLanguage;             // default: en for services, bilingual for copilot
  tone?: ApatrisTone;                     // default: depends on audience
  serviceContext?: string;                // per-service task-specific text
  includeDomainContext?: boolean;         // default: true (turn off for translators)
  omitSafetyRules?: boolean;              // default: false (NEVER omit in production; only for specialized pipelines)
}

export function getApatrisSystemPrompt(opts: ApatrisPromptOpts): string;
```

### Layered structure (composed at runtime)

```
╔══════════════════════════════════════════════════════════════╗
║ Layer 1: Apatris Identity (~40 tokens)                       ║
║ "You are Apatris — a Polish-law compliance assistant…"       ║
╠══════════════════════════════════════════════════════════════╣
║ Layer 2: Domain Context (~90 tokens)          [optional]     ║
║ "Polish immigration + labour law (2026): Ustawa o            ║
║  cudzoziemcach, KPA, Art. 108 (TRC continuity), Wojewoda,    ║
║  Szef UdSC. Sources: isap/cudzoziemcy/udsc…"                 ║
╠══════════════════════════════════════════════════════════════╣
║ Layer 3: Safety Rules (~80 tokens)            [never omit]   ║
║ - Use ONLY provided data; do NOT invent                      ║
║ - Do NOT override Legal Snapshot                             ║
║ - Never guarantee outcomes                                   ║
║ - Mark drafts PROJEKT/DRAFT                                  ║
║ - If uncertain, say so; do not guess                         ║
║ - All output requires lawyer review                          ║
╠══════════════════════════════════════════════════════════════╣
║ Layer 4: Audience Directive (~40 tokens)                     ║
║ lawyer | worker | validator | translator | auditor | classifier ║
╠══════════════════════════════════════════════════════════════╣
║ Layer 5: Language + Tone (~20 tokens)                        ║
║ pl | en | bilingual  ×  tone profile                         ║
╠══════════════════════════════════════════════════════════════╣
║ Layer 6: Service-Specific Context (~50 tokens, varies)       ║
║ Injected by caller — task instructions, schema hints, etc.   ║
╚══════════════════════════════════════════════════════════════╝
```

### Example Layer 1 + 2 + 3 (the base every prompt gets)

```
You are Apatris — a Polish-law compliance assistant used by a staffing
agency managing 200+ foreign workers. Your output informs lawyer
decisions; it never replaces them.

DOMAIN — Polish immigration + labour law (2026):
- Primary instruments: Ustawa o cudzoziemcach, Kodeks postępowania
  administracyjnego (KPA)
- Key provisions: Art. 108 (TRC continuity), Art. 127/138 KPA (appeals),
  Art. 64 §2 KPA (formal defects)
- Authorities: Wojewoda (voivode), Szef UdSC, voivodeship offices
- Sources: isap.sejm.gov.pl, cudzoziemcy.gov.pl, udsc.gov.pl
- Focus areas: MOS 2026 electronic filing, posted workers / A1,
  Ukrainian specustawa, ZUS registration, work-permit types A/B/C.

SAFETY RULES — apply to every output:
1. Use ONLY data provided in the request. Do NOT invent facts, cases,
   or article numbers.
2. Do NOT override the Legal Snapshot when provided — it is authoritative.
3. Never guarantee outcomes, success rates, or percentages.
4. Mark legal document drafts "PROJEKT" (Polish) or "DRAFT" (English).
5. When uncertain, say "uncertain" — do not guess.
6. Every output requires human lawyer review before client delivery.
```

### Audience directives (Layer 4 sketches)

- **lawyer:** precise legal language, full citations (article number + statute name + paragraph), dense over hand-holding
- **worker:** plain language, NO Art./KPA/voivodeship jargon, short paragraphs (2–3 sentences), address by first name, no promises
- **validator:** NO new legal reasoning; only flag inconsistencies between claims and ground truth
- **translator:** PRESERVE all legal meaning, article references, and structure; do NOT add or remove arguments
- **auditor:** conservative on severity; err toward requires-review over auto-approve
- **classifier:** short-form, enum-output, confidence-scored; no prose

---

## 7. Token Impact — Before vs After

### Per-call estimate

| Component | Before (avg) | After (shared) |
|---|---|---|
| Per-prompt identity/domain/safety boilerplate | ~130 tokens (scattered + drifted) | ~210 tokens (Layer 1+2+3 always) |
| Audience directive | ~15 tokens (sometimes) | ~40 tokens (Layer 4) |
| Language/tone | ~10 tokens (sometimes) | ~20 tokens (Layer 5) |
| Service-specific task | ~50 tokens | ~50 tokens (Layer 6 — unchanged) |
| **Total** | **~205 tokens** | **~320 tokens** |
| **Delta per call** | — | **+115 tokens** |

### Aggregate (conservative 50 Claude calls/tenant/hour max)

- 50 calls × 115 tokens = **+5,750 tokens/hour/tenant** of system prompt
- At Claude Sonnet pricing (~$3/Mtoken input), ≈$0.017/hr/tenant
- For 10 tenants: ~$4/month

**Cost impact: negligible.** The consolidation is a consistency + governance play, not a cost play. Don't sell it as "saves tokens" — it doesn't.

### Indirect savings
The **removal** of duplicated safety rules from service-specific contexts (Layer 6 becomes truly task-only) will shrink per-service prompts by ~70 tokens each. Net of +115 / –70 = **+45 tokens per call**. Still a slight increase, still negligible at scale.

### Real value (non-token)
- **Zero lexical drift.** "DRAFT only" vs "PROJEKT only" vs "draft for lawyer review" all become one phrase.
- **One place to edit** when safety rules need strengthening (e.g., "never quote costs" could be added centrally).
- **Auditable.** A compliance reviewer can read `apatris-identity.ts` once and know what every AI response is constrained by.
- **Testable.** A single unit test can assert: every prompt built via `getApatrisSystemPrompt()` contains "Do NOT invent facts" and "DRAFT only".

---

## 8. Risks + Mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Refusal dilution.** Services that had *stricter* custom safety rules (e.g., Legal Copilot's "ONLY structured data, do NOT make conclusions") inherit a weaker generic base. | Medium | Keep stricter per-service rules in Layer 6 (`serviceContext`). Don't remove them when migrating. |
| 2 | **Tone regression on worker-facing output.** Stage 5's tone-by-rejection-category map is nuanced. If we flatten it into audience=worker + tone=reassuring, we may lose the calibration. | Medium | Keep the tone-calibration map inside Layer 6 (Stage 5's `serviceContext` stays detailed). Audience=worker only sets the "plain language" base; tone stays per-category. |
| 3 | **Blast radius on edits.** A change to shared safety rules affects all 19 services simultaneously. | Medium-High | Every edit to `apatris-identity.ts` must go through: (a) unit tests asserting key phrases present per audience, (b) re-run the staging smoke (the Legal Brief end-to-end) before merge, (c) commit message must list which audiences/outputs change. |
| 4 | **Claude may ignore repeated instructions.** Layer 3 + per-service safety may overlap; Claude could de-prioritize. | Low-Medium | Test empirically: run the staging smoke replay after each migration and check Stage 3 validation still catches hallucinations. If validation weakens, strengthen Layer 3 or keep per-service. |
| 5 | **Token cost increase.** +45 tokens/call avg × many calls. | Low | Negligible at current + projected volume. Re-evaluate if we hit 500+ calls/hour/tenant. |
| 6 | **Language-mixing bugs.** If `language: "pl"` is set but `tone: "formal-legal"` produces English output, we have a contradiction. | Low | Unit tests verify each audience × language × tone combo produces a coherent prompt (no contradicting instructions). |
| 7 | **Per-service prompts drift back.** After migration, devs may add one-off safety rules in service code instead of Layer 3. | Medium | Lint rule (eslint-plugin-custom) OR a test that greps all `system:` usages and ensures they call `getApatrisSystemPrompt()`. |
| 8 | **"Apatris" branding in prompts.** If we ever sell this code to another staffing agency (EEJ, etc.), "Apatris" in the identity is wrong. | Low | Parameterize company name via environment var or a config constant; default to "Apatris" for this deployment. |

---

## 9. Proposed Execution Plan

Four-phase rollout. Stop for user approval between each phase.

### Phase 1 — Build the shared module + unit tests (no service migrations yet)
- Create `lib/apatris-identity.ts` with `getApatrisSystemPrompt()` and the 6-layer composer
- Unit tests in `lib/apatris-identity.test.ts`:
  - Every audience × language × tone combination produces a non-empty, non-contradicting string
  - Every output contains core safety phrases ("Do NOT invent", "requires lawyer review")
  - Service-context interpolation works
- **No behavior change on any existing service.** The module sits unused until Phase 2.
- **Effort:** ~150 LOC module + ~120 LOC tests = 1 small PR

### Phase 2 — Migrate Legal Brief Pipeline (5 stages) as the pilot
- Stage 1 → 2 → 3 → 5 → 6, one at a time
- After each stage, re-run the staging smoke replay and confirm:
  - Pipeline still completes / halts at the same point (no regression)
  - Stage 3 validation still catches the same hallucination patterns
- Preserve Stage 5's tone-calibration map in `serviceContext`
- **Effort:** ~5 commits, one per stage; ~80 LOC touched per stage
- **Risk gate:** if Stage 3 validation weakens, stop and revisit Layer 3

### Phase 3 — Migrate other high-value services
- Legal Copilot (preserve strict data-only rule in `serviceContext`)
- Legal Intelligence (5 prompts — research, appeal, POA, authority-letter, reasoning)
- Intelligence Router Tier 2 (Perplexity prompt) + Tier 3 (Claude)
- Case Doc Generator (PL + EN; stage-article map stays in `serviceContext`)
- **Effort:** ~8 commits

### Phase 4 — Lower-risk services + cleanup
- Rejection Intelligence AI fallback
- Regulatory Extraction + Classification
- Contract Gen
- Translate route
- Cleanup pass: remove duplicated safety language now living in `serviceContext` Layer 6

### What to ship first
**Recommended start:** Phase 1 only. Build the module; don't wire anything. This gives you a chance to review the shared prompt content before a single service depends on it.

### What to defer
- Tightening Layer 3 safety rules (e.g., "never quote costs") — do after migrations complete so we're editing one place, not 19
- Adding new audience types (e.g., `auditor-external` for clients) — defer until a concrete use case arrives
- Multi-tenant / multi-company identity — defer until a second agency onboards

---

## Out of scope for this investigation

- Per-service prompt tuning (e.g., Stage 2's 8-task list wording). That's a separate quality pass.
- Prompt caching (Anthropic has a prompt-caching beta that rewards stable shared prefixes — could magnify savings from shared layers). Worth revisiting post-migration.
- Localization of safety rules into Polish (currently all English). Depends on whether worker-facing outputs should be prompt-driven in Polish.
- Automatic prompt regression testing against a corpus of known-good outputs (would complement unit tests).

---

*Investigation complete. No code changes. File uncommitted. Prod v291 / staging v15 untouched.*
