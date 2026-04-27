# COUNSEL HANDOFF PACKET — APATRIS LEGAL INTELLIGENCE PLATFORM

## EU AI Act Conformity, RODO Intersection, and Polish Administrative Law Review

---

**Document version**: 1.0 (Sections 1-11 complete; seven verbatim questions in Section 8). Engagement contacts maintained in COUNSEL_PACKET_CONTACTS.md (independently editable).

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

**Engagement logistics**: Detailed in Section 11.

**Decision authority**: APATRIS Founder and Partner (Manish) holds final decision authority on all build decisions. Counsel provides legal analysis and recommendations; APATRIS interprets and acts on those recommendations.

**Document version**: 1.0 — counsel handoff packet complete. Subsequent versions will incorporate counsel responses.

**Related documents**: Section 10 lists the seven foundation documents that this packet synthesizes from.

---

## Section 2 — Executive Summary

**The situation**: APATRIS Sp. z o.o. is building an AI-augmented legal services platform that supports Polish immigration applications for foreign workers. The platform's AI components include legal research, document drafting (e.g., uzupełnienie braków formalnych responses), case strategy recommendation, and comprehension verification. A licensed Polish radca prawny (legal counsel) reviews and signs every output before transmission to authorities or clients. The platform is currently in pre-build phase: architectural design and constitutional principles are committed to the repository; the AI inference layer has not yet been built.

**The classification verdict** (preliminary, internal): Internal research has produced a likely-not-high-risk verdict under EU AI Act Article 6 and Annex III(7), with confidence labeled ESTIMATE-medium. The reasoning rests on the Annex III(7) qualifier "by or on behalf of competent public authorities." APATRIS is private applicant-side legal services — the opposite role from authority-side decision support. The verdict is contingent on counsel confirmation. If counsel reclassifies the system as high-risk (e.g., because Annex III(7) is read more broadly, or because Annex III(5)(b) on essential public benefits is triggered), the conformity path changes substantially. Specifically, high-risk classification triggers Articles 8-15 obligations (risk management, data governance, technical documentation, record-keeping, transparency, human oversight, accuracy/robustness/cybersecurity), Annex IV technical documentation, conformity assessment under Annex VI or VII, EU declaration of conformity, CE marking, and post-market monitoring. The not-high-risk path retains lighter obligations (general transparency under Article 50, RODO compliance, professional services regulation under Polish bar rules) without the Articles 8-15 burden. The internal research at commit bf4d92b walks through both paths.

**What counsel must answer**: This packet asks counsel to confirm, correct, or reclassify the verdict; specify the conformity path obligations under either classification; address RODO Article 22 application to lawyer-supervised AI outputs; clarify Polish-specific disclosure and oversight requirements; and provide guidance on the bilingual user interface architecture's legal implications. The seven specific questions are listed in Section 8 with operational context. Counsel responses become inputs to APATRIS's pre-build architectural decisions.

Additionally, Polish administrative law regulates who is authorized to represent applicants before authorities (radca prawny, adwokat, and specific provisions in the Code of Administrative Procedure on representation). The interaction between this representation regime and AI-assisted preparation of administrative submissions is a question that benefits from counsel addressing alongside the AI Act analysis. The seven specific questions in Section 8 surface this where relevant.

---

## Section 3 — APATRIS System Context

**Provider entity**: APATRIS Sp. z o.o., headquartered in Warsaw, Poland. Polish company registered in KRS. Legal services provider with licensed radca prawny on staff.

The APATRIS network includes three distinct legal entities relevant to counsel review:

(a) APATRIS Sp. z o.o. — operates the AI-augmented legal services platform that is the subject of this packet; employs the licensed radca prawny who serves as the structural gate for AI outputs.

(b) APATRIS and Co. — provides traditional (non-AI) immigration consulting services to foreign workers; sister entity sharing brand and ownership with APATRIS Sp. z o.o.

(c) A licensed agencja pracy (job agency) operated by a related party (the spouse of APATRIS Sp. z o.o.'s Founder and Partner); occasionally engaged by the welding outsourcing operation; distinct legal entity from the APATRIS-named entities.

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

**The seven specific questions in Section 8 surface this with operational context**.

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
**Article 14 — Human oversight.** Specifically, counsel must determine whether the lawyer-as-structural-gate design (where the radca prawny reviews and signs all AI-prepared content before submission) satisfies Article 14's human oversight requirement. The lawyer's review is a meaningful human-in-the-loop intervention, not a rubber stamp.

The Article 14 question and the parallel RODO Article 22 question (Section 6) are addressed across the seven specific questions in Section 8 where each surfaces in counsel's specialization area:

- Q3 (Article 50 transparency obligations) — surfaces the disclosure dimension of human oversight (where what the user is told about the lawyer-as-gate design becomes operationally relevant)
- Q5 (RODO + AI Act intersection on probe data and verification overrides) — surfaces the operational dimension of human oversight (the verification override mechanism is a structural gate that depends on meaningful human judgment)
- Q6 (Polish AI implementation law substantive obligations) — surfaces any Polish-specific human-oversight requirements layered on the EU baseline

Counsel addressing Articles 14 and 22 should consider these three questions together. APATRIS does not require counsel to surface Articles 14 and 22 as separate questions; counsel may address them naturally in the context of Q3, Q5, and Q6, or surface them as additional findings in Section 9's General Observations field of the response template.
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

**Counsel question for Section 6**: The seven specific questions in Section 8 surface RODO concerns across multiple questions. Specifically:

- Q5 (RODO + AI Act intersection on probe data and verification overrides) is the primary RODO + AI Act intersection question, addressing data governance, retention rules, and data minimization under the joint regimes
- Q3 (Article 50 transparency obligations) intersects with RODO's transparency obligations under Articles 12-14 GDPR/RODO
- Q6 (Polish AI implementation law substantive obligations) surfaces UODO's role in supervising high-risk AI in border control contexts and any Polish-specific RODO + AI Act overlay
- Q7 (Polish-language considerations) intersects with RODO's transparency and consent requirements under Polish administrative practice

Counsel covering Section 6 (RODO + AI Act intersection) will find the substantive deliverables in Q5 primarily, with Q3 and Q7 providing transparency and language dimensions. Article 22 (automated decision-making restrictions) surfaces naturally in Q5's analysis, given that APATRIS's lawyer-as-structural-gate design is the architectural response to Article 22 concerns.

---

## Section 7 — Polish-Specific Considerations (for Polish Administrative Law Counsel)

**Polish AI implementation context**: The EU AI Act applies in Poland via direct effect for Regulations, but Polish national implementation legislation determines supervisory authority structure, enforcement procedures, and specific national obligations. As of this packet's date:

- The Polish AI implementation law was accepted by the Council of Ministers on 2026-03-31 and is currently in Sejm review. The law has not yet been enacted.
- The proposed structure designates **KRiBSI** (Komisja Rozwoju i Bezpieczeństwa Sztucznej Inteligencji — Commission for the Development and Safety of Artificial Intelligence) as the primary supervisory authority for AI systems generally.
- **UODO** (Urząd Ochrony Danych Osobowych — Personal Data Protection Office) retains advisory and supervisory roles, with primary supervision for high-risk AI systems used in border control and migration management contexts.

**Counsel question — Polish AI law status**: Given the law is in Sejm review and not yet enacted, what is APATRIS's current and prospective compliance posture? Specifically:
- Does APATRIS need to comply with the proposed structure now (in anticipation), or only after enactment?
- If APATRIS is classified as not-high-risk under the EU AI Act (per Section 4 verdict), is KRiBSI or UODO the relevant Polish supervisor?
- If the Sejm modifies the proposed structure before enactment, what monitoring should APATRIS implement to track changes?

**KPA + Foreigners Act intersection with AI Act**: APATRIS operates under the Kodeks postępowania administracyjnego (Administrative Procedure Code) and the Foreigners Act when preparing immigration submissions. The AI Act adds a layer of obligations on top of these existing regimes.

**Counsel question — KPA intersection**: How do KPA procedural requirements interact with AI-assisted preparation? Specifically:
- Are there KPA provisions that constrain what AI tools can prepare for administrative submissions?
- Article 63 KPA (form of submissions) — does AI-prepared content require specific authentication or attribution?
- Article 32 KPA (representation) — see representation regime question below
- Foreigners Act Article 108 (fikcja prawna pobytu) — APATRIS's case practice relies on this provision; does AI involvement in case preparation affect its application?
- Article 88 Foreigners Act on initial work permits, where AI-prepared application content interacts with the labor market test requirement and the wojewoda's discretion under specific provisions — what AI-specific compliance considerations arise? (This is APATRIS's primary case type: third-country nationals on initial work permits issued by the wojewoda, employed by industrial outsourcing clients.)

**Polish-language disclosure standards**: Polish law has specific requirements for client communication, contractual language, and consumer protection in services rendered in Poland. APATRIS's bilingual architecture (Polish authoritative, English bridge — see Section 3) is designed with these requirements in mind, but legal validation is needed.

**Counsel question — Bilingual disclosure**: Does APATRIS's bilingual architecture meet Polish legal requirements? Specifically:
- Are there Polish consumer protection requirements that mandate primary-language disclosure standards (e.g., Article 384 Civil Code on standard contracts)?
- Are there professional services regulations (radca prawny) requiring Polish as the authoritative language for client communications?
- Does the "Polish prevails when translations diverge" principle align with Polish legal requirements, or is APATRIS's principle stricter, weaker, or aligned?
- What documentation must APATRIS retain to demonstrate bilingual compliance?

**Counsel question — Article 50 transparency disclosures in bilingual architecture**: How should EU AI Act Article 50 transparency disclosures (that the user is interacting with an AI system and that content is AI-generated) be rendered in APATRIS's bilingual architecture? Specifically:
- Must the disclosure be in Polish only (per Polish administrative law and consumer protection requirements), in both languages (per the bilingual user experience), or in whichever language the user has selected?
- If the disclosure is in Polish authoritative with English bridge, does this satisfy Article 50?
- What documentation must APATRIS maintain to demonstrate Article 50 compliance in the bilingual context?

**Representation regime** (forward-referenced from Section 3): Polish administrative law regulates who is authorized to represent applicants before authorities. The relevant framework includes:

- Radca prawny (legal counsel) — authorized representative under Polish bar rules
- Adwokat (advocate) — authorized representative under Polish bar rules
- KPA Articles 32-33 — provisions on representation in administrative proceedings
- Doradca podatkowy (tax adviser) — authorized in tax matters; not generally in immigration
- Other authorized parties under specific statutes

**Counsel question — Representation in AI-assisted case preparation**: Does APATRIS's design satisfy Polish representation requirements? Specifically:
- When APATRIS's AI prepares an administrative submission and the radca prawny reviews and signs, who is "the representative" under KPA Articles 32-33?
- Does AI-assisted preparation fall within the scope of services a radca prawny is authorized to delegate (to AI as a tool, to staff, to other parties)?
- Are there KPA provisions that constrain the form of representation when AI tools participate in case preparation?
- What documentation must APATRIS maintain to demonstrate that the radca prawny remains the legal representative, not the AI?

**Conflict-of-interest provisions for related-party arrangements** (forward-referenced from Section 3): The APATRIS network includes a related-party agencja pracy operated by the spouse of APATRIS Sp. z o.o.'s Founder and Partner. Polish bar rules and general corporate law have provisions addressing related-party arrangements.

**Counsel question — Related-party conflicts**: Are there conflict-of-interest provisions APATRIS should be aware of? Specifically:
- Polish radca prawny ethics rules (Kodeks Etyki Radcy Prawnego) — any provisions addressing related-party clients or service arrangements?
- KPA representation provisions — any restrictions when the representative entity has related-party relationships?
- Are there disclosure obligations to clients about the multi-entity structure including the related-party agencja pracy?
- What conflict-of-interest documentation should APATRIS maintain?

**Polish bar rules — radca prawny professional responsibility** (forward-referenced from Section 5): The radca prawny who serves as the structural gate for AI outputs is governed by Polish bar rules.

**Counsel question — Professional responsibility in AI-assisted services**: How do Polish bar rules apply to the radca prawny's use of AI tools? Specifically:
- Does the radca prawny's review-and-sign action satisfy the professional responsibility requirements when AI prepared the underlying content?
- Are there mandatory disclosure obligations to clients about the AI-assisted nature of services rendered?
- What documentation must the radca prawny maintain to demonstrate professional responsibility for AI-prepared content?
- Are there professional liability insurance considerations specific to AI-assisted legal services?

**The seven specific questions in Section 8 surface these Polish-specific concerns with operational context.**

---

## Section 8 — Seven Specific Questions (Substantive Deliverable)

This section contains the seven specific questions counsel is asked to answer, drawn verbatim from the internal research at commit bf4d92b (EU_AI_ACT_ARTICLE_6_RESEARCH.md, Section 13). Each question is presented with operational context to help counsel understand why APATRIS is asking and what level of detail is most useful in the response.

**Per-question structure**:

- **Q[N] — [Question topic]**
- *Verbatim question text from research document*
- **Why APATRIS is asking**: [Operational context — what build decision depends on this answer]
- **Sub-questions counsel may address** (if helpful): [Specific framings counsel may want to address]
- **Suggested response format**: [E.g., "binary verdict + reasoning paragraph + caveats", or "structured analysis with citations to specific provisions"]
- **Confidence level requested**: VERIFIED / ESTIMATE-high / ESTIMATE-medium / UNCERTAIN — counsel should label their confidence on each answer

---

### Q1 — Annex III(7) qualifier interpretation

*Verbatim text from research document*: **Is APATRIS truly outside Annex III(7)?** The "on behalf of competent public authorities" qualifier interpretation requires counsel confirmation. Hypothetical contract-side facts (e.g., APATRIS providing services to UdSC or to a public agency) could shift this.

**Why APATRIS is asking**: APATRIS's classification verdict in Section 4 (likely-not-high-risk, ESTIMATE-medium confidence) depends on the "by or on behalf of competent public authorities" qualifier excluding applicant-side legal services. Counsel confirmation determines whether APATRIS proceeds as not-high-risk under Article 50 + Article 6(4) self-assessment, or whether reclassification triggers the full Articles 8-15 + Annex IV + conformity assessment + CE marking + post-market monitoring obligation set. This is the single most consequential question for the build sequencing of Layer 0 v1.

**Sub-questions counsel may address**: scope of Annex III(7) sub-items (a) through (d); authoritative interpretive sources for "on behalf of"; EU Commission guidance if any; whether contract-side facts (e.g., APATRIS hypothetically providing services to UdSC) would shift the verdict; treatment of mixed-context AI systems where the same model serves both applicant-side and authority-side users.

**Suggested response format**: binary verdict (in scope / out of scope / ambiguous) + reasoning paragraph + caveats listing facts that would shift the verdict.

**Confidence level requested**: counsel should label.

---

### Q2 — Profiling under Article 6(3)

*Verbatim text from research document*: **Does the Layer 3 scenarios engine constitute "profiling of natural persons" under Article 6(3)?** If APATRIS were ever classified under Annex III, the profiling clause may close the Article 6(3) exclusions. Counsel must confirm whether per-worker viability scoring is profiling under GDPR Article 4(4) for AI Act Article 6(3) purposes.

**Why APATRIS is asking**: Layer 3 (case_strategy) is designed to produce per-case viability scoring and case-strategy recommendations grounded in evidence. If APATRIS were reclassified under Annex III at any point, the profiling clause in Article 6(3) may foreclose the exclusion paths that would otherwise apply. Counsel confirmation affects Layer 3 v1 architectural decisions: specifically, whether to design viability scoring with profiling-clause assumptions baked in, or to design assuming the exclusion paths remain available.

**Sub-questions counsel may address**: definition of "profiling of natural persons" under Article 6(3) and its relationship to GDPR Article 4(4); distinction between legal analysis (which scenarios engine produces) and decisions affecting natural persons; applicability to per-case viability scoring; relationship between Article 6(3) profiling clause and the Annex III(7)(b) "risk assessment" sub-item.

**Suggested response format**: structured analysis with citations to specific provisions and any available guidance.

**Confidence level requested**: counsel should label.

---

### Q3 — Article 50 transparency obligations

*Verbatim text from research document*: **Article 50 transparency obligations**: counsel must confirm what specific disclosure language is required for the lawyer-and-client AI-disclosure surface, and whether disclosure to the immigrant client requires additional Polish-language considerations.

**Why APATRIS is asking**: Article 50 transparency disclosures must surface to users that AI is involved in the system. APATRIS's bilingual architecture (Polish authoritative, English bridge — see Section 3) intersects with Polish-language disclosure standards. Counsel confirmation determines disclosure language requirements (Polish only, both languages, or user-selected language) and the documentation APATRIS must maintain to demonstrate Article 50 compliance in the bilingual context.

**Sub-questions counsel may address**: required disclosure language for the lawyer-facing surface; required disclosure language for the client-facing surface; whether the "Polish authoritative with English bridge" architecture satisfies Article 50; documentation requirements for Article 50 compliance; intersection with Polish consumer protection requirements for primary-language disclosure.

**Suggested response format**: specific recommended disclosure language (in Polish and English) + reasoning + documentation list.

**Confidence level requested**: counsel should label.

---

### Q4 — Article 6(4) non-high-risk-assessment documentation

*Verbatim text from research document*: **Article 6(4) non-high-risk-assessment documentation**: counsel must review the assessment record before APATRIS asserts non-high-risk classification. The record should be defensible to KRiBSI on inspection.

**Why APATRIS is asking**: If APATRIS asserts non-high-risk classification under Article 6(4) per the verdict in Section 4, Article 6(4) requires a written record of the assessment. The record must be defensible to the Polish supervisory authority (KRiBSI under the proposed Polish AI implementation law) on inspection. Counsel confirmation determines whether APATRIS's reasoning satisfies Article 6(4)'s documentation requirements, what content the record must contain, who must review or sign, and what retention obligations apply.

**Sub-questions counsel may address**: required content of the Article 6(4) self-assessment record; retention requirements; whether counsel review or signature is required for the record to be defensible; intersection with KRiBSI inspection authority once the Polish law enacts; format requirements (written vs. electronic, language, structure).

**Suggested response format**: structured documentation requirements list + reasoning + reviewer/signature recommendations.

**Confidence level requested**: counsel should label.

---

### Q5 — RODO + AI Act intersection on probe data and verification overrides

*Verbatim text from research document*: **RODO + AI Act intersection on probe data and verification overrides** (per LAYER_0_DESIGN.md unknown unknown #6): counsel must confirm retention rules and data minimization obligations.

**Why APATRIS is asking**: LAYER_0_DESIGN.md (commit 3e0dead) unknown unknown #6 surfaces probe data and verification override flows in the comprehension layer. These flows involve personal data captured during AI verification probes and lawyer override events. Counsel confirmation determines retention rules (RODO Article 5 storage limitation), data minimization obligations (RODO Article 5 minimization), and the intersection with EU AI Act Article 10 (data governance for high-risk AI). Affects Layer 0 v1 build decisions on probe-data architecture and verification override logging.

**Sub-questions counsel may address**: retention rules under RODO Article 5(1)(e) for probe data and override logs; data minimization under RODO Article 5(1)(c) for the verification flows; special-category data implications if probes touch RODO Article 9 data; intersection with EU AI Act Article 10 if APATRIS were ever reclassified as high-risk; intersection with Article 22 RODO automated-decision-making for override events.

**Suggested response format**: structured analysis with retention/minimization recommendations + RODO + EU AI Act citations.

**Confidence level requested**: counsel should label.

---

### Q6 — Polish AI implementation law substantive obligations

*Verbatim text from research document*: **Polish AI implementation law substantive obligations**: counsel must review the Council of Ministers draft (2026-03-31 version) to identify any APATRIS-specific obligations beyond EU AI Act baseline.

**Why APATRIS is asking**: The Polish AI implementation law was accepted by the Council of Ministers on 2026-03-31 and is currently in Sejm review. The law adds enforcement infrastructure (KRiBSI as primary supervisor, UODO advisory plus supervisory role for high-risk AI in border control / migration) and may add substantive obligations beyond the EU AI Act baseline. Counsel review of the draft determines whether APATRIS faces Polish-specific obligations beyond the EU baseline. Affects compliance posture once the law enacts.

**Sub-questions counsel may address**: Polish-specific obligations not in the EU AI Act baseline; KRiBSI / UODO supervisory overlap and APATRIS's reporting structure; enforcement timing (when do obligations attach — at acceptance, at enactment, or at a later commencement date?); transitional provisions for systems already in development at enactment.

**Suggested response format**: gap analysis (Polish vs EU baseline) + monitoring recommendations + flagging of changes APATRIS should track during Sejm review.

**Confidence level requested**: counsel should label.

---

### Q7 — Polish-language considerations

*Verbatim text from research document*: **Polish-language considerations**: instructions for use, transparency disclosures, consent forms — counsel must confirm translation and presentation standards under Polish administrative practice.

**Why APATRIS is asking**: Instructions for use, transparency disclosures, and consent forms must satisfy Polish administrative practice and Polish consumer protection requirements. APATRIS's bilingual architecture (Polish authoritative, English bridge) is the design response to this need. Counsel confirmation determines the translation and presentation standards required, whether the bilingual architecture satisfies them, and what documentation APATRIS must maintain to demonstrate bilingual compliance.

**Sub-questions counsel may address**: required Polish-language standards for instructions for use; required standards for transparency disclosures (intersection with Q3); required standards for client consent forms; presentation conventions (e.g., font, prominence, order of language presentation); documentation of bilingual compliance for KRiBSI / UODO inspection.

**Suggested response format**: specific language and presentation requirements + documentation list + intersection with Q3 if applicable.

**Confidence level requested**: counsel should label.

---

**Response logistics**: Section 9 provides a pre-structured response template. Counsel may use the template, adapt it, or respond in any format they prefer. The structured form is offered to make integration of findings systematic — not to constrain counsel.

**Engagement timing**: Section 11 details timing expectations. The seven questions are designed to be answerable in 5-15 hours of counsel time depending on specialization breadth.

---

## Section 9 — Counsel Response Template

This section provides a pre-structured form for counsel responses. Counsel may use the template directly, adapt it, or respond in any format preferred. The structured form is offered to make integration of counsel findings into APATRIS's pre-build architectural decisions systematic.

**Response template structure**:

COUNSEL RESPONSE — APATRIS COUNSEL HANDOFF PACKET v1.0

Counsel: [Name, firm, bar number]
Specialization(s) covered: [EU AI Act / RODO / Polish administrative law / multiple]
Date of response: [YYYY-MM-DD]
Hours spent on review: [Estimate]
Repository documents reviewed: [List by filename and commit SHA from Section 10]

Q1 — [Question topic]
Counsel's answer: [Response text]
Confidence: VERIFIED / ESTIMATE-high / ESTIMATE-medium / UNCERTAIN
Reasoning summary: [1-3 sentences]
Citations: [Specific provisions, case law, formal guidance, etc.]
Caveats: [Limitations, scope of opinion, what would change the answer]

Q2 — [Question topic]
[Same structure]

[... Q3 through Q7 follow same structure ...]

GENERAL OBSERVATIONS

Risks counsel surfaces that APATRIS may not have considered: [Free-text]
Architectural recommendations counsel proposes: [Free-text]
Questions counsel surfaces that need follow-up: [Free-text]
Documentation counsel recommends APATRIS maintain: [Free-text]

ENGAGEMENT TERMS

Scope of opinion: [What is and isn't covered by this response]
Reliance: [Who can rely on this opinion and for what purpose]
Updates: [Will counsel update if law/circumstances change?]
Fee summary: [If relevant; or reference to engagement letter]

Counsel signature:
Date:

**Notes on template use**:

- Counsel may answer questions in any order
- Questions outside counsel's specialization may be marked "Outside scope — recommend [other counsel type]"
- Confidence labels (VERIFIED/ESTIMATE-high/ESTIMATE-medium/UNCERTAIN) help APATRIS calibrate which counsel answers are decisive vs which warrant additional review
- Citations to specific provisions, case law, or formal guidance are valuable for APATRIS's compliance documentation
- Caveats are encouraged — overconfidence is not useful; honest uncertainty is

**Response delivery**: Counsel may deliver responses by email, signed PDF, or any preferred format. APATRIS will integrate responses into its pre-build architectural decisions and update the master plan accordingly.

**Follow-up process**: APATRIS may have follow-up questions after reading counsel's responses. Section 11 outlines the engagement process for follow-ups.

---

## Section 10 — Repository Document References

This section lists the foundation documents that support the counsel handoff packet. Counsel may consult these documents in any order; reading priority is suggested but not required.

All documents are committed to the APATRIS repository on the main branch. Direct file access is available via the GitHub commit links below. APATRIS will provide alternative access (PDF export, email attachment, secure file share) on counsel's request.

**Document repository**: artifacts/api-server/docs/ (within the APATRIS Compliance Hub repository)

**Reading priority for the seven questions in Section 8**:

| Priority | Document | Purpose | Commit SHA |
|---|---|---|---|
| Essential | MASTER_PLAN.md | Five-layer architecture, 20 non-negotiable principles, structural design | 5873fca |
| Essential | EU_AI_ACT_ARTICLE_6_RESEARCH.md | Internal classification analysis, the seven specific counsel questions | bf4d92b |
| Essential | LAYER_0_DESIGN.md | Comprehension layer architectural design with v1/v2 sub-phase split | 3e0dead |
| High | LAYER_0_TESTABILITY.md | 17-test comprehension verification suite covering 8 principles | 1d10251 |
| High | LANGUAGE_TOGGLE_VERIFICATION.md | Bilingual architecture audit with five-label classification (1.7 percent functional toggle) | 41dedd1 |
| Medium | LANGUAGE_TIER1_REMEDIATION.md | Foundational fix plan for bilingual architecture (4-8 hour scope) | 7e6fa97 |
| Reference | This packet (COUNSEL_HANDOFF_PACKET.md) | Counsel-facing synthesis document | bd61ee3 |

**Foundation document descriptions**:

**MASTER_PLAN.md** (commit 5873fca) — The architectural reference. Defines APATRIS's five-layer architecture: Layer 0 (comprehension/reasoning verification), Layer 1 (case_reference), Layer 2 (case_summary), Layer 3 (legal_analysis), Layer 4 (case_strategy). Lists the 20 non-negotiable principles that govern the system, including the lawyer-as-structural-gate provisions, the Polish authoritative / English bridge bilingual principle, the human review structural gate, and the refusal-to-fabricate discipline. Counsel reviewing the seven questions in Section 8 should read this first because the principles inform the design constraints that shape compliance posture.

**EU_AI_ACT_ARTICLE_6_RESEARCH.md** (commit bf4d92b) — The internal classification analysis that produced the verdict in Section 4 of this packet (likely-not-high-risk under Article 6 / Annex III(7), confidence ESTIMATE-medium). Section 13 of this document contains the seven specific counsel questions verbatim. The reasoning chain in Sections 1-12 of this document supports why APATRIS is asking each question. Counsel addressing classification should read Sections 1-13 in full. Counsel addressing only specific questions may read only Section 13 plus the relevant supporting section.

**LAYER_0_DESIGN.md** (commit 3e0dead) — The architectural design for Layer 0 with explicit v1/v2 sub-phase split. Layer 0 v1 is the implementation gated on counsel review; Layer 0 v2 is the post-counsel refinement. Counsel reviewing the lawyer-as-structural-gate design should read this document because the design lives at this architectural layer.

**LAYER_0_TESTABILITY.md** (commit 1d10251) — The 17-test comprehension verification suite. Each test demonstrates a specific principle's testable behavior. Counsel reviewing the system's compliance posture may use this document as evidence that principles are operationalized, not just declared. The testability suite is also relevant to Article 9 (EU AI Act risk management system) compliance documentation.

**LANGUAGE_TOGGLE_VERIFICATION.md** (commit 41dedd1) — The bilingual architecture audit. Documents that 1.7 percent (2 of 115) of result pages have a functional language toggle, 0 percent are Polish-default, and approximately 92 percent have no i18n at all. Five-label classification system used (VERIFIED, PARTIAL-FUNCTIONAL, PARTIAL-BROKEN, MISSING, AMBIGUOUS). Counsel reviewing Polish-language disclosure standards (Section 7), Article 50 transparency disclosures, and the bilingual disclosure question should read this document because it documents the gap between APATRIS's bilingual principle and current implementation.

**LANGUAGE_TIER1_REMEDIATION.md** (commit 7e6fa97) — The foundational fix plan for the bilingual architecture. Sub-options A, B, C documented with trade-off analysis. Sub-option C (workforce-app default flip; defer dashboard) recommended. Acceptance criteria are structural (every AppShell-wrapped page passes verification). Counsel reviewing the bilingual remediation plan may consult this document for understanding the proposed compliance path.

**This packet (COUNSEL_HANDOFF_PACKET.md, commit bd61ee3)** — The counsel-facing synthesis. Section 1 (Cover Page) introduces APATRIS. Section 2 (Executive Summary) outlines the engagement scope. Section 3 (System Context) describes the operational environment. Sections 4-7 (Classification, Conformity Path, RODO Intersection, Polish-Specific Considerations) frame each specialization area. Section 8 (Seven Specific Questions) contains the substantive deliverable. Section 9 (Counsel Response Template) provides the structured response form. Sections 10-11 (this section and the next) provide engagement logistics.

**Documents not required for counsel review**:

- CHECK_LAYER1_CASE_REFERENCE.md (commit ed0b31d) — Pre-build CHECK questions for Layer 1 architecture. Internal design exercise; not yet structurally relevant to counsel review.
- MASTER_BLUEPRINT.md (commit 902117a) — Original master specification (superseded by MASTER_PLAN.md). Available for historical reference if counsel asks about architectural evolution.
- TRACK2-INVENTORY.md (commit 739f592) — Codebase audit at Day 9 baseline. Available for technical reference if counsel asks about implementation state.

**Repository access**:

The APATRIS Compliance Hub repository is private. Counsel will receive read-only access via one of:
- GitHub user invitation (preferred — versioned access, audit trail)
- Repository archive (.zip with git history) shared via secure channel
- Individual file PDFs if counsel prefers

Engagement logistics in Section 11 detail the access provisioning process.

---

## Section 11 — Engagement Logistics

**Decision authority**:

Decision authority on architectural and operational choices belongs to APATRIS (specifically: Manish Shetty, Founder and Partner of APATRIS Sp. z o.o.). Counsel's role is to:
- Answer the seven specific questions in Section 8 with confidence labels
- Surface risks APATRIS may not have considered (Section 9 General Observations)
- Recommend architectural refinements where compliance benefits would be material
- Cite specific provisions, case law, or formal guidance that supports each answer

Counsel does not decide: which sub-option APATRIS selects from a set of compliance paths, which features are prioritized, or which documentation strategies APATRIS adopts. APATRIS will weigh counsel's recommendations against operational constraints, capital priorities, and risk tolerance, and decide.

**Counsel qualifications**:

APATRIS expects counsel to be qualified in Polish law (radca prawny or adwokat) for the Polish administrative law and bar rules questions in Section 7, and qualified in EU regulatory practice for the EU AI Act questions in Sections 4 and 5 and the RODO questions in Section 6. A single counsel may cover multiple specializations; multiple counsel may collaborate on the engagement. APATRIS is open to either structure and will defer to counsel's recommendation on whether the seven questions in Section 8 are best addressed by one engagement or by multiple counsel working together.

**What APATRIS commits to providing**:

- Repository access (read-only) per Section 10
- Operational clarification on request (case examples, current process documentation, business context)
- Source documentation for any factual claim in this packet
- Reasonable response time on counsel follow-up questions (target: within 3 business days)
- Direct point of contact (Manish) for substantive questions; backup contact (TBD) for logistics

**Timing expectations**:

- **Counsel time estimate**: 5-15 hours total, depending on specialization breadth and depth of review.
- **Response timeline**: 2-4 weeks from engagement letter signing.
- **Engagement structure**: APATRIS prefers a written response (using the Section 9 template, adapted, or any preferred format). Optional follow-up call (60-90 minutes) to discuss findings and clarify recommendations.

**Fee structure**:

APATRIS expects to engage counsel on hourly billing or fixed-fee basis, at counsel's preference. Fee discussion happens in the engagement letter; this packet does not pre-negotiate fees. APATRIS budgets for thorough review and is not seeking the lowest-cost engagement.

**Engagement letter**:

A formal engagement letter will define scope, fees, reliance, confidentiality, and engagement-specific terms. APATRIS expects counsel to provide the engagement letter; APATRIS will review and execute.

**Confidentiality**:

This packet contains commercially sensitive information about APATRIS's architecture, operational processes, and business strategy. APATRIS expects counsel to treat this packet as confidential. The engagement letter should include standard confidentiality and non-disclosure provisions covering:
- This packet and all foundation documents in Section 10
- Any APATRIS internal information shared in operational clarification
- Counsel's own work product produced in response to this engagement

**Reliance**:

Counsel's response will be relied upon by APATRIS for architectural decisions, compliance documentation, and pre-launch validation. APATRIS will not rely on counsel's response for third-party advice, client-facing claims, or post-launch dispute resolution.

The engagement letter should clarify the scope of reliance APATRIS may place on counsel's response.

**Updates and currency**:

Polish AI implementation law is in Sejm review. The EU AI Act framework is being supplemented by Commission delegated acts and guidelines. APATRIS expects counsel's response to reflect the law as of the response date, with material changes flagged for follow-up.

**Follow-up process**:

After APATRIS reads counsel's response, follow-up questions may arise. APATRIS will read the response in full before submitting follow-up questions, group follow-up questions where possible, provide context, and respect counsel's billing structure.

**Engagement contact**:

Current contacts:

- **Primary**: Manish Shetty, Founder and Partner, APATRIS Sp. z o.o. — manish@apatris.pl — +48 576 341 732
- **Backup**: Akshay Gandhi, Partner and Board Member, APATRIS Sp. z o.o. — akshay@apatris.pl — +48 578 781 000
- **Mailing address**: ul. Chłodna 51, Warsaw, Poland (APATRIS Sp. z o.o.)

For the canonical current state of engagement contacts (which may be updated independently of this packet's substantive content), see COUNSEL_PACKET_CONTACTS.md in the same directory.

Counsel may contact APATRIS directly through the channels above. APATRIS will respond within 2 business days to engagement inquiries.

**Engagement initiation**:

APATRIS welcomes counsel inquiries before formal engagement. A 30-minute introductory call to discuss scope, fit, and approach is offered free of charge. After the introductory call, formal engagement proceeds via:

1. Engagement letter from counsel
2. Repository access provisioning
3. Counsel review per agreed timeline
4. Written response per Section 9 template (or counsel's preferred format)
5. Optional follow-up call after APATRIS reviews the response

---

## Document complete

The COUNSEL HANDOFF PACKET is at v1.0 — internally complete and counsel-ready for the substantive content. The seven foundation documents (Section 10) provide the supporting research. Sections 1-11 cover the engagement scope, classification, conformity path, RODO intersection, Polish-specific considerations, the seven specific questions, the response template, repository references, and engagement logistics.
