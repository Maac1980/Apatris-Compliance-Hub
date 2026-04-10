/**
 * Legal Output Linker — connects Block 3 intelligence outputs to the
 * existing legal_documents table so they appear in document history.
 *
 * Also provides evidence query for the appeal assistant.
 */

import { query, queryOne, execute } from "../lib/db.js";

// ═══ LINK TO DOCUMENT HISTORY ═══════════════════════════════════════════════

export type OutputSource = "APPEAL_ASSISTANT" | "POA_GENERATOR" | "AUTHORITY_DRAFT" | "RESEARCH_MEMO" | "LEGAL_BRIEF";

export interface LinkDocumentInput {
  tenantId: string;
  workerId: string;
  legalCaseId?: string;
  templateType: string;
  title: string;
  contentPl: string;
  contentEn?: string;
  source: OutputSource;
  sourceId: string;
  createdBy: string;
}

/**
 * Insert a record into legal_documents so the output appears in the
 * worker's document history. Does NOT duplicate the actual content —
 * stores a reference back to the source via suggested_by field.
 */
export async function linkOutputToDocumentHistory(input: LinkDocumentInput): Promise<string> {
  const {
    tenantId, workerId, legalCaseId, templateType,
    title, contentPl, contentEn, source, sourceId, createdBy,
  } = input;

  // Build content JSON with both languages and source reference
  const contentJson = {
    pl: contentPl,
    en: contentEn ?? "",
    source,
    sourceId,
    generatedAt: new Date().toISOString(),
  };

  const rows = await query<{ id: string }>(
    `INSERT INTO legal_documents
       (tenant_id, worker_id, legal_case_id, template_type, title, language, status,
        content_json, suggested_by, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'pl', 'draft', $6::jsonb, $7, $8, NOW(), NOW())
     RETURNING id`,
    [
      tenantId, workerId, legalCaseId ?? null, templateType,
      title, JSON.stringify(contentJson),
      `${source}:${sourceId}`, createdBy,
    ],
  );

  return rows[0]?.id ?? "";
}

// ═══ GET WORKER EVIDENCE FOR APPEAL ASSISTANT ═══════════════════════════════

export interface WorkerEvidence {
  id: string;
  evidence_type: string;
  description: string;
  filing_date: string | null;
  verified: boolean;
  extraction_status: string | null;
  created_at: string;
}

/**
 * Retrieve all legal evidence for a worker — used by appeal assistant
 * to show available and missing evidence.
 */
export async function getWorkerEvidence(workerId: string, tenantId: string): Promise<WorkerEvidence[]> {
  return query<WorkerEvidence>(
    `SELECT id, evidence_type, description, filing_date,
            COALESCE(verification_status = 'VERIFIED', false) as verified,
            extraction_status, created_at
     FROM legal_evidence
     WHERE worker_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC`,
    [workerId, tenantId],
  );
}

/**
 * Get existing legal documents for a worker — used to show what's already
 * on file vs what's missing.
 */
export async function getWorkerDocumentSummary(workerId: string, tenantId: string) {
  const docs = await query<{ id: string; template_type: string; status: string; title: string; suggested_by: string | null; approved_by: string | null; approved_at: string | null; created_at: string }>(
    `SELECT id, template_type, status, title, suggested_by, approved_by, approved_at, created_at
     FROM legal_documents
     WHERE worker_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC`,
    [workerId, tenantId],
  );

  return docs;
}

// ═══ RECOMMENDED EVIDENCE LIST ══════════════════════════════════════════════

/**
 * Standard evidence types for Polish immigration appeals.
 * Used by appeal assistant to show what's recommended vs what's on file.
 */
export const RECOMMENDED_EVIDENCE = [
  { type: "rejection_letter", label: "Rejection Decision (Decyzja odmowna)", critical: true },
  { type: "passport", label: "Valid Passport", critical: true },
  { type: "trc_card", label: "Current/Expired TRC Card", critical: false },
  { type: "filing_proof", label: "Filing Proof (stempel / potwierdzenie)", critical: true },
  { type: "employment_contract", label: "Employment Contract (Umowa)", critical: true },
  { type: "employer_declaration", label: "Employer Declaration", critical: false },
  { type: "insurance_proof", label: "Insurance / ZUS Confirmation", critical: false },
  { type: "bank_statement", label: "Bank Statement (3 months)", critical: false },
  { type: "accommodation_proof", label: "Accommodation Proof", critical: false },
  { type: "power_of_attorney", label: "Power of Attorney (Pełnomocnictwo)", critical: false },
  { type: "previous_decisions", label: "Previous Positive Decisions", critical: false },
];

/**
 * Compare available evidence against recommended list.
 * Returns { available, missing, recommended } arrays.
 */
export function analyzeEvidenceGaps(existingEvidence: WorkerEvidence[]) {
  const existingTypes = new Set(existingEvidence.map(e => e.evidence_type?.toLowerCase()));

  const available = RECOMMENDED_EVIDENCE.filter(r => existingTypes.has(r.type));
  const missing = RECOMMENDED_EVIDENCE.filter(r => !existingTypes.has(r.type));
  const criticalMissing = missing.filter(r => r.critical);

  return { available, missing, criticalMissing };
}
