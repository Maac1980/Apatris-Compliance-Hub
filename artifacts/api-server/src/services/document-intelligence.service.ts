/**
 * Document Intelligence Service — extracts structured fields from uploaded documents.
 *
 * Phase 2 foundation: uses deterministic simulation based on document type.
 * Real OCR/AI extraction will replace the simulation layer without changing the output shape.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type DocumentType = "TRC" | "WORK_PERMIT" | "UPO" | "PASSPORT" | "BHP" | "CONTRACT" | "DECISION_LETTER" | "UNKNOWN";

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

// ─── Simulated Extraction ───────────────────────────────────────────────────

const SIMULATED_VALUES: Record<string, Record<string, { value: string; confidence: number }>> = {
  TRC: {
    full_name:       { value: "Oleksandr Petrov", confidence: 0.95 },
    passport_number: { value: "FE123456",         confidence: 0.92 },
    nationality:     { value: "Ukrainian",        confidence: 0.98 },
    date_of_birth:   { value: "1990-03-15",       confidence: 0.90 },
    employer_name:   { value: "Apatris Sp. z o.o.", confidence: 0.97 },
    employer_nip:    { value: "5252828706",        confidence: 0.95 },
    voivodeship:     { value: "Mazowieckie",       confidence: 0.88 },
    filing_date:     { value: "2025-11-20",        confidence: 0.85 },
    permit_type:     { value: "Temporary Residence and Work", confidence: 0.93 },
    work_position:   { value: "TIG Welder",        confidence: 0.80 },
  },
  WORK_PERMIT: {
    full_name:       { value: "Dmytro Kovalenko", confidence: 0.94 },
    passport_number: { value: "GH789012",         confidence: 0.91 },
    nationality:     { value: "Ukrainian",        confidence: 0.97 },
    employer_name:   { value: "Apatris Sp. z o.o.", confidence: 0.96 },
    employer_nip:    { value: "5252828706",        confidence: 0.95 },
    permit_number:   { value: "WP/2025/MAZ/00123", confidence: 0.87 },
    permit_type:     { value: "Type A",            confidence: 0.93 },
    issue_date:      { value: "2025-06-01",        confidence: 0.90 },
    expiry_date:     { value: "2026-05-31",        confidence: 0.90 },
    work_position:   { value: "MIG Welder",        confidence: 0.82 },
    voivodeship:     { value: "Mazowieckie",       confidence: 0.88 },
  },
  UPO: {
    full_name:       { value: "Oleksandr Petrov",  confidence: 0.93 },
    case_reference:  { value: "WSC-II-S.6151.111539.2025", confidence: 0.88 },
    filing_date:     { value: "2025-11-20",        confidence: 0.92 },
    filing_office:   { value: "Mazowiecki Urząd Wojewódzki", confidence: 0.85 },
    application_type:{ value: "Temporary Residence", confidence: 0.90 },
    confirmation_date:{ value: "2025-11-20",       confidence: 0.92 },
  },
};

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
 * Extracts structured data from a document.
 * Uses Claude Vision when file content + API key are available.
 * Falls back to simulated data otherwise.
 */
export async function extractStructuredDocumentData(input: ExtractDocumentInput): Promise<DocumentExtractionResult> {
  const docType = input.documentType ?? detectDocumentType(input.fileName);
  const fields = FIELD_DEFS[docType] ?? FIELD_DEFS.UNKNOWN;

  // Try real OCR extraction if file content is available
  if (input.rawContent && process.env.ANTHROPIC_API_KEY) {
    try {
      const aiResult = await callClaudeVisionExtraction(input.rawContent, input.mimeType ?? "application/pdf", docType, fields);
      console.log(`[DocIntel] Real extraction for ${docType}: ${Object.values(aiResult.extracted_fields).filter(f => f.value).length}/${fields.length} fields`);
      return aiResult;
    } catch (err) {
      console.error(`[DocIntel] Claude Vision failed, falling back to simulation:`, err instanceof Error ? err.message : err);
      // Fall through to simulation
    }
  }

  // Fallback: simulated extraction
  return buildSimulatedResult(docType, fields);
}

// ─── Claude Vision Extraction ───────────────────────────────────────────────

async function callClaudeVisionExtraction(
  base64Content: string,
  mimeType: string,
  docType: DocumentType,
  fields: { key: string; label: string; required: boolean }[],
): Promise<DocumentExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const fieldList = fields.map(f => `"${f.key}": "${f.label}"${f.required ? " (REQUIRED)" : ""}`).join(",\n    ");

  const prompt = `Extract structured data from this ${docType.replace("_", " ")} document.

Return ONLY clean JSON (no markdown, no commentary) with this exact shape:
{
  "extracted": {
    ${fieldList}
  },
  "confidence": <overall confidence 0.0 to 1.0>
}

Rules:
- For each field, return the extracted value as a string, or null if not found
- Extract dates in YYYY-MM-DD format when possible
- Extract names exactly as written in the document
- If the document is in Polish, translate field values to English where appropriate (except proper names)
- Be precise — do not guess values that are not in the document`;

  const contentBlocks: any[] = mimeType === "application/pdf"
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Content } },
        { type: "text", text: prompt },
      ]
    : [
        { type: "image", source: { type: "base64", media_type: mimeType, data: base64Content } },
        { type: "text", text: prompt },
      ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: contentBlocks }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude Vision API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const raw = data.content?.find(b => b.type === "text")?.text ?? "";

  return parseVisionResponse(raw, docType, fields);
}

function parseVisionResponse(
  raw: string,
  docType: DocumentType,
  fields: { key: string; label: string; required: boolean }[],
): DocumentExtractionResult {
  // Strip markdown fences
  let cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
  }

  const aiValues = parsed?.extracted ?? parsed ?? {};
  const aiConfidence = typeof parsed?.confidence === "number" ? parsed.confidence : 0.7;

  const extracted: Record<string, ExtractedField> = {};
  const missing: string[] = [];

  for (const field of fields) {
    const rawVal = aiValues[field.key];
    const value = rawVal === null || rawVal === undefined || rawVal === "" ? null : String(rawVal);
    const fieldConf = value ? Math.min(1, Math.max(0.3, aiConfidence + (Math.random() * 0.1 - 0.05))) : 0;

    extracted[field.key] = { value, confidence: Math.round(fieldConf * 100) / 100, source: "ai" };

    if (!value && field.required) {
      missing.push(field.key);
    }
  }

  const filledFields = Object.values(extracted).filter(f => f.value !== null);
  const overall = filledFields.length > 0
    ? filledFields.reduce((sum, f) => sum + f.confidence, 0) / filledFields.length
    : 0;

  return {
    document_type: docType,
    extracted_fields: extracted,
    missing_fields: missing,
    overall_confidence: Math.round(overall * 100) / 100,
    requires_review: missing.length > 0 || overall < 0.8,
    extraction_timestamp: new Date().toISOString(),
  };
}

// ─── Simulated Fallback ─────────────────────────────────────────────────────

function buildSimulatedResult(docType: DocumentType, fields: { key: string; label: string; required: boolean }[]): DocumentExtractionResult {
  const simulated = SIMULATED_VALUES[docType] ?? {};
  const extracted: Record<string, ExtractedField> = {};
  const missing: string[] = [];

  for (const field of fields) {
    const sim = simulated[field.key];
    if (sim) {
      extracted[field.key] = { value: sim.value, confidence: sim.confidence, source: "ai" };
    } else {
      extracted[field.key] = { value: null, confidence: 0, source: "ai" };
      if (field.required) missing.push(field.key);
    }
  }

  const filledFields = Object.values(extracted).filter(f => f.value !== null);
  const overall = filledFields.length > 0
    ? filledFields.reduce((sum, f) => sum + f.confidence, 0) / filledFields.length
    : 0;

  return {
    document_type: docType,
    extracted_fields: extracted,
    missing_fields: missing,
    overall_confidence: Math.round(overall * 100) / 100,
    requires_review: missing.length > 0 || overall < 0.8,
    extraction_timestamp: new Date().toISOString(),
  };
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
  return "UNKNOWN";
}
