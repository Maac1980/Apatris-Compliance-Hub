/**
 * Document Intelligence Service — extracts structured fields from uploaded documents.
 *
 * UNIFIED PIPELINE (2026-04-24): this service now delegates to the new
 * document-intake service (B1+B2+B3) and translates the typed extraction
 * back to the legacy flat `extracted_fields` shape the UI expects.
 *
 * - B1 (`callClaudeWithSchema` + discriminated union) replaces the fragile
 *   regex+JSON.parse path that previously lived here.
 * - B2 (`typeScopedConfidence`) drives `overall_confidence` — typical 0.95+
 *   on clean work permits (was 0.62–0.82 on the old scoring math).
 * - B3 (`maybeEnrichEmployer`) populates an optional top-level `enrichment`
 *   field with Biała Lista company details when an employer NIP is present.
 *
 * Backward compat: the legacy response keys (document_type, extracted_fields,
 * missing_fields, overall_confidence, requires_review, extraction_timestamp)
 * are preserved. New additive keys (classification, typeSpecific,
 * typeScopedConfidence, enrichment, keyContent) ride alongside for
 * progressive UI enhancement.
 */

import { extractWithAI, maybeEnrichEmployer, type EnrichmentBlock } from "./document-intake.service.js";
import type { IntakeClassification, TypedIntakeExtraction } from "../lib/document-schemas.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DocumentType =
  | "TRC" | "WORK_PERMIT" | "UPO" | "PASSPORT" | "BHP" | "CONTRACT" | "DECISION_LETTER"
  | "MEDICAL_EXAM" | "UDT_CERT" | "A1_CERTIFICATE" | "OSWIADCZENIE" | "POWER_OF_ATTORNEY"
  | "ZUS_REGISTRATION" | "TAX_CERTIFICATE" | "LABOUR_MARKET_TEST" | "ACCOMMODATION_PROOF"
  | "BANK_STATEMENT" | "INSURANCE_CERT" | "QUALIFICATION" | "PHOTO_ID" | "MOS_RECEIPT"
  | "UNKNOWN";

export interface ExtractedField {
  value: string | null;
  confidence: number;   // 0–1
  source: "ai" | "manual";
}

export interface DocumentExtractionResult {
  document_type: DocumentType;
  extracted_fields: Record<string, ExtractedField>;
  missing_fields: string[];
  overall_confidence: number;
  requires_review: boolean;
  extraction_timestamp: string;
  // ── Additive fields (Option A unification, 2026-04-24) ────────────────
  // UI consumers may progressively adopt these richer fields. Legacy
  // consumers continue to read the flat extracted_fields shape above.
  classification?: IntakeClassification;
  typeSpecific?: TypedIntakeExtraction | null;
  typeScopedConfidence?: number;
  enrichment?: EnrichmentBlock;
  keyContent?: string;
}

// ─── Field Definitions Per Document Type ─────────────────────────────────────

const FIELD_DEFS: Record<DocumentType, { key: string; label: string; required: boolean }[]> = {
  TRC: [
    { key: "full_name",           label: "Full Name",            required: true },
    { key: "passport_number",     label: "Passport Number",      required: true },
    { key: "nationality",         label: "Nationality",          required: true },
    { key: "date_of_birth",       label: "Date of Birth",        required: true },
    { key: "pesel",               label: "PESEL",                required: false },
    { key: "employer_name",       label: "Employer Name",        required: true },
    { key: "employer_nip",        label: "Employer NIP",         required: true },
    { key: "voivodeship",         label: "Voivodeship",          required: true },
    { key: "case_reference",      label: "Case Reference",       required: false },
    { key: "filing_date",         label: "Filing Date",          required: true },
    { key: "expiry_date",         label: "Expiry Date",          required: false },
    { key: "permit_type",         label: "Permit Type",          required: true },
    { key: "work_position",       label: "Work Position/Role",   required: true },
    { key: "salary",              label: "Salary (PLN)",         required: false },
  ],
  WORK_PERMIT: [
    { key: "full_name",           label: "Full Name",            required: true },
    { key: "passport_number",     label: "Passport Number",      required: true },
    { key: "nationality",         label: "Nationality",          required: true },
    { key: "employer_name",       label: "Employer Name",        required: true },
    { key: "employer_nip",        label: "Employer NIP",         required: true },
    { key: "permit_number",       label: "Permit Number",        required: true },
    { key: "permit_type",         label: "Permit Type (A/B/C)",  required: true },
    { key: "issue_date",          label: "Issue Date",           required: true },
    { key: "expiry_date",         label: "Expiry Date",          required: true },
    { key: "work_position",       label: "Work Position",        required: true },
    { key: "voivodeship",         label: "Issuing Voivodeship",  required: true },
    { key: "conditions",          label: "Special Conditions",   required: false },
  ],
  UPO: [
    { key: "full_name",           label: "Full Name",            required: true },
    { key: "case_reference",      label: "Case Reference Number",required: true },
    { key: "filing_date",         label: "Filing Date",          required: true },
    { key: "filing_office",       label: "Filing Office",        required: true },
    { key: "application_type",    label: "Application Type",     required: true },
    { key: "upo_number",          label: "UPO Number",           required: false },
    { key: "confirmation_date",   label: "Confirmation Date",    required: true },
  ],
  PASSPORT: [
    { key: "full_name",           label: "Full Name",            required: true },
    { key: "passport_number",     label: "Passport Number",      required: true },
    { key: "nationality",         label: "Nationality",          required: true },
    { key: "date_of_birth",       label: "Date of Birth",        required: true },
    { key: "issue_date",          label: "Issue Date",           required: true },
    { key: "expiry_date",         label: "Expiry Date",          required: true },
    { key: "issuing_country",     label: "Issuing Country",      required: true },
    { key: "sex",                 label: "Sex",                  required: false },
  ],
  BHP: [
    { key: "full_name",           label: "Full Name",            required: true },
    { key: "certificate_number",  label: "Certificate Number",   required: false },
    { key: "training_type",       label: "Training Type",        required: true },
    { key: "issue_date",          label: "Issue Date",           required: true },
    { key: "expiry_date",         label: "Expiry Date",          required: true },
    { key: "issuing_body",        label: "Issuing Body",         required: false },
  ],
  CONTRACT: [
    { key: "full_name",           label: "Worker Name",          required: true },
    { key: "employer_name",       label: "Employer Name",        required: true },
    { key: "contract_type",       label: "Contract Type",        required: true },
    { key: "start_date",          label: "Start Date",           required: true },
    { key: "end_date",            label: "End Date",             required: false },
    { key: "hourly_rate",         label: "Hourly Rate (PLN)",    required: false },
    { key: "monthly_salary",      label: "Monthly Salary (PLN)", required: false },
    { key: "work_position",       label: "Work Position",        required: true },
    { key: "work_location",       label: "Work Location",        required: false },
  ],
  DECISION_LETTER: [
    { key: "full_name",           label: "Full Name",            required: true },
    { key: "case_reference",      label: "Case Reference",       required: true },
    { key: "decision_date",       label: "Decision Date",        required: true },
    { key: "decision_type",       label: "Decision Type",        required: true },
    { key: "issuing_authority",   label: "Issuing Authority",    required: true },
    { key: "appeal_deadline",     label: "Appeal Deadline",      required: false },
    { key: "decision_outcome",    label: "Outcome (positive/negative)", required: true },
    { key: "legal_basis",         label: "Legal Basis Cited",    required: false },
  ],
  MEDICAL_EXAM: [
    { key: "full_name",           label: "Full Name",            required: true },
    { key: "exam_date",           label: "Examination Date",     required: true },
    { key: "expiry_date",         label: "Valid Until",           required: true },
    { key: "doctor_name",         label: "Doctor Name",          required: false },
    { key: "medical_center",      label: "Medical Center",       required: false },
    { key: "fitness_status",      label: "Fitness for Work",     required: true },
    { key: "restrictions",        label: "Restrictions",         required: false },
  ],
  UDT_CERT: [
    { key: "full_name",           label: "Full Name",            required: true },
    { key: "certificate_number",  label: "Certificate Number",   required: true },
    { key: "equipment_type",      label: "Equipment Type",       required: true },
    { key: "issue_date",          label: "Issue Date",           required: true },
    { key: "expiry_date",         label: "Expiry Date",          required: true },
    { key: "issuing_office",      label: "UDT Office",           required: false },
  ],
  A1_CERTIFICATE: [
    { key: "full_name",           label: "Worker Name",          required: true },
    { key: "pesel",               label: "PESEL",                required: true },
    { key: "employer_name",       label: "Employer Name",        required: true },
    { key: "sending_country",     label: "Sending Country",      required: true },
    { key: "receiving_country",   label: "Receiving Country",    required: true },
    { key: "start_date",          label: "Posting Start",        required: true },
    { key: "end_date",            label: "Posting End",          required: true },
    { key: "certificate_number",  label: "A1 Number",            required: false },
    { key: "social_security_no",  label: "Social Security No.",  required: false },
  ],
  OSWIADCZENIE: [
    { key: "full_name",           label: "Worker Name",          required: true },
    { key: "passport_number",     label: "Passport Number",      required: true },
    { key: "nationality",         label: "Nationality",          required: true },
    { key: "employer_name",       label: "Employer Name",        required: true },
    { key: "employer_nip",        label: "Employer NIP",         required: true },
    { key: "work_position",       label: "Work Position",        required: true },
    { key: "start_date",          label: "Start Date",           required: true },
    { key: "end_date",            label: "End Date",             required: true },
    { key: "pup_office",          label: "PUP Office",           required: false },
    { key: "registration_number", label: "Registration Number",  required: false },
  ],
  POWER_OF_ATTORNEY: [
    { key: "grantor_name",        label: "Grantor (Worker)",     required: true },
    { key: "attorney_name",       label: "Attorney (Representative)", required: true },
    { key: "scope",               label: "Scope of Authority",   required: true },
    { key: "issue_date",          label: "Issue Date",           required: true },
    { key: "expiry_date",         label: "Expiry Date",          required: false },
    { key: "notary",              label: "Notary/Witness",       required: false },
  ],
  ZUS_REGISTRATION: [
    { key: "full_name",           label: "Worker Name",          required: true },
    { key: "pesel",               label: "PESEL",                required: true },
    { key: "employer_nip",        label: "Employer NIP",         required: true },
    { key: "registration_date",   label: "Registration Date",    required: true },
    { key: "form_type",           label: "Form Type (ZUA/ZZA)",  required: true },
    { key: "insurance_code",      label: "Insurance Code",       required: false },
  ],
  TAX_CERTIFICATE: [
    { key: "full_name",           label: "Taxpayer Name",        required: true },
    { key: "nip",                 label: "NIP",                  required: true },
    { key: "tax_office",          label: "Tax Office",           required: true },
    { key: "issue_date",          label: "Issue Date",           required: true },
    { key: "valid_until",         label: "Valid Until",           required: false },
    { key: "status",              label: "Status (clear/arrears)", required: true },
  ],
  LABOUR_MARKET_TEST: [
    { key: "employer_name",       label: "Employer Name",        required: true },
    { key: "work_position",       label: "Position",             required: true },
    { key: "starost_office",      label: "Starost Office",       required: true },
    { key: "issue_date",          label: "Issue Date",           required: true },
    { key: "validity_period",     label: "Validity Period",      required: false },
    { key: "result",              label: "Result (positive/negative)", required: true },
  ],
  ACCOMMODATION_PROOF: [
    { key: "full_name",           label: "Resident Name",        required: true },
    { key: "address",             label: "Address",              required: true },
    { key: "registration_date",   label: "Registration Date",    required: true },
    { key: "registration_type",   label: "Type (temporary/permanent)", required: false },
    { key: "office",              label: "Issuing Office",       required: false },
  ],
  BANK_STATEMENT: [
    { key: "account_holder",      label: "Account Holder",       required: true },
    { key: "iban",                label: "IBAN",                 required: true },
    { key: "bank_name",           label: "Bank Name",            required: false },
    { key: "statement_date",      label: "Statement Date",       required: true },
    { key: "balance",             label: "Balance (PLN)",        required: false },
  ],
  INSURANCE_CERT: [
    { key: "full_name",           label: "Insured Name",         required: true },
    { key: "policy_number",       label: "Policy Number",        required: true },
    { key: "insurer",             label: "Insurance Company",    required: true },
    { key: "coverage_type",       label: "Coverage Type",        required: true },
    { key: "start_date",          label: "Start Date",           required: true },
    { key: "end_date",            label: "End Date",             required: true },
  ],
  QUALIFICATION: [
    { key: "full_name",           label: "Holder Name",          required: true },
    { key: "qualification",       label: "Qualification/Diploma", required: true },
    { key: "issuing_institution", label: "Institution",          required: true },
    { key: "issue_date",          label: "Issue Date",           required: true },
    { key: "certificate_number",  label: "Certificate Number",   required: false },
    { key: "specialization",      label: "Specialization",       required: false },
  ],
  PHOTO_ID: [
    { key: "full_name",           label: "Name on Photo",        required: true },
    { key: "photo_date",          label: "Photo Date",           required: false },
    { key: "dimensions",          label: "Dimensions",           required: false },
    { key: "compliant",           label: "Meets Requirements",   required: true },
  ],
  MOS_RECEIPT: [
    { key: "full_name",           label: "Applicant Name",       required: true },
    { key: "submission_number",   label: "MOS Submission Number", required: true },
    { key: "submission_date",     label: "Submission Date",      required: true },
    { key: "application_type",    label: "Application Type",     required: true },
    { key: "portal_reference",    label: "Portal Reference",     required: false },
    { key: "status",              label: "Status",               required: true },
  ],
  UNKNOWN: [
    { key: "full_name",           label: "Full Name",            required: false },
    { key: "document_date",       label: "Document Date",        required: false },
    { key: "reference_number",    label: "Reference Number",     required: false },
    { key: "raw_text",            label: "Extracted Text",       required: false },
  ],
};

/** Get the field definitions for a document type. Exported for UI form generation. */
export function getFieldDefinitions(docType: DocumentType) {
  return FIELD_DEFS[docType] ?? FIELD_DEFS.UNKNOWN;
}

// ─── Main Function ──────────────────────────────────────────────────────────

export interface ExtractDocumentInput {
  fileName: string;
  documentType?: DocumentType;
  /** Base64-encoded file content for real OCR */
  rawContent?: string;
  /** MIME type of the uploaded file */
  mimeType?: string;
}

/**
 * Extracts structured data from an uploaded document.
 *
 * Now delegates to the B1+B2+B3 pipeline in document-intake.service and
 * translates the typed response to the legacy flat shape used by the UI.
 * Claude tool_use + discriminated union schema replaces the old
 * regex+JSON.parse extraction. `overall_confidence` comes from B2's
 * type-scoped scoring. `enrichment` comes from B3's Biała Lista lookup.
 */
export async function extractStructuredDocumentData(input: ExtractDocumentInput): Promise<DocumentExtractionResult> {
  const hintDocType = input.documentType ?? detectDocumentType(input.fileName);

  // No file upload → no vision extraction possible. Return a minimal
  // result. (Previously buildSimulatedResult returned fake data here;
  // dropped per decision #3 — honest empty is cleaner than fake success.)
  if (!input.rawContent) {
    return buildEmptyResult(hintDocType, "AI extraction requires file upload");
  }

  const buffer = Buffer.from(input.rawContent, "base64");
  const mimeType = input.mimeType ?? "application/pdf";

  // New pipeline: B1 (schema-enforced tool_use) + B2 (type-scoped confidence)
  const extracted = await extractWithAI(buffer, mimeType);

  // B3: third-party enrichment (Biała Lista). Fail-open — errors surface
  // on enrichment.employer.error, never throw.
  const enrichment = await maybeEnrichEmployer(extracted.typeSpecific);

  const typed = extracted.typeSpecific;
  const legacyDocType = typed ? mapB1ToLegacyDocType(typed.classification) : hintDocType;
  const fieldDefs = FIELD_DEFS[legacyDocType] ?? FIELD_DEFS.UNKNOWN;

  const extractedFields: Record<string, ExtractedField> = typed
    ? typedToLegacyExtractedFields(typed, legacyDocType)
    : Object.fromEntries(fieldDefs.map((fd) => [fd.key, { value: null, confidence: 0, source: "ai" as const }]));

  const missingFields = fieldDefs
    .filter((fd) => fd.required && !extractedFields[fd.key]?.value)
    .map((fd) => fd.key);

  const overallConfidence = extracted.typeScopedConfidence;
  const roundedOverall = Math.round(overallConfidence * 100) / 100;

  const base: DocumentExtractionResult = {
    document_type: legacyDocType,
    extracted_fields: extractedFields,
    missing_fields: missingFields,
    overall_confidence: roundedOverall,
    requires_review: missingFields.length > 0 || overallConfidence < 0.7,
    extraction_timestamp: new Date().toISOString(),
    // Additive fields for progressive UI adoption:
    classification: typed?.classification ?? "OTHER",
    typeSpecific: typed,
    typeScopedConfidence: roundedOverall,
    keyContent: extracted.keyContent,
  };

  if (enrichment) base.enrichment = enrichment;
  return base;
}

/** Empty-result helper for when no file content is provided. Preserves the
 *  DocumentExtractionResult shape so callers can uniformly consume it. */
function buildEmptyResult(docType: DocumentType, note: string): DocumentExtractionResult {
  const fieldDefs = FIELD_DEFS[docType] ?? FIELD_DEFS.UNKNOWN;
  return {
    document_type: docType,
    extracted_fields: Object.fromEntries(fieldDefs.map((fd) => [fd.key, { value: null, confidence: 0, source: "ai" as const }])),
    missing_fields: fieldDefs.filter((fd) => fd.required).map((fd) => fd.key),
    overall_confidence: 0,
    requires_review: true,
    extraction_timestamp: new Date().toISOString(),
    classification: "OTHER",
    typeSpecific: null,
    typeScopedConfidence: 0,
    keyContent: note,
  };
}

// ─── B1 → Legacy Translation ─────────────────────────────────────────────

/** Map the B1 6-classification enum onto the legacy 22-type DocumentType
 *  for backward compat. TRC_POSITIVE and TRC_REJECTION both flatten to
 *  DECISION_LETTER; the distinction is preserved in the extracted
 *  `decision_outcome` field ("positive" vs "negative"). */
function mapB1ToLegacyDocType(b1: IntakeClassification): DocumentType {
  switch (b1) {
    case "WORK_PERMIT": return "WORK_PERMIT";
    case "TRC_POSITIVE": return "DECISION_LETTER";
    case "TRC_REJECTION": return "DECISION_LETTER";
    case "FILING_PROOF": return "UPO";
    case "PASSPORT": return "PASSPORT";
    case "OTHER": return "UNKNOWN";
  }
}

/** Per-type flattener: take the B1 typed extraction + target legacy
 *  DocumentType, emit a Record<string, ExtractedField> keyed by
 *  FIELD_DEFS[legacyDocType] keys. Every FIELD_DEFS key is present; values
 *  not captured in the B1 schema show as null with confidence 0.
 *  Exported for direct unit testing. */
export function typedToLegacyExtractedFields(
  typed: TypedIntakeExtraction,
  legacyDocType: DocumentType,
): Record<string, ExtractedField> {
  const fieldDefs = FIELD_DEFS[legacyDocType] ?? FIELD_DEFS.UNKNOWN;
  const out: Record<string, ExtractedField> = {};

  for (const fd of fieldDefs) {
    const resolved = resolveFieldValue(typed, legacyDocType, fd.key);
    const pfc = resolved.confidencePath
      ? typed.perFieldConfidence?.[resolved.confidencePath]
      : undefined;
    const confidence = resolved.value
      ? (typeof pfc === "number" && pfc >= 0 && pfc <= 1 ? pfc : 0.8)
      : 0;
    out[fd.key] = {
      value: resolved.value,
      confidence: Math.round(confidence * 100) / 100,
      source: "ai",
    };
  }

  return out;
}

/** Resolve a single legacy field key against the B1 typed extraction.
 *  Returns the value and the perFieldConfidence path used to score it. */
function resolveFieldValue(
  typed: TypedIntakeExtraction,
  legacyDocType: DocumentType,
  key: string,
): { value: string | null; confidencePath?: string } {
  const cf = typed.commonFields;

  // Common-field mappings (apply across types where the key matches)
  switch (key) {
    case "full_name": return { value: cf.fullName, confidencePath: "commonFields.fullName" };
    case "pesel": return { value: cf.pesel, confidencePath: "commonFields.pesel" };
    case "date_of_birth": return { value: cf.dateOfBirth, confidencePath: "commonFields.dateOfBirth" };
    case "nationality": return { value: cf.nationality, confidencePath: "commonFields.nationality" };
  }

  // Per-type mappings
  if (legacyDocType === "WORK_PERMIT") {
    const wp = typed.workPermit;
    if (!wp) return { value: null };
    switch (key) {
      case "employer_name": return { value: wp.employerName, confidencePath: "workPermit.employerName" };
      case "employer_nip": return { value: wp.employerNip, confidencePath: "workPermit.employerNip" };
      case "permit_type": return { value: wp.permitType, confidencePath: "workPermit.permitType" };
      case "issue_date": return { value: wp.validFrom, confidencePath: "workPermit.validFrom" };
      case "expiry_date": return { value: wp.validUntil, confidencePath: "workPermit.validUntil" };
      case "work_position": return { value: wp.role, confidencePath: "workPermit.role" };
      case "voivodeship": return { value: wp.voivodeship, confidencePath: "workPermit.voivodeship" };
      // passport_number, permit_number, conditions not captured in B1 schema
    }
    return { value: null };
  }

  if (legacyDocType === "DECISION_LETTER") {
    const td = typed.trcDecision;
    const tr = typed.trcRejection;
    const caseRef = td?.caseReference ?? tr?.caseReference ?? null;
    const decisionDate = td?.decisionDate ?? tr?.decisionDate ?? null;
    switch (key) {
      case "case_reference": return {
        value: caseRef,
        confidencePath: td ? "trcDecision.caseReference" : "trcRejection.caseReference",
      };
      case "decision_date": return {
        value: decisionDate,
        confidencePath: td ? "trcDecision.decisionDate" : "trcRejection.decisionDate",
      };
      case "decision_type": return {
        // Polish legal terminology: the document itself is called a "decyzja"
        value: td ? "Decyzja o udzieleniu zezwolenia" : tr ? "Decyzja o odmowie" : null,
      };
      case "issuing_authority": return { value: cf.authority, confidencePath: "commonFields.authority" };
      case "decision_outcome": return { value: td ? "positive" : tr ? "negative" : null };
      case "legal_basis": {
        const cited = tr?.citedArticles;
        return { value: cited && cited.length > 0 ? cited.join("; ") : null };
      }
      case "appeal_deadline": {
        // Convert appealDeadlineDays → date (decisionDate + days).
        if (tr?.appealDeadlineDays && tr?.decisionDate) {
          const d = new Date(tr.decisionDate);
          if (!isNaN(d.getTime())) {
            d.setDate(d.getDate() + tr.appealDeadlineDays);
            return { value: d.toISOString().slice(0, 10) };
          }
        }
        return { value: null };
      }
    }
    return { value: null };
  }

  if (legacyDocType === "UPO") {
    const fp = typed.filingProof;
    if (!fp) return { value: null };
    switch (key) {
      case "case_reference": return { value: fp.caseReference, confidencePath: "filingProof.caseReference" };
      case "filing_date": return { value: fp.filingDate, confidencePath: "filingProof.filingDate" };
      case "filing_office": return { value: cf.authority, confidencePath: "commonFields.authority" };
      case "upo_number": return { value: fp.submissionNumber, confidencePath: "filingProof.submissionNumber" };
      case "confirmation_date": return { value: fp.filingDate, confidencePath: "filingProof.filingDate" };
      // application_type not captured in B1 schema
    }
    return { value: null };
  }

  if (legacyDocType === "PASSPORT") {
    const ps = typed.passport;
    if (!ps) return { value: null };
    switch (key) {
      case "passport_number": return { value: ps.passportNumber, confidencePath: "passport.passportNumber" };
      case "issue_date": return { value: ps.issueDate, confidencePath: "passport.issueDate" };
      case "expiry_date": return { value: ps.expiryDate, confidencePath: "passport.expiryDate" };
      case "issuing_country": return { value: ps.issuingCountry, confidencePath: "passport.issuingCountry" };
      // sex not captured in B1 schema
    }
    return { value: null };
  }

  // UNKNOWN / everything else — minimal commonFields mapping
  if (key === "document_date") return { value: cf.documentDate, confidencePath: "commonFields.documentDate" };

  return { value: null };
}

// ─── Type Detection from Filename ───────────────────────────────────────────

function detectDocumentType(fileName: string): DocumentType {
  const lower = fileName.toLowerCase();
  if (lower.includes("trc") || lower.includes("karta pobytu") || lower.includes("residence"))   return "TRC";
  if (lower.includes("work_permit") || lower.includes("zezwolenie") || lower.includes("permit")) return "WORK_PERMIT";
  if (lower.includes("upo") || lower.includes("potwierdzenie"))                                  return "UPO";
  if (lower.includes("passport") || lower.includes("paszport"))                                  return "PASSPORT";
  if (lower.includes("bhp") || lower.includes("safety"))                                         return "BHP";
  if (lower.includes("contract") || lower.includes("umowa"))                                     return "CONTRACT";
  if (lower.includes("decision") || lower.includes("decyzja"))                                   return "DECISION_LETTER";
  if (lower.includes("medical") || lower.includes("badania") || lower.includes("lekarsk"))       return "MEDICAL_EXAM";
  if (lower.includes("udt"))                                                                      return "UDT_CERT";
  if (lower.includes("a1") || lower.includes("posted"))                                           return "A1_CERTIFICATE";
  if (lower.includes("oswiadczenie") || lower.includes("declaration"))                            return "OSWIADCZENIE";
  if (lower.includes("poa") || lower.includes("pelnomocnictwo") || lower.includes("attorney"))   return "POWER_OF_ATTORNEY";
  if (lower.includes("zus") || lower.includes("zua") || lower.includes("zza"))                   return "ZUS_REGISTRATION";
  if (lower.includes("tax") || lower.includes("us ") || lower.includes("niezaleganie"))          return "TAX_CERTIFICATE";
  if (lower.includes("starost") || lower.includes("labour") || lower.includes("labor"))          return "LABOUR_MARKET_TEST";
  if (lower.includes("zameldowanie") || lower.includes("accommodation") || lower.includes("meldunek")) return "ACCOMMODATION_PROOF";
  if (lower.includes("bank") || lower.includes("statement") || lower.includes("wyciag"))         return "BANK_STATEMENT";
  if (lower.includes("insurance") || lower.includes("ubezpieczeni"))                              return "INSURANCE_CERT";
  if (lower.includes("diploma") || lower.includes("qualification") || lower.includes("certyfikat")) return "QUALIFICATION";
  if (lower.includes("photo") || lower.includes("zdjecie") || lower.includes("35x45"))           return "PHOTO_ID";
  if (lower.includes("mos") || lower.includes("submission receipt"))                              return "MOS_RECEIPT";
  return "UNKNOWN";
}
