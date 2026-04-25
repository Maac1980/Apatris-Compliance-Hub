# APATRIS LEGAL INTELLIGENCE MASTER BUILD

## 1. Purpose
This is the final master build file for the Apatris legal intelligence platform. It combines the entire system from A to Z: case intake, upload processing, OCR, document classification, fact extraction, legal retrieval, AI drafting, verification, lawyer review, export, archive, retention, governance, and security.

## 2. Product vision
Build one case-centered workspace where every upload is connected to the case, every AI answer is tied to source documents and legal authorities, every draft is reviewable by a lawyer, and every final output is approved before export.

## 3. What the system must do
- Manage workers, cases, permits, appeals, contracts, protocols, and legal research.
- Ingest all uploaded documents and connect them to one case ID.
- Convert scans, PDFs, photos, and emails into searchable text.
- Extract facts, dates, deadlines, issues, and missing evidence.
- Retrieve relevant law, internal playbooks, and approved templates.
- Draft appeals, contracts, protocols, and legal briefs.
- Verify claims, citations, deadlines, and contradictions.
- Send drafts to lawyer review and redline mode.
- Export final documents to Word and PDF.
- Maintain audit logs, version history, access control, and retention holds.

## 4. What makes it strong
This build is stronger than a standard agency tool because it combines case management, retrieval-based drafting, lawyer review, retention controls, auditability, and source provenance in a single system. Legal AI workflows increasingly emphasize case linkage, audit trails, source-backed output, and human oversight, which is why every module here is designed around traceability and reviewability. [web:118][web:119][web:123][web:130][web:136][web:137][web:138][web:141][web:143][web:146][web:151][web:153][web:184][web:186][web:189][web:190][web:194][web:195][web:196][web:197][web:200][web:201][web:202][web:204]

## 5. System architecture
### Frontend
- Next.js or React dashboard.
- Case workspace page.
- Document explorer.
- Legal review workspace.
- Draft comparison view.
- Source citation panel.
- Timeline and deadline panel.
- Approval screen.

### Backend
- Node.js API.
- Case orchestration service.
- OCR and parsing service.
- Document classification service.
- Retrieval service.
- Draft generation service.
- Verification service.
- Export service.
- Audit logging service.
- Retention and litigation-hold service.
- Security and permissions service.

### Storage
- Postgres database.
- Object storage for files.
- Vector store for legal sources and templates.
- Immutable audit log store.
- Secure backups.

## 6. Database model
### Core tables
- cases
- case_parties
- case_documents
- document_chunks
- extracted_facts
- legal_issues
- deadline_events
- ai_drafts
- lawyer_reviews
- tasks
- audit_logs
- knowledge_base_sources
- prompt_templates
- export_versions
- retention_flags
- case_sources
- source_links
- verification_runs
- model_runs
- security_events
- access_logs
- review_assignments

### Important fields
- case_type
- status
- priority
- assigned_lawyer
- assigned_operator
- retention_status
- litigation_hold
- retention_end_date
- evidence_preservation_required
- approval_status
- source_completeness_score
- confidence_score
- risk_level
- export_locked

## 7. Case lifecycle
1. Create case.
2. Add parties.
3. Upload documents.
4. OCR and classify files.
5. Attach documents to the case.
6. Extract facts, deadlines, and issues.
7. Retrieve law and templates.
8. Generate draft.
9. Verify claims and sources.
10. Route to lawyer review.
11. Approve or revise.
12. Export final output.
13. Archive the matter.
14. Preserve logs and retention records.
15. Enforce litigation hold if required.

## 8. Mandatory operating rules
- Never invent facts, legal citations, deadlines, or legal authority.
- Never let AI finalize or send legal output without human approval.
- Never let a case proceed without source linkage.
- Never let a document be detached from its case.
- Never close a matter without audit history.
- Never delete a record when litigation hold or evidence preservation is active.
- Never use one prompt to do the entire pipeline.
- Never allow export if verification failed.
- Never allow a draft to bypass lawyer review.

## 9. Advanced differentiators
### 1) Source-linked answer engine
Every AI answer must be tied to the exact file, page, chunk, statute, or internal rule used to produce it.

### 2) Case memory layer
The system should remember prior drafts, approved positions, prior objections, repeated issue patterns, and common argument structures for each client and matter type.

### 3) Litigation-hold automation
If a matter becomes dispute-sensitive, the system should mark documents and prevent deletion until the hold is removed.

### 4) Deadline autopilot
Deadlines should be extracted, checked, surfaced on the dashboard, and rechecked whenever new documents are uploaded.

### 5) Evidence completeness scoring
The platform should score how complete a case is before drafting or filing.

### 6) Counterargument generation
For appeals and disputes, the AI should generate the strongest supporting argument and the strongest expected counterargument.

### 7) Lawyer redline mode
The lawyer should see the AI draft, the source panel, and a redline-ready editing mode in one view.

### 8) Version comparison
The system should compare draft versions and show what changed and why.

### 9) Quality gates
Use thresholds for citation coverage, fact completeness, and confidence before the draft can move to review.

### 10) Template intelligence
Approved language, clauses, and argument blocks should be stored as reusable templates with version control.

### 11) Multi-case analytics
Track trends across matters: rejection reasons, turnaround time, success rates, and recurring document gaps.

### 12) Role-based workqueues
Separate queues for intake, research, drafting, review, escalation, and archive.

### 13) Source provenance panel
Show which source contributed to each paragraph or issue point.

### 14) Change log generation
Automatically generate a log of what the AI changed between stages.

### 15) Exception routing
If the system detects missing evidence, conflicting facts, or a high-risk legal issue, it routes the case to manual review.

### 16) Security controls
Role-based access, case-level permissions, encrypted storage, secure backups, export restrictions, and approval-only sharing.

### 17) Audit controls
Immutable logs, prompt-version history, model-run history, approval history, and export history.

## 10. Retention and evidence rule
For Polish employee matters, record-retention and evidence-preservation rules must be tracked. Employer personnel files are generally retained for 10 years in many cases, but if documents may be evidence in proceedings they may need to be kept longer until the matter is finally concluded, and retention extensions may be required in some situations. [web:106][web:79][web:88][web:203]

## 11. Case-connected modules
### A. Appeal generator
Use this for worker rejections, dismissals, and employment disputes.

Input:
- rejection letter or termination notice
- worker documents
- employer records
- timelines
- relevant law
- internal playbook rules

Output:
- case summary
- verified facts
- deadline analysis
- applicable law
- arguments
- evidence list
- weak points
- draft appeal
- lawyer review notes

### B. Contract generator
Use this for service agreements, outsourcing contracts, and related documents.

Input:
- client intake
- scope
- pricing
- billing model
- jurisdiction
- clause library
- compliance requirements

Output:
- deal summary
- assumptions
- draft contract
- optional clauses
- risk flags
- missing information
- lawyer review checklist

### C. Protocol generator
Use this for operational protocols, handover instructions, internal procedures, and case-handling SOPs.

Input:
- process description
- operational rules
- compliance requirements
- escalation rules
- approval rules

Output:
- protocol title
- purpose
- scope
- step-by-step procedure
- responsibilities
- exception handling
- approval and version section

## 12. Prompt pack for Claude Code
### Prompt 1: Upload intake
```text
You are a legal case intake assistant.

Task:
Analyze the uploaded document and classify it for a legal case workspace.

Rules:
- Do not invent facts.
- If a field is missing, return "unknown".
- Identify the document type, date, parties, jurisdiction, case relevance, and deadlines.
- Extract all visible names, dates, amounts, reference numbers, and required actions.
- If the document is scanned or unclear, note OCR confidence issues.
- Return structured JSON only.

Output fields:
- document_type
- document_subtype
- parties
- dates
- jurisdiction
- deadlines
- key_facts
- missing_information
- risk_flags
- suggested_case_tags
```

### Prompt 2: Case summary
```text
You are a legal case summarization assistant.

Task:
Create a complete case summary from the linked documents and extracted facts.

Rules:
- Use only the provided case materials.
- Separate verified facts from assumptions.
- Cite the source document for every important statement.
- Identify the current procedural posture.
- List what is still missing before a lawyer can finalize strategy.

Output sections:
1. Case summary
2. Verified facts
3. Procedural posture
4. Missing facts
5. Deadlines
6. Risk flags
7. Recommended next action
```

### Prompt 3: Issue spotting
```text
You are a legal issue spotting assistant.

Task:
Review the case file and identify legal issues, procedural issues, deadline risks, and evidence gaps.

Rules:
- Do not give final legal advice.
- Do not invent statutes or deadlines.
- Tag each issue by severity: low, medium, high, or critical.
- For each issue, explain why it matters and what evidence would reduce the risk.
- If law is missing from the knowledge base, mark it as "needs research".

Output:
- issue
- severity
- explanation
- source_documents
- related_law_topics
- missing_evidence
- action_needed
```

### Prompt 4: Retrieval
```text
You are a legal retrieval assistant.

Task:
Find the most relevant statutes, regulations, internal playbook rules, and template clauses for this case.

Rules:
- Use only authoritative sources from the knowledge base.
- Rank sources by relevance and jurisdiction.
- Include article or section numbers where available.
- If there are conflicting sources, note the conflict.
- If the legal rule is uncertain, say so plainly.

Output:
- source_title
- jurisdiction
- article_or_section
- relevance_reason
- use_in_case
- confidence
```

### Prompt 5: Appeal draft
```text
You are a legal drafting assistant for an employment appeal.

Task:
Draft a lawyer-ready appeal based on the rejection letter, all uploaded case documents, and the retrieved legal authorities.

Rules:
- Use only the facts and sources provided.
- Do not invent legal citations, deadlines, or procedural facts.
- Distinguish between verified facts and assumptions.
- Build the strongest possible argument from the available evidence.
- Include weak points and counterarguments.
- Cite each legal claim with the source used.
- If the case is weak, draft a cautious and professional appeal rather than overclaiming.

Output sections:
1. Short case overview
2. Verified facts
3. Deadline analysis
4. Applicable law
5. Arguments for appeal
6. Evidence list
7. Weak points / risk analysis
8. Draft appeal text
9. Lawyer review notes
```

### Prompt 6: Contract draft
```text
You are a legal contract drafting assistant.

Task:
Draft a clean first version of the requested contract using the client intake, approved clause library, and jurisdiction-specific playbook.

Rules:
- Use the exact business inputs provided.
- Do not add clauses not supported by the playbook unless marked optional.
- Flag unusual or high-risk terms.
- Keep the language commercially reasonable and lawyer-editable.
- Include placeholders where business input is missing.
- Cite internal playbook references when applicable.

Output sections:
1. Deal summary
2. Assumptions
3. Draft contract
4. Optional clauses
5. Risk flags
6. Missing information
7. Lawyer review checklist
```

### Prompt 7: Protocol draft
```text
You are a legal operations protocol drafting assistant.

Task:
Draft a step-by-step internal protocol based on the supplied process, compliance rules, and escalation logic.

Rules:
- Keep the protocol operational and practical.
- Use numbered steps.
- Include responsibilities, exceptions, and approval points.
- Flag anything that requires legal or management approval.

Output sections:
1. Purpose
2. Scope
3. Definitions
4. Procedure
5. Responsibilities
6. Exceptions
7. Approvals
8. Version control
```

### Prompt 8: Verification
```text
You are a legal verification assistant.

Task:
Review the draft for accuracy, unsupported claims, missing citations, missing deadlines, and contradictions.

Rules:
- Compare every legal statement against the provided sources.
- Mark any statement that is unsupported, unclear, or overly confident.
- Identify any missing facts that would change the legal analysis.
- Return a list of required fixes before lawyer approval.

Output:
- passed_or_failed
- unsupported_statements
- missing_citations
- contradictions
- deadline_issues
- factual_gaps
- required_fixes
```

### Prompt 9: Lawyer review
```text
You are a legal review assistant.

Task:
Prepare the AI draft for lawyer review.

Rules:
- Highlight only the paragraphs or claims that require human attention.
- Summarize the top legal risks in plain language.
- Show source documents next to each disputed point.
- Suggest the minimum edits needed to make the draft usable.

Output sections:
1. High-risk items
2. Source-backed issues
3. Missing evidence
4. Suggested edits
5. Approval readiness
```

### Prompt 10: Export
```text
You are a legal export assistant.

Task:
Convert the approved draft into a final client-ready or court-ready document.

Rules:
- Preserve the lawyer-approved text exactly.
- Do not add new legal content.
- Format cleanly in numbered paragraphs and headings.
- Include the version number, approval date, and matter ID.
- Generate a change log if needed.

Output:
- final_document
- version_info
- change_log
```

### Prompt 11: Orchestrator
```text
You are the legal case orchestrator.

Task:
Given a new case and its uploads, decide the next best workflow step.

Rules:
- If documents are missing, request them.
- If OCR failed, send the file to reprocessing.
- If facts are insufficient, request more information.
- If legal research is needed, trigger retrieval.
- If drafting is ready, generate the appeal, contract, or protocol draft.
- If the draft is ready, send it to verification and then lawyer review.

Output:
- current_stage
- next_action
- required_inputs
- blockers
- status
```

## 13. Security and checking
### Access control
- Role-based access control.
- Case-level permissions.
- Lawyer-only approval actions.
- Export lock until approval.

### Document safety
- Encryption at rest and in transit.
- Secure backups.
- File integrity checks.
- Malware scanning on upload.
- No external sharing without permission.

### Model safety
- Prompt-version history.
- Model-run history.
- Verification before export.
- Source-citation enforcement.
- Confidence scoring.
- Conflict detection.
- Human review required for final output.

### Audit safety
- Immutable logs.
- Access logs.
- Change logs.
- Approval logs.
- Export logs.
- Retention logs.

### Quality checks
- OCR confidence check.
- Fact completeness check.
- Deadline consistency check.
- Source coverage check.
- Contradiction check.
- Reviewer signoff check.

## 14. Claude Code build order
### Phase 1
Schema, uploads, OCR, case page, and document tagging.

### Phase 2
Fact extraction, issue spotting, retrieval, and source linking.

### Phase 3
Draft generation for appeals, contracts, and protocols.

### Phase 4
Verification, lawyer review, and redline comparison.

### Phase 5
Export, audit logs, retention controls, litigation holds, and archival packaging.

### Phase 6
Security hardening, access control, audit controls, and test suites.

## 15. Workqueues
- Intake queue.
- OCR queue.
- Research queue.
- Draft queue.
- Review queue.
- Escalation queue.
- Archive queue.

## 16. Case review panel
The lawyer should see:
- case summary,
- source documents,
- extracted facts,
- deadlines,
- legal issues,
- AI draft,
- verification warnings,
- review comments,
- approval controls,
- and export controls.

## 17. Final operating policy
The order is always: intake, classify, extract, retrieve, draft, verify, review, approve, export, archive.

## 18. Final goal
A fully connected legal intelligence system where one case contains all uploads, all answers are source-linked, all drafts are reviewable, and all final outputs are lawyer-approved.
