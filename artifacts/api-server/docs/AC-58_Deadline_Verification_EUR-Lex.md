# AC-58 Deadline + Annex III Verification — Path 1 (EUR-Lex Primary Source Check)

**Date:** Day 32, 2026-05-18 (Monday)
**Purpose:** Verify the two AC-58 URGENT framing claims against EU AI Act Regulation (EU) 2024/1689 primary text:
1. "2 August 2026" enforcement deadline for high-risk employment AI
2. APATRIS AI features classify as high-risk under Annex III

**Triggering prompt:** Manish read-only check (Day 32) — "Where does Aug 2 2026 come from in AC-58? Is it (a) verified from EU AI Act official text + Polish transposition, (b) inferred from web research, or (c) operator-supplied framing?"

---

## Source verification

### EUR-Lex primary source attempted

| URL | Status | Notes |
|---|---|---|
| https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689 | **BLOCKED — empty content** | WebFetch returned no extractable text |
| https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng | **BLOCKED — empty content** | WebFetch returned no extractable text |

EUR-Lex did not yield primary text via WebFetch on 2026-05-18.

### Secondary source used (cross-reference of EUR-Lex)

| URL | Status | Notes |
|---|---|---|
| https://artificialintelligenceact.eu/article/113/ | **FETCHED — verbatim quoted** | Third-party law database that cross-references EUR-Lex; same publisher as the staffing-businesses summary cited in AC-55 Phase 3 |
| https://artificialintelligenceact.eu/annex/3/ | **FETCHED — verbatim quoted** | Same publisher |

**Caveat for SaaS-grade decisions:** verbatim text below is from artificialintelligenceact.eu cross-reference, NOT direct EUR-Lex extraction. Yulia must confirm against EUR-Lex (or equivalent official source) before Phase B Wave 1 commitments lock. This is an upgrade vs AC-55 Phase 3 sources (which only paraphrased the date) but not the EUR-Lex primary text the Phase 3 anti-hallucination caveat called for.

---

## Article 113 — Entry into Force and Application (verbatim)

Source: https://artificialintelligenceact.eu/article/113/ (fetched 2026-05-18)

> "This Regulation shall enter into force on the twentieth day following that of its publication in the Official Journal of the European Union."
>
> "It shall apply from 2 August 2026.
>
> However:
>
> (a) Chapters I and II shall apply from 2 February 2025;
>
> (b) Chapter III Section 4, Chapter V, Chapter VII and Chapter XII and Article 78 shall apply from 2 August 2025, with the exception of Article 101;
>
> (c) Article 6(1) and the corresponding obligations in this Regulation shall apply from 2 August 2027."

---

## Annex III Point 4 — Employment, Workers' Management and Access to Self-Employment (verbatim)

Source: https://artificialintelligenceact.eu/annex/3/ (fetched 2026-05-18)

> **(a)** "AI systems intended to be used for the recruitment or selection of natural persons, in particular to place targeted job advertisements, to analyse and filter job applications, and to evaluate candidates"
>
> **(b)** "AI systems intended to be used to make decisions affecting terms of work-related relationships, the promotion or termination of work-related contractual relationships, to allocate tasks based on individual behaviour or personal traits or characteristics or to monitor and evaluate the performance and behaviour of persons in such relationships."

---

## Deadline finding

| Claim | Status | Evidence |
|---|---|---|
| "Aug 2 2026 = enforcement cutoff for APATRIS high-risk AI" | **CONFIRMED with refinement** | Article 113 default application date is 2 August 2026 for Annex III high-risk AI (Article 6(2) auto-classification path). APATRIS employment AI falls under Annex III Point 4, so 2 August 2026 holds. |
| "Article 6 + Annex III enforce 2 August 2026" | **PARTIAL — needs disambiguation** | Article 6(1) (AI as safety component of products under Annex I) shifts to **2 August 2027** per Article 113(c). Article 6(2) (Annex III auto-classification path — the APATRIS path) follows the default 2 August 2026. AC-58 framing conflated Article 6(1) + Article 6(2). |

**Refined enforcement timeline for APATRIS:**

| Date | Provisions enforced | APATRIS-relevant? |
|---|---|---|
| 2 Feb 2025 (passed) | Chapters I + II | Yes (already-effective definitions + prohibited practices) |
| 2 Aug 2025 (passed) | Chapter III Section 4 (GPAI rules) + Chapters V, VII, XII + Article 78 (except Article 101) | GPAI = General Purpose AI Models (e.g., Claude itself) — relevant for APATRIS as deployer of Claude |
| **2 Aug 2026** | **Default application — full Annex III high-risk obligations** | **YES — APATRIS Annex III Point 4 employment AI obligations enforce here** |
| 2 Aug 2027 | Article 6(1) + corresponding obligations (Annex I product-safety-component AI) | NO — APATRIS does not ship products with embedded AI safety components |

**Verdict:** AC-58 URGENT deadline framing **HOLDS** for APATRIS-relevant employment AI. The 11-week window to 2 August 2026 stands.

---

## Annex III classification finding (pre-Yulia mapping)

Mapping the 30 AI-call-site files from AC-58 Phase A audit (Scope b) against Annex III Point 4 verbatim text.

**Mapping discipline:** sub-point (a) = recruitment/selection AI; sub-point (b) = decisions on terms/promotion/termination/task-allocation/monitoring of existing work relationships.

| AI feature (file) | Annex III Point 4 sub-point | Classification verdict | Reasoning |
|---|---|---|---|
| `routes/matching.ts` | **4(a)** | **CLEARLY high-risk** | Worker-to-job placement = "selection of natural persons" + "evaluate candidates" |
| `routes/contract-gen.ts` | **4(b)** | **CLEARLY high-risk** | Generates employment contracts = "decisions affecting terms of work-related relationships" |
| `routes/salary.ts` | **4(b)** | **CLEARLY high-risk** | Rate decisions = "decisions affecting terms of work-related relationships" |
| `routes/careers.ts` | **4(a)** or **4(b)** | **AMBIGUOUS — Yulia gate** | Depends on whether decisions are recruitment-facing (4a) or worker-facing career-progression (4b) |
| `routes/regulatory.ts` / `services/regulatory-classification.ts` / `services/regulatory-review.ts` | **4(b)** likely | **AMBIGUOUS — Yulia gate** | Worker compliance decisions — depends on whether they directly affect contractual outcomes vs inform operator action |
| `services/legal-copilot.ts` / `services/legal-answer.ts` / `services/legal-brief-pipeline.ts` | possibly **4(b)** | **AMBIGUOUS — Yulia gate** | Operator-facing AI advice; high-risk only if outputs directly determine worker outcomes (Recital 6 of the Regulation likely informs this; verify with Yulia) |
| `services/document-intelligence.ts` / `routes/document-intake.ts` | possibly **4(b)** | **AMBIGUOUS — Yulia gate** | Document decisions affecting worker status (e.g., document validity → permit decision) may trigger 4(b) |
| `routes/immigration.ts` / `routes/trc-service.ts` | possibly **4(b)** | **AMBIGUOUS — Yulia gate** | Immigration outcomes affect work-permit ability; depends on whether APATRIS AI decides vs informs |
| `routes/safety.ts` | possibly **4(b)** | **AMBIGUOUS — Yulia gate** | If worker-safety decisions affect contractual outcomes (suspension/termination) = 4(b); if pure ops = not |
| `routes/skills-gap.ts` | possibly **4(b)** | **AMBIGUOUS — Yulia gate** | If outputs drive training/promotion decisions = 4(b); if pure analysis = not |
| `routes/worker-email.ts` | possibly **4(b)** | **AMBIGUOUS — Yulia gate** | Depends on content — AI-generated disciplinary or terms-changing emails would be 4(b) |
| `routes/translate.ts` | **none** | **CLEARLY NOT high-risk** | Pure translation utility |
| `routes/ai-copilot.ts` | **none** | **CLEARLY NOT high-risk** | Operator chat, no worker-affecting decisions |
| `routes/legal-kb.ts` | **none** | **CLEARLY NOT high-risk** | Knowledge retrieval |
| `routes/system-test.ts` | **none** | **CLEARLY NOT high-risk** | Testing infrastructure |
| `routes/signals.ts` | **none** likely | **AMBIGUOUS — Yulia gate** | Depends on what signals drive |
| `routes/competitors.ts` | **none** | **CLEARLY NOT high-risk** | Market intelligence, not worker-affecting |
| `routes/analytics.ts` | **none** likely | **AMBIGUOUS — Yulia gate** | Aggregate reporting on workers — Recital 36 may treat aggregate analysis differently than per-worker |
| `routes/frameworks.ts` | **none** likely | **CLEARLY NOT high-risk** | Framework selection for operators |
| `routes/intelligence-feed.ts` | **none** | **CLEARLY NOT high-risk** | Intelligence feed |
| `routes/public-verify.ts` | **none** | **CLEARLY NOT high-risk** | Public verification |
| `routes/workers.ts` | depends on call site | **AMBIGUOUS — Yulia gate** | Multiple call sites; need per-callsite audit |
| `services/legal-intelligence.service.ts` | possibly **4(b)** | **AMBIGUOUS — Yulia gate** | Depends on whether outputs drive worker decisions |
| `services/ai-provider.ts` (+ AC-52 drift `services/ai/provider.ts`) | **none** (substrate) | **N/A** | Provider abstraction — classification belongs to call sites |
| `lib/bilingual.ts` / `lib/complianceAI.ts` / `lib/claude-schema.ts` / `lib/whatsapp.ts` / `lib/init-db.ts` | **none** likely | **AMBIGUOUS — Yulia gate** | Library functions; depends on consuming call site |

**Summary counts (pre-Yulia best-effort):**
- **CLEARLY high-risk: 3 files** (matching / contract-gen / salary)
- **AMBIGUOUS (Yulia gate): ~13 files** (careers / regulatory cluster / legal cluster / document cluster / immigration cluster / safety / skills-gap / worker-email / signals / analytics / workers / legal-intelligence / lib substrate)
- **CLEARLY NOT high-risk: ~9 files** (translate / ai-copilot / legal-kb / system-test / competitors / frameworks / intelligence-feed / public-verify / ai-provider substrate)

**Yulia-gate items:** 13 ambiguous files require legal interpretation — does the AI directly decide or only inform? Recital 6 + Recital 36 of the Regulation likely inform this distinction; Yulia confirms.

**Comparison vs AC-58 Phase A audit pre-Yulia classification:** Audit Scope (b) estimated "likely 15-20 sites trigger Annex III." Verification refines this to **3 CLEARLY high-risk + up to 13 ambiguous = potentially 16 total high-risk** if Yulia confirms all ambiguous as high-risk. Range 3-16 aligns with the original 15-20 estimate floor; ceiling is slightly lower than audit estimate.

---

## Impact on AC-58 URGENT framing

| Question | Verdict |
|---|---|
| Is "2 August 2026" the correct deadline for APATRIS-relevant high-risk AI? | **CONFIRMED** (with Article 6(1) vs 6(2) disambiguation refinement) |
| Does APATRIS have high-risk AI features triggering Annex III Point 4? | **CONFIRMED** (at minimum 3 features clearly trigger; up to 16 if Yulia confirms ambiguous) |
| **AC-58 URGENT framing: HOLDS / RE-RATE / WITHDRAW?** | **HOLDS** — URGENT priority is justified for the CLEARLY high-risk subset (matching / contract-gen / salary) regardless of Yulia ambiguous-classification outcome |

### Recommended action

**Proceed with 7 architect decisions worksheet (commit `be94e00`)** — the URGENT framing holds; Manish decisions remain valid. No re-scope needed.

**One refinement to surface in Yulia session:** add to Yulia item 1 (Annex III classification) the explicit ask to verify Article 113 text matches EUR-Lex official source (closes the EUR-Lex-direct-blocked verification gap from this audit). This is item 1.a sub-question, not a new item.

**Minor refinement to AC-58 Phase A audit Scope (b) pre-Yulia table:** the verification-classified breakdown (3 CLEARLY / 13 AMBIGUOUS / 9 CLEARLY NOT) is more honest than the audit's "likely 15-20" estimate. Update AC-58 Phase A audit OR carry the verification doc as the canonical pre-Yulia mapping (recommendation: carry this verification doc forward; audit's estimate stays as historical).

---

## Sources

**Secondary (cited verbatim above):**
- [Article 113 verbatim text](https://artificialintelligenceact.eu/article/113/) — fetched 2026-05-18
- [Annex III Point 4 verbatim text](https://artificialintelligenceact.eu/annex/3/) — fetched 2026-05-18
- [Web search triangulation](https://www.kennedyslaw.com/en/thought-leadership/article/2026/the-eu-ai-act-implementation-timeline-understanding-the-next-deadline-for-compliance/) + [White & Case LLP analysis](https://www.whitecase.com/insight-alert/long-awaited-eu-ai-act-becomes-law-after-publication-eus-official-journal) — same Article 113 dates corroborated

**Primary (attempted, BLOCKED):**
- EUR-Lex CELEX:32024R1689 — both URL formats returned empty content via WebFetch on 2026-05-18. Yulia must verify against EUR-Lex directly OR Polish official translation.

**Polish transposition status:** NOT INVESTIGATED in this verification pass. EU regulations are directly applicable in member states (do not require national transposition the way directives do), but Polish authorities (Prezes UODO / President of Personal Data Protection Office) may publish supplementary guidance. Yulia confirms Polish-side enforcement landscape.

---

## Anti-hallucination disclosure

- **Article 113 + Annex III Point 4 verbatim quotes** are from artificialintelligenceact.eu (secondary), NOT EUR-Lex direct. Triangulated against 2 additional law-firm analyses (Kennedys + White & Case) that cite the same dates. Confidence: high on the verbatim text accuracy.
- **EUR-Lex BLOCKED** — could not extract from primary source via WebFetch today. This is an environmental constraint, not a content claim. Yulia confirms against EUR-Lex directly.
- **APATRIS feature classification** — pre-Yulia best-effort. 13 ambiguous items explicitly flagged. Recital 6 + Recital 36 interpretations not deep-fetched (would need separate verification).
- **Article 6(1) vs 6(2) refinement** — derived from Article 113(c) text + secondary-source explanation. Manish should ask Yulia to confirm APATRIS uses fall under Article 6(2) (Annex III auto-classification) not Article 6(1) (Annex I product-safety-component AI). Likely YES (APATRIS = SaaS not embedded AI in regulated products) but worth Yulia confirmation.
- **Polish transposition / national supplementary measures** not investigated.

---

## Status

- **AC-58 URGENT framing: HOLDS** for Article 6(2) Annex III high-risk path (the APATRIS path)
- **Article 6(1) vs 6(2) disambiguation:** refinement, not invalidation — APATRIS is Article 6(2)
- **EUR-Lex direct verification: BLOCKED** — secondary triangulation strong; Yulia confirms primary
- **7 architect decisions worksheet (commit `be94e00`): proceeds as-is**
- **Yulia session item 1 (Annex III classification):** add sub-question to verify Article 113 vs EUR-Lex official text
