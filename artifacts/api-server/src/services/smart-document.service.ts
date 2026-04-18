/**
 * Smart Document Service — reads any dropped PDF/image, extracts worker identity
 * and document content, matches against database.
 *
 * One service, used across all pages:
 * - Rejection Intelligence: extract rejection reasons + match worker
 * - Evidence Upload: extract filing date
 * - TRC Service: extract case details
 * - Legal Documents: extract correspondence details
 */

import { query, queryOne } from "../lib/db.js";
import { lookupHash } from "../lib/encryption.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface SmartDocumentResult {
  extractedText: string;
  workerMatch: { id: string; name: string; confidence: number } | null;
  workerSuggestions: Array<{ id: string; name: string; score: number }>;
  documentType: string | null;
  extractedFields: Record<string, string | null>;
  isNewWorker: boolean;
}

// ═══ EXTRACTION PROMPT ══════════════════════════════════════════════════════

const EXTRACTION_PROMPT = `You are an expert document reader for a Polish immigration staffing agency. Analyze this document carefully.

DOCUMENT TYPES you may encounter:
- PASSPORT: Look for MRZ zone (bottom of page, two lines of <<< characters), photo, name fields "Surname/Nom", "Given names/Prénoms", passport number, nationality, date of birth, expiry date, issuing country
- REJECTION_LETTER: Polish government rejection (odmowa/decyzja negatywna) — look for Wojewoda, case number, worker name, rejection reasons
- FILING_RECEIPT: UPO receipt or MoS stamp confirming filing date
- TRC_DECISION: Temporary Residence Card decision
- PERMIT: Work permit or residence permit
- CONTRACT: Employment contract (Umowa zlecenie/o pracę)
- ID_CARD: National ID card — look for name, number, DOB, nationality
- OTHER: Anything else

EXTRACTION RULES:
- For PASSPORTS: The name is ALWAYS split into Surname + Given Names. Combine them as "Given Names SURNAME" (e.g. "Monica Tatiana BARAHONA VARON"). Read the MRZ zone carefully for passport number (alphanumeric, 8-9 chars) and nationality code (3-letter ISO).
- For PESEL: 11-digit Polish identification number. May appear on contracts, ZUS forms, or Polish documents.
- For dates: Always convert to YYYY-MM-DD format.
- For names: Extract the FULL name including all middle names.
- If the image is blurry or low quality, extract what you CAN read and note uncertainty.

Return ONLY valid JSON (no markdown):
{
  "workerName": "full name or null",
  "nationality": "full country name or ISO code or null",
  "pesel": "11-digit PESEL or null",
  "passportNumber": "passport/ID document number or null",
  "dateOfBirth": "YYYY-MM-DD or null",
  "documentType": "PASSPORT|REJECTION_LETTER|FILING_RECEIPT|TRC_DECISION|PERMIT|CONTRACT|ID_CARD|OTHER",
  "voivodeship": "voivodeship/office or null",
  "caseReference": "case/reference number or null",
  "decisionDate": "YYYY-MM-DD or null",
  "filingDate": "YYYY-MM-DD or null",
  "expiryDate": "YYYY-MM-DD document expiry or null",
  "rejectionReasons": "rejection reasons text or null",
  "keyContent": "2-3 sentence summary of what this document contains",
  "language": "pl|en|uk|es|other",
  "confidence": "HIGH|MEDIUM|LOW based on image quality"
}`;

// ═══ CORE ═══════════════════════════════════════════════════════════════════

export async function processSmartDocument(
  fileBuffer: Buffer,
  mimeType: string,
  tenantId: string,
): Promise<SmartDocumentResult> {
  // 1. Extract with Claude Vision
  const extracted = await callVision(fileBuffer, mimeType);

  // 2. Match worker against database
  const { match, suggestions } = await matchWorker(extracted.workerName, extracted.pesel, extracted.passportNumber, tenantId);

  return {
    extractedText: extracted.keyContent ?? "",
    workerMatch: match,
    workerSuggestions: suggestions,
    documentType: extracted.documentType,
    extractedFields: {
      workerName: extracted.workerName,
      nationality: extracted.nationality,
      pesel: extracted.pesel,
      passportNumber: extracted.passportNumber,
      voivodeship: extracted.voivodeship,
      caseReference: extracted.caseReference,
      decisionDate: extracted.decisionDate,
      filingDate: extracted.filingDate,
      rejectionReasons: extracted.rejectionReasons,
      keyContent: extracted.keyContent,
      language: extracted.language,
    },
    isNewWorker: !match,
  };
}

// ═══ CLAUDE VISION ══════════════════════════════════════════════════════════

async function callVision(fileBuffer: Buffer, mimeType: string): Promise<Record<string, string | null>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { workerName: null, documentType: "OTHER", keyContent: "AI not available — upload manually" };
  }

  try {
    const base64 = fileBuffer.toString("base64");
    const mediaType = mimeType === "application/pdf" ? "application/pdf" : mimeType;

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

    if (!res.ok) throw new Error(`Vision API ${res.status}`);

    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const raw = data.content?.find(b => b.type === "text")?.text ?? "";

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, v === null ? null : String(v)]));
    }
    return { workerName: null, documentType: "OTHER", keyContent: raw.slice(0, 500) };
  } catch (err) {
    console.error("[SmartDocument] Vision error:", err instanceof Error ? err.message : err);
    return { workerName: null, documentType: "OTHER", keyContent: "Document could not be read automatically" };
  }
}

// ═══ WORKER MATCHING ════════════════════════════════════════════════════════

async function matchWorker(
  name: string | null,
  pesel: string | null,
  passport: string | null,
  tenantId: string,
): Promise<{ match: { id: string; name: string; confidence: number } | null; suggestions: Array<{ id: string; name: string; score: number }> }> {

  // Try exact PESEL match first (highest confidence) — PESEL is encrypted at rest,
  // so we look up via the hash column (Apr 18 PII encryption migration).
  if (pesel && pesel.length >= 10) {
    const peselHash = lookupHash(pesel);
    if (peselHash) {
      const row = await queryOne<any>(
        "SELECT id, full_name FROM workers WHERE tenant_id = $1 AND pesel_hash = $2",
        [tenantId, peselHash]
      );
      if (row) return { match: { id: row.id, name: row.full_name, confidence: 1.0 }, suggestions: [] };
    }
  }

  // Note: workers table does not have passport_number column.
  // Passport matching would require adding the column. For now, skip to name match.

  // Try name match (fuzzy)
  if (name && name.trim().length >= 3) {
    const normalized = name.trim().toLowerCase();
    const rows = await query<any>(
      "SELECT id, full_name FROM workers WHERE tenant_id = $1",
      [tenantId]
    );

    const scored = rows.map((r: any) => {
      const dbName = (r.full_name ?? "").toLowerCase();
      let score = 0;
      // Exact match
      if (dbName === normalized) score = 1.0;
      // Contains full name
      else if (dbName.includes(normalized) || normalized.includes(dbName)) score = 0.8;
      // Word overlap
      else {
        const inputWords = normalized.split(/\s+/);
        const dbWords = dbName.split(/\s+/);
        const matches = inputWords.filter(w => dbWords.some(d => d.includes(w) || w.includes(d))).length;
        score = matches / Math.max(inputWords.length, dbWords.length);
      }
      return { id: r.id, name: r.full_name, score };
    }).filter(r => r.score > 0.3).sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score >= 0.8) {
      return { match: { id: scored[0].id, name: scored[0].name, confidence: scored[0].score }, suggestions: scored.slice(1, 4) };
    }
    return { match: null, suggestions: scored.slice(0, 4) };
  }

  return { match: null, suggestions: [] };
}
