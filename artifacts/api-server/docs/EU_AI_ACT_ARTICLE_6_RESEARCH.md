# EU AI ACT ARTICLE 6 CONFORMITY RESEARCH

## Frame

This document captures research findings on EU AI Act Article 6 conformity for the APATRIS legal intelligence platform. The research was conducted by APATRIS Claude on 2026-04-26 against authoritative sources including Regulation (EU) 2024/1689 and Polish implementing legislation in draft.

This is research, not legal advice. The findings inform review by qualified legal counsel, who hold final authority on compliance interpretation. APATRIS Claude is not a lawyer. The load-bearing classification verdict in Section 5 is rated ESTIMATE-medium and requires counsel confirmation before any Layer 0 v1 build proceeds.

This document satisfies the EU AI Act Article 6 Pre-Build Gate named in LAYER_0_DESIGN.md Section 7. Layer 0 v1 build cannot proceed until counsel review of the seven specific questions in Section 13 is complete.

## Companion Documents

This research document references companion documents in the same directory:

- artifacts/api-server/docs/MASTER_PLAN.md (commit f1c0152) -- the directional plan with five-layer architecture
- artifacts/api-server/docs/LAYER_0_DESIGN.md (commit 3e0dead) -- the Layer 0 architectural design with v1/v2 split; Section 7 of this design names the EU AI Act Article 6 pre-build gate that this research satisfies
- artifacts/api-server/docs/LAYER_0_TESTABILITY.md (commit 1d10251) -- the comprehension test suite (17 tests covering all 8 Layer 0 principles)
- artifacts/api-server/docs/CHECK_LAYER1_CASE_REFERENCE.md (commit ed0b31d) -- the operational companion for Layer 1 sub-phase 1, deferred until Layer 0 v1 ships

## Status Summary

Research date: 2026-04-26.

Classification verdict: APATRIS as currently designed is likely NOT classified as high-risk under Article 6(2) of the EU AI Act, because the system does not fall within Annex III categories (particularly Annex III(7) on migration which requires intended use by or on behalf of competent public authorities, which APATRIS is not).

Confidence: ESTIMATE-medium. Verdict requires counsel confirmation before Layer 0 v1 build proceeds.

Counsel review required: yes, mandatory before v1 build. The seven specific questions for counsel are listed in Section 13.

Architectural impact summary: no BLOCKING items for v1 build. Two MUST-RESOLVE-BEFORE-BUILD items (Article 6(4) non-high-risk-assessment record; Article 50 disclosure surface). Several SHOULD-RESOLVE-DURING-BUILD items. The v1 design as documented in LAYER_0_DESIGN.md (commit 3e0dead) does not require fundamental revision contingent on the verdict holding.

Polish-specific status: the Polish AI implementation law was accepted by the Council of Ministers on 2026-03-31 and is currently in Sejm review (not yet enacted as of research date 2026-04-26). KRiBSI (Komisja Rozwoju i Bezpieczeństwa Sztucznej Inteligencji) is designated as the primary supervisory and market surveillance authority. UODO has an advisory role plus additional supervisory authority for high-risk AI in justice, border control, and police-action areas. The EU AI Act applies directly in Poland; the Polish implementing law adds enforcement infrastructure, not new substantive obligations.

Next action: counsel review of the seven specific questions in Section 13. Layer 0 v1 build is gated on this review completing.

## Executive Summary

**Top-line classification finding** [ESTIMATE-medium]: APATRIS as currently designed is likely **NOT** classified as high-risk under Article 6(2) via Annex III(7) (migration, asylum and border control management), because all four sub-items of Annex III point 7 require the AI system to be "intended to be used by or on behalf of competent public authorities or by Union institutions, bodies, offices or agencies." APATRIS is a private legal-services platform supporting applicants and their lawyers — structurally adversarial to or independent from the authorities, not deployed by them. This is the central finding of the research.

**However, this is a determination that must be confirmed by qualified counsel** because (a) the phrase "on behalf of" has interpretive ambiguity, (b) deployer-side or contract-side facts could shift classification, (c) if Article 6(3) exclusions are asserted as a fallback, formal documentation per Article 6(4) is required, and (d) profiling carve-outs intersect.

**Architectural impact on Layer 0 v1 design**: with the likely-not-high-risk classification, the v1 design as documented in LAYER_0_DESIGN.md (commit 3e0dead) does not require fundamental revision. The v1 surfaces (A, B, D, E.C-manual, I, J-field, K) already exceed what Article 50 (general transparency) and RODO (GDPR) require. Recommended additions are non-blocking but should be integrated: an explicit Article 6(4) non-high-risk-assessment record, an Article 50 lawyer-and-client-facing AI-disclosure surface, and RODO-alignment documentation.

**Polish-specific status** [VERIFIED]: The Polish AI implementation law was accepted by the Council of Ministers on 2026-03-31, designating KRiBSI as primary supervisory authority and UODO with advisory + additional supervisory role for high-risk AI areas (justice, border control, police). The law has **not yet been enacted** as of 2026-04-26 — it is in Sejm review. The EU AI Act applies directly in Poland; the Polish implementing law adds enforcement infrastructure, not new substantive obligations.

**No BLOCKING findings for v1 build.** Two MUST-RESOLVE-BEFORE-BUILD items (Article 6(4) assessment record; Article 50 disclosure surface). Several SHOULD-RESOLVE-DURING-BUILD items.

## Article 6 Classification

### Article 6 framework

[VERIFIED] **Article 6(1)** classifies an AI system as high-risk if (a) it is intended to be used as a safety component of, or is itself, a product covered by EU harmonization legislation listed in Annex I, AND (b) that product is required to undergo third-party conformity assessment under that legislation.

APATRIS is **not** a safety component of an Annex I product (no medical device, machinery, toy, etc. context). [VERIFIED — by exclusion]

[VERIFIED] **Article 6(2)** classifies AI systems referred to in Annex III as high-risk.

[VERIFIED] **Article 6(3)** lists four exclusions: AI systems referred to in Annex III are NOT high-risk where they pose no significant risk of harm and ANY of the following conditions apply:
- The AI system is intended to perform a narrow procedural task
- The AI system is intended to improve the result of a previously completed human activity
- The AI system is intended to detect decision-making patterns or deviations from prior decision-making patterns and is not meant to replace or influence the previously completed human assessment without proper human review
- The AI system is intended to perform a preparatory task to an assessment relevant for purposes of use cases listed in Annex III

[VERIFIED] **Article 6(3) profiling clause**: "Notwithstanding the first subparagraph, an AI system referred to in Annex III shall always be considered to be high-risk where the AI system performs profiling of natural persons." (Source: artificialintelligenceact.eu/article/6, accessed 2026-04-26)

[VERIFIED] **Article 6(4)** requires providers asserting non-high-risk status under 6(3) to document their assessment before placing the system on the market or putting it into service.

[VERIFIED] **Article 6(5)** mandates Commission guidelines (deadline February 2026) on practical examples of high-risk and non-high-risk use cases.

### Annex III categorical scan for APATRIS

I walked the eight Annex III categories. Functional matches and the disqualifying qualifier:

**Annex III(7) Migration, asylum and border control management** [VERIFIED — verbatim text retrieved from artificialintelligenceact.eu/annex/3]:

> 7(a) "AI systems intended to be used **by or on behalf of competent public authorities or by Union institutions, bodies, offices or agencies** as polygraphs or similar tools"
>
> 7(b) "AI systems intended to be used **by or on behalf of competent public authorities or by Union institutions, bodies, offices or agencies** to assess a risk, including a security risk, a risk of irregular migration, or a health risk, posed by a natural person who intends to enter or who has entered into the territory of a Member State"
>
> 7(c) "AI systems intended to be used **by or on behalf of competent public authorities or by Union institutions, bodies, offices or agencies** to assist competent public authorities for the examination of applications for asylum, visa or residence permits and for associated complaints with regard to the eligibility of the natural persons applying for a status, including related assessments of the reliability of evidence"
>
> 7(d) "AI systems intended to be used **by or on behalf of competent public authorities, or by Union institutions, bodies, offices or agencies**, in the context of migration, asylum or border control management, for the purpose of detecting, recognising or identifying natural persons, with the exception of the verification of travel documents"

The qualifier "by or on behalf of competent public authorities or by Union institutions, bodies, offices or agencies" is present in all four sub-items.

**APATRIS analysis** [ESTIMATE-medium]: APATRIS is a private legal-services SaaS used by lawyers representing applicants. The functional resemblance to 7(c) (assistance with examination of applications for residence permits) is real — but the qualifier is "intended to be used by competent public authorities to assist competent public authorities." APATRIS is intended to be used by private lawyers to assist applicants, not to assist authorities. This is structurally the opposite side of the same procedure.

**Annex III(4) Employment, workers management, access to self-employment** [VERIFIED]: covers AI used for recruitment, candidate selection, work-condition decisions, monitoring/evaluation, allocation of tasks. APATRIS's legal-comprehension layer is for immigration cases, not recruitment. The CRM and worker-matching modules of the broader Apatris platform may touch this category — but those are separate products from Layer 0 / the legal scope of this assessment.

**Annex III(5) Essential services** [VERIFIED]: 5(a) refers to AI "intended to be used by public authorities or on behalf of public authorities to evaluate eligibility for essential public assistance benefits and services" — same public-authority qualifier as 7(c). 5(b) credit-scoring, 5(c) life/health insurance, 5(d) emergency dispatch — none apply to APATRIS.

**Other Annex III categories** [ESTIMATE-high]: (1) biometrics, (2) critical infrastructure, (3) education, (6) law enforcement, (8) administration of justice — none functionally match APATRIS.

### Classification verdict

[ESTIMATE-medium] **APATRIS is likely not classified as a high-risk AI system under Article 6 of the EU AI Act, because (i) it does not fall under Article 6(1) — not an Annex I product safety component, and (ii) it does not fall within any Annex III category in its current scope, particularly because Annex III(7) requires intended use by or on behalf of competent public authorities, which APATRIS is not.**

[UNCERTAIN] The phrase "on behalf of" is ambiguous in scope. A consulting firm hired by UdSC to develop AI tools to screen applications would clearly be "on behalf of." A private law firm using AI to prepare applications submitted TO authorities is the opposite side. Counsel must confirm this interpretation is sound.

[ESTIMATE-low] Even if APATRIS were under Annex III(7), Article 6(3) exclusions (preparatory task, improve result of previously completed human activity) may apply. However, the profiling carve-out (Article 6(3) last paragraph) likely closes this door because the Layer 3 scenarios engine generates per-worker viability scores — this is profiling under GDPR Article 4(4) understanding. So Article 6(3) is not a reliable safety net if classification ever shifts.

[VERIFIED] If the non-high-risk determination is asserted, **Article 6(4) requires a documented assessment** to be retained before placing the system on the market. This is a structural compliance step regardless of which exclusion or non-classification path is chosen.

## Conformity Assessment Requirements

This section applies only if APATRIS is classified as high-risk. Given the classification verdict (likely not high-risk), the requirements below are conditional.

### If classified as high-risk under Annex III(7)

[VERIFIED] **Article 43(2)** specifies that for high-risk AI systems referred to in points 2 to 8 of Annex III (which includes 7), providers shall follow **the conformity assessment procedure based on internal control referred to in Annex VI**. There is **no notified-body involvement** required for these categories. (Source: artificialintelligenceact.eu/article/43, accessed 2026-04-26)

[VERIFIED] **Annex VI internal control procedure** requires the provider to:
- Verify the established quality management system complies with Article 17
- Examine the technical documentation (Annex IV) to assess compliance with Articles 8-15 essential requirements
- Verify the design and development process is consistent with the technical documentation

[VERIFIED] **Article 47 EU declaration of conformity** must be drawn up, machine-readable or physically/electronically signed, and retained for 10 years after the system is placed on the market. Contents per Annex V. Translated to languages of Member States where placed on the market.

[VERIFIED] **CE marking** (Article 48): high-risk AI systems must be CE-marked. For digital-only systems, the CE marking appears electronically.

[VERIFIED] **Article 49 EU database registration**: providers must register themselves and the system in the EU database before placing on market or putting into service. For Annex III points 1, 6, and 7 (law enforcement, migration), registration is in a **secure non-public section** accessible only to the Commission and national authorities.

### Timeline considerations

[VERIFIED — from search results] Application timeline:
- 2 February 2025: Prohibited practices (Article 5) applied
- 2 August 2025: General-purpose AI rules applied
- 2 August 2026: Most provisions, including high-risk AI requirements (Articles 8-15) applied
- 2 August 2027: High-risk AI systems referred to in Annex I (different transition for legacy harmonization legislation cases)

[ESTIMATE-high] If APATRIS were classified as high-risk under Annex III, the 2 August 2026 application date would govern. Conformity assessment, declaration of conformity, CE marking, and EU database registration would be prerequisites for putting the system into service after that date.

### If not classified as high-risk (likely verdict)

[VERIFIED] No conformity assessment under Article 43 is required.
[VERIFIED] No CE marking is required.
[VERIFIED] No EU database registration is required.
[VERIFIED] **Article 6(4) documentation** of the non-high-risk assessment IS required — a written record explaining why the system does not fall under Article 6(1) or Article 6(2)/Annex III, retained at the disposal of national authorities.
[VERIFIED] **Article 50 transparency obligations** still apply: deployers must inform natural persons that they are interacting with an AI system (where not obvious from circumstances).

## Architectural Elements

The requirements below would apply if APATRIS were classified as high-risk. Even under the likely-not-high-risk verdict, several should be voluntarily implemented as best practice and as defense-in-depth if classification is ever challenged.

### Article 9 — Risk Management System

[VERIFIED] Risk management must be established, implemented, documented, and maintained throughout the lifecycle of a high-risk AI system, as a **continuous iterative process** with regular review. Includes: identification and analysis of foreseeable risks, estimation of risks under intended use and reasonably foreseeable misuse, evaluation against post-market monitoring data, and adoption of risk management measures.

**Layer 0 v1 design coverage**: PARTIAL.
- Surface I (refusal mode) addresses risk of fluent fiction.
- Surface B (comprehension verification) addresses risk of legal misunderstanding.
- Surface K (boundary enforcement) addresses risk of unauthorized AI-side action.
- **Gap**: no formal risk management documentation per Article 9(2). Currently risks are surfaced via the design document; Article 9 contemplates a separate risk management system document with periodic review.

### Article 10 — Data and Data Governance

[VERIFIED] Training, validation, and testing datasets must be relevant, sufficiently representative, free of errors as far as possible, and complete in view of intended purpose. Bias detection and mitigation. Data governance practices addressing design choices, data collection, preparation, examination of biases, identification of data gaps. Special category personal data (GDPR Article 9, RODO Article 9) processing only where strictly necessary for bias monitoring.

**Layer 0 v1 design coverage**: PARTIAL to NOT-COVERED.
- The `legal_articles` table (surface A) is the corpus for legal grounding; data governance for it is implicit.
- **Gap**: no documented data governance for the prompt-engineering corpus, the comprehension test set, the legal_knowledge generic-prose layer, or the Polish-law sources used for Stream C.
- **Gap**: no bias-detection process for AI outputs against vulnerable populations (foreign workers — many vulnerable, many supporting families).
- **Gap**: no documented data lineage from sources -> embeddings -> retrieval -> outputs.

### Article 11 — Technical Documentation (Annex IV)

[VERIFIED] Technical documentation must be drawn up before the system is placed on the market and updated continuously. Annex IV specifies contents: general description, detailed description, intended purpose, system architecture, computational resources, data and data governance, validation and testing, human oversight measures, post-market monitoring plan.

**Layer 0 v1 design coverage**: PARTIAL.
- LAYER_0_DESIGN.md covers system description, architecture, intended purpose, validation (testability), human oversight (P2 + surface I + surface K).
- **Gap**: data governance section (Article 10), post-market monitoring plan, computational-resources description.

### Article 12 — Record-Keeping (Logging)

[VERIFIED] High-risk AI systems must have automatic logging capabilities. Logs must enable identification of risks throughout lifecycle and post-market monitoring. Period of use, reference databases, input data, identities of individuals verifying outputs (where applicable).

**Layer 0 v1 design coverage**: PARTIAL.
- `engagement_events` (Stream A, v2) and `verification_overrides` (G, v2) provide event logging.
- v1 `audit_logs` (existing) provides admin action logging.
- **Gap in v1**: no AI-output audit log capturing every AI generation event with input, output, model, prompt version, timestamp, citing-articles, confidence. This is a v1 gap if compliance posture requires it.

### Article 13 — Transparency and Provision of Information to Deployers

[VERIFIED] High-risk AI systems must be transparent enough that deployers can understand and appropriately use outputs. Instructions for use must include: provider contact details, system characteristics, capabilities and limitations, intended purpose, accuracy/robustness/cybersecurity levels, human oversight measures, computational and hardware requirements, maintenance needs, logging mechanisms.

**Layer 0 v1 design coverage**: NOT-COVERED.
- **Gap**: no instructions-for-use document covering APATRIS's legal-AI capabilities and limitations from a deployer (lawyer / firm) perspective.
- **Gap**: no public-facing limitations disclosure ("APATRIS does not make legal decisions; Article 6 of the AI Act and Article 14 human oversight require lawyer review on every output").

### Article 14 — Human Oversight

[VERIFIED] High-risk AI systems must be designed and developed to be effectively overseen by natural persons during use. Oversight measures must enable: understanding of capabilities and limitations, awareness of automation bias, correct interpretation of outputs, ability to disregard, override, or reverse outputs, ability to intervene or interrupt operation.

**Layer 0 v1 design coverage**: STRONG (for v1) and STRONGER (for v2).
- Layer 0 Principle P2 (AI completes; lawyer edits and sends) maps directly to Article 14.
- Surface K (boundary enforcement, lawyer-only-send token) is the **structural** instantiation of Article 14 oversight.
- Surface I (refusal mode) handles the "lawful refusal" axis of human oversight.
- v2 surfaces F (in-flight engagement) and G (post-edit verification) add depth.

This is one of the strongest alignment areas of the v1 design.

### Article 15 — Accuracy, Robustness, Cybersecurity

[VERIFIED] High-risk AI systems must achieve appropriate level of accuracy, robustness, cybersecurity, and perform consistently in those respects throughout lifecycle. Accuracy levels and metrics must be declared. Resilient against errors, faults, inconsistencies. Resilient against attempts by unauthorized third parties to alter use, behavior, or performance.

**Layer 0 v1 design coverage**: PARTIAL.
- Surface B (comprehension verification with LLM-judge scoring) provides accuracy measurement for legal comprehension.
- Surface D (citation validator) provides robustness against fluent-fiction outputs.
- **Gap**: no documented adversarial-robustness testing (e.g., prompt injection, citation fabrication attempts).
- **Gap**: no declared accuracy metric thresholds. Article 15 contemplates explicit accuracy declarations.
- ENISA guidance on AI cybersecurity is the secondary source; not consulted in this research [RETRIEVABLE BUT NOT RETRIEVED].

## v1 Surface Gap Analysis

For each v1 surface, assess sufficiency against compliance requirements:

| v1 Surface | Article 9 (Risk) | Article 10 (Data) | Article 12 (Logs) | Article 13 (Transparency) | Article 14 (Oversight) | Article 15 (Accuracy) |
|---|---|---|---|---|---|---|
| **A. Legal knowledge representation** | n/a | partial gap | n/a | n/a | n/a | partial |
| **B. Comprehension verification** | partial | n/a | partial | n/a | n/a | partial |
| **D. Source linkage enforcement** | n/a | n/a | partial | partial | n/a | partial |
| **E.C-manual. Stream C v1** | n/a | partial | partial | n/a | n/a | n/a |
| **I. Refusal mode** | sufficient | n/a | n/a | n/a | sufficient | n/a |
| **J-field. Population field** | n/a | n/a | n/a | n/a | n/a | n/a |
| **K. Boundary enforcement** | sufficient | n/a | partial | n/a | **sufficient** | n/a |

**Surface B gap (Article 9 + Article 10)**: comprehension verification covers comprehension; not formal risk management. Gap can be closed by adding `comprehension_test_runs.risk_category` and a periodic risk-review document.

**Surface D gap (Article 13 transparency)**: the schema enforces source linkage internally; the compliance gap is **lawyer-and-client-facing transparency** about source-linked claims. v1 should add a requirement that AI outputs surface their cited articles in human-readable form on lawyer review screens.

**Surface I (Article 14)**: refusal mode is structurally aligned with Article 14's "ability to refuse / interrupt" requirement.

**Surface K (Article 14)**: token-gated send is **the strongest** Article 14 instantiation in any AI legal product I've seen described. Sufficient.

### Promotions from v2 to v1 recommended

**G post-edit verification** (currently v2) — should be considered for v1 if compliance counsel concludes Article 14 requires more than the lawyer-review gate. v1 minimum could be a manual "I've reviewed every cited article" checkbox before send (lighter than the full G design).

**F in-flight engagement** (currently v2) — Article 14(4)(b) "be aware of the possible tendency of automatically relying or over-relying on the output produced by a high-risk AI system" suggests automation-bias mitigation. Surface F's confidence-display badges support this. v2 placement is fine *if* APATRIS is non-high-risk; v1 priority increases if classification shifts.

### New surfaces (not in current v1 or v2) compliance may require

**N1. Article 6(4) non-high-risk-assessment record (v1, NEW).** Required if asserting non-high-risk classification. Schema: `regulatory_assessments` table with `(assessment_type, classification_verdict, reasoning_text, articles_analyzed, dated_at, reviewed_by_counsel_at)`. Document version-controlled. Required before placing on market per Article 6(4).

**N2. Article 50 transparency surface (v1, NEW).** Even non-high-risk AI systems interacting with natural persons must disclose AI involvement. APATRIS lawyers using AI to draft, and clients receiving documents drafted with AI assistance, fall in scope. Implementation: AI-disclosure footer on lawyer-presented outputs; "Drafted with AI assistance" notice on client-facing documents; lawyer-confirmation acknowledgment that the lawyer reviewed AI output.

**N3. Risk management system document (v1, NEW).** Article 9-aligned even if non-high-risk, as defense-in-depth. Living document. Version-controlled.

**N4. Data governance document (v1, NEW).** Article 10-aligned. Covers `legal_articles` corpus, comprehension test data, prompt corpus, embeddings, RODO interactions.

## Deployment Documentation

If high-risk: Annex IV technical documentation, Article 13 instructions for use, Article 47 EU declaration of conformity, Article 49 EU database registration, Article 12 retained logs, Article 9 risk management documentation, Article 10 data governance documentation, Article 17 quality management system documentation.

If non-high-risk (likely APATRIS scenario):
- **Article 6(4) non-high-risk assessment record** (mandatory if non-high-risk asserted).
- **Article 50 transparency notices** (mandatory).
- RODO/GDPR compliance documentation (mandatory under GDPR independently).
- Internal Article 9-aligned risk management document (recommended, not strictly mandatory for non-high-risk).
- Internal Article 10-aligned data governance document (recommended).
- Layer 0 testability evidence (LAYER_0_TESTABILITY.md + run logs) as defense-in-depth.

[VERIFIED] **Annex IV technical documentation contents** (from artificialintelligenceact.eu/annex/4 — not directly retrieved this session, summarized from search context):
1. General description (intended purpose, provider, version)
2. Detailed description (architecture, software components, data flow)
3. Information about data and data governance
4. Computational resources and development methodology
5. Validation and testing
6. Detailed information on the monitoring, functioning, and control of the AI system
7. Description of post-market monitoring plan
8. Cybersecurity measures (Article 15)
9. List of harmonised standards applied
10. EU declaration of conformity copy

[ESTIMATE-medium] APATRIS LAYER_0_DESIGN.md, MASTER_PLAN.md, and LAYER_0_TESTABILITY.md cover items 1, 2, 5, 6 substantially. Items 3, 4, 7, 8, 9, 10 require additional documents.

## Ongoing Monitoring

[VERIFIED — summary depth] **Article 72 Post-market monitoring**: providers establish and document a post-market monitoring system proportionate to the nature of the AI technologies and the risks. The system shall actively and systematically collect, document, and analyse relevant data on the performance of high-risk AI systems throughout their lifetime, allowing the provider to evaluate continuous compliance with requirements set out in Articles 8-15.

[VERIFIED — summary depth] **Article 73 Reporting of serious incidents**: providers of high-risk AI systems placed on the EU market must report any serious incident to market surveillance authorities of the Member States where the incident occurred. Serious incident = death, serious harm to health, serious and irreversible disruption of critical infrastructure, infringement of fundamental rights protected by Union law, serious harm to property or environment.

[ESTIMATE-medium] **Continuous compliance with Articles 8-15**: technical documentation must be kept up to date as the system evolves; comprehension tests must be re-run on prompt changes and law changes; risk assessments must be reviewed periodically (Article 9 contemplates iterative process throughout lifecycle).

[VERIFIED — search summary] **Articles 74-94 Cooperation with market surveillance authorities**: in Poland, this would be KRiBSI once the Polish AI Act is enacted. Authorities have access powers, can require corrective actions, can impose fines. Currently the EU AI Act applies directly even though Polish enforcement infrastructure is in draft.

[ESTIMATE-medium] If APATRIS is non-high-risk: Article 72-73 obligations do not formally apply. However, voluntary post-market monitoring (Stream B in Layer 0 v2) is recommended as defense-in-depth and operational hygiene.

## Architectural Impacts

Synthesis of the v1 surface gap analysis (Section 8) and architectural elements review (Section 7). Severity ranked.

| # | Gap / Required Addition | Recommended Architectural Change | Severity | Document Propagation Chain |
|---|---|---|---|---|
| 1 | Article 6(4) non-high-risk-assessment record absent | Add new schema `regulatory_assessments` table (or equivalent document store). Capture classification verdict, reasoning, articles analyzed, counsel review date. | **MUST RESOLVE BEFORE BUILD** | LAYER_0_DESIGN.md (new sub-section under K or new surface L); MASTER_PLAN.md (companion docs reference); this document (EU_AI_ACT_ARTICLE_6_RESEARCH.md, post-refinement) |
| 2 | Article 50 transparency surface to lawyer + client absent | Add AI-disclosure surface: footer on lawyer-presented outputs, "Drafted with AI assistance" on client-facing artifacts, lawyer-acknowledgment record. | **MUST RESOLVE BEFORE BUILD** | LAYER_0_DESIGN.md (new surface L or extend K); new prompt template patterns; possibly new document |
| 3 | Article 9 formal risk management documentation absent | Risk management document, version-controlled. Periodic review cadence. | **SHOULD RESOLVE DURING BUILD** | New doc `RISK_MANAGEMENT.md`; LAYER_0_DESIGN.md cross-reference |
| 4 | Article 10 formal data governance documentation absent | Data governance document covering `legal_articles` corpus, comprehension test data, prompt corpus, RODO alignment. | **SHOULD RESOLVE DURING BUILD** | New doc `DATA_GOVERNANCE.md`; LAYER_0_DESIGN.md cross-reference |
| 5 | Article 12 AI-output audit log not in v1 | Add `ai_output_log` table (input, output, model, prompt version, timestamp, cited articles, confidence) — distinct from existing `ai_audit_log` and `engagement_events`. | **SHOULD RESOLVE DURING BUILD** | LAYER_0_DESIGN.md surface D extension; schema migrations |
| 6 | Article 13 instructions-for-use document absent | "How APATRIS Legal AI works for lawyers" document covering capabilities, limitations, accuracy levels, oversight measures. | **SHOULD RESOLVE DURING BUILD** | New doc `INSTRUCTIONS_FOR_USE.md`; LAYER_0_DESIGN.md cross-reference |
| 7 | Article 15 declared accuracy metrics absent | Comprehension test pass-threshold becomes the declared accuracy metric. Document the metric in instructions for use. | **SHOULD RESOLVE DURING BUILD** | LAYER_0_TESTABILITY.md (extend with declared thresholds); new doc INSTRUCTIONS_FOR_USE.md |
| 8 | Adversarial-robustness testing for prompt injection / citation fabrication | Test category in comprehension tests for adversarial attempts. | **NICE-TO-HAVE** for v1; **MUST** for v2 if classification shifts | LAYER_0_TESTABILITY.md (new test category) |
| 9 | RODO + AI Act intersection documentation | Article 10 references RODO for special-category data. RODO retention rules for probe data (per LAYER_0_DESIGN.md unknown unknown #6). | **SHOULD RESOLVE DURING BUILD** | New doc `RODO_AI_ACT_INTERSECTION.md`; LAYER_0_DESIGN.md cross-reference |

**No BLOCKING items.** The v1 design is fundamentally sound. The two MUST-RESOLVE-BEFORE-BUILD items (Article 6(4) record and Article 50 disclosure surface) are documentation-and-process changes that take days, not weeks.

## Polish-Specific Considerations

[VERIFIED] **Polish AI implementation law status** (as of 2026-04-26):
- Council of Ministers accepted the draft on 2026-03-31.
- The draft now goes to Sejm for review and enactment.
- The law is **not yet enacted**.

[VERIFIED] **KRiBSI** (Komisja Rozwoju i Bezpieczeństwa Sztucznej Inteligencji — Commission for the Development and Safety of Artificial Intelligence) is designated as Poland's primary supervisory and market surveillance authority for AI systems.

[VERIFIED] **UODO** (Urząd Ochrony Danych Osobowych — Personal Data Protection Office) sought decision-making powers in AI matters concerning personal data; the current draft retained UODO in an advisory role plus additional supervisory authority for high-risk AI in justice, border control, and police-action areas.

[ESTIMATE-medium] **For APATRIS specifically**:
- If APATRIS were classified as high-risk under Annex III(7) — UODO would be an additional supervisor (border control area). KRiBSI would be the primary.
- If APATRIS is non-high-risk (likely verdict) — KRiBSI has general oversight; UODO has full RODO authority over personal data processing.
- Polish administrative law (KPA) does not yet contain specific AI-Act-related transparency or oversight provisions distinct from the EU regulation.

[VERIFIED] **EU AI Act applies directly in Poland** since entry into force on 2026-08-01 (Article 113 — most provisions applying 2 August 2026; prohibited practices applied 2 February 2025). The Polish implementing law adds enforcement infrastructure and clarifies authority designation; it does not add or relax substantive obligations for APATRIS.

[ESTIMATE-medium] **RODO + AI Act intersection**:
- Article 10(5) of the AI Act permits processing of special-category personal data only where strictly necessary for bias monitoring, with appropriate safeguards.
- RODO Article 22 on automated decision-making applies independently. Layer 0 Principle P2 (lawyer-edits-and-sends) likely satisfies Article 22(2)(c) opt-out from purely automated decisions.
- RODO Article 9 special-category data overlaps with AI Act Article 10(5).

[RETRIEVABLE BUT NOT RETRIEVED] **Specific Polish guidance from UODO on AI**:
- UODO has issued opinions on AI processing of personal data; specific opinions related to legal-AI applications were not retrieved this session.
- Engaging Polish privacy counsel to retrieve UODO opinion library is recommended.

[RETRIEVABLE BUT NOT RETRIEVED] **The Polish draft AI law text (March 2026 Council of Ministers version)**:
- Key search results referenced press summaries; the verbatim draft text was not retrieved.
- Polish-language legal counsel should review the draft text to identify any APATRIS-specific obligations beyond EU AI Act baseline.

[UNCERTAIN] **Foreigners Act / KPA intersection with AI Act**:
- Polish administrative procedure (KPA) requires authority decisions to be properly motivated (Art. 107 KPA). Use of AI by APATRIS to draft applications does not implicate KPA directly because APATRIS is private-side.
- If Polish authorities (UdSC, voivodeship offices) deploy AI on the assessment side, that AI would be high-risk under Annex III(7). Not an APATRIS concern.

## Limits of Research

### Scope acknowledgments

**APATRIS Claude is not a qualified lawyer.** Findings here should be reviewed by counsel qualified in:
- EU AI Act (priority — Article 6 classification verdict in Section 5 is medium-confidence)
- RODO / GDPR (Article 10 + RODO intersection)
- Polish administrative law (KPA + Foreigners Act intersection with the AI Act)
- Polish AI implementation law (KRiBSI + UODO division of responsibility)

### Sections with full research depth

- Section 5 (Q1 classification): direct text retrieval of Article 6 and Annex III(7) verbatim. Verdict reasoning is solid; counsel review needed for "on behalf of" interpretation.
- Section 7 (Q3 architectural elements): summary of Articles 9-15 from authoritative source aggregator (artificialintelligenceact.eu) plus search results from EU AI Act Service Desk (ec.europa.eu).
- Section 8 (Q4 v1 surface gap analysis): synthesis-driven, grounded in Section 5 verdict and Section 7 requirements.

### Sections with summary depth

- Section 6 (Q2 conformity assessment): mid-depth; conditional on high-risk classification. Annex VI internal control procedure summarized, not verbatim.
- Section 9 (Q5 deployment documentation): mid-depth; Annex IV contents summarized from search context, not retrieved verbatim.
- Section 10 (Q6 ongoing monitoring): summary depth; Articles 72-73 retrieved as summaries, not verbatim.
- Section 12 (Polish-specific): retrievable-but-not-retrieved for the verbatim Polish draft law text and UODO opinion library. Search summaries used.

### Specific questions that require legal counsel review (not Apatris Claude research)

1. **Is APATRIS truly outside Annex III(7)?** The "on behalf of competent public authorities" qualifier interpretation requires counsel confirmation. Hypothetical contract-side facts (e.g., APATRIS providing services to UdSC or to a public agency) could shift this.

2. **Does the Layer 3 scenarios engine constitute "profiling of natural persons" under Article 6(3)?** If APATRIS were ever classified under Annex III, the profiling clause may close the Article 6(3) exclusions. Counsel must confirm whether per-worker viability scoring is profiling under GDPR Article 4(4) for AI Act Article 6(3) purposes.

3. **Article 50 transparency obligations**: counsel must confirm what specific disclosure language is required for the lawyer-and-client AI-disclosure surface, and whether disclosure to the immigrant client requires additional Polish-language considerations.

4. **Article 6(4) non-high-risk-assessment documentation**: counsel must review the assessment record before APATRIS asserts non-high-risk classification. The record should be defensible to KRiBSI on inspection.

5. **RODO + AI Act intersection on probe data and verification overrides** (per LAYER_0_DESIGN.md unknown unknown #6): counsel must confirm retention rules and data minimization obligations.

6. **Polish AI implementation law substantive obligations**: counsel must review the Council of Ministers draft (2026-03-31 version) to identify any APATRIS-specific obligations beyond EU AI Act baseline.

7. **Polish-language considerations**: instructions for use, transparency disclosures, consent forms — counsel must confirm translation and presentation standards under Polish administrative practice.

## Sources Consulted

**Primary (verbatim text):**
- [Article 6 — Classification Rules for High-Risk AI Systems](https://artificialintelligenceact.eu/article/6/) — accessed 2026-04-26
- [Annex III — High-Risk AI Systems Referred to in Article 6(2)](https://artificialintelligenceact.eu/annex/3/) — accessed 2026-04-26 — verbatim Annex III(7)(a)(b)(c)(d)
- [EUR-Lex Regulation (EU) 2024/1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) — accessed 2026-04-26 (publication date confirmed: 12 July 2024)

**Secondary (summary level):**
- [Article 43: Conformity Assessment](https://artificialintelligenceact.eu/article/43/) — accessed 2026-04-26
- [Article 47: EU Declaration of Conformity](https://artificialintelligenceact.eu/article/47/) — accessed 2026-04-26
- [Article 49: Registration](https://artificialintelligenceact.eu/article/49/) — accessed 2026-04-26
- [Article 16: Obligations of Providers](https://artificialintelligenceact.eu/article/16/) — accessed 2026-04-26
- [AI Act Service Desk — official EU portal](https://ai-act-service-desk.ec.europa.eu/) — accessed 2026-04-26
- [European Commission Shaping Europe's digital future — AI Act](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) — accessed 2026-04-26
- [Conformity Assessments under the EU AI Act: A step-by step guide (FPF)](https://fpf.org/wp-content/uploads/2025/04/OT-comformity-assessment-under-the-eu-ai-act-WP-1.pdf) — accessed 2026-04-26
- [Article 9: Risk Management System](https://artificialintelligenceact.eu/article/9/) — accessed 2026-04-26
- [Article 10: Data and Data Governance](https://artificialintelligenceact.eu/article/10/) — accessed 2026-04-26
- [Article 12: Record-Keeping](https://artificialintelligenceact.eu/article/12/) — accessed 2026-04-26
- [Article 13: Transparency and Provision of Information to Deployers](https://artificialintelligenceact.eu/article/13/) — accessed 2026-04-26
- [Article 14: Human Oversight](https://artificialintelligenceact.eu/article/14/) — accessed 2026-04-26

**Polish-specific (search summary level):**
- [Rząd przyjął projekt ustawy o systemach sztucznej inteligencji — rp.pl](https://www.rp.pl/prawo-w-polsce/art44076181-rzad-przyjal-projekt-ustawy-o-systemach-sztucznej-inteligencji-ma-wdrozyc-w-polsce-ai-act) — accessed 2026-04-26
- [Alert prawny: AI Act — PwC Polska](https://www.pwc.pl/pl/artykuly/ministerstwo-cyfryzacji-opublikowalo-nowa-wersje-projektu-ustawy-o-systemach-sztucznej-inteligencji.html) — accessed 2026-04-26
- [Polska ustawa o AI przyjęta — prawo.pl](https://www.prawo.pl/biznes/ai-act-rzad-przyjal-projekt-ustawy-kolejne-przepisy-w-drodze,1541924.html) — accessed 2026-04-26
- [Regulating AI at Europe's Borders: Where the AI Act Falls Short — Verfassungsblog](https://verfassungsblog.de/regulating-ai-at-europes-borders/) — accessed 2026-04-26

**Sources NOT retrieved this session:**
- Verbatim text of Annex IV (technical documentation contents) — used summary
- Verbatim text of Annex VI (internal control procedure) — used summary
- Verbatim text of Annex V (EU declaration of conformity contents) — used summary
- Polish draft AI law verbatim text (Council of Ministers 2026-03-31 version)
- UODO published guidance on AI processing
- ENISA guidance on AI cybersecurity (Article 15-relevant)
- CEN-CENELEC JTC 21 harmonised standards
- Commission Article 6(5) guidelines (deadline February 2026 — may be published, not retrieved)
