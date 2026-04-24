/**
 * Discriminated-union schema for document intake extraction.
 *
 * Sub-phase B1: replaces the regex+JSON.parse fragility in
 * document-intake.service.ts::extractWithAI with Anthropic tool_use
 * schema enforcement. Each document type gets its own sub-object; Claude
 * populates only the one matching the emitted `classification`.
 *
 * Design rationale: the old INTAKE_PROMPT asked Claude to fill a flat
 * mega-schema regardless of document type. A TRC rejection letter has no
 * `passportNumber` or `filingDate`, so those fields returned null and
 * dragged the completeness signal to ~62% — a false-low. Per-type
 * sub-objects let completeness be computed only over fields relevant to
 * the identified type.
 *
 * B2 (next sub-phase) wires per-type completeness scoring against
 * perFieldConfidence; B3 adds NIP enrichment; B4 rewires UI.
 */

// ── Classification (reduced set of 6 for structured extraction) ──────────
// Maps to the legacy 14-type enum via toLegacyClassification() for
// backward compat with existing consumers (routes, DB rows, audit logs).

export const INTAKE_CLASSIFICATIONS = [
  "WORK_PERMIT",
  "TRC_POSITIVE",
  "TRC_REJECTION",
  "FILING_PROOF",
  "PASSPORT",
  "OTHER",
] as const;

export type IntakeClassification = typeof INTAKE_CLASSIFICATIONS[number];

// ── TypeScript mirrors of sub-schemas ────────────────────────────────────

export interface IntakeCommonFields {
  fullName: string | null;
  pesel: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  authority: string | null;
  documentDate: string | null;
  language: string | null;
}

export interface WorkPermitFields {
  permitType: string | null;        // "Typ A" | "Typ B" | "Oswiadczenie" | …
  employerName: string | null;
  employerNip: string | null;
  role: string | null;
  voivodeship: string | null;
  validFrom: string | null;
  validUntil: string | null;
  workHoursPerWeek: number | null;
}

export interface TrcDecisionFields {
  caseReference: string | null;
  decisionDate: string | null;
  validUntil: string | null;
  voivodeship: string | null;
  permitType: string | null;
}

export interface TrcRejectionFields {
  caseReference: string | null;
  decisionDate: string | null;
  voivodeship: string | null;
  rejectionGrounds: string | null;
  citedArticles: string[];
  appealDeadlineDays: number | null;
}

export interface FilingProofFields {
  caseReference: string | null;
  filingDate: string | null;
  submissionNumber: string | null;
  isUpo: boolean;
}

export interface PassportFields {
  passportNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  issuingCountry: string | null;
}

export interface TypedIntakeExtraction {
  classification: IntakeClassification;
  commonFields: IntakeCommonFields;
  workPermit: WorkPermitFields | null;
  trcDecision: TrcDecisionFields | null;
  trcRejection: TrcRejectionFields | null;
  filingProof: FilingProofFields | null;
  passport: PassportFields | null;
  /** Per-field confidence 0-1. Keys match field paths like "commonFields.fullName" or "workPermit.employerNip". */
  perFieldConfidence: Record<string, number>;
  overallConfidence: number;
  keyContent: string;
}

// ── JSON Schema (Anthropic tool_use input_schema, draft-07 shape) ────────

const NULLABLE_STRING = { type: ["string", "null"] };
const NULLABLE_NUMBER = { type: ["number", "null"] };

export const INTAKE_TOOL_NAME = "emit_document_extraction";

export const INTAKE_TOOL_DESCRIPTION =
  "Emit the classified document type and extracted fields. Populate ONLY the " +
  "sub-object matching `classification`; leave the others as null. Fill " +
  "perFieldConfidence with a 0–1 score for every non-null field you return.";

export const INTAKE_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    classification: { type: "string", enum: INTAKE_CLASSIFICATIONS },
    commonFields: {
      type: "object",
      properties: {
        fullName: NULLABLE_STRING,
        pesel: NULLABLE_STRING,
        dateOfBirth: NULLABLE_STRING,
        nationality: NULLABLE_STRING,
        authority: NULLABLE_STRING,
        documentDate: NULLABLE_STRING,
        language: NULLABLE_STRING,
      },
      required: ["fullName", "pesel", "dateOfBirth", "nationality", "authority", "documentDate", "language"],
    },
    workPermit: {
      type: ["object", "null"],
      description: "Populate ONLY when classification = WORK_PERMIT.",
      properties: {
        permitType: NULLABLE_STRING,
        employerName: NULLABLE_STRING,
        employerNip: NULLABLE_STRING,
        role: NULLABLE_STRING,
        voivodeship: NULLABLE_STRING,
        validFrom: NULLABLE_STRING,
        validUntil: NULLABLE_STRING,
        workHoursPerWeek: NULLABLE_NUMBER,
      },
    },
    trcDecision: {
      type: ["object", "null"],
      description: "Populate ONLY when classification = TRC_POSITIVE.",
      properties: {
        caseReference: NULLABLE_STRING,
        decisionDate: NULLABLE_STRING,
        validUntil: NULLABLE_STRING,
        voivodeship: NULLABLE_STRING,
        permitType: NULLABLE_STRING,
      },
    },
    trcRejection: {
      type: ["object", "null"],
      description: "Populate ONLY when classification = TRC_REJECTION.",
      properties: {
        caseReference: NULLABLE_STRING,
        decisionDate: NULLABLE_STRING,
        voivodeship: NULLABLE_STRING,
        rejectionGrounds: NULLABLE_STRING,
        citedArticles: { type: "array", items: { type: "string" } },
        appealDeadlineDays: NULLABLE_NUMBER,
      },
    },
    filingProof: {
      type: ["object", "null"],
      description: "Populate ONLY when classification = FILING_PROOF.",
      properties: {
        caseReference: NULLABLE_STRING,
        filingDate: NULLABLE_STRING,
        submissionNumber: NULLABLE_STRING,
        isUpo: { type: "boolean" },
      },
    },
    passport: {
      type: ["object", "null"],
      description: "Populate ONLY when classification = PASSPORT.",
      properties: {
        passportNumber: NULLABLE_STRING,
        issueDate: NULLABLE_STRING,
        expiryDate: NULLABLE_STRING,
        issuingCountry: NULLABLE_STRING,
      },
    },
    perFieldConfidence: {
      type: "object",
      description: "Per-field confidence 0–1. Keys = field paths like 'workPermit.employerNip'.",
      additionalProperties: { type: "number", minimum: 0, maximum: 1 },
    },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 },
    keyContent: { type: "string", description: "2-3 sentence plain-language summary of the document." },
  },
  required: ["classification", "commonFields", "perFieldConfidence", "overallConfidence", "keyContent"],
};

// ── Prompt text (used as the user-message body alongside the PDF/image) ──

export const INTAKE_PROMPT_V2 = `You are a document analysis expert for a Polish immigration staffing agency. Analyze this document with extreme precision, then call the emit_document_extraction tool.

CLASSIFICATION — choose exactly one:
- WORK_PERMIT: Zezwolenie na pracę (Typ A/B/C) or Oświadczenie o powierzeniu pracy.
- TRC_POSITIVE: favourable TRC (residence permit) decision — Decyzja o udzieleniu zezwolenia na pobyt czasowy.
- TRC_REJECTION: unfavourable TRC decision — Decyzja o odmowie, Umorzenie, or similar denial.
- FILING_PROOF: submission/filing confirmation — UPO (Urzędowe Poświadczenie Odbioru) or equivalent.
- PASSPORT: travel passport with MRZ zone.
- OTHER: anything else (contracts, medical certs, BHP, UDT, supporting documents).

RULES:
- Populate ONLY the sub-object matching your classification. Leave other sub-objects null.
- commonFields applies to every type; fill what the document shows, null otherwise.
- Dates in YYYY-MM-DD. Polish month names: stycznia=01, lutego=02, marca=03, kwietnia=04, maja=05, czerwca=06, lipca=07, sierpnia=08, września=09, października=10, listopada=11, grudnia=12.
- Authority: "Wojewoda [Voivode name]" or "Szef Urzędu ds. Cudzoziemców" or similar, exactly as printed.
- For TRC_REJECTION: extract rejectionGrounds verbatim (or closely paraphrased). Cite articles like "Art. 108 Ustawy o cudzoziemcach" in citedArticles.
- For WORK_PERMIT and TRC_* types: the employer's NIP is printed on every Polish work permit and most decision letters. Look ACTIVELY for it — usually near the employer name, formatted as "NIP: XXXXXXXXXX" or "NIP XXX-XXX-XX-XX" (10 digits with optional dashes). Do NOT skip or defer this field. Only leave it null after you have genuinely searched the document and cannot locate it.
- perFieldConfidence: emit a 0–1 score for EVERY non-null field. Use 0.9+ when the value is unambiguous, 0.5–0.8 when partially legible or inferred, <0.5 when uncertain.
- overallConfidence: average of populated sub-object + commonFields fields. Not over null/empty fields.
- keyContent: 2–3 sentences plain language; lawyer should read this to grasp what the document is.
- Do not invent fields. If a value is genuinely absent from the document, leave it null.`;

// ── Legacy-compat classification mapping ─────────────────────────────────
// Maps the B1 6-type enum onto the 14-type legacy DocumentClassification
// used by existing DB rows, routes, and audit logs. Preserves backward
// compatibility for all IntakeResult consumers.

export function toLegacyClassification(c: IntakeClassification): string {
  switch (c) {
    case "WORK_PERMIT": return "WORK_PERMIT";
    case "TRC_POSITIVE": return "DECISION_LETTER";
    case "TRC_REJECTION": return "REJECTION_LETTER";
    case "FILING_PROOF": return "FILING_PROOF";
    case "PASSPORT": return "PASSPORT";
    case "OTHER": return "UNKNOWN";
  }
}

// ── HIGH/MEDIUM/LOW bucketing for legacy consumers ───────────────────────

export function bucketConfidence(overall: number): "HIGH" | "MEDIUM" | "LOW" {
  if (overall >= 0.8) return "HIGH";
  if (overall >= 0.5) return "MEDIUM";
  return "LOW";
}

// ── Per-type required fields + completeness scoring (Sub-phase B2) ───────
//
// The B1 prompt asks Claude to populate ONLY the sub-object matching the
// classification. Scoring completeness over the whole mega-schema would
// drag down rejection letters (which have no employer/passport fields) —
// the "62% misread" bug. B2 scores only against the 5-field per-type
// required set, mirroring AUDIT_DOC_TYPES from
// routes/first-contact-verification.ts:48-54 but using the typed-path
// field keys that match perFieldConfidence entries.

export const REQUIRED_FIELDS_BY_TYPE: Record<IntakeClassification, readonly string[]> = {
  WORK_PERMIT: [
    "commonFields.fullName",
    "workPermit.employerName",
    "workPermit.validUntil",
    "workPermit.role",
    "workPermit.voivodeship",
  ],
  TRC_POSITIVE: [
    "commonFields.fullName",
    "trcDecision.caseReference",
    "trcDecision.decisionDate",
    "trcDecision.validUntil",
    "commonFields.authority",
  ],
  TRC_REJECTION: [
    "commonFields.fullName",
    "trcRejection.caseReference",
    "trcRejection.decisionDate",
    "commonFields.authority",
    "trcRejection.rejectionGrounds",
  ],
  FILING_PROOF: [
    "commonFields.fullName",
    "filingProof.caseReference",
    "filingProof.filingDate",
    "commonFields.authority",
  ],
  PASSPORT: [
    "commonFields.fullName",
    "passport.passportNumber",
    "commonFields.dateOfBirth",
    "passport.issuingCountry",
    "passport.expiryDate",
  ],
  OTHER: [],
};

/** Missing perFieldConfidence entry for a populated field → assume this.
 *  Claude's schema asks for per-field confidence on every non-null field,
 *  but Claude occasionally forgets some. 0.8 is a reasonable "default
 *  high" that rewards populated fields without trusting them blindly. */
const DEFAULT_PRESENT_FIELD_CONFIDENCE = 0.8;

/** Read a field from a TypedIntakeExtraction using a "sub.key" path.
 *  Returns null for paths that don't resolve (sub-object is null, key
 *  missing, value undefined or empty string). */
function readField(typed: TypedIntakeExtraction, path: string): unknown {
  const [group, key] = path.split(".");
  if (!group || !key) return null;
  const sub = (typed as unknown as Record<string, unknown>)[group];
  if (sub == null || typeof sub !== "object") return null;
  const v = (sub as Record<string, unknown>)[key];
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  if (Array.isArray(v) && v.length === 0) return null;
  return v;
}

/** B2 per-type completeness score — averages per-field confidence over
 *  exactly the fields required for the classified document type. Missing
 *  fields contribute 0; present-but-unscored fields contribute
 *  DEFAULT_PRESENT_FIELD_CONFIDENCE. For OTHER / unknown, falls back to
 *  the model-reported overallConfidence (legacy behavior). */
export function computeTypeScopedConfidence(typed: TypedIntakeExtraction): number {
  const required = REQUIRED_FIELDS_BY_TYPE[typed.classification];
  if (!required || required.length === 0) {
    return typed.overallConfidence;
  }

  let sum = 0;
  for (const path of required) {
    const value = readField(typed, path);
    if (value == null) continue;                              // missing → 0
    const score = typed.perFieldConfidence?.[path];
    sum += (typeof score === "number" && score >= 0 && score <= 1)
      ? score
      : DEFAULT_PRESENT_FIELD_CONFIDENCE;
  }
  return sum / required.length;
}
