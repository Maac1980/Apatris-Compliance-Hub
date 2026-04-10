/**
 * Document Intake Hardening Layer
 *
 * Production-safety layer on top of Document Intake Intelligence.
 * Runs 10 checks BEFORE results reach the user:
 *  1. Duplicate detection (file hash + extracted reference)
 *  2. Version detection (same worker + doc type + different date)
 *  3. Document linking (match to existing cases)
 *  4. Confidence gating (AUTO_SUGGEST / REVIEW_REQUIRED / MANUAL_REQUIRED)
 *  5. Identity risk assessment
 *  6. Timeline checks (filing vs permit expiry vs decision)
 *  7. Completeness scoring (critical fields per doc type)
 *  8. Language handling
 *  9. Conflict resolution (before/after comparison)
 * 10. Audit trail (full lifecycle logging)
 *
 * SAFETY: No silent updates. All checks are advisory.
 */

import { query, queryOne } from "../lib/db.js";
import type {
  DocumentClassification, ExtractedIdentity, ExtractedCredentials,
  WorkerMatchResult, LegalImpact, ContradictionFlag,
} from "./document-intake.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type ConfidenceGate = "AUTO_SUGGEST" | "REVIEW_REQUIRED" | "MANUAL_REQUIRED";
export type IdentityRisk = "LOW" | "MEDIUM" | "HIGH";
export type TimelineStatus = "VALID" | "LATE" | "INCONSISTENT" | "GAP" | "UNKNOWN";

export interface DuplicateCheck {
  isDuplicate: boolean;
  duplicateOfId: string | null;
  duplicateConfidence: number;
  reason: string | null;
}

export interface VersionCheck {
  isNewVersion: boolean;
  replacesId: string | null;
  versionNumber: number;
  isLatest: boolean;
  reason: string | null;
}

export interface DocumentLink {
  linkedCaseId: string | null;
  linkedGroupId: string | null;
  linkConfidence: number;
  explanation: string;
}

export interface TimelineCheck {
  status: TimelineStatus;
  explanation: string;
  filingGapDays: number | null;
  isLateFilingRisk: boolean;
}

export interface CompletenessCheck {
  score: number;
  missingCritical: string[];
  missingNonCritical: string[];
  forceReview: boolean;
}

export interface ConflictDetail {
  field: string;
  extractedValue: string;
  existingValue: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  recommendedAction: string;
}

export interface AuditEntry {
  timestamp: string;
  event: string;
  detail: string;
  confidence?: number;
}

export interface HardeningResult {
  duplicate: DuplicateCheck;
  version: VersionCheck;
  documentLink: DocumentLink;
  confidenceGate: ConfidenceGate;
  identityRisk: IdentityRisk;
  timeline: TimelineCheck;
  completeness: CompletenessCheck;
  language: string;
  conflicts: ConflictDetail[];
  auditTrail: AuditEntry[];
  deadlineDate: string | null;
  overallSafetyScore: number;
}

// ═══ MAIN HARDENING FUNCTION ════════════════════════════════════════════════

export async function hardenIntake(
  fileHash: string,
  classification: DocumentClassification,
  identity: ExtractedIdentity,
  credentials: ExtractedCredentials,
  workerMatch: WorkerMatchResult,
  legalImpact: LegalImpact,
  contradictions: ContradictionFlag[],
  aiConfidence: number,
  tenantId: string,
  extractedLanguage?: string,
): Promise<HardeningResult> {
  const audit: AuditEntry[] = [];
  const ts = () => new Date().toISOString();

  audit.push({ timestamp: ts(), event: "HARDENING_START", detail: `Classification: ${classification}, AI confidence: ${aiConfidence}` });

  // 1. Duplicate detection
  const duplicate = await checkDuplicate(fileHash, classification, credentials, workerMatch.workerId, tenantId);
  audit.push({ timestamp: ts(), event: "DUPLICATE_CHECK", detail: duplicate.isDuplicate ? `DUPLICATE of ${duplicate.duplicateOfId}: ${duplicate.reason}` : "No duplicate found" });

  // 2. Version detection
  const version = await checkVersion(classification, credentials, workerMatch.workerId, tenantId);
  audit.push({ timestamp: ts(), event: "VERSION_CHECK", detail: version.isNewVersion ? `New version (v${version.versionNumber}), replaces ${version.replacesId}` : "First version or no prior document" });

  // 3. Document linking
  const documentLink = await linkDocument(classification, credentials, workerMatch.workerId, tenantId);
  audit.push({ timestamp: ts(), event: "LINK_CHECK", detail: documentLink.linkedCaseId ? `Linked to case ${documentLink.linkedCaseId} (${(documentLink.linkConfidence * 100).toFixed(0)}%)` : documentLink.explanation, confidence: documentLink.linkConfidence });

  // 4. Confidence gating
  const confidenceGate = computeConfidenceGate(aiConfidence, workerMatch.confidence, contradictions);
  audit.push({ timestamp: ts(), event: "CONFIDENCE_GATE", detail: `Gate: ${confidenceGate} (AI: ${aiConfidence}, match: ${workerMatch.confidence})` });

  // 5. Identity risk
  const identityRisk = assessIdentityRisk(workerMatch, contradictions);
  audit.push({ timestamp: ts(), event: "IDENTITY_RISK", detail: `Risk: ${identityRisk}` });

  // 6. Timeline check
  const timeline = await checkTimeline(classification, credentials, workerMatch.workerId, tenantId);
  audit.push({ timestamp: ts(), event: "TIMELINE_CHECK", detail: `Status: ${timeline.status} — ${timeline.explanation}` });

  // 7. Completeness
  const completeness = checkCompleteness(classification, identity, credentials);
  audit.push({ timestamp: ts(), event: "COMPLETENESS", detail: `Score: ${completeness.score}/100, missing critical: ${completeness.missingCritical.length}` });

  // 8. Language
  const language = extractedLanguage ?? "unknown";
  audit.push({ timestamp: ts(), event: "LANGUAGE", detail: `Detected: ${language}` });

  // 9. Conflicts (enhance existing contradictions)
  const conflicts = enhanceConflicts(contradictions);

  // 10. Deadline
  const deadlineDate = legalImpact.deadlineDate ?? null;

  // Overall safety score (0-100, higher = safer to proceed)
  const overallSafetyScore = computeSafetyScore(duplicate, version, confidenceGate, identityRisk, timeline, completeness, conflicts);
  audit.push({ timestamp: ts(), event: "HARDENING_COMPLETE", detail: `Safety score: ${overallSafetyScore}/100, gate: ${confidenceGate}` });

  return {
    duplicate, version, documentLink, confidenceGate, identityRisk,
    timeline, completeness, language, conflicts, auditTrail: audit,
    deadlineDate, overallSafetyScore,
  };
}

// ═══ 1. DUPLICATE DETECTION ═════════════════════════════════════════════════

async function checkDuplicate(
  fileHash: string,
  classification: string,
  credentials: ExtractedCredentials,
  workerId: string | null,
  tenantId: string,
): Promise<DuplicateCheck> {
  // Check by exact file hash
  if (fileHash) {
    const hashMatch = await queryOne<any>(
      "SELECT id, file_name, created_at FROM document_intake WHERE tenant_id = $1 AND file_hash = $2 AND status != 'REJECTED'",
      [tenantId, fileHash]
    );
    if (hashMatch) {
      return { isDuplicate: true, duplicateOfId: hashMatch.id, duplicateConfidence: 1.0, reason: `Identical file already uploaded on ${new Date(hashMatch.created_at).toLocaleDateString()}` };
    }
  }

  // Check by same worker + doc type + case reference
  if (workerId && credentials.caseReference) {
    const refMatch = await queryOne<any>(
      `SELECT id, created_at FROM document_intake WHERE tenant_id = $1 AND matched_worker_id = $2
       AND ai_classification = $3 AND ai_extracted_json->>'caseReference' = $4
       AND status != 'REJECTED'`,
      [tenantId, workerId, classification, credentials.caseReference]
    );
    if (refMatch) {
      return { isDuplicate: true, duplicateOfId: refMatch.id, duplicateConfidence: 0.9, reason: `Same worker + type + case reference "${credentials.caseReference}" already exists` };
    }
  }

  // Check by same worker + doc type + same date
  if (workerId && (credentials.issueDate || credentials.decisionDate)) {
    const dateKey = credentials.decisionDate ?? credentials.issueDate;
    const dateMatch = await queryOne<any>(
      `SELECT id FROM document_intake WHERE tenant_id = $1 AND matched_worker_id = $2
       AND ai_classification = $3 AND status != 'REJECTED'
       AND (ai_extracted_json->'credentials'->>'issueDate' = $4 OR ai_extracted_json->'credentials'->>'decisionDate' = $4)`,
      [tenantId, workerId, classification, dateKey]
    );
    if (dateMatch) {
      return { isDuplicate: true, duplicateOfId: dateMatch.id, duplicateConfidence: 0.75, reason: `Same worker + type + date (${dateKey}) already exists — may be duplicate or updated version` };
    }
  }

  return { isDuplicate: false, duplicateOfId: null, duplicateConfidence: 0, reason: null };
}

// ═══ 2. VERSION DETECTION ═══════════════════════════════════════════════════

async function checkVersion(
  classification: string,
  credentials: ExtractedCredentials,
  workerId: string | null,
  tenantId: string,
): Promise<VersionCheck> {
  if (!workerId) return { isNewVersion: false, replacesId: null, versionNumber: 1, isLatest: true, reason: null };

  // Find previous documents of same type for this worker
  const previous = await query<any>(
    `SELECT id, ai_extracted_json, created_at, version_number FROM document_intake
     WHERE tenant_id = $1 AND matched_worker_id = $2 AND ai_classification = $3
     AND status != 'REJECTED' ORDER BY created_at DESC`,
    [tenantId, workerId, classification]
  );

  if (previous.length === 0) return { isNewVersion: false, replacesId: null, versionNumber: 1, isLatest: true, reason: "First document of this type for worker" };

  const latest = previous[0];
  const latestCreds = latest.ai_extracted_json?.credentials;

  // Check if this is a newer version (different expiry or issue date)
  if (credentials.expiryDate && latestCreds?.expiryDate && credentials.expiryDate !== latestCreds.expiryDate) {
    const isNewer = new Date(credentials.expiryDate) > new Date(latestCreds.expiryDate);
    const newVersion = (latest.version_number ?? 1) + 1;
    return {
      isNewVersion: true,
      replacesId: isNewer ? latest.id : null,
      versionNumber: newVersion,
      isLatest: isNewer,
      reason: isNewer
        ? `Newer version: expiry ${credentials.expiryDate} > previous ${latestCreds.expiryDate}`
        : `Older version: expiry ${credentials.expiryDate} < current ${latestCreds.expiryDate}`,
    };
  }

  // Same doc type, different document number = replacement
  if (credentials.documentNumber && latestCreds?.documentNumber && credentials.documentNumber !== latestCreds.documentNumber) {
    return {
      isNewVersion: true,
      replacesId: latest.id,
      versionNumber: (latest.version_number ?? 1) + 1,
      isLatest: true,
      reason: `New document number: ${credentials.documentNumber} (previous: ${latestCreds.documentNumber})`,
    };
  }

  return { isNewVersion: false, replacesId: null, versionNumber: (latest.version_number ?? 0) + 1, isLatest: true, reason: null };
}

// ═══ 3. DOCUMENT LINKING ════════════════════════════════════════════════════

async function linkDocument(
  classification: string,
  credentials: ExtractedCredentials,
  workerId: string | null,
  tenantId: string,
): Promise<DocumentLink> {
  if (!workerId) return { linkedCaseId: null, linkedGroupId: null, linkConfidence: 0, explanation: "No worker matched — cannot link to case" };

  // Try to find matching TRC case by worker + case reference
  if (credentials.caseReference) {
    const caseMatch = await queryOne<any>(
      "SELECT id FROM trc_cases WHERE tenant_id = $1 AND worker_id = $2 AND case_reference = $3",
      [tenantId, workerId, credentials.caseReference]
    );
    if (caseMatch) {
      return { linkedCaseId: caseMatch.id, linkedGroupId: null, linkConfidence: 0.95, explanation: `Matched to TRC case by reference: ${credentials.caseReference}` };
    }
  }

  // Try by worker + authority + recent date
  if (credentials.authority) {
    const recentCase = await queryOne<any>(
      `SELECT id, case_reference FROM trc_cases WHERE tenant_id = $1 AND worker_id = $2
       AND created_at > NOW() - INTERVAL '6 months' ORDER BY created_at DESC LIMIT 1`,
      [tenantId, workerId]
    );
    if (recentCase) {
      return { linkedCaseId: recentCase.id, linkedGroupId: null, linkConfidence: 0.6, explanation: `Possibly linked to recent case ${recentCase.case_reference ?? recentCase.id} (same worker, recent)` };
    }
  }

  // For rejection letters, check rejection_analyses
  if (classification === "REJECTION_LETTER" && workerId) {
    const analysis = await queryOne<any>(
      "SELECT id FROM rejection_analyses WHERE tenant_id = $1 AND worker_id = $2 ORDER BY created_at DESC LIMIT 1",
      [tenantId, workerId]
    );
    if (analysis) {
      return { linkedCaseId: null, linkedGroupId: analysis.id, linkConfidence: 0.7, explanation: "Linked to existing rejection analysis for this worker" };
    }
  }

  return { linkedCaseId: null, linkedGroupId: null, linkConfidence: 0, explanation: "No existing case found for linking" };
}

// ═══ 4. CONFIDENCE GATING ═══════════════════════════════════════════════════

function computeConfidenceGate(
  aiConfidence: number,
  matchConfidence: number,
  contradictions: ContradictionFlag[],
): ConfidenceGate {
  const hasHighContradiction = contradictions.some(c => c.severity === "HIGH");
  if (hasHighContradiction) return "MANUAL_REQUIRED";

  const combined = (aiConfidence * 0.6) + (matchConfidence * 0.4);
  if (combined >= 0.85) return "AUTO_SUGGEST";
  if (combined >= 0.60) return "REVIEW_REQUIRED";
  return "MANUAL_REQUIRED";
}

// ═══ 5. IDENTITY RISK ══════════════════════════════════════════════════════

function assessIdentityRisk(workerMatch: WorkerMatchResult, contradictions: ContradictionFlag[]): IdentityRisk {
  if (contradictions.some(c => c.field === "pesel" && c.severity === "HIGH")) return "HIGH";
  if (contradictions.some(c => c.field === "nationality" && c.severity === "HIGH")) return "HIGH";
  if (workerMatch.confidence < 0.5) return "HIGH";
  if (workerMatch.confidence < 0.7) return "MEDIUM";
  if (workerMatch.matchType === "NONE") return "HIGH";
  return "LOW";
}

// ═══ 6. TIMELINE CHECK ══════════════════════════════════════════════════════

async function checkTimeline(
  classification: string,
  credentials: ExtractedCredentials,
  workerId: string | null,
  tenantId: string,
): Promise<TimelineCheck> {
  if (!workerId) return { status: "UNKNOWN", explanation: "No worker matched — cannot check timeline", filingGapDays: null, isLateFilingRisk: false };

  const worker = await queryOne<any>(
    "SELECT trc_expiry, work_permit_expiry, passport_expiry FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  if (!worker) return { status: "UNKNOWN", explanation: "Worker not found", filingGapDays: null, isLateFilingRisk: false };

  const now = new Date();

  // For filing proofs — check if filing date is before permit expiry
  if (["UPO", "FILING_PROOF", "MOS_SUBMISSION"].includes(classification) && credentials.filingDate) {
    const filingDate = new Date(credentials.filingDate);
    const permitExpiry = worker.trc_expiry ? new Date(worker.trc_expiry) : null;

    if (permitExpiry) {
      const gapDays = Math.ceil((filingDate.getTime() - permitExpiry.getTime()) / 86400000);
      if (gapDays <= 0) {
        return { status: "VALID", explanation: `Filing date (${credentials.filingDate}) is before permit expiry (${worker.trc_expiry}) — Art. 108 protection applies`, filingGapDays: gapDays, isLateFilingRisk: false };
      } else {
        return { status: "GAP", explanation: `Filing date (${credentials.filingDate}) is ${gapDays} days AFTER permit expiry (${worker.trc_expiry}) — verify no departure from Poland`, filingGapDays: gapDays, isLateFilingRisk: true };
      }
    }
  }

  // For rejection/decision letters — check decision date against appeal window
  if (["REJECTION_LETTER", "DECISION_LETTER"].includes(classification) && credentials.decisionDate) {
    const decisionDate = new Date(credentials.decisionDate);
    const daysSinceDecision = Math.ceil((now.getTime() - decisionDate.getTime()) / 86400000);
    if (daysSinceDecision > 14) {
      return { status: "LATE", explanation: `Decision was ${daysSinceDecision} days ago — 14-day appeal window may have passed`, filingGapDays: null, isLateFilingRisk: false };
    }
    if (daysSinceDecision > 10) {
      return { status: "VALID", explanation: `Decision was ${daysSinceDecision} days ago — only ${14 - daysSinceDecision} days left to appeal`, filingGapDays: null, isLateFilingRisk: false };
    }
    return { status: "VALID", explanation: `Decision was ${daysSinceDecision} days ago — ${14 - daysSinceDecision} days to appeal`, filingGapDays: null, isLateFilingRisk: false };
  }

  // For permits — check if expiry is approaching
  if (["RESIDENCE_PERMIT", "WORK_PERMIT"].includes(classification) && credentials.expiryDate) {
    const expiry = new Date(credentials.expiryDate);
    const daysToExpiry = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
    if (daysToExpiry < 0) {
      return { status: "LATE", explanation: `Document already expired ${Math.abs(daysToExpiry)} days ago`, filingGapDays: null, isLateFilingRisk: false };
    }
    if (daysToExpiry < 30) {
      return { status: "VALID", explanation: `Expires in ${daysToExpiry} days — renewal should be initiated`, filingGapDays: null, isLateFilingRisk: false };
    }
    return { status: "VALID", explanation: `Valid for ${daysToExpiry} more days`, filingGapDays: null, isLateFilingRisk: false };
  }

  return { status: "UNKNOWN", explanation: "Insufficient data for timeline assessment", filingGapDays: null, isLateFilingRisk: false };
}

// ═══ 7. COMPLETENESS SCORING ════════════════════════════════════════════════

function checkCompleteness(
  classification: string,
  identity: ExtractedIdentity,
  credentials: ExtractedCredentials,
): CompletenessCheck {
  const missingCritical: string[] = [];
  const missingNonCritical: string[] = [];

  // Universal critical: name is always needed
  if (!identity.fullName) missingCritical.push("fullName");

  // Classification-specific critical fields
  const criticalMap: Record<string, Array<{ field: string; source: "identity" | "credentials"; key: string }>> = {
    PASSPORT: [
      { field: "passportNumber", source: "identity", key: "passportNumber" },
      { field: "expiryDate", source: "credentials", key: "expiryDate" },
      { field: "nationality", source: "identity", key: "nationality" },
      { field: "dateOfBirth", source: "identity", key: "dateOfBirth" },
    ],
    REJECTION_LETTER: [
      { field: "authority", source: "credentials", key: "authority" },
      { field: "decisionDate", source: "credentials", key: "decisionDate" },
    ],
    DECISION_LETTER: [
      { field: "authority", source: "credentials", key: "authority" },
      { field: "decisionDate", source: "credentials", key: "decisionDate" },
    ],
    UPO: [{ field: "filingDate", source: "credentials", key: "filingDate" }],
    FILING_PROOF: [{ field: "filingDate", source: "credentials", key: "filingDate" }],
    MOS_SUBMISSION: [{ field: "filingDate", source: "credentials", key: "filingDate" }],
    RESIDENCE_PERMIT: [
      { field: "expiryDate", source: "credentials", key: "expiryDate" },
      { field: "documentNumber", source: "credentials", key: "documentNumber" },
    ],
    WORK_PERMIT: [
      { field: "expiryDate", source: "credentials", key: "expiryDate" },
      { field: "employer", source: "credentials", key: "employer" },
    ],
    WORK_CONTRACT: [
      { field: "employer", source: "credentials", key: "employer" },
    ],
  };

  const nonCriticalFields = [
    { field: "caseReference", source: "credentials" as const, key: "caseReference" },
    { field: "issuingCountry", source: "identity" as const, key: "issuingCountry" },
    { field: "pesel", source: "identity" as const, key: "pesel" },
    { field: "issueDate", source: "credentials" as const, key: "issueDate" },
  ];

  const criticals = criticalMap[classification] ?? [];
  for (const c of criticals) {
    const val = c.source === "identity" ? (identity as any)[c.key] : (credentials as any)[c.key];
    if (!val) missingCritical.push(c.field);
  }

  for (const nc of nonCriticalFields) {
    const val = nc.source === "identity" ? (identity as any)[nc.key] : (credentials as any)[nc.key];
    if (!val) missingNonCritical.push(nc.field);
  }

  const totalFields = criticals.length + nonCriticalFields.length + 1; // +1 for fullName
  const presentFields = totalFields - missingCritical.length - missingNonCritical.length;
  const score = Math.round((presentFields / Math.max(totalFields, 1)) * 100);

  return {
    score,
    missingCritical,
    missingNonCritical,
    forceReview: missingCritical.length > 0,
  };
}

// ═══ 9. CONFLICT ENHANCEMENT ═══════════════════════════════════════════════

function enhanceConflicts(contradictions: ContradictionFlag[]): ConflictDetail[] {
  return contradictions.map(c => ({
    field: c.field,
    extractedValue: c.extractedValue,
    existingValue: c.existingValue,
    severity: c.severity as "LOW" | "MEDIUM" | "HIGH",
    message: c.message,
    recommendedAction: c.severity === "HIGH"
      ? "Do NOT proceed without manual verification"
      : c.severity === "MEDIUM"
        ? "Review before confirming"
        : "Acceptable — may be an update (e.g. renewed passport)",
  }));
}

// ═══ SAFETY SCORE ══════════════════════════════════════════════════════════

function computeSafetyScore(
  duplicate: DuplicateCheck,
  version: VersionCheck,
  gate: ConfidenceGate,
  risk: IdentityRisk,
  timeline: TimelineCheck,
  completeness: CompletenessCheck,
  conflicts: ConflictDetail[],
): number {
  let score = 100;

  if (duplicate.isDuplicate) score -= 40;
  if (!version.isLatest && version.isNewVersion) score -= 20;
  if (gate === "MANUAL_REQUIRED") score -= 30;
  else if (gate === "REVIEW_REQUIRED") score -= 10;
  if (risk === "HIGH") score -= 30;
  else if (risk === "MEDIUM") score -= 15;
  if (timeline.status === "LATE") score -= 20;
  else if (timeline.status === "GAP") score -= 15;
  else if (timeline.status === "INCONSISTENT") score -= 10;
  if (completeness.forceReview) score -= 15;
  score -= conflicts.filter(c => c.severity === "HIGH").length * 20;
  score -= conflicts.filter(c => c.severity === "MEDIUM").length * 10;

  return Math.max(0, Math.min(100, score));
}

// ═══ FILE HASH ══════════════════════════════════════════════════════════════

export function computeFileHash(buffer: Buffer): string {
  // Use Web Crypto / Node crypto for SHA-256
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
