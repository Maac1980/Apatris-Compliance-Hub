/**
 * Legal Evidence OCR Service — extracts filing facts from uploaded documents
 * using Claude Vision (or fallback provider).
 *
 * RULES:
 *  - Extracts facts, does NOT decide legal status
 *  - Extracted data stored separately from trusted structured data
 *  - Mismatches flagged for review, not silently overwritten
 *  - Legal engine still uses verified structured facts only
 */

import { queryOne, execute } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface ExtractionResult {
  filingDate: string | null;
  documentType: string | null;
  referenceNumber: string | null;
  issuingAuthority: string | null;
  extractedText: string | null;
  confidence: number;
  provider: string;
}

export type ExtractionStatus = "PENDING" | "SUCCESS" | "FAILED" | "REVIEW_REQUIRED";
export type VerificationStatus = "VERIFIED" | "MISMATCH" | "REVIEW_REQUIRED" | "FAILED" | "PENDING";

export interface VerificationResult {
  status: VerificationStatus;
  extractedFilingDate: string | null;
  storedFilingDate: string | null;
  trcStartDate: string | null;
  permitExpiryDate: string | null;
  details: string[];
}

export interface FullExtractionResult {
  extraction: ExtractionResult;
  extractionStatus: ExtractionStatus;
  verification: VerificationResult;
}

// ═══ VISION EXTRACTION ══════════════════════════════════════════════════════

const EXTRACTION_PROMPT = `You are analyzing a Polish immigration/legal filing document. This may be a UPO (Urzędowe Poświadczenie Odbioru), MoS (Potwierdzenie złożenia), TRC filing receipt, or immigration office receipt.

Extract the following from the document image. Return ONLY a JSON object:
{
  "filingDate": "YYYY-MM-DD or null if not found",
  "documentType": "UPO" or "MOS" or "TRC_FILING" or "IMMIGRATION_RECEIPT" or null,
  "referenceNumber": "string or null",
  "issuingAuthority": "string or null (e.g. voivodeship name, office name)",
  "extractedText": "key text excerpt from the document (max 500 chars)",
  "confidence": 0.0 to 1.0
}

Focus on finding the filing/submission date. Look for:
- "Data złożenia" / "Data wpływu" / "Data nadania"
- Date stamps, receipt dates
- Reference/case numbers (sygnatura, numer sprawy)
- Office name (Urząd Wojewódzki, Wydział Spraw Cudzoziemców)

Return JSON only, no markdown.`;

export async function extractEvidenceFacts(
  fileBuffer: Buffer,
  mimeType: string,
  evidenceId: string,
): Promise<FullExtractionResult> {
  let extraction: ExtractionResult;
  let extractionStatus: ExtractionStatus;

  try {
    extraction = await callClaudeVision(fileBuffer, mimeType);
    extractionStatus = extraction.confidence >= 0.5 ? "SUCCESS" : "REVIEW_REQUIRED";
  } catch (err) {
    extraction = {
      filingDate: null, documentType: null, referenceNumber: null,
      issuingAuthority: null, extractedText: null, confidence: 0, provider: "failed",
    };
    extractionStatus = "FAILED";
  }

  // Persist extraction results on the evidence record
  await execute(
    `UPDATE legal_evidence SET
      extracted_filing_date = $1, extracted_document_type = $2, extracted_reference_number = $3,
      extracted_authority = $4, extracted_text = $5, extraction_confidence = $6,
      extraction_status = $7, extraction_provider = $8,
      extracted_data = extracted_data || $9::jsonb
     WHERE id = $10`,
    [
      extraction.filingDate, extraction.documentType, extraction.referenceNumber,
      extraction.issuingAuthority, extraction.extractedText, extraction.confidence,
      extractionStatus, extraction.provider,
      JSON.stringify({ ocrResult: extraction, extractedAt: new Date().toISOString() }),
      evidenceId,
    ]
  );

  // Run verification against stored data
  const verification = await verifyExtraction(evidenceId, extraction);

  // Persist verification
  await execute(
    "UPDATE legal_evidence SET verification_status = $1, verification_details = $2 WHERE id = $3",
    [verification.status, JSON.stringify(verification), evidenceId]
  );

  return { extraction, extractionStatus, verification };
}

// ═══ CLAUDE VISION CALL ═════════════════════════════════════════════════════

async function callClaudeVision(fileBuffer: Buffer, mimeType: string): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const base64 = fileBuffer.toString("base64");
  const mediaType = mimeType === "application/pdf" ? "application/pdf" as const
    : mimeType.startsWith("image/") ? mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp"
    : "image/jpeg" as const;

  // For PDFs, Claude Vision needs the document as a document block
  const contentBlocks: any[] = mimeType === "application/pdf"
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: EXTRACTION_PROMPT },
      ]
    : [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: EXTRACTION_PROMPT },
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
      max_tokens: 1024,
      messages: [{ role: "user", content: contentBlocks }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude Vision API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const raw = data.content?.find(b => b.type === "text")?.text ?? "";

  return parseExtractionResponse(raw);
}

function parseExtractionResponse(raw: string): ExtractionResult {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        filingDate: validateDateStr(parsed.filingDate),
        documentType: typeof parsed.documentType === "string" ? parsed.documentType : null,
        referenceNumber: typeof parsed.referenceNumber === "string" ? parsed.referenceNumber : null,
        issuingAuthority: typeof parsed.issuingAuthority === "string" ? parsed.issuingAuthority : null,
        extractedText: typeof parsed.extractedText === "string" ? parsed.extractedText.slice(0, 500) : null,
        confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.3,
        provider: "claude_vision",
      };
    }
  } catch { /* fall through */ }

  return {
    filingDate: null, documentType: null, referenceNumber: null,
    issuingAuthority: null, extractedText: raw.slice(0, 500) || null,
    confidence: 0, provider: "claude_vision",
  };
}

function validateDateStr(val: unknown): string | null {
  if (typeof val !== "string" || !val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  // Sanity: date should be between 2020 and 2030
  const year = d.getFullYear();
  if (year < 2020 || year > 2030) return null;
  return d.toISOString().slice(0, 10);
}

// ═══ VERIFICATION ═══════════════════════════════════════════════════════════

async function verifyExtraction(evidenceId: string, extraction: ExtractionResult): Promise<VerificationResult> {
  // Load the evidence record + related data
  const ev = await queryOne<any>(
    `SELECT le.filing_date, le.worker_id, le.tenant_id,
            tc.start_date as trc_start_date,
            ip.expiry_date as permit_expiry_date
     FROM legal_evidence le
     LEFT JOIN trc_cases tc ON tc.worker_id = le.worker_id::text AND tc.tenant_id = le.tenant_id::text
     LEFT JOIN immigration_permits ip ON ip.worker_id = le.worker_id AND ip.tenant_id = le.tenant_id
     WHERE le.id = $1
     ORDER BY tc.created_at DESC, ip.expiry_date DESC
     LIMIT 1`,
    [evidenceId]
  );

  const storedFilingDate = ev?.filing_date ? new Date(ev.filing_date).toISOString().slice(0, 10) : null;
  const trcStartDate = ev?.trc_start_date ? new Date(ev.trc_start_date).toISOString().slice(0, 10) : null;
  const permitExpiryDate = ev?.permit_expiry_date ? new Date(ev.permit_expiry_date).toISOString().slice(0, 10) : null;
  const extractedDate = extraction.filingDate;
  const details: string[] = [];

  // No extracted date → cannot verify
  if (!extractedDate) {
    return {
      status: extraction.confidence > 0 ? "REVIEW_REQUIRED" : "FAILED",
      extractedFilingDate: null, storedFilingDate, trcStartDate, permitExpiryDate,
      details: ["No filing date could be extracted from the document."],
    };
  }

  let status: VerificationStatus = "VERIFIED";

  // Check vs stored filing date
  if (storedFilingDate) {
    const daysDiff = Math.abs(daysBetween(extractedDate, storedFilingDate));
    if (daysDiff === 0) {
      details.push(`Extracted date matches stored filing date: ${storedFilingDate}.`);
    } else if (daysDiff <= 3) {
      details.push(`Extracted date (${extractedDate}) is ${daysDiff} day(s) from stored filing date (${storedFilingDate}). Close match.`);
    } else {
      details.push(`MISMATCH: Extracted date (${extractedDate}) differs from stored filing date (${storedFilingDate}) by ${daysDiff} days.`);
      status = "MISMATCH";
    }
  } else {
    details.push(`No stored filing date to compare. Extracted: ${extractedDate}.`);
  }

  // Check vs TRC start date
  if (trcStartDate) {
    const daysDiff = Math.abs(daysBetween(extractedDate, trcStartDate));
    if (daysDiff <= 3) {
      details.push(`Consistent with TRC case start date: ${trcStartDate}.`);
    } else {
      details.push(`Note: Extracted date (${extractedDate}) differs from TRC start date (${trcStartDate}) by ${daysDiff} days.`);
      if (status === "VERIFIED") status = "REVIEW_REQUIRED";
    }
  }

  // Check vs permit expiry (filing should be before or on expiry for Art. 108)
  if (permitExpiryDate) {
    if (extractedDate <= permitExpiryDate) {
      details.push(`Filing date is before permit expiry (${permitExpiryDate}). Art. 108 timing condition met.`);
    } else {
      details.push(`WARNING: Extracted filing date (${extractedDate}) is AFTER permit expiry (${permitExpiryDate}). Art. 108 may not apply.`);
      if (status === "VERIFIED") status = "REVIEW_REQUIRED";
    }
  }

  // Low confidence → force review
  if (extraction.confidence < 0.6 && status === "VERIFIED") {
    status = "REVIEW_REQUIRED";
    details.push("Extraction confidence is below threshold. Manual verification recommended.");
  }

  return { status, extractedFilingDate: extractedDate, storedFilingDate, trcStartDate, permitExpiryDate, details };
}

function daysBetween(a: string, b: string): number {
  return Math.ceil((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

// ═══ READ ═══════════════════════════════════════════════════════════════════

export async function getExtractionResult(evidenceId: string): Promise<any> {
  return queryOne(
    `SELECT id, extraction_status, extraction_confidence, extraction_provider,
            extracted_filing_date, extracted_document_type, extracted_reference_number,
            extracted_authority, extracted_text, verification_status, verification_details
     FROM legal_evidence WHERE id = $1`,
    [evidenceId]
  );
}
