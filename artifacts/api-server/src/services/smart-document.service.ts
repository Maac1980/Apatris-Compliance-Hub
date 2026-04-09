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

const EXTRACTION_PROMPT = `Analyze this Polish legal/immigration document. Extract ALL of the following. Return ONLY valid JSON:
{
  "workerName": "full name of the worker/foreigner mentioned, or null",
  "nationality": "nationality if mentioned, or null",
  "pesel": "PESEL number if visible, or null",
  "passportNumber": "passport number if visible, or null",
  "documentType": "REJECTION_LETTER" or "FILING_RECEIPT" or "TRC_DECISION" or "AUTHORITY_CORRESPONDENCE" or "PERMIT" or "CONTRACT" or "OTHER",
  "voivodeship": "voivodeship/office name if mentioned, or null",
  "caseReference": "case/reference number if visible, or null",
  "decisionDate": "YYYY-MM-DD if a decision date is visible, or null",
  "filingDate": "YYYY-MM-DD if a filing/submission date is visible, or null",
  "rejectionReasons": "text of rejection reasons if this is a rejection, or null",
  "keyContent": "main content summary in 2-3 sentences",
  "language": "pl" or "en" or "uk" or "other"
}

Look for: names, dates, case numbers, stamps, office headers, decision text.
Return JSON only, no markdown.`;

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

  // Try exact PESEL match first (highest confidence)
  if (pesel && pesel.length >= 10) {
    const row = await queryOne<any>(
      "SELECT id, full_name FROM workers WHERE tenant_id = $1 AND pesel = $2",
      [tenantId, pesel]
    );
    if (row) return { match: { id: row.id, name: row.full_name, confidence: 1.0 }, suggestions: [] };
  }

  // Try passport match
  if (passport && passport.length >= 5) {
    const row = await queryOne<any>(
      "SELECT id, full_name FROM workers WHERE tenant_id = $1 AND passport_number = $2",
      [tenantId, passport]
    );
    if (row) return { match: { id: row.id, name: row.full_name, confidence: 0.95 }, suggestions: [] };
  }

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
