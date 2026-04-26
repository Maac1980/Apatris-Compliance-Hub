# COUNSEL HANDOFF PACKET — APATRIS LEGAL INTELLIGENCE PLATFORM

## EU AI Act Conformity, RODO Intersection, and Polish Administrative Law Review

---

**Document version**: 0.6 (Sections 1-6 complete; Sections 7-11 pending). The complete packet will be saved as Version 1.0 when Sections 7-11 are drafted, reviewed, and integrated.

---

## Section 1 — Cover Page

**Document purpose**: This packet briefs legal counsel on the APATRIS legal intelligence platform's regulatory posture and requests counsel review on specific questions that have been surfaced through internal architectural research.

**Document scope**: APATRIS is being built as an AI-augmented legal services platform supporting Polish immigration applications for foreign workers. The platform is in pre-build phase. This packet is delivered before development of the AI inference layer begins, so counsel guidance can shape the build rather than retrofit it.

**Audience**: This packet is structured to serve three counsel specializations:
- **EU AI Act specialist counsel** — Sections 2, 4, 5, 8 (executive summary, classification, conformity path, specific questions)
- **RODO/GDPR specialist counsel** — Sections 2, 6, 8 (executive summary, RODO intersection, specific questions)
- **Polish administrative law counsel** — Sections 2, 7, 8 (executive summary, Polish-specific considerations, specific questions)

Counsel covering multiple specializations should read the union of relevant sections. Counsel covering all three specializations should read Sections 2 through 8 in order. Section 11 (engagement logistics) and Section 10 (related documents) are read by all counsel regardless of specialization.

**What is being requested**: Counsel review and written response to seven specific questions in Section 8. The questions concern:
- The classification of the APATRIS AI system under EU AI Act Article 6 and Annex III(7)
- The conformity path obligations contingent on the classification verdict
- RODO Article 22 (automated decision-making) application to lawyer-supervised AI outputs
- Polish-specific disclosure and oversight requirements
- The scope of Article 50 (transparency) obligations for the bilingual user interface
- Data retention bounds for performance feedback loops
- The legal weight of Polish vs English when bilingual outputs diverge

**Estimated counsel review time**: 5-15 hours depending on specialization breadth and depth of repo document review. The questions are answerable from publicly available legal sources combined with the operational context provided in this packet.

**Engagement logistics**: Detailed in Section 11 (pending).

**Decision authority**: APATRIS owner (Manish) holds final decision authority on all build decisions. Counsel provides legal analysis and recommendations; APATRIS interprets and acts on those recommendations.

**Document version**: 0.6 — initial counsel handoff, Sections 1-6 complete; Sections 7-11 pending. Subsequent versions will incorporate counsel responses.

**Related documents**: Section 10 (pending) lists the seven foundation documents that this packet synthesizes from.

---

## Section 2 — Executive Summary

**The situation**: APATRIS Sp. z o.o. is building an AI-augmented legal services platform that supports Polish immigration applications for foreign workers. The platform's AI components include legal research, document drafting (e.g., uzupełnienie braków formalnych responses), case strategy recommendation, and comprehension verification. A licensed Polish radca prawny (legal counsel) reviews and signs every output before transmission to authorities or clients. The platform is currently in pre-build phase: architectural design and constitutional principles are committed to the repository; the AI inference layer has not yet been built.

**The classification verdict** (preliminary, internal): Internal research has produced a likely-not-high-risk verdict under EU AI Act Article 6 and Annex III(7), with confidence labeled ESTIMATE-medium. The reasoning rests on the Annex III(7) qualifier "by or on behalf of competent public authorities." APATRIS is private applicant-side legal services — the opposite role from authority-side decision support. The verdict is contingent on counsel confirmation. If counsel reclassifies the system as high-risk (e.g., because Annex III(7) is read more broadly, or because Annex III(5)(b) on essential public benefits is triggered), the conformity path changes substantially. Specifically, high-risk classification triggers Articles 8-15 obligations (risk management, data governance, technical documentation, record-keeping, transparency, human oversight, accuracy/robustness/cybersecurity), Annex IV technical documentation, conformity assessment under Annex VI or VII, EU declaration of conformity, CE marking, and post-market monitoring. The not-high-risk path retains lighter obligations (general transparency under Article 50, RODO compliance, professional services regulation under Polish bar rules) without the Articles 8-15 burden. The internal research at commit bf4d92b walks through both paths.

**What counsel must answer**: This packet asks counsel to confirm, correct, or reclassify the verdict; specify the conformity path obligations under either classification; address RODO Article 22 application to lawyer-supervised AI outputs; clarify Polish-specific disclosure and oversight requirements; and provide guidance on the bilingual user interface architecture's legal implications. The seven specific questions are listed in Section 8 (pending) with operational context. Counsel responses become inputs to APATRIS's pre-build architectural decisions.

Additionally, Polish administrative law regulates who is authorized to represent applicants before authorities (radca prawny, adwokat, and specific provisions in the Code of Administrative Procedure on representation). The interaction between this representation regime and AI-assisted preparation of administrative submissions is a question that benefits from counsel addressing alongside the AI Act analysis. The seven specific questions in Section 8 (pending) surface this where relevant.

---

## Section 3 — APATRIS System Context

**Provider entity**: APATRIS Sp. z o.o., headquartered in Warsaw, Poland. Polish company registered in KRS. Legal services provider with licensed radca prawny on staff.

The APATRIS network includes three distinct legal entities relevant to counsel review:

(a) APATRIS Sp. z o.o. — operates the AI-augmented legal services platform that is the subject of this packet; employs the licensed radca prawny who serves as the structural gate for AI outputs.

(b) APATRIS and Co. — provides traditional (non-AI) immigration consulting services to foreign workers; sister entity sharing brand and ownership with APATRIS Sp. z o.o.

(c) A licensed agencja pracy (job agency) operated by a related party (the spouse of APATRIS Sp. z o.o.'s owner); occasionally engaged by the welding outsourcing operation; distinct legal entity from the APATRIS-named entities.

The three entities are distinct legal persons. Data-sharing relationships, RODO controller/processor designations, and labor-law boundaries between them are detailed in Section 6 (RODO intersection) and Section 7 (Polish administrative law, pending) as relevant. Counsel may verify the entity structure via KRS records.

**Geographic scope**: Poland. EU AI Act applies via Polish implementation. Polish administrative law (Kodeks postępowania administracyjnego, Foreigners Act, Posted Workers Act) is the governing legal frame for the immigration domain APATRIS operates in.

**Business model**: APATRIS is private applicant-side legal services — a paid legal services provider acting for foreign worker applicants and their employers. Clients pay APATRIS to handle their immigration case. APATRIS does not act on behalf of Polish authorities. APATRIS does not make administrative decisions on behalf of authorities. APATRIS prepares, files, and tracks applications that authorities then decide.

**Decision domain**: Polish immigration permits and residence authorizations, primarily under:
- Ustawa z dnia 12 grudnia 2013 r. o cudzoziemcach (Foreigners Act)
- Kodeks postępowania administracyjnego (Administrative Procedure Code)
- Ustawa z dnia 20 kwietnia 2004 r. o promocji zatrudnienia i instytucjach rynku pracy (employment-related provisions affecting foreign workers)
- Posted Workers Directive (96/71/EC, as amended by 2018/957/EU) implementation, which applies when foreign workers are posted between EU member states (e.g., third-country nationals on Polish work permits temporarily sent to other EU member states for project work)

**Affected parties**:
- **Foreign workers** (primary): individuals applying for residence permits, work permits, posted-worker authorizations, family reunification, and related authorizations. Many are not native Polish speakers; English bridge is operationally necessary.
- **Employers**: entities sponsoring foreign workers; APATRIS coordinates with employer-side documentation.
- **Polish authorities**: Wojewoda offices, Urząd Pracy, Straż Graniczna, ZUS, NIP/REGON systems. APATRIS interacts with these as an applicant representative.

**AI role in the system architecture**: The AI is a support layer, not a decision-making layer. Specifically:

- **Layer 0 (in pre-build)**: comprehension and reasoning verification. AI must demonstrate understanding of cases, legal articles, and procedural rules before higher layers act on its outputs. Architectural document at commit 3e0dead specifies the design with a v1/v2 split. Comprehension testability set with 17 tests at commit 1d10251 specifies the verification methodology.
- **Layer 1 (gated on Layer 0 v1 completion)**: case-reference writes. AI proposes additions to a case's reference set; human review gates every write.
- **Layer 2-4 (gated on prior layers)**: research synthesis, draft generation, decision support. Each layer presupposes the layer below.

**The structural gate**: A licensed radca prawny reviews every AI output before it reaches an authority, a client, or any external surface. The lawyer is the structural gate, not a quality control afterthought. AI completes a draft; lawyer reads, edits, and signs. The lawyer's signature is the legal act; the AI's output is internal preparation. This is captured in the master plan (commit 5873fca) as a non-negotiable principle.

**Bilingual architecture**: Polish is authoritative; English is a comprehension bridge. The system operates with Polish as the primary and authoritative language because Polish law, Polish authorities, and Polish administrative practice are the regulatory ground truth. AI outputs render in Polish by default on result pages; English translation is available via per-page toggle. Where translations diverge, Polish prevails. (This is APATRIS's internal principle; whether it aligns with Polish legal requirements for bilingual client communication is one of the questions counsel addresses in Section 8, pending.) The principle is constitutional (commit 5873fca, principle #16 of 20) and operational status is two-tier remediation (commit 41dedd1 verification report; commit 7e6fa97 Tier 1 plan).

**Pre-build status**: As of this packet's date, APATRIS has committed:
- Architectural design (Layer 0 design + testability)
- EU AI Act conformity research (likely-not-high-risk verdict, ESTIMATE-medium)
- Bilingual architecture verification (1.7 percent functional toggle coverage; Tier 1 remediation plan saved)
- Master plan with five-layer architecture and 20 non-negotiable principles
- Layer 1 CHECK questions (deferred until Layer 0 v1)

The AI inference layer is not yet built. Counsel guidance from this packet shapes pre-build decisions. Counsel review timeline does not block ongoing repository work but does block certain build commitments (e.g., Layer 0 v1 SUGGEST proposals are gated on classification verdict confirmation).

---

## Section 4 — Classification Question (for EU AI Act Specialist Counsel)

**The classification question**: Is the APATRIS AI system a "high-risk AI system" under EU AI Act Article 6?

**Article 6(2)** classifies AI systems as high-risk when they fall within the use cases listed in Annex III. The relevant Annex III categories for APATRIS's domain are:

- **Annex III(7)**: AI systems intended to be used for migration, asylum, and border control management — specifically (a) lie detectors and similar tools, (b) risk assessments, (c) examination of applications for asylum, visa, and residence permits, and (d) detection, recognition, or identification of natural persons in the context of migration.
- **Annex III(5)** covers essential private and public services, including evaluation of eligibility for public assistance benefits, credit scoring, life insurance, and emergency call dispatch. Specifically, Annex III(5)(b) covers AI systems intended to be used to evaluate the eligibility of natural persons for essential public assistance benefits and services. Whether immigration legal services for foreign workers fall within Annex III(5)(b) or related sub-paragraphs is one of the questions counsel addresses.

**The load-bearing qualifier in Annex III(7)**: "AI systems intended to be used by or on behalf of competent public authorities, or by Union institutions, bodies, offices or agencies, in the management of migration, asylum and border control management..."

**APATRIS's role analysis**: APATRIS is private applicant-side legal services. APATRIS does not act on behalf of Polish authorities. APATRIS does not make administrative decisions. APATRIS prepares and submits applications that authorities then decide. The role is the opposite of "by or on behalf of competent public authorities" — APATRIS represents the applicant, not the authority.

**Internal verdict** (preliminary, ESTIMATE-medium confidence): APATRIS likely does NOT fall within Annex III(7) because the "by or on behalf of competent public authorities" qualifier excludes applicant-side legal services. Full reasoning is in EU_AI_ACT_ARTICLE_6_RESEARCH.md (commit bf4d92b).

**Why the verdict is "ESTIMATE-medium" not "VERIFIED"**:

1. The "by or on behalf of" qualifier could in principle be read more broadly. A reading that includes "any AI system used in connection with migration management" would capture APATRIS. The narrow reading (which APATRIS adopts) requires the AI system to be used by the authority side. The legislative intent appears to support the narrow reading; counsel confirmation is requested.

2. Annex III(5) coverage of "essential private and public services" could in principle apply if immigration legal services or the underlying residence permits are considered essential under Annex III(5)(b) (eligibility for essential public assistance benefits and services). Recital 58 of the EU AI Act discusses essential services in the context of access to public services, healthcare, financial services, and similar. Whether immigration legal services for foreign workers fall within this scope is a gray area; counsel input is needed.

3. The interaction between Annex III(7) (authority-side migration management) and Annex III(5) (essential services eligibility evaluation) has not been settled by case law or formal guidance. Counsel may identify reasoning paths not surfaced in internal research.

**What counsel must confirm or correct**:

- (a) Whether the narrow reading of Annex III(7)'s "by or on behalf of" qualifier is correct (APATRIS likely-not-high-risk)
- (b) Whether Annex III(5)'s "essential services" framing applies to immigration legal services or to the residence permits themselves
- (c) Whether there are other Annex III categories APATRIS should be analyzed under that internal research did not surface
- (d) Whether the verdict (likely-not-high-risk) survives counsel's full analysis

**The seven specific questions in Section 8 (pending) surface this with operational context**.

---

## Section 5 — Conformity Path Decisions (for EU AI Act Specialist Counsel)

**The conformity path decision is contingent on classification.** Counsel must specify obligations under both branches because APATRIS architectural decisions depend on which path applies.

**Branch A — If verdict holds (likely-not-high-risk)**:

The system is governed by general AI Act provisions outside Articles 8-15 high-risk obligations. Specifically:

- **Article 50** (transparency) applies to AI systems that interact with natural persons and to AI systems generating synthetic content. APATRIS's AI generates legal drafts, comprehension verifications, and recommendations. Counsel must specify which Article 50 obligations attach (e.g., disclosure that content is AI-generated; disclosure that the user is interacting with AI; specific format requirements).
- **General-purpose AI provisions** (Articles 51-56) apply if APATRIS uses general-purpose AI models. APATRIS's design uses general-purpose foundation models accessed via API. Counsel must specify what obligations APATRIS has as a downstream deployer of general-purpose AI models. Specifically: which transparency disclosures must APATRIS make to its users about the use of GPAI models, and what documentation must APATRIS maintain about its use of these models for compliance purposes.
- **RODO compliance** (separate from AI Act) applies regardless. Detailed in Section 6.
- **Polish bar rules** (separate from AI Act) apply to the radca prawny's professional services. Counsel must specify the interaction between AI-assisted preparation and the radca prawny's professional responsibility regime.
- **Article 6(4) self-assessment record-keeping**: Article 6(4) provides that providers shall maintain documentation demonstrating compliance with the not-high-risk classification. Counsel must specify what records APATRIS must keep, in what form, and for what retention period.

**Branch B — If counsel reclassifies as high-risk**:

Articles 8-15 obligations apply in full:

- **Article 8** — General compliance requirement
- **Article 9** — Risk management system covering the AI system's full lifecycle
- **Article 10** — Data governance for training, validation, and test datasets
- **Article 11** — Technical documentation per Annex IV
- **Article 12** — Record-keeping (logs of operation)
- **Article 13** — Transparency and information provision to users
- **Article 14** — Human oversight. Specifically, counsel must determine whether the lawyer-as-structural-gate design (described in Section 3) satisfies Article 14's human oversight requirement, or whether additional oversight mechanisms are required. The interaction between this Article 14 question and the parallel RODO Article 22 question (Section 6) is one of the seven specific questions in Section 8 (pending).
- **Article 15** — Accuracy, robustness, and cybersecurity

Plus:
- **Annex IV technical documentation** — comprehensive system documentation
- **Conformity assessment under Annex VI (internal control) or Annex VII (third-party)** — counsel must specify which procedure applies
- **EU declaration of conformity** — issued by the provider
- **CE marking** — required before placing on the market
- **Post-market monitoring** — ongoing system performance and incident tracking
- **Registration in the EU database** for high-risk AI systems

The high-risk path adds substantial documentation, process, and external assessment burden. APATRIS's architectural plan (commit f1c0152, commit 3e0dead) is designed to support either path, but high-risk classification accelerates several work streams that are otherwise gated.

**What counsel must determine**:

- (a) The conformity path APATRIS is on (Branch A or Branch B)
- (b) Specific Article 50 obligations under Branch A (which disclosures, in which formats, at which user touchpoints)
- (c) The Article 6(4) self-assessment documentation requirements under Branch A (what records, what retention)
- (d) If Branch B applies: which conformity assessment procedure (Annex VI internal control vs Annex VII third-party)
- (e) Timing and sequencing of the conformity steps relative to APATRIS's planned build phases

---

## Section 6 — RODO + AI Act Intersection (for RODO/GDPR Specialist Counsel)

**RODO applies regardless of AI Act classification.** This section surfaces RODO questions that intersect with the AI architecture and the multi-entity structure described in Section 3.

**Article 22 (automated decision-making)**:

Article 22 prohibits decisions based solely on automated processing that produce legal or similarly significant effects, with limited exceptions. APATRIS's design positions the licensed radca prawny as the structural gate: AI completes drafts, lawyer reviews and signs. The lawyer is the legal actor, not the AI.

**Counsel question**: Does the lawyer-as-structural-gate design satisfy the "not solely automated" requirement of Article 22? Specifically:
- Is the lawyer's review-and-sign action sufficient human involvement to remove the decision from Article 22's scope?
- What documentation must APATRIS maintain to demonstrate that the lawyer's involvement is meaningful and not perfunctory?
- Does the AI's draft generation and recommendation constitute "preparing the decision" in a way that triggers Article 22 even with lawyer review?
- Recital 71 discusses the lawyer-supervised case; counsel must specify how Recital 71's reasoning applies to APATRIS's specific design.

**Article 9 (special-category data)**:

Immigration applications routinely include data that may fall within Article 9 special categories:
- Health data (medical insurance status, pre-existing conditions for visa categories)
- Religious or philosophical beliefs (relevant for some asylum cases, not APATRIS's primary domain)
- Biometric data (passport photos, fingerprints in some application processes)
- Data concerning sex life or sexual orientation (relevant for some family reunification cases)

**Counsel question**: What additional safeguards must APATRIS implement when processing Article 9 data through the AI architecture? Specifically:
- Which Article 9(2) lawful basis applies to APATRIS's processing (likely 9(2)(a) explicit consent, but counsel must confirm)
- What technical safeguards must the AI architecture implement (e.g., separate processing flows, additional access controls, encryption-at-rest specifics)
- How does the lawyer-supervised AI affect Article 9 analysis (e.g., does the lawyer's involvement constitute "necessary for the establishment, exercise or defence of legal claims" under Article 9(2)(f))

**Controller/processor designations across the three entities**:

Per Section 3, the APATRIS network includes three distinct legal entities:
- APATRIS Sp. z o.o. (AI platform provider)
- APATRIS and Co. (non-AI immigration consulting)
- The licensed agencja pracy operated by a related party

**Counsel question**: What are the controller/processor designations for personal data processed across these entities? Specifically:
- Are APATRIS Sp. z o.o. and APATRIS and Co. joint controllers under Article 26, or separate controllers with data-sharing agreements under Article 28?
- Does the agencja pracy receive personal data from the AI platform? If yes, what is its controller/processor status? If no, is the data flow boundary documented?
- What are the Article 26 agreements (joint controller arrangements) or Article 28 agreements (controller-processor) that must be in place?
- Are there Article 26(2) information transparency obligations that require disclosure to data subjects about the multi-entity structure?

**Data retention for performance feedback loops**:

APATRIS's design includes feedback mechanisms where AI outputs are reviewed by the radca prawny, edits are tracked, and the system learns from lawyer corrections. This creates a personal data retention question.

**Counsel question**: What are the retention bounds for AI performance data? Specifically:
- May APATRIS retain anonymized lawyer-edit data indefinitely for system improvement?
- May APATRIS retain pseudonymized client case data for performance analysis, and for how long?
- What is the boundary between "necessary for service provision" retention and "AI improvement" retention?
- Does Article 5(1)(e) storage limitation principle require specific retention periods to be documented?

**Data subject rights in the AI architecture**:

Articles 15-22 (access, rectification, erasure, restriction, portability, objection, automated decision-making) apply to APATRIS's processing.

**Counsel question**: How are data subject rights implemented in the lawyer-supervised AI architecture? Specifically:
- Article 15 access: must APATRIS disclose AI-generated drafts in addition to the final lawyer-signed output?
- Article 17 erasure: how is erasure handled when AI outputs have been used in training or feedback loops (even if anonymized)?
- Article 22 specific safeguards: if Article 22 applies (per the question above), what specific human-intervention rights must APATRIS implement?
- Article 21 objection: how does objection interact with the lawyer's professional obligations to maintain case records?

**The seven specific questions in Section 8 (pending) surface RODO questions with operational context.**

---

## PENDING SECTIONS (7-11)

The following sections are pending and will be added in a subsequent edit:

- **Section 7** — Polish-Specific Considerations (for Polish administrative law counsel): Polish AI implementation law status (KRiBSI/UODO), KPA + Foreigners Act intersection with AI Act, Polish-language disclosure standards, representation regime, conflict-of-interest provisions for related-party arrangements
- **Section 8** — The Seven Specific Questions (verbatim from EU_AI_ACT_ARTICLE_6_RESEARCH.md commit bf4d92b Section 13, with operational context and suggested response format)
- **Section 9** — Counsel Response Template (pre-structured form for counsel responses)
- **Section 10** — Repository Document References (the seven foundation documents with brief descriptions and GitHub links)
- **Section 11** — Engagement Logistics (timeline, decision authority, what APATRIS commits to providing)

When Sections 7-11 are added, the document version will be updated from 0.6 to 1.0.

---
