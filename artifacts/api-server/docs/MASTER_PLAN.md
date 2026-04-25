# APATRIS MASTER PLAN

This document defines what is being built, the order in which it is built, the principles every sub-phase must honor, and the immediate next steps. It is read by Claude Code as the directional document for all subsequent SUGGEST proposals, CHECK passes, and build sub-phases. Future proposals reference this document. Future architectural decisions are checked against it. If a proposal diverges from this plan, the divergence is named and resolved before the proposal proceeds.

This document supersedes the original master spec. The original spec described a comprehensive feature list. This plan describes what is actually being built, in what order, and why.

## PURPOSE

The system serves people navigating complex situations involving documents, rules, time, and human stakes. The first domain is Polish immigration practice. The architecture is generalizable to other domains where serious decisions about real people's lives must be documented, reviewed, and approved by qualified humans before consequences leave the system.

The system makes the team faster and more accurate by removing the friction between a client uploading something and a reviewed, intelligent response being ready. It gives clients dignity by letting them see their own case rather than waiting in silence. It amplifies human judgment rather than replaces it. It respects the four kinds of hope that real cases carry.

## WHO THE SYSTEM SERVES

Clients are foreigners navigating Polish legal and administrative systems. Many are vulnerable. Many support families who depend on them. Their goal is often not abstract legal victory but the ability to keep earning, to remain together, to find pathways that match their changing circumstances.

The team includes operators, lawyers, and administrative staff. They deserve tools that help them work well rather than tools that create friction. Lawyers are the human gate. Nothing leaves the system without their review.

## THE FOUR KINDS OF HOPE

Real hope: case has merit, path to positive outcome is visible.

Appeal hope: first decision negative, grounds for appeal exist, outcome uncertain.

Time hope: substantive outcome will likely fail, but the procedural pathway buys legitimate time during which the client can stay, work, and earn for their family.

Protective hope: removal proceedings are active, the legal process itself is the shield, the goal is the right to remain during proceedings.

The system distinguishes substantive merit from procedural value. Both are real. Both deserve honest representation to the lawyer and the client. The system serves time-buying appeals when that is what the client legitimately needs, without pretending the substantive outcome is better than it is.

## NON-NEGOTIABLE PRINCIPLES

Human review is the structural gate. AI output cannot reach a client or authority without lawyer approval. The gate is encoded in the system, not relied upon as discipline.

No false hope. The system tells the truth about what is possible.

No false certainty. Confidence scores are honest. Risks are surfaced. Uncertainty is named.

Source linkage. Every claim in AI-generated output traces to a specific document, statute, or regulation. Claims without sources do not ship.

Case-centered architecture. Every document, event, draft, and communication ties to the case it belongs to.

Evidence chain integrity. The system records what was sent, when, why, by whom, and to whom. Same for what was received.

Audit trail completeness. Every action affecting a case is logged. The audit log is built to be evidentially valid.

Refusal to fabricate. When the AI lacks inputs to produce meaningful output, it refuses rather than producing fluent fiction. Paths that lack legal basis citations are not generated, not filtered out after generation.

Legitimacy by construction. The scenarios engine generates only paths that exist legally and are accessible. Illegitimate paths cannot enter the candidate set.

Informed consent as data. Client choice of a legal path is recorded as a first-class entity with timestamp and consent context. Subsequent AI work on the case is scoped to the chosen path.

Numbers must be calibrated or refused. Where the system produces numerical estimates, the numbers must be grounded in real data or replaced with qualitative bands. Disclaimers do not protect lawyers or clients from trusting numbers. If calibration data does not exist, the system uses bands such as short/medium/long or low/medium/high rather than specific values.

AI-produced classifications must be backed by structured reasoning. Where the system produces a boolean or categorical judgment, the same record carries a non-nullable text field containing the structured reasoning that supports the classification. The classification is for filtering. The reasoning is what makes the classification honest.

Eight-step discipline. Ideas, review, suggestions, decision, build, test, fix, retest. No steps skipped. The eight-step is shorthand for the full execution loop documented later in this plan; the two are aligned, not in conflict.

The build outlives the builder. Every component is documented and reusable by people without context.

## CURRENT STATE

The system is shipped to production at version v295. It runs on Fly.io with Neon Postgres. It includes JWT authentication, five-tier role-based access control, encryption at rest and in transit, an Express API with around 100 endpoints, an OCR and document classification pipeline using a discriminated-union schema, a four-stage legal brief generation pipeline with seven cases on production, audit logs, S3/R2 object storage, pgvector embeddings for legal knowledge retrieval, a contract generator, and a React 19 dashboard.

A parallel platform, EEJ, is shipping at eej-jobs-api.fly.dev with around 28 modules covering recruitment, payroll, immigration intelligence, GDPR, EU AI Act compliance, ZUS calculation, candidate workflow, client management, and worker-facing legal status views.

A recent audit identified five broken-on-prod gaps: zero of twenty documents linked to cases, missing case_reference writes, empty case_notebook_entries, empty case_generated_docs, empty legal_evidence. These are one structural issue: the case-centered architecture exists in the schema and not in the data flow.

## THE FOUR-LAYER ARCHITECTURE

The build proceeds in four layers. Each layer is the foundation for the next. Skipping a layer means the layer above ships onto sand.

Layer 1: Fix the writes. The three writes that should already be firing must be made to fire. Without this, every layer above is hollow.

Layer 2: Evidence chain at send-time. Every outbound communication is recorded with recipient, time, sender, delivery method, and proof of delivery reference. Without this, every path the scenarios engine generates lacks audit trail.

Layer 3: Scenarios engine. The new stage in the legal_briefs pipeline that generates three to five candidate paths per case, each carrying mandatory legal basis citation, mandatory merit argument text, prerequisites, time forecast, earnings forecast, cost forecast, net benefit, viability score, and good-faith-appeal flag. Time and earnings forecasts ship as qualitative bands in v1 and as calibrated numerical values in v2 once the firm's historical case data is structured to support calibration.

Layer 4: Consent loop. The new client_path_selections table records which path was generated, which the lawyer recommended, which the client chose, when, how, and the consent context. Subsequent AI work is scoped to the chosen path. Consent context includes structured artifacts (uploaded signed forms, audio recording references with timestamps) where applicable, not freeform notes alone.

Each layer has its own SUGGEST proposal, CHECK pass, and build sequence. The dependencies between layers are strict. Layer 2 cannot start until Layer 1 is complete. Layer 3 cannot start until Layer 2 is complete. Layer 4 cannot start until Layer 3 is complete.

## LAYER 1: FIX THE WRITES

Three writes must fire. Plus one discipline gap.

Write one: case_reference populates on trc_cases when a lawyer creates a case. Today nobody writes it.

Before code: define case_reference. Specify format, uniqueness rule, who owns the namespace, what happens for cases that span multiple legal entities in the group. The current schema comment implies authority-issued ("Polish authority case ID, e.g. WSC-II-S.6151.111539.2025") but this creates a chicken-and-egg problem because the linker depends on case_reference for matching, and authority-issued references do not exist at case creation. The likely correct architecture is hybrid: an Apatris-internal case ID assigned at creation (used by the linker), with the authority reference added as a separate field when received (surfaced to lawyer and client). This decision must be made before code begins.

Write two: linkDocument actually populates document_intake.linked_case_id on every upload. The function exists; the primary match path is broken because case_reference is empty. Once write one is firing, the diagnosis says write two should follow. CHECK that this is the only remaining gap before assuming.

Write three: case_notebook_entries populates on every status change and document confirmation. Today the table is empty because nothing inserts into it. Identify every code path that should trigger an insert.

Discipline gap: case_generated_docs.sent_to is the only column in the schema that names a recipient and it is empty on production. Before any document leaves the system, sent_to must be populated. This is a process and code change.

Backfill: existing data on production must be brought into the new write discipline where possible. The 20 existing documents without linked_case_id should be linked retroactively where the data supports it. Cases without case_reference get one assigned. case_notebook_entries gets populated for known historical status changes where the data exists to do so. Backfill is partial by definition; some documents will remain unlinked because the data does not exist to link them retroactively.

Estimate at the demonstrated build pace: two to three weeks for new writes. Backfill is its own multi-day project. Either explicitly accept that backfill is partial or budget for hand-curation.

## LAYER 2: EVIDENCE CHAIN AT SEND-TIME

Every outbound communication writes a recipient capture record with sent_to, sent_at, sent_by, delivery_method, and proof_of_delivery_ref. Email sends. Documents mailed. Generated PDFs that are attached to messages. API calls to authority systems. Every send-point must be instrumented.

Architectural decision before Layer 2 starts: where does the send-event capture live. Two options.

Option A: add sent_to and related columns to many existing tables. High coordination cost. Drift risk because every new send-point requires schema work.

Option B: create a unified outbound_communications table that every send-point writes to. Cleaner. Every send-point in the codebase needs one new line of code that writes to the unified table.

Recommendation in the plan: Option B for survivability. The unified table is the single source of truth for everything that has left the system. Existing tables can carry references to outbound_communications.id where useful. This decision is made now so Layer 2 implementation does not branch.

Before implementation: a code-wide audit identifies every place in the codebase where something leaves the system. The implementation estimate depends on what the audit finds. The two-to-three-week estimate assumes a moderate number of send-points; a larger codebase audit may extend the timeline.

The principle: no document leaves Apatris without a recorded recipient. No null recipients. No "we sent it somewhere." The inspector-loses-the-appeal scenario must be defensible by producing the row and producing the proof.

Estimate at the demonstrated build pace: two to three weeks, pending audit results.

## LAYER 3: SCENARIOS ENGINE

A new stage in the legal_briefs pipeline, stage5_alternatives, takes verified facts from stages 1 through 4 and generates three to five candidate paths per case.

Each path is required to carry, as non-nullable fields:

Legal basis: Polish law article and section. The path does not render without this. This is the structural enforcement of legitimacy.

Merit argument: structured legal text articulating the substantive merit of the path, distinct from any time-buying value. The text field is non-nullable. If the AI cannot articulate the merit argument, the path does not render. This makes the is_good_faith_appeal boolean honest by requiring the reasoning that supports it.

Prerequisites: documents needed, eligibility windows, conditions that must be met.

Forecast time: in v1, qualitative band (short, medium, long stretch). In v2, calibrated months grounded in the firm's actual historical case data for similar cases at the relevant office and case type.

Forecast earnings: in v1, qualitative band (low, medium, high earning potential during the stretch). In v2, calibrated numerical estimate grounded in the firm's actual historical data on what comparable workers have earned.

Forecast costs: in v1, qualitative band. In v2, calibrated numerical estimate of legal fees, ZUS contributions, filing fees, translation costs, accommodation costs.

Net benefit: in v1, qualitative assessment (likely positive, neutral, likely negative). In v2, calibrated numerical net.

Viability score: zero to one hundred with explicit reasoning text.

is_good_faith_appeal: boolean. Only paths with substantive merit are generated. Pure delay tactics never enter the candidate set. The boolean is supported by the merit argument text field above.

Calibration dependency: the engine ships v1 with qualitative bands and v2 with calibrated numbers once historical case data extraction is real. The two stages are distinguished structurally in the schema (a calibration_status field per path) so the lawyer reviewing the output knows whether the forecast is general or grounded.

Output format: not a document. A time-and-money assessment for one specific person, displayed on the unified review surface, ready for the lawyer to evaluate and present to the client.

Existing legal_briefs migration: the seven existing rows on prod predate stage5_alternatives. The choice for handling them must be made before Layer 3 ships. Options: backfill stage5 retroactively for existing cases, re-run the pipeline on existing cases, or mark them is_pre_stage5 and only new cases get alternatives. The decision is made at Layer 3 SUGGEST stage.

Estimate at the demonstrated build pace: four to six weeks for the engine itself, plus the parallel historical-data calibration work which may extend across additional months.

## LAYER 4: CONSENT LOOP

A new table, client_path_selections, records:

Path identifier (which generated path).

Lawyer recommendation (which path the lawyer recommended).

Client choice (which path the client chose).

Choice timestamp.

Consent method (verbal, signed, recorded).

Consent context. For RODO and EU AI Act compliance, this includes structured artifacts where applicable: references to uploaded signed consent forms, audio recording timestamps, written confirmation message IDs, and so on. Freeform notes are allowed for context but are not the primary evidence. The artifact storage is specified at Layer 4 SUGGEST stage.

Once a client chooses, all subsequent AI work on that case is scoped to the chosen path. The AI does not re-litigate options the client already declined. The lawyer can mark a path "ruled out" and that decision propagates.

Estimate at the demonstrated build pace: two to three weeks.

## CROSS-CUTTING WORK

The unified case review surface. One page, displayed to the lawyer, showing client identity and case stage, every linked document with extracted facts, AI first-pass analysis, generated paths from Layer 3, verification report, risks, lawyer's input area, and approval and dispatch controls. This surface ships after Layer 4 because it depends on all four layers being real.

Before this surface ships: existing aggregator code (getLinkedCaseView in the legal services, routes/timeline.ts for worker scope) must be addressed. The decision is whether to deprecate them when the new surface ships, evolve them into the new surface, or maintain them alongside. Maintaining all three creates duplicate views of the same data with potential for drift and lawyer confusion. The plan decision: deprecate the existing aggregators when the unified surface ships, redirect their callers to the new surface, and remove the old code in a follow-up sub-phase. The deprecation plan is part of the Layer 3 or Layer 4 SUGGEST.

Estimate: four to six weeks.

The client portal. Clients log in, see their case, upload documents, respond to questions, track progress, and see the paths the lawyer is presenting to them as Layer 4 unfolds. This ships in parallel with Layer 4 because it depends on consent recording. The portal architecture should be built in a form that can later replace EEJ's worker-facing layer when consolidation happens.

Estimate: six to eight weeks.

The historical-case-data extraction. The firm's thirteen years of case files are the calibration source for Layer 3 v2 forecasts and the pattern source for the scenarios engine itself. This is a multi-month parallel project. It is not blocked on the four layers; it is blocked on someone deciding to start it. The earlier it starts, the better Layer 3 v2 will be.

## WHAT IS EXPLICITLY DROPPED FROM THE MASTER SPEC FOR THIS VERSION

prompt_templates table. Premature. Prompts as code constants are fine until versioning pain emerges.

Litigation hold automation. Later. Needs retention foundation first.

Seven separate workqueues. Start with one review queue once case_generated_docs actually populates.

document_chunks and extracted_facts as relational tables. JSONB on document_intake is sufficient until search demands chunked retrieval.

Full export pipeline. Does not build until paths and consent are real.

Counterargument generation as a separate feature. Folded into the scenarios engine output where each path includes its strongest counterargument.

Multi-case analytics. Defer until enough cases have flowed through the four layers to produce meaningful patterns.

Source provenance panel as a separate feature. Folded into the unified review surface where each paragraph of generated output carries its source citation.

These items go to the queue, not the build. They may be added back when the foundation supports them.

## EXECUTION LOOP

The loop for every sub-phase is:

A SUGGEST proposal is drafted with deep search of the existing codebase, VERIFIED/DECISION/ESTIMATE labels on every claim, the buffer principle applied (operational percentage versus buffer percentage with named buffer items), survivability check (what a future engineer needs to read), an adversarial argue-against section, and an unknown unknowns section.

The proposal is reviewed by the human in the loop and by a separate reviewer working in three-lens mode (what is wrong, what is right, what is near-miss).

A CHECK pass runs against the codebase and production data to verify assumptions before code is written. CHECK has three outcomes: PROCEED, PIVOT, SHELVE. The decision rule for these outcomes: PROCEED if no major broken assumption is found and all blocking questions have answers; PIVOT if any major architectural assumption proves false or any blocking question cannot be resolved without redesign; SHELVE if the work as scoped does not solve the underlying problem and a different sub-phase should be run instead.

If PROCEED, an execution prompt is drafted for the build agent, with character-safety verification before paste, hard boundaries, expected outputs, and explicit stop conditions between sub-steps.

The build agent executes the build, stopping between sub-steps for verification.

Each sub-step's output is reviewed in three-lens mode.

Tests run with at least three scenarios: positive (system handles correctly), negative (system refuses or escalates correctly), and dummy (system refuses to fabricate when inputs do not warrant output).

If tests pass, the build ships to staging. Smoke tests run. Smoke results are reviewed. On pass, the build promotes to production via a documented procedure with a pre-written rollback path.

When real cases reveal failures, those cases enter the regression bank. Future builds run against the bank before shipping.

Cost-cap escalation rule: if a sub-phase exceeds its estimate by 50 percent, the work pauses and re-enters SUGGEST. This prevents silent timeline drift.

## CHARACTER SAFETY

Every prompt containing shell commands, SQL, or executable text must be verified for character integrity before pasting. Smart quotes versus straight quotes. En-dashes versus double hyphens. Non-breaking spaces in commands. The chat layer between AI and executor is not a trusted transport.

## DUAL-PLATFORM CONSIDERATION

APATRIS is the primary build target. EEJ is the parallel platform that ships with broader feature coverage. Every architectural decision in APATRIS should be evaluated for whether it should also become the pattern for EEJ when consolidation happens. The plan to eventually replace EEJ's current implementation with the hardened APATRIS architecture is the right plan because it reduces long-term maintenance burden. SUGGEST proposals note when a pattern is being established that will later propagate to EEJ.

## REGULATORY POSITIONING

The system serves businesses operating in a regulatory environment that scrutinizes the boundary between genuine outsourcing and disguised staffing, between legitimate immigration practice and unauthorized legal services, and between AI-assisted work and unsupervised AI decision-making. Every architectural choice has regulatory implications. The audit trail is regulatory defense. The lawyer review gate is regulatory defense. The source linkage is regulatory defense. The refusal to fabricate is regulatory defense. RODO compliance, EU AI Act compliance, and Polish-specific labor law compliance are designed in from the start, not retrofitted.

## REVIEW HISTORY AND ELEVEN ADJUSTMENTS

This plan was reviewed by Claude Code in its capacity as codebase-aware reviewer. The review identified eleven adjustments. Three were classified as blocking and have been integrated into the plan above. Eight were classified as resolvable at SUGGEST stage of each layer and are listed here as known concerns to address when each layer's SUGGEST is drafted.

Blocking adjustments integrated above:

One. Layer 2 scope is wider than originally acknowledged and requires an architectural decision between adding columns to many tables versus creating a unified outbound_communications table. The plan now specifies the unified table approach.

Two. Layer 3 numerical forecasts are dangerous without calibration. The plan now ships v1 with qualitative bands and v2 with calibrated numbers.

Three. is_good_faith_appeal as a boolean is structurally weak. The plan now requires a non-nullable merit_argument text field that supports the boolean.

Adjustments to address at SUGGEST stage:

Four. Layer 1 backfill is harder than originally estimated. Backfill is now explicitly partial. The Layer 1 SUGGEST must specify which existing data is recoverable and which remains unlinked.

Five. Existing legal_briefs (seven prod cases) need a migration plan when stage5 ships. The Layer 3 SUGGEST must specify whether to backfill, re-run, or mark as is_pre_stage5.

Six. Existing infrastructure (getLinkedCaseView, routes/timeline.ts) has dangling fate when the unified review surface ships. The plan now specifies deprecation but the SUGGEST for the unified surface must produce the deprecation plan.

Seven. CHECK's three outcomes (PROCEED, PIVOT, SHELVE) now have a decision rule documented in the execution loop section above.

Eight. Failure mode for terminal cases (when the scenarios engine cannot generate any good-faith path) must be specified at Layer 3 SUGGEST.

Nine. Cost-cap escalation rule is documented in the execution loop section above.

Ten. Consent context as freeform may not survive RODO scrutiny. The plan now specifies structured artifacts at Layer 4 with details to be specified at Layer 4 SUGGEST.

Eleven. Eight-step discipline and execution loop alignment is now documented in the principles section.

## THE FIRST CONCRETE STEP

The first SUGGEST proposal under this plan is for Layer 1, sub-phase one: making case_reference populate at intake.

Before drafting the technical proposal, a CHECK pass must address seven product decisions. These decisions cannot be answered by code or production data; they are business-level decisions that must precede the technical proposal.

The seven product decisions:

A1: Source of truth for case_reference. Apatris-internal-assigned, authority-issued, or hybrid. The schema comment implies authority-issued but this creates a chicken-and-egg problem. The likely correct answer is hybrid: an internal case ID at creation, with the authority reference added when received as a separate field.

A2: Format specification. If authority-issued or hybrid, what is the canonical format. Are there office variants. Are there multi-stage references when cases escalate to courts.

A3: Uniqueness scope. Within tenant, globally, or within tenant and worker. Whether uniqueness is enforceable as a constraint or only soft expectation.

A4: Multi-entity behavior. What does tenant mean in the data model. One per agency, one per legal entity within an agency, or shared across entities in a group.

A5: When does case_reference get added. At case creation, during first document upload, at manual edit step, or all three.

A6: Mutability. Once set, can it change. Immutable, updateable with audit trail, append-only, or array of references.

A7: Failure mode. What happens when a document arrives wanting to link by case_reference and no matching case exists.

In addition, code verification (Parts B), production data verification (Part C), edge case resolution (Part D), and backfill feasibility (Part E) must run in parallel against the codebase and production data. The full CHECK questions document is preserved separately as MASTER_PLAN_REVIEW.md or CHECK_LAYER1_CASE_REFERENCE.md.

After the CHECK is complete and a recommendation of PROCEED is made, the technical proposal specifies the write-path implementation and the build proceeds following the standard execution loop.

## CLOSING

The system is being built to serve a chain of relationships and yeses that has accumulated across thirteen years of practice. The system exists so the chain can continue at scale, beyond what any one person can personally extend. Every architectural decision is checked against this purpose. Every feature serves the chain or it does not ship.

The system outlives the builder. The chain is the legacy. The system serves the chain.
