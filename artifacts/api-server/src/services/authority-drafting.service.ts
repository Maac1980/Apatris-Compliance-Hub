/**
 * Authority Drafting Service — formal response drafting for authority communications.
 *
 * Supports:
 *   - Missing document responses
 *   - Formal defect responses
 *   - Clarification letters
 *   - Employer declarations
 *   - Contract consistency explanations
 *
 * PROVIDER SPLIT:
 *   Claude → drafting, bilingual output
 *   Deterministic → template selection, field validation, card truth
 *
 * Safety: draft only, lawyer/coordinator review required, bilingual output.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { completeBilingual, type BilingualResult } from "./ai-provider.js";
import { linkOutputToDocumentHistory } from "./legal-output-linker.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type DraftType =
  | "MISSING_DOCUMENT_RESPONSE"
  | "FORMAL_DEFECT_RESPONSE"
  | "CLARIFICATION_LETTER"
  | "EMPLOYER_DECLARATION"
  | "CONTRACT_CONSISTENCY";

export interface DraftInput {
  tenantId: string;
  workerId: string;
  caseId?: string;
  draftType: DraftType;
  authorityName?: string;
  caseReference?: string;
  specificIssue: string;
  additionalContext?: string;
  generatedBy: string;
}

export interface DraftOutput {
  id: string;
  tenant_id: string;
  worker_id: string;
  case_id: string | null;
  draft_type: DraftType;
  content_pl: string;
  content_en: string;
  authority_name: string;
  case_reference: string;
  status: "draft" | "reviewed" | "approved" | "sent";
  requires_review: boolean;
  confidence: number;
  generated_by: string;
  created_at: string;
}

// ═══ TABLE ══════════════════════════════════════════════════════════════════

async function ensureTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS authority_drafts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL DEFAULT 'default',
      worker_id TEXT NOT NULL,
      case_id TEXT,
      draft_type TEXT NOT NULL,
      content_pl TEXT NOT NULL DEFAULT '',
      content_en TEXT NOT NULL DEFAULT '',
      authority_name TEXT NOT NULL DEFAULT '',
      case_reference TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      requires_review BOOLEAN NOT NULL DEFAULT true,
      confidence REAL NOT NULL DEFAULT 0,
      generated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// ═══ SYSTEM PROMPTS ═════════════════════════════════════════════════════════

const DRAFT_PROMPTS: Record<DraftType, string> = {
  MISSING_DOCUMENT_RESPONSE:
    `Draft a formal response to a Polish authority's request for missing documents.
The letter should:
- Reference the case number and authority
- Acknowledge the request
- List the documents being submitted
- Request continuation of proceedings
- Be addressed properly with date and formal salutation
Format: formal Polish administrative letter.`,

  FORMAL_DEFECT_RESPONSE:
    `Draft a formal response to a Polish authority's notice of formal defects (wezwanie do uzupełnienia braków formalnych).
The letter should:
- Reference the case number and the defect notice
- Address each identified defect
- Explain corrections or provide missing information
- Reference KPA Art. 64 § 2 (7-day deadline for formal defects)
- Request continuation of proceedings
Format: formal Polish administrative letter.`,

  CLARIFICATION_LETTER:
    `Draft a formal clarification letter to a Polish authority regarding an immigration/work permit case.
The letter should:
- Reference the case number
- Clearly state what is being clarified
- Provide factual explanations
- Attach supporting evidence if applicable
- Request that the clarification be added to the case file
Format: formal Polish administrative letter.`,

  EMPLOYER_DECLARATION:
    `Draft a formal employer declaration (oświadczenie pracodawcy) for a Polish authority.
The letter should:
- Identify the employer (company name, NIP, address)
- Declare the employment relationship
- Confirm position, salary, work hours as applicable
- Confirm compliance with Polish labour law
- Be signed by authorized representative
Format: formal Polish employer declaration.`,

  CONTRACT_CONSISTENCY:
    `Draft a formal explanation of contract consistency for a Polish authority.
The letter should:
- Reference the permit conditions
- Explain any differences between permit and current contract
- Confirm that the worker's conditions match or exceed permit requirements
- Reference applicable articles of Ustawa o cudzoziemcach
- Explain any salary, role, or location changes
Format: formal Polish administrative letter.`,
};

// ═══ GENERATE ═══════════════════════════════════════════════════════════════

export async function generateAuthorityDraft(input: DraftInput): Promise<DraftOutput> {
  await ensureTable();

  const { tenantId, workerId, caseId, draftType, authorityName, caseReference, specificIssue, additionalContext, generatedBy } = input;

  // Load worker
  const worker = await queryOne<Record<string, unknown>>(
    `SELECT * FROM workers WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`, [workerId, tenantId],
  );
  if (!worker) throw new Error("Worker not found");
  const w = worker as any;

  // Build context
  const workerContext = `Worker: ${w.name}, Nationality: ${w.nationality ?? "N/A"}, PESEL: ${w.pesel ?? "N/A"}, Permit type: ${w.permit_type ?? w.visa_type ?? "N/A"}, Permit expiry: ${w.trc_expiry ?? w.work_permit_expiry ?? "N/A"}`;

  const prompt = `${DRAFT_PROMPTS[draftType]}\n\nCONTEXT:\n${workerContext}\nAuthority: ${authorityName ?? "[Urząd Wojewódzki]"}\nCase reference: ${caseReference ?? "[nr sprawy]"}\nSpecific issue: ${specificIssue}\n${additionalContext ? `Additional context: ${additionalContext}` : ""}\n\nMark the document as PROJEKT (draft) at the top.\nInclude placeholder for date, signature, and stamp.\nAll output is DRAFT for review — never auto-send.`;

  let bilingual: BilingualResult = { pl: "", en: "", confidence: 0 };

  try {
    bilingual = await completeBilingual(prompt, {
      system: "You are a Polish immigration law assistant drafting formal administrative correspondence. All output is DRAFT (PROJEKT). Use formal Polish legal language. Never guarantee outcomes.",
      maxTokens: 2500,
    });
  } catch { /* AI unavailable — empty draft */ }

  // Fallback if AI failed
  if (!bilingual.pl) {
    bilingual.pl = `PROJEKT\n\n[Wymagane ręczne opracowanie pisma]\n\nTyp: ${draftType}\nPracownik: ${w.name}\nSprawy: ${specificIssue}`;
    bilingual.en = `DRAFT\n\n[Manual drafting required]\n\nType: ${draftType}\nWorker: ${w.name}\nIssue: ${specificIssue}`;
    bilingual.confidence = 0;
  }

  // Persist
  const rows = await query<DraftOutput>(
    `INSERT INTO authority_drafts
       (tenant_id, worker_id, case_id, draft_type, content_pl, content_en,
        authority_name, case_reference, status, requires_review, confidence, generated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',true,$9,$10) RETURNING *`,
    [
      tenantId, workerId, caseId ?? null, draftType,
      bilingual.pl, bilingual.en,
      authorityName ?? "", caseReference ?? "",
      bilingual.confidence, generatedBy,
    ],
  );

  const draft = rows[0];

  // Link to document history
  if (draft) {
    try {
      await linkOutputToDocumentHistory({
        tenantId, workerId, legalCaseId: caseId,
        templateType: draftType,
        title: `Authority Draft — ${w.name ?? "Worker"} (${draftType})`,
        contentPl: bilingual.pl, contentEn: bilingual.en,
        source: "AUTHORITY_DRAFT", sourceId: draft.id,
        createdBy: generatedBy,
      });
    } catch { /* best-effort */ }
  }

  return draft;
}

// ═══ READ ═══════════════════════════════════════════════════════════════════

export async function getDraftsByWorker(workerId: string, tenantId: string) {
  await ensureTable();
  return query<DraftOutput>(
    `SELECT * FROM authority_drafts WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
    [workerId, tenantId],
  );
}

export async function getDraftById(id: string, tenantId: string) {
  await ensureTable();
  return queryOne<DraftOutput>(
    `SELECT * FROM authority_drafts WHERE id = $1 AND tenant_id = $2`, [id, tenantId],
  );
}

// ═══ STATUS ═════════════════════════════════════════════════════════════════

export async function updateDraftStatus(id: string, tenantId: string, status: "draft" | "reviewed" | "approved" | "sent") {
  await execute(
    `UPDATE authority_drafts SET status = $1 WHERE id = $2 AND tenant_id = $3`,
    [status, id, tenantId],
  );
}

// ═══ DRAFT TYPES CATALOG ════════════════════════════════════════════════════

export function getDraftTypes() {
  return [
    { id: "MISSING_DOCUMENT_RESPONSE", label: "Missing Document Response", description: "Response to authority request for missing documents" },
    { id: "FORMAL_DEFECT_RESPONSE", label: "Formal Defect Response", description: "Response to wezwanie do uzupełnienia braków formalnych (KPA Art. 64)" },
    { id: "CLARIFICATION_LETTER", label: "Clarification Letter", description: "Formal clarification of facts for the authority" },
    { id: "EMPLOYER_DECLARATION", label: "Employer Declaration", description: "Oświadczenie pracodawcy confirming employment terms" },
    { id: "CONTRACT_CONSISTENCY", label: "Contract Consistency Explanation", description: "Explanation of contract vs permit conditions" },
  ];
}
