/**
 * Legal Status Service — derives worker legal state from existing immigration data.
 *
 * READS from: immigration_permits, trc_cases, workers
 * WRITES to: worker_legal_snapshots (derived state only)
 * NEVER overwrites raw immigration records.
 *
 * TRC Continuity Logic (Art. 108 of the Act on Foreigners):
 * If a foreigner submits a TRC application before current permit expiry,
 * and remains with same employer/role, their stay is legally protected
 * until a final decision is made — even if the original permit expires.
 */

import { query, queryOne, execute } from "../lib/db.js";
import type { LegalBasis, RiskLevel } from "./legal-engine.js";
import { emitIntelligenceEvent } from "../lib/intelligence-emitter.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type LegalStatus =
  | "VALID"                 // Permit is valid and not expiring soon
  | "PROTECTED_PENDING"     // Permit expired but Art. 108 protection applies
  | "EXPIRING_SOON"         // Permit valid but expires within 60 days
  | "EXPIRED_NOT_PROTECTED" // Permit expired, no Art. 108 protection
  | "REVIEW_REQUIRED"       // Insufficient data to determine status
  | "NO_PERMIT";            // No permit records found

export interface LegalSnapshot {
  workerId: string;
  workerName: string;
  countryCode: string;
  legalStatus: LegalStatus;
  legalBasis: LegalBasis;
  riskLevel: RiskLevel;
  permitExpiresAt: string | null;
  trcApplicationSubmitted: boolean;
  sameEmployerFlag: boolean;
  sameRoleFlag: boolean;
  legalProtectionFlag: boolean;
  formalDefectStatus: string | null;
  summary: string;
  conditions: string[];
  warnings: string[];
  requiredActions: string[];
  snapshotCreatedAt: string;
  /** Which approved document intake records contributed to this evaluation */
  trustedInputs?: Array<{
    intakeId: string;
    documentType: string;
    field: string;
    value: string;
    confidence: number;
    source: "ai" | "manual";
    approvedAt: string | null;
  }>;
  /** Decision trace: which fields influenced the decision and their origin */
  decisionTrace?: Array<{
    field: string;
    value: string;
    origin: "approved_document" | "immigration_permit" | "trc_case" | "legal_evidence" | "worker_record";
    overriddenBy?: string;
  }>;
  /** Rejection intelligence — populated when status is not VALID */
  rejectionReasons?: string[];
  missingRequirements?: string[];
  recommendedActions?: string[];
  /** Appeals intelligence — populated when an appeal may be relevant */
  appealRelevant?: boolean;
  appealUrgency?: "low" | "medium" | "high" | null;
  appealBasis?: string[];
  appealDeadlineNote?: string | null;
  /** Authority draft context — structured facts for future letter generation */
  authorityDraftContext?: {
    workerName: string | null;
    employerName: string | null;
    documentType: string | null;
    caseReference: string | null;
    currentStatus: string;
    filingDate: string | null;
    expiryDate: string | null;
    decisionOutcome: string | null;
    decisionDate: string | null;
    keyFacts: string[];
    missingDocuments: string[];
    nextAuthorityActions: string[];
  } | null;
}

export interface DeployabilityInput {
  legalStatus: LegalStatus;
  legalBasis?: LegalBasis;
  riskLevel?: RiskLevel;
}

export interface DeployabilityResponse {
  deployability: DeployabilityResult;
  legalBasis: LegalBasis;
  riskLevel: RiskLevel;
}

export type DeployabilityResult = "ALLOWED" | "BLOCKED" | "APPROVAL_REQUIRED" | "CONDITIONAL";

// ═══ CORE LOGIC ═════════════════════════════════════════════════════════════

export async function getWorkerLegalSnapshot(workerId: string, tenantId: string): Promise<LegalSnapshot> {
  // 1. Get worker basic info
  const worker = await queryOne<any>(
    "SELECT id, full_name, trc_expiry, work_permit_expiry, assigned_site FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");

  // 2. Get most recent immigration permit
  const permit = await queryOne<any>(
    "SELECT * FROM immigration_permits WHERE worker_id = $1 AND tenant_id = $2 ORDER BY expiry_date DESC NULLS LAST LIMIT 1",
    [workerId, tenantId]
  );

  // 3. Get TRC case if exists
  const trcCase = await queryOne<any>(
    "SELECT * FROM trc_cases WHERE worker_id = $1::text AND tenant_id = $2::text ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  // 4. Derive legal status using the pure decision engine
  const workerName = worker.full_name ?? "Unknown";

  // Determine the key dates from existing data
  const permitExpiryStr = permit?.expiry_date ?? worker.trc_expiry ?? worker.work_permit_expiry ?? null;

  // Check for MOS electronic submission date (highest authority)
  const mosCase = await queryOne<any>(
    "SELECT mos_submission_date, mos_status FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 AND mos_status IN ('submitted','mos_pending','approved','correction_needed') ORDER BY mos_submission_date DESC NULLS LAST LIMIT 1",
    [workerId, tenantId]
  );

  // Check for explicit filing evidence
  const evidence = await queryOne<any>(
    "SELECT filing_date FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  // 6. Resolve approved structured document data (highest-trust human-approved facts)
  const approvedDocs = await resolveApprovedDocumentFacts(workerId, tenantId);

  // Determine filing date: approved doc > MOS submission > evidence > TRC case > permit flag
  // Precedence: approved confirmed data → existing data → legacy fallback
  const trcSubmitted = !!approvedDocs.filing_date
    || !!mosCase?.mos_submission_date
    || permit?.trc_application_submitted === true
    || (trcCase?.status && trcCase.status !== "intake")
    || !!evidence?.filing_date;
  const filingDate = approvedDocs.filing_date
    ?? mosCase?.mos_submission_date
    ?? evidence?.filing_date
    ?? (trcSubmitted ? (trcCase?.start_date ?? trcCase?.created_at ?? permit?.created_at ?? null) : null);

  // Expiry: approved doc > permit > worker fields
  const resolvedExpiryStr = approvedDocs.expiry_date ?? permitExpiryStr;

  // Check for formal defect
  const formalDefect = trcCase?.status === "formal_defect";

  // Employer/role consistency from approved documents
  const sameEmployerFromDocs = approvedDocs.employer_name
    ? (trcCase?.employer_name?.toLowerCase() === approvedDocs.employer_name.toLowerCase() || !trcCase?.employer_name)
    : undefined;
  const sameRoleFromDocs = approvedDocs.work_position ? true : undefined;

  // No permit at all
  if (!permit && !worker.trc_expiry && !worker.work_permit_expiry && !approvedDocs.expiry_date) {
    return buildSnapshot(workerId, workerName, "PL", "NO_PERMIT", {
      legalBasis: "NO_LEGAL_BASIS",
      riskLevel: "CRITICAL",
      summary: `No immigration permits or TRC records found for ${workerName}.`,
      warnings: ["No work authorization on file."],
      requiredActions: ["Verify worker's right to work. Upload relevant permits."],
      trustedInputs: approvedDocs._sources,
      rejectionReasons: ["No immigration permit, TRC, or work authorization record exists for this worker."],
      missingRequirements: ["Valid work permit or TRC", "Passport with valid entry stamp or visa"],
      recommendedActions: ["Verify the worker's right to work and upload their permit documents."],
    });
  }

  // Call the pure legal engine
  const { evaluateWorkerLegalProtection } = await import("./legal-engine.js");
  const engineResult = evaluateWorkerLegalProtection({
    filingDate,
    permitExpiryDate: resolvedExpiryStr,
    nationality: permit?.country?.toUpperCase() ?? approvedDocs.nationality?.toUpperCase(),
    hasCukrApplication: false,
    sameEmployer: sameEmployerFromDocs ?? (trcCase?.employer_name ? true : undefined),
    sameRole: sameRoleFromDocs,
    sameLocation: undefined,
    formalDefect,
    hadPriorRightToWork: permit?.status === "active" || trcSubmitted ? true : undefined,
  });

  // Map engine result to snapshot
  let mappedStatus: LegalStatus = engineResult.status === "VALID" && resolvedExpiryStr
    ? (Math.ceil((new Date(resolvedExpiryStr).getTime() - Date.now()) / 86_400_000) <= 60 ? "EXPIRING_SOON" : "VALID")
    : engineResult.status as LegalStatus;

  let resolvedRisk = engineResult.riskLevel;
  const extraWarnings: string[] = [];

  // Apply approved decision-letter outcome (post-engine override)
  const normalizedOutcome = normalizeDecisionOutcome(approvedDocs.decision_outcome);
  if (normalizedOutcome) {
    switch (normalizedOutcome) {
      case "APPROVED":
        // Approved decision confirms legality — only upgrade if consistent
        if (mappedStatus === "REVIEW_REQUIRED" || mappedStatus === "PROTECTED_PENDING") {
          if (resolvedExpiryStr && new Date(resolvedExpiryStr).getTime() > Date.now()) {
            mappedStatus = "VALID";
            resolvedRisk = "LOW";
          } else {
            // Approved but expiry already passed — keep as review
            extraWarnings.push("Decision letter shows approval but permit expiry date has passed. Verify current validity.");
          }
        }
        break;
      case "REJECTED":
        // Rejected decision is a strong negative signal
        if (mappedStatus !== "EXPIRED_NOT_PROTECTED") {
          mappedStatus = "REVIEW_REQUIRED";
        }
        if (resolvedRisk === "LOW" || resolvedRisk === "MEDIUM") resolvedRisk = "HIGH";
        extraWarnings.push("A confirmed decision letter shows this application was rejected. Appeal or new application may be required.");
        break;
      case "PENDING":
        // Pending reinforces protected-pending if already in that state
        if (mappedStatus === "REVIEW_REQUIRED" && trcSubmitted) {
          mappedStatus = "PROTECTED_PENDING";
        }
        break;
    }
  }

  // Build decision trace — shows where each key fact came from
  const decisionTrace: LegalSnapshot["decisionTrace"] = [];
  // Filing date
  if (filingDate) {
    const origin = approvedDocs.filing_date ? "approved_document"
      : mosCase?.mos_submission_date ? "legal_evidence"
      : evidence?.filing_date ? "legal_evidence"
      : trcCase ? "trc_case" : "immigration_permit";
    const overriddenBy = approvedDocs.filing_date && (mosCase?.mos_submission_date || evidence?.filing_date || trcCase)
      ? "approved_document" : undefined;
    decisionTrace.push({ field: "filing_date", value: String(filingDate).slice(0, 10), origin: origin as any, overriddenBy });
  }
  // Expiry date
  if (resolvedExpiryStr) {
    const origin = approvedDocs.expiry_date ? "approved_document"
      : permit?.expiry_date ? "immigration_permit" : "worker_record";
    const overriddenBy = approvedDocs.expiry_date && permitExpiryStr ? "approved_document" : undefined;
    decisionTrace.push({ field: "expiry_date", value: String(resolvedExpiryStr).slice(0, 10), origin: origin as any, overriddenBy });
  }
  // Employer
  if (sameEmployerFromDocs !== undefined) {
    decisionTrace.push({ field: "employer_match", value: sameEmployerFromDocs ? "same" : "different", origin: "approved_document" });
  } else if (trcCase?.employer_name) {
    decisionTrace.push({ field: "employer_match", value: "same", origin: "trc_case" });
  }
  // Decision outcome
  if (normalizedOutcome) {
    decisionTrace.push({ field: "decision_outcome", value: normalizedOutcome, origin: "approved_document" });
  }

  // ── Rejection Intelligence — explain non-VALID statuses deterministically ──
  const rejectionReasons: string[] = [];
  const missingRequirements: string[] = [];
  const recommendedActions: string[] = [];

  if (mappedStatus !== "VALID") {
    // Expired permit without protection
    if (mappedStatus === "EXPIRED_NOT_PROTECTED") {
      if (resolvedExpiryStr) {
        const daysExpired = Math.ceil((Date.now() - new Date(resolvedExpiryStr).getTime()) / 86_400_000);
        rejectionReasons.push(`Permit expired ${daysExpired} day(s) ago (${String(resolvedExpiryStr).slice(0, 10)}).`);
      } else {
        rejectionReasons.push("Permit has expired.");
      }
      if (!trcSubmitted) {
        rejectionReasons.push("No TRC application was filed before expiry — Art. 108 continuity protection does not apply.");
        missingRequirements.push("TRC application filing proof (UPO or MoS confirmation)");
        recommendedActions.push("File a new TRC application immediately if the worker is still in Poland.");
      }
      if (formalDefect) {
        rejectionReasons.push("TRC application has a formal defect — legal protection is suspended until corrected.");
        recommendedActions.push("Correct the formal defect and resubmit the required documents to the voivodeship office.");
      }
    }

    // Review required — insufficient data
    if (mappedStatus === "REVIEW_REQUIRED") {
      if (!resolvedExpiryStr && !permit) {
        missingRequirements.push("Immigration permit record (TRC, work permit, or visa)");
        recommendedActions.push("Upload the worker's current permit or TRC to the system.");
      }
      if (!filingDate && !trcSubmitted) {
        missingRequirements.push("TRC application filing date");
        recommendedActions.push("Upload TRC application proof (UPO filing confirmation) to establish filing date.");
      }
      if (normalizedOutcome === "REJECTED") {
        rejectionReasons.push("A decision letter confirms this application was rejected.");
        recommendedActions.push("File an appeal within 14 days of the decision or submit a new application.");
      }
      if (missingRequirements.length === 0 && rejectionReasons.length === 0) {
        rejectionReasons.push("Insufficient documentation to determine legal status.");
        recommendedActions.push("Upload relevant work authorization documents for review.");
      }
    }

    // No permit at all
    if (mappedStatus === "NO_PERMIT") {
      rejectionReasons.push("No immigration permit, TRC, or work authorization record exists for this worker.");
      missingRequirements.push("Valid work permit or TRC");
      missingRequirements.push("Passport with valid entry stamp or visa");
      recommendedActions.push("Verify the worker's right to work and upload their permit documents.");
    }

    // Expiring soon — not blocked but at risk
    if (mappedStatus === "EXPIRING_SOON") {
      if (resolvedExpiryStr) {
        const daysLeft = Math.ceil((new Date(resolvedExpiryStr).getTime() - Date.now()) / 86_400_000);
        rejectionReasons.push(`Permit expires in ${daysLeft} day(s) (${String(resolvedExpiryStr).slice(0, 10)}).`);
      }
      if (!trcSubmitted) {
        missingRequirements.push("TRC renewal application (must be filed before expiry for Art. 108 protection)");
        recommendedActions.push("File TRC renewal application before permit expiry to maintain legal continuity.");
      } else {
        recommendedActions.push("TRC application is filed — monitor for voivodeship decision.");
      }
    }

    // Protected pending — explain conditions
    if (mappedStatus === "PROTECTED_PENDING") {
      if (sameEmployerFromDocs === false) {
        rejectionReasons.push("Employer on the TRC application does not match the current employer — Art. 108 protection may not apply.");
        recommendedActions.push("Verify employer continuity or update the TRC application.");
      }
      if (formalDefect) {
        rejectionReasons.push("TRC application has a formal defect — protection is conditional on correction.");
        missingRequirements.push("Formal defect correction documents");
        recommendedActions.push("Submit correction documents to the voivodeship office within the deadline.");
      }
    }
  }

  const appealResult = deriveAppealIntelligence(mappedStatus, normalizedOutcome, formalDefect, approvedDocs);

  return buildSnapshot(workerId, workerName, permit?.country ?? "PL", mappedStatus, {
    legalBasis: engineResult.legalBasis,
    riskLevel: resolvedRisk,
    permitExpiresAt: resolvedExpiryStr ? new Date(resolvedExpiryStr).toISOString() : null,
    trcApplicationSubmitted: trcSubmitted,
    sameEmployerFlag: sameEmployerFromDocs ?? (trcCase?.employer_name ? true : false),
    sameRoleFlag: sameRoleFromDocs ?? false,
    legalProtectionFlag: mappedStatus === "PROTECTED_PENDING",
    formalDefectStatus: formalDefect ? "formal_defect" : null,
    summary: normalizedOutcome
      ? `${engineResult.summary} Decision letter outcome: ${normalizedOutcome}.`
      : engineResult.summary,
    conditions: engineResult.conditions,
    warnings: [...engineResult.warnings, ...extraWarnings],
    requiredActions: engineResult.requiredActions,
    trustedInputs: approvedDocs._sources,
    decisionTrace,
    ...(mappedStatus !== "VALID" ? { rejectionReasons, missingRequirements, recommendedActions } : {}),
    ...appealResult,
    authorityDraftContext: buildAuthorityDraftContext(
      mappedStatus, workerName, approvedDocs, normalizedOutcome,
      filingDate, resolvedExpiryStr,
      sameEmployerFromDocs, sameRoleFromDocs,
      missingRequirements, recommendedActions, appealResult.appealBasis ?? [],
    ),
  });
}

// ═══ AUTHORITY DRAFT CONTEXT ════════════════════════════════════════════════

function buildAuthorityDraftContext(
  status: LegalStatus,
  workerName: string,
  approvedDocs: ApprovedFacts,
  normalizedOutcome: string | null,
  filingDate: string | null,
  expiryDate: string | null,
  sameEmployer: boolean | undefined,
  sameRole: boolean | undefined,
  missingRequirements: string[],
  recommendedActions: string[],
  appealBasis: string[],
): LegalSnapshot["authorityDraftContext"] {
  // Only populate for non-VALID statuses
  if (status === "VALID") return null;

  // Determine the dominant document type from approved sources
  const docTypes = approvedDocs._sources.map(s => s.documentType);
  const documentType = docTypes.length > 0
    ? docTypes.sort((a, b) => docTypes.filter(d => d === b).length - docTypes.filter(d => d === a).length)[0]
    : null;

  // Build key facts from strongest signals
  const keyFacts: string[] = [];
  if (filingDate) keyFacts.push(`TRC application filed on ${String(filingDate).slice(0, 10)}.`);
  if (expiryDate) {
    const expired = new Date(expiryDate).getTime() < Date.now();
    keyFacts.push(`Permit ${expired ? "expired" : "expires"} on ${String(expiryDate).slice(0, 10)}.`);
  }
  if (sameEmployer === true) keyFacts.push("Employer continuity confirmed — same employer as TRC application.");
  if (sameEmployer === false) keyFacts.push("Employer mismatch — current employer differs from TRC application.");
  if (sameRole === true) keyFacts.push("Role continuity confirmed.");
  if (normalizedOutcome) keyFacts.push(`Decision outcome: ${normalizedOutcome}.`);
  if (approvedDocs.case_reference) keyFacts.push(`Case reference: ${approvedDocs.case_reference}.`);
  if (approvedDocs.nationality) keyFacts.push(`Worker nationality: ${approvedDocs.nationality}.`);

  // Merge recommended + appeal basis into next authority actions (deduplicated)
  const nextAuthorityActions: string[] = [];
  const seen = new Set<string>();
  for (const a of [...recommendedActions, ...appealBasis]) {
    const key = a.toLowerCase().slice(0, 40);
    if (!seen.has(key)) { seen.add(key); nextAuthorityActions.push(a); }
  }

  // Find decision date from approved sources
  const decisionDateSource = approvedDocs._sources.find(s => s.field === "decision_outcome");
  const decisionDate = decisionDateSource?.approvedAt?.slice(0, 10) ?? null;

  return {
    workerName,
    employerName: approvedDocs.employer_name,
    documentType,
    caseReference: approvedDocs.case_reference,
    currentStatus: status,
    filingDate: filingDate ? String(filingDate).slice(0, 10) : null,
    expiryDate: expiryDate ? String(expiryDate).slice(0, 10) : null,
    decisionOutcome: normalizedOutcome,
    decisionDate,
    keyFacts,
    missingDocuments: missingRequirements,
    nextAuthorityActions,
  };
}

// ═══ APPEAL INTELLIGENCE ════════════════════════════════════════════════════

function deriveAppealIntelligence(
  status: LegalStatus,
  normalizedOutcome: string | null,
  formalDefect: boolean,
  approvedDocs: ApprovedFacts,
): Pick<LegalSnapshot, "appealRelevant" | "appealUrgency" | "appealBasis" | "appealDeadlineNote"> {
  const none = { appealRelevant: false, appealUrgency: null, appealBasis: undefined, appealDeadlineNote: null } as const;

  // VALID or PROTECTED_PENDING — no appeal needed
  if (status === "VALID" || status === "PROTECTED_PENDING") return none;

  // Rejection decision exists — appeal is relevant
  if (normalizedOutcome === "REJECTED") {
    const basis: string[] = [
      "Review refusal grounds stated in the decision letter.",
      "Check if filing continuity / Art. 108 protection was ignored in the assessment.",
      "Check employer / role continuity evidence — ensure it was presented.",
    ];
    if (formalDefect) {
      basis.push("Verify whether formal defect was properly notified and deadline was reasonable.");
    }
    if (approvedDocs.employer_name) {
      basis.push(`Employer on file (${approvedDocs.employer_name}) — confirm it matches the TRC application.`);
    }

    let deadlineNote: string | null = null;
    const decisionDate = approvedDocs._sources.find(s => s.field === "decision_outcome")?.approvedAt
      ?? approvedDocs._sources.find(s => s.field === "filing_date")?.approvedAt;
    if (decisionDate) {
      deadlineNote = `Appeal deadline typically 14 days from decision service date. Decision recorded: ${new Date(decisionDate).toLocaleDateString("en-GB")}. Verify exact service date.`;
    } else {
      deadlineNote = "Appeal deadline is typically 14 days from the date the decision was served — verify exact service date.";
    }

    return { appealRelevant: true, appealUrgency: "high", appealBasis: basis, appealDeadlineNote: deadlineNote };
  }

  // EXPIRED_NOT_PROTECTED — appeal only if there's a contradictory signal
  // (e.g., filing was done but not recognized). Without a rejection decision, no appeal.
  if (status === "EXPIRED_NOT_PROTECTED") return none;

  // REVIEW_REQUIRED — no appeal unless rejection decision exists (handled above)
  if (status === "REVIEW_REQUIRED") return none;

  // EXPIRING_SOON — no appeal, this is a proactive status
  if (status === "EXPIRING_SOON") return none;

  // NO_PERMIT — no appeal relevant
  return none;
}

// ═══ REFRESH (persist snapshot) ═════════════════════════════════════════════

export async function refreshWorkerLegalSnapshot(workerId: string, tenantId: string): Promise<LegalSnapshot> {
  const snapshot = await getWorkerLegalSnapshot(workerId, tenantId);

  // Persist to worker_legal_snapshots (upsert)
  await execute(`
    INSERT INTO worker_legal_snapshots (worker_id, tenant_id, country_code, legal_status, legal_basis, risk_level,
      permit_expires_at, trc_application_submitted, same_employer_flag, same_role_flag, legal_protection_flag,
      formal_defect_status, legal_reasoning_json, snapshot_created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
    ON CONFLICT (worker_id) DO UPDATE SET
      country_code = $3, legal_status = $4, legal_basis = $5, risk_level = $6,
      permit_expires_at = $7, trc_application_submitted = $8, same_employer_flag = $9, same_role_flag = $10,
      legal_protection_flag = $11, formal_defect_status = $12, legal_reasoning_json = $13,
      snapshot_created_at = NOW(), updated_at = NOW()
  `, [
    workerId, tenantId, snapshot.countryCode, snapshot.legalStatus,
    snapshot.legalBasis, snapshot.riskLevel,
    snapshot.permitExpiresAt, snapshot.trcApplicationSubmitted,
    snapshot.sameEmployerFlag, snapshot.sameRoleFlag, snapshot.legalProtectionFlag,
    snapshot.formalDefectStatus,
    JSON.stringify({ summary: snapshot.summary, conditions: snapshot.conditions, warnings: snapshot.warnings, requiredActions: snapshot.requiredActions }),
  ]);

  emitIntelligenceEvent({
    type: "status_change",
    workerId: snapshot.workerId,
    workerName: snapshot.workerName,
    message: `Legal status: ${snapshot.legalStatus} (${snapshot.riskLevel} risk)`,
    timestamp: new Date().toISOString(),
    meta: { legalStatus: snapshot.legalStatus, riskLevel: snapshot.riskLevel },
  });

  return snapshot;
}

// ═══ DEPLOYABILITY ══════════════════════════════════════════════════════════

export function evaluateDeployability(input: DeployabilityInput): DeployabilityResponse {
  let deployability: DeployabilityResult;
  switch (input.legalStatus) {
    case "VALID": deployability = "ALLOWED"; break;
    case "EXPIRING_SOON": deployability = "ALLOWED"; break;
    case "PROTECTED_PENDING": deployability = "CONDITIONAL"; break;
    case "REVIEW_REQUIRED": deployability = "APPROVAL_REQUIRED"; break;
    case "EXPIRED_NOT_PROTECTED": deployability = "BLOCKED"; break;
    case "NO_PERMIT": deployability = "BLOCKED"; break;
    default: deployability = "APPROVAL_REQUIRED";
  }
  return {
    deployability,
    legalBasis: input.legalBasis ?? "REVIEW_REQUIRED",
    riskLevel: input.riskLevel ?? "HIGH",
  };
}

// ═══ HELPERS ════════════════════════════════════════════════════════════════

function buildSnapshot(workerId: string, workerName: string, countryCode: string, status: LegalStatus, overrides: Partial<LegalSnapshot>): LegalSnapshot {
  return {
    workerId,
    workerName,
    countryCode,
    legalStatus: status,
    legalBasis: "REVIEW_REQUIRED",
    riskLevel: "HIGH",
    permitExpiresAt: null,
    trcApplicationSubmitted: false,
    sameEmployerFlag: false,
    sameRoleFlag: false,
    legalProtectionFlag: status === "PROTECTED_PENDING",
    formalDefectStatus: null,
    summary: "",
    conditions: [],
    warnings: [],
    requiredActions: [],
    snapshotCreatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ═══ DECISION OUTCOME NORMALIZATION ══════════════════════════════════════════
//
// Maps raw decision-letter outcome text to a canonical category.
// Only explicit, clear phrases are recognized. Ambiguous text returns null.

type NormalizedOutcome = "APPROVED" | "REJECTED" | "PENDING" | null;

const APPROVED_PATTERNS = [
  "approved", "granted", "positive", "pozytywna", "udzielono",
  "zezwolono", "wydano", "accepted",
];
const REJECTED_PATTERNS = [
  "rejected", "refused", "denied", "negative", "negatywna",
  "odmówiono", "odmowa", "declined", "uchylono",
];
const PENDING_PATTERNS = [
  "pending", "under review", "in progress", "w toku",
  "rozpatrywane", "awaiting", "oczekuje",
];

function normalizeDecisionOutcome(raw: string | null): NormalizedOutcome {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;

  if (APPROVED_PATTERNS.some(p => lower.includes(p))) return "APPROVED";
  if (REJECTED_PATTERNS.some(p => lower.includes(p))) return "REJECTED";
  if (PENDING_PATTERNS.some(p => lower.includes(p))) return "PENDING";

  // Ambiguous — do not force a mapping
  return null;
}

// ═══ APPROVED DOCUMENT FACT RESOLVER ══════════════════════════════════════════
//
// Reads CONFIRMED document_intake rows for a worker and extracts
// trusted legal facts from confirmed_fields_json.
//
// Precedence when multiple confirmed intakes exist:
//   1. Most recently confirmed wins per field
//   2. TRC-type intakes preferred for filing_date / expiry_date
//   3. Null/empty confirmed values are ignored (not treated as "cleared")

interface ApprovedFacts {
  filing_date: string | null;
  expiry_date: string | null;
  employer_name: string | null;
  work_position: string | null;
  case_reference: string | null;
  decision_outcome: string | null;
  nationality: string | null;
  passport_number: string | null;
  _sources: Array<{
    intakeId: string;
    documentType: string;
    field: string;
    value: string;
    confidence: number;
    source: "ai" | "manual";
    approvedAt: string | null;
  }>;
}

async function resolveApprovedDocumentFacts(workerId: string, tenantId: string): Promise<ApprovedFacts> {
  const empty: ApprovedFacts = {
    filing_date: null, expiry_date: null, employer_name: null, work_position: null,
    case_reference: null, decision_outcome: null, nationality: null, passport_number: null,
    _sources: [],
  };

  try {
    // Get confirmed intakes for this worker, newest first
    const rows = await query<any>(
      `SELECT id, ai_classification, confirmed_fields_json, confirmed_at
       FROM document_intake
       WHERE tenant_id = $1
         AND (confirmed_worker_id = $2 OR matched_worker_id = $2)
         AND status = 'CONFIRMED'
         AND confirmed_fields_json IS NOT NULL
       ORDER BY confirmed_at DESC
       LIMIT 10`,
      [tenantId, workerId]
    );

    if (rows.length === 0) return empty;

    const facts: ApprovedFacts = { ...empty };
    const LEGAL_FIELDS = ["filing_date", "expiry_date", "employer_name", "work_position", "case_reference", "decision_outcome", "nationality", "passport_number"] as const;

    for (const row of rows) {
      let fields: Record<string, any>;
      try {
        fields = typeof row.confirmed_fields_json === "string"
          ? JSON.parse(row.confirmed_fields_json)
          : row.confirmed_fields_json ?? {};
      } catch { continue; }

      const docType = row.ai_classification ?? "UNKNOWN";

      for (const key of LEGAL_FIELDS) {
        if (facts[key] !== null) continue; // already resolved from a newer intake

        const raw = fields[key];
        const value = typeof raw === "object" && raw !== null ? raw.value : raw;
        if (!value || value === "") continue;

        // Date validation for date fields
        if ((key === "filing_date" || key === "expiry_date") && isNaN(new Date(value).getTime())) continue;

        (facts as any)[key] = String(value);
        const fieldMeta = typeof raw === "object" && raw !== null ? raw : {};
        facts._sources.push({
          intakeId: row.id,
          documentType: docType,
          field: key,
          value: String(value),
          confidence: typeof fieldMeta.confidence === "number" ? fieldMeta.confidence : 1.0,
          source: fieldMeta.source === "ai" ? "ai" : "manual",
          approvedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
        });
      }
    }

    return facts;
  } catch (err) {
    console.error("[LegalStatus] Approved document resolver failed:", err instanceof Error ? err.message : err);
    return empty;
  }
}
