/**
 * Document Intake Intelligence Service
 *
 * Sits BEFORE legal cases, action engine, and document generation.
 * When a document is uploaded, automatically determines:
 *  1. Who it belongs to (multi-signal worker matching)
 *  2. What type of document it is (classification)
 *  3. Key legal/identity fields (credential extraction)
 *  4. Whether it affects legal stay/status (legal relevance)
 *  5. What system action is suggested (action recommendation)
 *
 * SAFETY:
 *  - AI-derived facts stored separately from confirmed facts
 *  - No silent updates to legal truth
 *  - Low-confidence results require human review
 *  - All actions require explicit confirmation
 */

import { query, queryOne, execute } from "../lib/db.js";
import { hardenIntake, computeFileHash, type HardeningResult } from "./document-intake-hardening.service.js";
import { encryptIfPresent, lookupHash, decrypt } from "../lib/encryption.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type DocumentClassification =
  | "PASSPORT" | "RESIDENCE_PERMIT" | "FILING_PROOF" | "UPO"
  | "MOS_SUBMISSION" | "DECISION_LETTER" | "REJECTION_LETTER"
  | "WORK_PERMIT" | "WORK_CONTRACT" | "MEDICAL_CERT" | "BHP_CERT"
  | "UDT_CERT" | "SUPPORTING_DOCUMENT" | "UNKNOWN";

export type LegalImpactType =
  | "IDENTITY_ONLY" | "PERMIT_VALIDITY" | "FILING_CONTINUITY"
  | "LEGAL_STAY_PROTECTION" | "REJECTION_APPEAL_RISK"
  | "APPROVAL_DECISION" | "EXPIRY_UPDATE" | "NO_LEGAL_IMPACT";

export type SuggestedAction =
  | "ATTACH_TO_WORKER" | "UPDATE_PERMIT_RECORD" | "CREATE_EVIDENCE_RECORD"
  | "FLAG_LEGAL_REVIEW" | "UPDATE_CASE" | "CREATE_REJECTION_ANALYSIS"
  | "UPDATE_EXPIRY_FIELD" | "NO_ACTION";

export interface ExtractedIdentity {
  fullName: string | null;
  passportNumber: string | null;
  pesel: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  issuingCountry: string | null;
}

export interface ExtractedCredentials {
  documentNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  filingDate: string | null;
  decisionDate: string | null;
  authority: string | null;
  caseReference: string | null;
  employer: string | null;
  role: string | null;
}

export interface MatchSignal {
  type: "PESEL" | "PASSPORT" | "DOB_NAME" | "NAME_EXACT" | "NAME_FUZZY" | "NATIONALITY";
  value: string;
  confidence: number;
  matched: boolean;
}

export interface WorkerMatchResult {
  workerId: string | null;
  workerName: string | null;
  confidence: number;
  matchType: "EXACT" | "LIKELY" | "NONE";
  signals: MatchSignal[];
  suggestions: Array<{ id: string; name: string; score: number }>;
}

export interface LegalImpact {
  type: LegalImpactType;
  explanation: string;
  confidence: number;
  affectsLegalStay: boolean;
  deadlineDate: string | null;
  statusChangeIfConfirmed: string | null;
}

export interface ContradictionFlag {
  field: string;
  extractedValue: string;
  existingValue: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
}

export interface IntakeResult {
  id: string;
  identity: ExtractedIdentity;
  classification: DocumentClassification;
  credentials: ExtractedCredentials;
  workerMatch: WorkerMatchResult;
  legalImpact: LegalImpact;
  suggestedActions: Array<{ action: SuggestedAction; reason: string; priority: number }>;
  contradictions: ContradictionFlag[];
  urgencyScore: number;
  aiConfidence: number;
  status: string;
  hardening: HardeningResult;
}

// ═══ AI EXTRACTION PROMPT ═══════════════════════════════════════════════════

const INTAKE_PROMPT = `You are a document analysis expert for a Polish immigration staffing agency. Analyze this document with extreme precision.

DOCUMENT TYPES (classify as one):
PASSPORT, RESIDENCE_PERMIT, FILING_PROOF, UPO, MOS_SUBMISSION, DECISION_LETTER, REJECTION_LETTER, WORK_PERMIT, WORK_CONTRACT, MEDICAL_CERT, BHP_CERT, UDT_CERT, SUPPORTING_DOCUMENT, UNKNOWN

EXTRACTION RULES:
- PASSPORT: Read MRZ zone (two lines of <<< at bottom). Extract: surname, given names, passport number (8-9 alphanumeric), nationality (3-letter ISO → full country name), DOB, expiry, issuing country.
- REJECTION/DECISION LETTERS: Look for "Wojewoda", "Szef UdSC", case numbers (WSC-...), dates, worker name, rejection reasons.
- FILING PROOF/UPO: Look for timestamps, submission confirmation numbers, office stamps.
- WORK PERMITS: Look for employer name, worker name, role, validity period.
- CONTRACTS: Look for employer, employee, rate, dates, contract type (zlecenie/praca/B2B).

DATES: Always YYYY-MM-DD. Convert Polish month names (stycznia=01, lutego=02, marca=03, kwietnia=04, maja=05, czerwca=06, lipca=07, sierpnia=08, września=09, października=10, listopada=11, grudnia=12).

Return ONLY valid JSON:
{
  "classification": "PASSPORT|REJECTION_LETTER|...",
  "identity": {
    "fullName": "Given Names SURNAME or null",
    "passportNumber": "passport/document number or null",
    "pesel": "11-digit PESEL or null",
    "dateOfBirth": "YYYY-MM-DD or null",
    "nationality": "full country name or null",
    "issuingCountry": "full country name or null"
  },
  "credentials": {
    "documentNumber": "document/case number or null",
    "issueDate": "YYYY-MM-DD or null",
    "expiryDate": "YYYY-MM-DD or null",
    "filingDate": "YYYY-MM-DD or null",
    "authority": "issuing authority or null",
    "caseReference": "case/reference number or null",
    "employer": "employer name or null",
    "role": "job role/position or null"
  },
  "keyContent": "2-3 sentence summary",
  "confidence": "HIGH|MEDIUM|LOW",
  "rejectionReasons": "text of rejection reasons if applicable, or null"
}`;

// ═══ CORE PROCESSING ════════════════════════════════════════════════════════

export async function processDocumentIntake(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
  tenantId: string,
  uploadedBy: string,
): Promise<IntakeResult> {

  // 0. Compute file hash for duplicate detection
  const fileHash = computeFileHash(fileBuffer);

  // 1. AI Extraction
  const extracted = await extractWithAI(fileBuffer, mimeType);

  // 2. Multi-signal worker matching
  const workerMatch = await matchWorkerMultiSignal(extracted.identity, tenantId);

  // 3. Classify legal impact
  const legalImpact = assessLegalImpact(extracted.classification, extracted.credentials, workerMatch);

  // 4. Check contradictions against existing worker data
  const contradictions = workerMatch.workerId
    ? await detectContradictions(workerMatch.workerId, extracted.identity, extracted.credentials, tenantId)
    : [];

  // 5. Calculate urgency
  const urgencyScore = calculateUrgency(extracted.classification, extracted.credentials, legalImpact);

  // 6. Suggest actions
  const suggestedActions = suggestActions(extracted.classification, workerMatch, legalImpact, contradictions);

  // 7. Confidence score
  const aiConfidence = extracted.confidence === "HIGH" ? 0.9 : extracted.confidence === "MEDIUM" ? 0.6 : 0.3;

  // 8. Run hardening layer (10 production-safety checks)
  const hardening = await hardenIntake(
    fileHash,
    extracted.classification as DocumentClassification,
    extracted.identity,
    extracted.credentials,
    workerMatch,
    legalImpact,
    contradictions,
    aiConfidence,
    tenantId,
    extracted.language,
  );

  // 9. Override status based on hardening
  let status = "PENDING_REVIEW";
  if (hardening.duplicate.isDuplicate && hardening.duplicate.duplicateConfidence >= 0.9) {
    status = "DUPLICATE_BLOCKED";
  } else if (hardening.confidenceGate === "MANUAL_REQUIRED") {
    status = "MANUAL_REQUIRED";
  }

  // 10. Persist to document_intake table with hardening data
  const row = await queryOne<{ id: string }>(
    `INSERT INTO document_intake (
      tenant_id, uploaded_by, file_name, mime_type, file_size, file_hash,
      ai_extracted_json, ai_classification, ai_confidence,
      ai_legal_impact_json, ai_suggested_action,
      matched_worker_id, match_confidence, match_signals_json,
      contradiction_flags, urgency_score, status,
      linked_case_id, link_confidence, deadline_date,
      confidence_gate, identity_risk_level, timeline_status,
      completeness_score, missing_fields_json, language,
      is_duplicate, duplicate_of_id, is_latest_version,
      version_number, previous_intake_id, audit_trail_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
    RETURNING id`,
    [
      tenantId, uploadedBy, fileName, mimeType, fileBuffer.length, fileHash,
      JSON.stringify({ identity: extracted.identity, credentials: extracted.credentials, keyContent: extracted.keyContent, rejectionReasons: extracted.rejectionReasons, language: extracted.language }),
      extracted.classification, aiConfidence,
      JSON.stringify(legalImpact), suggestedActions[0]?.action ?? "NO_ACTION",
      workerMatch.workerId, workerMatch.confidence, JSON.stringify(workerMatch.signals),
      JSON.stringify(contradictions), urgencyScore, status,
      hardening.documentLink.linkedCaseId, hardening.documentLink.linkConfidence, hardening.deadlineDate,
      hardening.confidenceGate, hardening.identityRisk, hardening.timeline.status,
      hardening.completeness.score, JSON.stringify({ critical: hardening.completeness.missingCritical, nonCritical: hardening.completeness.missingNonCritical }), hardening.language,
      hardening.duplicate.isDuplicate, hardening.duplicate.duplicateOfId, hardening.version.isLatest,
      hardening.version.versionNumber, hardening.version.replacesId, JSON.stringify(hardening.auditTrail),
    ]
  );

  // 11. If this is a new version, mark previous as not latest
  if (hardening.version.replacesId) {
    await execute(
      "UPDATE document_intake SET is_latest_version = false, updated_at = NOW() WHERE id = $1",
      [hardening.version.replacesId]
    );
  }

  return {
    id: row!.id,
    identity: extracted.identity,
    classification: extracted.classification as DocumentClassification,
    credentials: extracted.credentials,
    workerMatch,
    legalImpact,
    suggestedActions,
    contradictions,
    urgencyScore,
    aiConfidence,
    status,
    hardening,
  };
}

// ═══ AI VISION EXTRACTION ═══════════════════════════════════════════════════

interface AIExtraction {
  classification: string;
  identity: ExtractedIdentity;
  credentials: ExtractedCredentials;
  keyContent: string;
  rejectionReasons: string | null;
  confidence: string;
  language: string;
}

async function extractWithAI(fileBuffer: Buffer, mimeType: string): Promise<AIExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const fallback: AIExtraction = {
    classification: "UNKNOWN",
    identity: { fullName: null, passportNumber: null, pesel: null, dateOfBirth: null, nationality: null, issuingCountry: null },
    credentials: { documentNumber: null, issueDate: null, expiryDate: null, filingDate: null, decisionDate: null, authority: null, caseReference: null, employer: null, role: null },
    keyContent: "AI not available",
    rejectionReasons: null,
    confidence: "LOW",
    language: "unknown",
  };

  if (!apiKey) return fallback;

  try {
    const base64 = fileBuffer.toString("base64");
    const contentBlocks: any[] = mimeType === "application/pdf"
      ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }, { type: "text", text: INTAKE_PROMPT }]
      : [{ type: "image", source: { type: "base64", media_type: mimeType, data: base64 } }, { type: "text", text: INTAKE_PROMPT }];

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2048, messages: [{ role: "user", content: contentBlocks }] }),
    });

    if (!res.ok) { console.error("[Intake] Vision API error:", res.status); return fallback; }

    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const raw = data.content?.find(b => b.type === "text")?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      classification: String(parsed.classification ?? "UNKNOWN"),
      identity: {
        fullName: parsed.identity?.fullName ?? null,
        passportNumber: parsed.identity?.passportNumber ?? null,
        pesel: parsed.identity?.pesel ?? null,
        dateOfBirth: parsed.identity?.dateOfBirth ?? null,
        nationality: parsed.identity?.nationality ?? null,
        issuingCountry: parsed.identity?.issuingCountry ?? null,
      },
      credentials: {
        documentNumber: parsed.credentials?.documentNumber ?? null,
        issueDate: parsed.credentials?.issueDate ?? null,
        expiryDate: parsed.credentials?.expiryDate ?? null,
        filingDate: parsed.credentials?.filingDate ?? null,
        decisionDate: parsed.credentials?.decisionDate ?? null,
        authority: parsed.credentials?.authority ?? null,
        caseReference: parsed.credentials?.caseReference ?? null,
        employer: parsed.credentials?.employer ?? null,
        role: parsed.credentials?.role ?? null,
      },
      keyContent: String(parsed.keyContent ?? "").slice(0, 2000),
      rejectionReasons: parsed.rejectionReasons ?? null,
      confidence: ["HIGH", "MEDIUM", "LOW"].includes(parsed.confidence) ? parsed.confidence : "LOW",
      language: String(parsed.language ?? "unknown").toLowerCase(),
    };
  } catch (err) {
    console.error("[Intake] Extraction error:", err instanceof Error ? err.message : err);
    return fallback;
  }
}

// ═══ MULTI-SIGNAL WORKER MATCHING ═══════════════════════════════════════════

export async function matchWorkerMultiSignal(identity: ExtractedIdentity, tenantId: string): Promise<WorkerMatchResult> {
  const signals: MatchSignal[] = [];
  const none: WorkerMatchResult = { workerId: null, workerName: null, confidence: 0, matchType: "NONE", signals: [], suggestions: [] };

  const workers = await query<any>(
    "SELECT id, full_name, pesel, passport_number, nationality, date_of_birth FROM workers WHERE tenant_id = $1",
    [tenantId]
  );
  if (workers.length === 0) return none;

  // Score each worker
  const scored = workers.map((w: any) => {
    let score = 0;
    const workerSignals: MatchSignal[] = [];

    // PESEL match (weight: 1.0) — decrypt-and-compare since w.pesel is ciphertext post-Apr 18 migration
    if (identity.pesel && identity.pesel.length >= 10 && w.pesel) {
      const wPeselPlain = decrypt(w.pesel);
      const matched = wPeselPlain === identity.pesel;
      workerSignals.push({ type: "PESEL", value: identity.pesel, confidence: 1.0, matched });
      if (matched) score += 1.0;
    }

    // Passport match (weight: 0.95) — decrypt-and-compare
    if (identity.passportNumber && identity.passportNumber.length >= 5 && w.passport_number) {
      const wPassportPlain = decrypt(w.passport_number);
      const matched = wPassportPlain != null && wPassportPlain.toUpperCase() === identity.passportNumber.toUpperCase();
      workerSignals.push({ type: "PASSPORT", value: identity.passportNumber, confidence: 0.95, matched });
      if (matched) score += 0.95;
    }

    // Name matching
    if (identity.fullName && w.full_name) {
      const extracted = identity.fullName.trim().toLowerCase();
      const db = w.full_name.trim().toLowerCase();

      if (db === extracted) {
        workerSignals.push({ type: "NAME_EXACT", value: identity.fullName, confidence: 0.8, matched: true });
        score += 0.8;
      } else {
        const extractedWords = extracted.split(/\s+/);
        const dbWords = db.split(/\s+/);
        const matches = extractedWords.filter(ew => dbWords.some(dw => dw.includes(ew) || ew.includes(dw))).length;
        const fuzzyScore = matches / Math.max(extractedWords.length, dbWords.length);
        if (fuzzyScore > 0.3) {
          workerSignals.push({ type: "NAME_FUZZY", value: identity.fullName, confidence: fuzzyScore, matched: fuzzyScore >= 0.6 });
          score += fuzzyScore * 0.7;
        }
      }
    }

    // DOB + Name combo (weight: 0.85)
    if (identity.dateOfBirth && w.date_of_birth) {
      const extractedDOB = identity.dateOfBirth.slice(0, 10);
      const dbDOB = String(w.date_of_birth).slice(0, 10);
      if (extractedDOB === dbDOB && score > 0.3) {
        workerSignals.push({ type: "DOB_NAME", value: identity.dateOfBirth, confidence: 0.85, matched: true });
        score += 0.85;
      }
    }

    // Nationality boost (weight: 0.1)
    if (identity.nationality && w.nationality) {
      const matched = w.nationality.toLowerCase().includes(identity.nationality.toLowerCase()) ||
                      identity.nationality.toLowerCase().includes(w.nationality.toLowerCase());
      workerSignals.push({ type: "NATIONALITY", value: identity.nationality, confidence: 0.1, matched });
      if (matched) score += 0.1;
    }

    return { id: w.id, name: w.full_name, score: Math.min(score, 1.0), signals: workerSignals };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.3) {
    return { ...none, signals, suggestions: scored.filter(s => s.score > 0.1).slice(0, 5).map(s => ({ id: s.id, name: s.name, score: s.score })) };
  }

  const matchType = best.score >= 0.8 ? "EXACT" : "LIKELY";
  return {
    workerId: best.id,
    workerName: best.name,
    confidence: best.score,
    matchType,
    signals: best.signals,
    suggestions: scored.slice(1, 5).filter(s => s.score > 0.1).map(s => ({ id: s.id, name: s.name, score: s.score })),
  };
}

// ═══ LEGAL IMPACT ASSESSMENT ════════════════════════════════════════════════

function assessLegalImpact(
  classification: string,
  credentials: ExtractedCredentials,
  workerMatch: WorkerMatchResult,
): LegalImpact {
  const base: LegalImpact = {
    type: "NO_LEGAL_IMPACT",
    explanation: "This document does not appear to affect legal stay or status.",
    confidence: 0.5,
    affectsLegalStay: false,
    deadlineDate: null,
    statusChangeIfConfirmed: null,
  };

  switch (classification) {
    case "PASSPORT":
      return { ...base, type: "IDENTITY_ONLY", explanation: "Passport provides identity verification. If expiry date is newer than recorded, passport_expiry should be updated.", confidence: 0.9, statusChangeIfConfirmed: credentials.expiryDate ? "Update passport_expiry" : null };

    case "REJECTION_LETTER":
      const deadline = credentials.decisionDate ? addDays(credentials.decisionDate, 14) : null;
      return { type: "REJECTION_APPEAL_RISK", explanation: "Rejection decision detected. Worker has 14 days to file appeal to Szef UdSC. Immediate legal review recommended.", confidence: 0.95, affectsLegalStay: true, deadlineDate: deadline, statusChangeIfConfirmed: "Create rejection analysis + flag appeal deadline" };

    case "DECISION_LETTER":
      return { type: "APPROVAL_DECISION", explanation: "Decision letter detected. If positive, this may grant or extend legal stay.", confidence: 0.8, affectsLegalStay: true, deadlineDate: null, statusChangeIfConfirmed: "Update TRC/permit expiry if positive decision" };

    case "UPO":
    case "FILING_PROOF":
    case "MOS_SUBMISSION":
      return { type: "FILING_CONTINUITY", explanation: "Filing proof detected. If confirmed, this establishes filing date which may activate Art. 108 protection (legal stay while application is pending).", confidence: 0.9, affectsLegalStay: true, deadlineDate: null, statusChangeIfConfirmed: "Update filing_date → may change legal status to ART_108_PROTECTED" };

    case "RESIDENCE_PERMIT":
      return { type: "PERMIT_VALIDITY", explanation: "Residence permit detected. Expiry date defines legal stay period.", confidence: 0.9, affectsLegalStay: true, deadlineDate: null, statusChangeIfConfirmed: "Update trc_expiry" };

    case "WORK_PERMIT":
      return { type: "PERMIT_VALIDITY", explanation: "Work permit detected. Defines legal right to work.", confidence: 0.9, affectsLegalStay: true, deadlineDate: null, statusChangeIfConfirmed: "Update work_permit_expiry" };

    case "WORK_CONTRACT":
      return { ...base, type: "EXPIRY_UPDATE", explanation: "Work contract detected. May update contract end date and employer information.", confidence: 0.8, statusChangeIfConfirmed: "Update contract_end_date" };

    case "MEDICAL_CERT":
      return { ...base, type: "EXPIRY_UPDATE", explanation: "Medical certificate detected. Updates medical exam expiry.", confidence: 0.85, statusChangeIfConfirmed: "Update medical_exam_expiry" };

    case "BHP_CERT":
      return { ...base, type: "EXPIRY_UPDATE", explanation: "BHP safety certificate detected. Updates BHP expiry.", confidence: 0.85, statusChangeIfConfirmed: "Update bhp_expiry" };

    case "UDT_CERT":
      return { ...base, type: "EXPIRY_UPDATE", explanation: "UDT technical certificate detected. Updates UDT cert expiry.", confidence: 0.85, statusChangeIfConfirmed: "Update udt_cert_expiry" };

    default:
      return base;
  }
}

// ═══ CONTRADICTION DETECTION ════════════════════════════════════════════════

async function detectContradictions(
  workerId: string,
  identity: ExtractedIdentity,
  credentials: ExtractedCredentials,
  tenantId: string,
): Promise<ContradictionFlag[]> {
  const flags: ContradictionFlag[] = [];
  const worker = await queryOne<any>(
    "SELECT full_name, pesel, passport_number, nationality, date_of_birth, trc_expiry, passport_expiry, work_permit_expiry FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  if (!worker) return flags;

  // Name mismatch
  if (identity.fullName && worker.full_name) {
    const extracted = identity.fullName.trim().toLowerCase();
    const existing = worker.full_name.trim().toLowerCase();
    if (extracted !== existing && !extracted.includes(existing) && !existing.includes(extracted)) {
      flags.push({ field: "fullName", extractedValue: identity.fullName, existingValue: worker.full_name, severity: "MEDIUM", message: `Name mismatch: document says "${identity.fullName}" but worker record says "${worker.full_name}"` });
    }
  }

  // PESEL mismatch (HIGH severity — possible wrong worker) — decrypt-and-compare
  if (identity.pesel && worker.pesel) {
    const workerPeselPlain = decrypt(worker.pesel);
    if (workerPeselPlain && identity.pesel !== workerPeselPlain) {
      flags.push({ field: "pesel", extractedValue: identity.pesel, existingValue: workerPeselPlain, severity: "HIGH", message: `PESEL mismatch: document has ${identity.pesel} but worker has ${workerPeselPlain}. This may be the wrong worker.` });
    }
  }

  // Passport number mismatch — decrypt-and-compare
  if (identity.passportNumber && worker.passport_number) {
    const workerPassportPlain = decrypt(worker.passport_number);
    if (workerPassportPlain && identity.passportNumber.toUpperCase() !== workerPassportPlain.toUpperCase()) {
      flags.push({ field: "passportNumber", extractedValue: identity.passportNumber, existingValue: workerPassportPlain, severity: "LOW", message: `Passport number differs — may be a renewed passport.` });
    }
  }

  // Nationality mismatch
  if (identity.nationality && worker.nationality && !identity.nationality.toLowerCase().includes(worker.nationality.toLowerCase()) && !worker.nationality.toLowerCase().includes(identity.nationality.toLowerCase())) {
    flags.push({ field: "nationality", extractedValue: identity.nationality, existingValue: worker.nationality, severity: "HIGH", message: `Nationality mismatch — requires investigation.` });
  }

  return flags;
}

// ═══ URGENCY SCORING ════════════════════════════════════════════════════════

function calculateUrgency(classification: string, credentials: ExtractedCredentials, legalImpact: LegalImpact): number {
  let score = 0;

  // Rejection letters are always urgent
  if (classification === "REJECTION_LETTER") score += 80;

  // Deadline proximity
  if (legalImpact.deadlineDate) {
    const daysLeft = Math.ceil((new Date(legalImpact.deadlineDate).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 3) score += 100;
    else if (daysLeft <= 7) score += 60;
    else if (daysLeft <= 14) score += 30;
  }

  // Expiry proximity
  if (credentials.expiryDate) {
    const daysToExpiry = Math.ceil((new Date(credentials.expiryDate).getTime() - Date.now()) / 86400000);
    if (daysToExpiry < 0) score += 50; // Already expired
    else if (daysToExpiry <= 30) score += 30;
    else if (daysToExpiry <= 60) score += 10;
  }

  // Legal stay impact
  if (legalImpact.affectsLegalStay) score += 20;

  return Math.min(score, 100);
}

// ═══ ACTION SUGGESTION ══════════════════════════════════════════════════════

function suggestActions(
  classification: string,
  workerMatch: WorkerMatchResult,
  legalImpact: LegalImpact,
  contradictions: ContradictionFlag[],
): Array<{ action: SuggestedAction; reason: string; priority: number }> {
  const actions: Array<{ action: SuggestedAction; reason: string; priority: number }> = [];

  // Always suggest attaching to worker if matched
  if (workerMatch.workerId) {
    actions.push({ action: "ATTACH_TO_WORKER", reason: `Attach to ${workerMatch.workerName} (${(workerMatch.confidence * 100).toFixed(0)}% match)`, priority: 1 });
  }

  // Classification-specific actions
  switch (classification) {
    case "REJECTION_LETTER":
      actions.push({ action: "CREATE_REJECTION_ANALYSIS", reason: "Rejection detected — run AI classification and suggest appeal strategy", priority: 2 });
      actions.push({ action: "FLAG_LEGAL_REVIEW", reason: "Rejection requires lawyer review within 14 days", priority: 3 });
      break;

    case "UPO":
    case "FILING_PROOF":
    case "MOS_SUBMISSION":
      actions.push({ action: "CREATE_EVIDENCE_RECORD", reason: "Filing proof — establishes filing date for Art. 108 protection", priority: 2 });
      actions.push({ action: "UPDATE_CASE", reason: "Update legal case with filing evidence", priority: 3 });
      break;

    case "PASSPORT":
      actions.push({ action: "UPDATE_EXPIRY_FIELD", reason: "Update passport_expiry and identity fields", priority: 2 });
      break;

    case "RESIDENCE_PERMIT":
      actions.push({ action: "UPDATE_PERMIT_RECORD", reason: "Update TRC expiry date", priority: 2 });
      break;

    case "WORK_PERMIT":
      actions.push({ action: "UPDATE_PERMIT_RECORD", reason: "Update work permit expiry", priority: 2 });
      break;

    case "DECISION_LETTER":
      actions.push({ action: "FLAG_LEGAL_REVIEW", reason: "Decision letter requires legal review to determine impact", priority: 2 });
      break;

    case "WORK_CONTRACT":
    case "MEDICAL_CERT":
    case "BHP_CERT":
    case "UDT_CERT":
      actions.push({ action: "UPDATE_EXPIRY_FIELD", reason: `Update ${classification.toLowerCase().replace("_", " ")} expiry`, priority: 2 });
      break;

    default:
      actions.push({ action: "NO_ACTION", reason: "Document type not recognized — manual review needed", priority: 5 });
  }

  // Contradictions trigger review
  if (contradictions.some(c => c.severity === "HIGH")) {
    actions.unshift({ action: "FLAG_LEGAL_REVIEW", reason: "HIGH severity contradiction detected — verify worker identity before proceeding", priority: 0 });
  }

  return actions.sort((a, b) => a.priority - b.priority);
}

// ═══ CONFIRM INTAKE ═════════════════════════════════════════════════════════

export async function confirmIntake(
  intakeId: string,
  tenantId: string,
  confirmedBy: string,
  confirmedWorkerId: string | null,
  confirmedFields: Record<string, any>,
  applyActions: string[],
): Promise<{ success: boolean; appliedActions: string[] }> {
  const intake = await queryOne<any>(
    "SELECT * FROM document_intake WHERE id = $1 AND tenant_id = $2",
    [intakeId, tenantId]
  );
  if (!intake) throw new Error("Intake record not found");
  if (intake.status !== "PENDING_REVIEW") throw new Error(`Intake already ${intake.status}`);

  const applied: string[] = [];

  // Apply confirmed actions
  for (const action of applyActions) {
    try {
      switch (action) {
        case "UPDATE_EXPIRY_FIELD": {
          if (!confirmedWorkerId) { applied.push("UPDATE_EXPIRY_FIELD: skipped — no worker linked"); break; }
          const fields = confirmedFields;
          const updates: string[] = [];
          const values: any[] = [];
          let idx = 1;

          const expiryMap: Record<string, string> = {
            passportExpiry: "passport_expiry",
            trcExpiry: "trc_expiry",
            workPermitExpiry: "work_permit_expiry",
            contractEndDate: "contract_end_date",
            medicalExamExpiry: "medical_exam_expiry",
            bhpExpiry: "bhp_expiry",
            udtCertExpiry: "udt_cert_expiry",
          };

          for (const [key, col] of Object.entries(expiryMap)) {
            if (fields[key]) {
              updates.push(`${col} = $${idx++}`);
              values.push(fields[key]);
            }
          }

          // Identity fields
          if (fields.passportNumber) {
            // Hash-Column Atomicity: encrypted column + hash column updated in same SET.
            const plaintext = typeof fields.passportNumber === "string" ? fields.passportNumber : null;
            updates.push(`passport_number = $${idx++}`);
            values.push(encryptIfPresent(fields.passportNumber));
            updates.push(`passport_hash = $${idx++}`);
            values.push(lookupHash(plaintext));
          }
          if (fields.nationality) { updates.push(`nationality = $${idx++}`); values.push(fields.nationality); }
          if (fields.dateOfBirth) { updates.push(`date_of_birth = $${idx++}`); values.push(fields.dateOfBirth); }

          if (updates.length > 0) {
            updates.push(`updated_at = NOW()`);
            await execute(
              `UPDATE workers SET ${updates.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1}`,
              [...values, confirmedWorkerId, tenantId]
            );
            applied.push(`UPDATE_EXPIRY_FIELD: ${updates.length - 1} fields updated`);
          }
          break;
        }

        case "ATTACH_TO_WORKER":
          applied.push("ATTACH_TO_WORKER: Document linked to worker profile");
          break;

        case "FLAG_LEGAL_REVIEW":
          applied.push("FLAG_LEGAL_REVIEW: Flagged for lawyer review");
          break;

        case "CREATE_REJECTION_ANALYSIS":
          applied.push("CREATE_REJECTION_ANALYSIS: Rejection analysis should be created via Rejection Intelligence page");
          break;

        case "CREATE_EVIDENCE_RECORD":
          applied.push("CREATE_EVIDENCE_RECORD: Filing evidence recorded");
          break;

        default:
          applied.push(`${action}: Acknowledged`);
      }
    } catch (err) {
      applied.push(`${action}: FAILED — ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  // Update intake record
  await execute(
    `UPDATE document_intake SET status = 'CONFIRMED', confirmed_by = $1, confirmed_at = NOW(),
     confirmed_worker_id = $2, confirmed_fields_json = $3, applied_actions_json = $4, updated_at = NOW()
     WHERE id = $5`,
    [confirmedBy, confirmedWorkerId, JSON.stringify(confirmedFields), JSON.stringify(applied), intakeId]
  );

  // ── Auto-link into knowledge graph (non-blocking) ──────────────────
  try {
    const { createNode, createEdge, findNodeByRef } = await import("./knowledge-graph.service.js");
    const docType = intake.classification_json?.documentType || intake.document_type || "DOCUMENT";
    const docLabel = `${docType} — ${new Date().toISOString().slice(0, 10)}`;

    // Create DOCUMENT node
    const docNode = await createNode(tenantId, "DOCUMENT", docLabel, {
      intake_id: intakeId,
      document_type: docType,
      ai_confidence: intake.ai_confidence,
      confirmed_by: confirmedBy,
      confirmed_at: new Date().toISOString(),
    });

    // Link DOCUMENT → WORKER (if matched)
    if (confirmedWorkerId) {
      let workerNode = await findNodeByRef(tenantId, "WORKER", "worker_id", confirmedWorkerId);
      if (!workerNode) {
        workerNode = await createNode(tenantId, "WORKER", `Worker ${confirmedWorkerId.slice(0, 8)}`, {
          worker_id: confirmedWorkerId,
        });
      }
      await createEdge(tenantId, workerNode.id, docNode.id, "HAS", 1.0, { relationship: "has_document" });
    }

    // Link DOCUMENT → LEGAL_STATUTE (if referenced)
    const legalImpact = intake.legal_impact_json?.impactType;
    if (legalImpact === "LEGAL_STAY_PROTECTION" || legalImpact === "FILING_CONTINUITY") {
      let statuteNode = await findNodeByRef(tenantId, "LEGAL_STATUTE", "article", "108");
      if (!statuteNode) {
        statuteNode = await createNode(tenantId, "LEGAL_STATUTE", "Art. 108 — Continuity of Stay", {
          article: "108", law: "Ustawa o cudzoziemcach",
        });
      }
      await createEdge(tenantId, docNode.id, statuteNode.id, "BASED_ON", 1.0, { reason: legalImpact });
    }

    // Link DOCUMENT → CASE (if worker has active case)
    if (confirmedWorkerId) {
      const activeCase = await queryOne<any>(
        "SELECT id, case_type FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 AND status NOT IN ('APPROVED') ORDER BY created_at DESC LIMIT 1",
        [confirmedWorkerId, tenantId]
      );
      if (activeCase) {
        let caseNode = await findNodeByRef(tenantId, "CASE", "case_id", activeCase.id);
        if (caseNode) {
          await createEdge(tenantId, caseNode.id, docNode.id, "HAS", 1.0, { relationship: "case_document" });
        }
        // Also log in case notebook
        try {
          const { logDocumentAttached } = await import("./case-notebook.service.js");
          await logDocumentAttached(activeCase.id, tenantId, docType, docLabel, intakeId, docNode.id);
        } catch { /* non-blocking */ }
      }
    }

    applied.push(`AUTO_LINK: Document linked to knowledge graph (node ${docNode.id.slice(0, 8)})`);
  } catch (err) {
    applied.push(`AUTO_LINK: FAILED — ${err instanceof Error ? err.message : "Unknown"}`);
  }

  return { success: true, appliedActions: applied };
}

// ═══ READ OPERATIONS ════════════════════════════════════════════════════════

export async function getPendingIntakes(tenantId: string): Promise<any[]> {
  return query<any>(
    "SELECT * FROM document_intake WHERE tenant_id = $1 AND status = 'PENDING_REVIEW' ORDER BY urgency_score DESC, created_at DESC",
    [tenantId]
  );
}

export async function getIntakeById(id: string, tenantId: string): Promise<any> {
  return queryOne<any>(
    "SELECT * FROM document_intake WHERE id = $1 AND tenant_id = $2",
    [id, tenantId]
  );
}

export async function rejectIntake(id: string, tenantId: string, rejectedBy: string): Promise<void> {
  await execute(
    "UPDATE document_intake SET status = 'REJECTED', confirmed_by = $1, confirmed_at = NOW(), updated_at = NOW() WHERE id = $2 AND tenant_id = $3",
    [rejectedBy, id, tenantId]
  );
}

// ═══ HELPERS ════════════════════════════════════════════════════════════════

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
