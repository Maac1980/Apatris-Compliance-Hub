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

  // Determine filing date: MOS submission > evidence > TRC case > permit flag
  const trcSubmitted = !!mosCase?.mos_submission_date
    || permit?.trc_application_submitted === true
    || (trcCase?.status && trcCase.status !== "intake")
    || !!evidence?.filing_date;
  const filingDate = mosCase?.mos_submission_date
    ?? evidence?.filing_date
    ?? (trcSubmitted ? (trcCase?.start_date ?? trcCase?.created_at ?? permit?.created_at ?? null) : null);

  // Check for formal defect
  const formalDefect = trcCase?.status === "formal_defect";

  // No permit at all
  if (!permit && !worker.trc_expiry && !worker.work_permit_expiry) {
    return buildSnapshot(workerId, workerName, "PL", "NO_PERMIT", {
      legalBasis: "NO_LEGAL_BASIS",
      riskLevel: "CRITICAL",
      summary: `No immigration permits or TRC records found for ${workerName}.`,
      warnings: ["No work authorization on file."],
      requiredActions: ["Verify worker's right to work. Upload relevant permits."],
    });
  }

  // Call the pure legal engine
  const { evaluateWorkerLegalProtection } = await import("./legal-engine.js");
  const engineResult = evaluateWorkerLegalProtection({
    filingDate,
    permitExpiryDate: permitExpiryStr,
    nationality: permit?.country?.toUpperCase(),
    hasCukrApplication: false, // Would need a dedicated field — safe default
    sameEmployer: trcCase?.employer_name ? true : undefined,
    sameRole: undefined, // Unknown from current data
    sameLocation: undefined,
    formalDefect,
    hadPriorRightToWork: permit?.status === "active" || trcSubmitted ? true : undefined,
  });

  // Map engine result to snapshot
  const mappedStatus: LegalStatus = engineResult.status === "VALID" && permitExpiryStr
    ? (Math.ceil((new Date(permitExpiryStr).getTime() - Date.now()) / 86_400_000) <= 60 ? "EXPIRING_SOON" : "VALID")
    : engineResult.status as LegalStatus;

  return buildSnapshot(workerId, workerName, permit?.country ?? "PL", mappedStatus, {
    legalBasis: engineResult.legalBasis,
    riskLevel: engineResult.riskLevel,
    permitExpiresAt: permitExpiryStr ? new Date(permitExpiryStr).toISOString() : null,
    trcApplicationSubmitted: trcSubmitted,
    sameEmployerFlag: trcCase?.employer_name ? true : false,
    sameRoleFlag: false,
    legalProtectionFlag: engineResult.status === "PROTECTED_PENDING",
    formalDefectStatus: formalDefect ? "formal_defect" : null,
    summary: engineResult.summary,
    conditions: engineResult.conditions,
    warnings: engineResult.warnings,
    requiredActions: engineResult.requiredActions,
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
