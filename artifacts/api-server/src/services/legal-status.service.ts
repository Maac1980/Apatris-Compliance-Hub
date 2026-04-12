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
  trustedInputs?: Array<{ intakeId: string; documentType: string; field: string; value: string }>;
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
  });
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
  _sources: Array<{ intakeId: string; documentType: string; field: string; value: string }>;
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
        facts._sources.push({ intakeId: row.id, documentType: docType, field: key, value: String(value) });
      }
    }

    return facts;
  } catch (err) {
    console.error("[LegalStatus] Approved document resolver failed:", err instanceof Error ? err.message : err);
    return empty;
  }
}
