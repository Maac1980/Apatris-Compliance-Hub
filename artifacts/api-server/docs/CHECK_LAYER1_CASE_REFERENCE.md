# CHECK QUESTIONS — Layer 1, Sub-phase 1: case_reference definition

Frame: Manish builds for what continues beyond him. The case_reference field is the anchor of the evidence chain — without it the linker cannot fire, and without the linker every case timeline aggregates zero documents. This CHECK answers what case_reference actually is, where it comes from, when it becomes available, and how it should be enforced — so the technical proposal that follows isn't designing in a vacuum.

Output expectation for chat-Claude: for each question, label the answer as PRODUCT-DECISION (Manish must decide), CODE-VERIFIED (read from repo at HEAD), PROD-VERIFIED (read from Neon v295), or EXTERNAL-KNOWLEDGE (Polish authority practice). If a question has multiple sub-questions, answer each.

Hard boundaries: read-only. No code changes. No commits. No database writes. SELECT-only on prod Neon. If a sub-question reveals a structural break (e.g., format incompatibility with current schema), surface immediately rather than completing the rest.

## PART 0 — Already verified in prior CHECK pass (do NOT re-verify)

These are CODE-VERIFIED at commit 739f592 / PROD-VERIFIED at v295:

- trc_cases.case_reference is TEXT, nullable, no writer in repo (only the schema-add comment and one read in document-intake-hardening.service.ts:282)
- Conditional partial index idx_trc_cases_case_reference ON trc_cases (tenant_id, worker_id, case_reference) WHERE case_reference IS NOT NULL exists
- 0/5 prod rows have case_reference populated
- 0/20 document_intake rows have linked_case_id populated
- Schema comment documents it as "Polish authority case ID (e.g. WSC-II-S.6151.111539.2025)"
- linkDocument() in document-intake.service.ts:271-313 uses case_reference as primary match key
- tenant_id on trc_cases is TEXT NOT NULL; on legal_cases is UUID NOT NULL REFERENCES tenants(id) — schema drift exists between these two tables

These are the starting facts. The questions below extend the CHECK to what we don't yet know.

## PART A — PRODUCT DEFINITION (Manish must decide)

These cannot be answered by code or prod data. They are business-level decisions that must precede the technical proposal.

A1. Source of truth for case_reference.

Is case_reference (a) Apatris-internal-assigned (we own the namespace, we generate it when a case is created, we control format), (b) authority-issued (the Polish voivodeship office assigns it when we file, we capture it from authority correspondence later), or (c) hybrid (Apatris assigns an internal ID at case creation, the authority reference is added when received)?

The schema comment says "Polish authority case ID" which implies (b). But (b) means case_reference cannot be NOT NULL at case creation — the authority hasn't issued it yet. The linker depends on it for matching, which means uploaded documents arriving before the authority reference is captured will fail to link. This affects whether the case-creation flow blocks waiting for a reference, or whether cases live without one until the authority issues one.

A2. Format specification.

If authority-issued (path b above), what is the canonical format? Is it always [OFFICE-CODE]-[ROMAN]-[LETTER].[NUMBER].[NUMBER].[YEAR] (e.g., WSC-II-S.6151.111539.2025)? Are there office variants (Mazowiecki vs Malopolski use different prefixes)? Are there multi-stage references (first-instance reference vs WSA-court reference vs NSA-supreme-court reference) that all attach to the same case as it escalates? If yes, do we store one column or multiple columns or a JSON array?

A3. Uniqueness scope.

Is case_reference unique (a) within (tenant_id, case_reference) — each tenant has its own namespace, (b) globally unique across all tenants — because Polish authority references are globally unique by construction, (c) unique within (tenant_id, worker_id, case_reference) — same worker could have multiple cases with different references, or (d) something else? The current partial index is (tenant_id, worker_id, case_reference) which suggests (c) but is non-unique. Is uniqueness even an enforceable constraint or only a soft expectation?

A4. Multi-entity behavior.

What does "tenant" mean in Apatris's data model — one per agency-using-Apatris (the SaaS interpretation), or one per legal entity within a single agency (APATRIS Sp. z o.o. vs APATRIS and Co. as separate tenants), or one per agency-and-its-legal-entities-share-a-tenant? The plan asks the question; the answer determines whether uniqueness scope (A3) needs to think about cross-entity collisions.

A5. When does it get added?

When does the lawyer first have a case_reference to enter? Is it (a) at case creation in the dashboard (lawyer has the authority's letter in hand), (b) during the first document upload (extracted from the authority correspondence by AI), (c) at a manual edit step after the authority responds, or (d) all three are possible entry points?

If (b), the AI extractor must be able to parse the format (A2). If (a), the dashboard needs a field. If (c), the lawyer needs an edit UI. The technical proposal cannot specify code locations until the entry points are decided.

A6. Mutability.

Once case_reference is set, can it change? Authorities sometimes issue corrected references, or the case escalates to a court with a new reference. Options: (a) immutable once set, (b) updateable with audit trail, (c) append-only (new reference replaces but old is preserved), (d) array of references. This affects the schema and the linker's behavior on update.

A7. Failure mode.

What does the lawyer see if a case has no case_reference and a document arrives that wants to link by reference? The linker today returns linkedCaseId: null. Should the document still be ingested without a case link (current behavior, weak), should it queue for manual review, should it block? The non-negotiable principle says "documents stay attached to their case" — but if the case is unidentified, what does "attached" mean?

## PART B — CODE VERIFICATION (CHECK against repo at HEAD)

B1. AI extraction of case_reference.

Verify whether the document-intake AI extraction prompt (lib/document-schemas.ts::INTAKE_PROMPT_V2) instructs the model to extract case_reference from authority documents. If yes, where does the extracted value flow — does it reach linkDocument() via credentials.caseReference? If no, the extraction prompt needs an addition before the linker can succeed even with case_reference enabled.

Methodology: read lib/document-schemas.ts and services/document-intake.service.ts. Trace the path from extracted JSON to linkDocument(credentials.caseReference).

B2. Existing UI surface for case_reference.

Verify whether the dashboard (artifacts/apatris-dashboard) has any input field, display field, or column for case_reference on the case-creation, case-edit, or case-list pages. Grep for the string. If absent, the UI work is part of this sub-phase scope; if present, what does it currently display when the value is null?

B3. Existing pseudo-references in notes or other freeform fields.

Check whether prior cases have stuffed authority case IDs into trc_cases.notes or legal_cases.notes as a workaround for the missing column. If yes, those become backfill candidates.

Methodology: query prod for notes field contents on the 5 existing rows and look for patterns matching [A-Z]+-[IVX]+-[A-Z]\.\d+\.\d+\.\d{4} or similar.

## PART C — PRODUCTION DATA VERIFICATION (read-only Neon SELECTs)

C1. Is there extracted case_reference data sitting in document_intake.ai_extracted_json that hasn't propagated?

Of 20 existing document_intake rows, how many have a case_reference-like value in the ai_extracted_json JSONB? If many, the extraction is working but the propagation to trc_cases is what's broken — that changes the fix from "add extraction" to "add propagation."

Methodology: SELECT id, ai_extracted_json->>'caseReference' FROM document_intake WHERE ai_extracted_json IS NOT NULL.

C2. Existing tenant_id values on trc_cases.

What do the 5 existing tenant_id strings look like? Are they UUIDs cast to TEXT (then we have a casting concern with legal_cases.tenant_id UUID), or are they readable agency names (then we have a multi-entity question), or some mix?

Methodology: SELECT DISTINCT tenant_id FROM trc_cases.

C3. Cross-table tenant consistency.

For the 5 existing cases, does each trc_cases.tenant_id (TEXT) match a corresponding legal_cases.tenant_id (UUID via trc_case_id join)? If they don't, the schema drift has actually leaked into data — and any uniqueness scope using tenant_id will misbehave.

## PART D — EDGE CASES TO RESOLVE BEFORE TECHNICAL PROPOSAL

D1. Format normalization. Does the system canonicalize whitespace, casing, dashes-vs-en-dashes on input? If two lawyers enter the same authority reference with different whitespace, do they collide?

D2. Same reference, different workers. If the same authority case_reference shows up in documents linking to two different workers, what does the system do? Treat as authority error and flag? Treat as same case for both workers? Refuse to link the second?

D3. Reference from a court appeal. When a TRC case escalates to WSA, the court issues a new reference. Is that the same case or a child case? Schema today has no parent_case_id — adding one is its own design decision.

D4. Cross-tenant reference visibility. If tenant A and tenant B are both tracking the same migrant worker (they switched agencies), and both have a case with the same authority reference — should the system allow this? Reject as duplicate? Merge?

## PART E — BACKFILL FEASIBILITY

E1. For the 5 existing trc_cases rows, can we backfill case_reference?

Sources to check:
- notes field freeform text (Part B3)
- document_intake.ai_extracted_json for documents linked to those 5 cases via worker_id (Part C1)
- Lawyer hand-curation if the data exists in physical files

If none of those sources yield a value, the row stays without case_reference. The backfill is partial by definition.

E2. For the 20 existing document_intake rows, can we retroactively populate linked_case_id?

Even after Layer 1's writes are firing, retroactive linkage requires the docs to be re-run through linkDocument() against now-populated case_reference values. Plan for one-shot script vs. accept partial coverage.

## PART F — POST-CHECK DECISION

After all of A-E are answered, the recommendation is one of:

- PROCEED: definition is clear, format is decided, entry points are identified, backfill is bounded. Move to technical proposal.
- PIVOT: at least one PRODUCT-DECISION (Part A) needs more thought, OR one EDGE CASE (Part D) reveals a model-level issue. Pause for design discussion.
- SHELVE: the writes problem is symptomatic of a deeper case-identity problem that requires a design conversation about Apatris-internal vs authority-issued IDs first.
