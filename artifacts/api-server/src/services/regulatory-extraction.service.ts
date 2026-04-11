/**
 * Regulatory Extraction Service — Stage 2
 *
 * Extracts structured data from raw regulatory updates:
 * - Bilingual summary (PL/EN)
 * - Cited articles
 * - Affected topics, worker types, document types, regions
 * - Deadlines and effective dates
 *
 * Uses Claude for extraction. All summaries grounded in raw content.
 * NO legal engine changes. NO invented facts.
 */

import { execute, queryOne } from "../lib/db.js";
import { translateToEnglish } from "../lib/bilingual.js";

export interface ExtractionResult {
  summaryPL: string;
  summaryEN: string;
  authorityName: string | null;
  publicationDate: string | null;
  effectiveDate: string | null;
  deadlineDate: string | null;
  citedArticles: string[];
  affectedTopics: string[];
  affectedWorkerTypes: string[];
  affectedDocumentTypes: string[];
  affectedRegions: string[];
}

// ═══ AI EXTRACTION ══════════════════════════════════════════════════════════

export async function extractFromUpdate(updateId: string): Promise<ExtractionResult | null> {
  const row = await queryOne<any>("SELECT id, title, raw_text, summary, language FROM regulatory_updates WHERE id = $1", [updateId]);
  if (!row) return null;

  const text = row.raw_text || row.summary || "";
  if (text.length < 20) {
    return { summaryPL: "", summaryEN: "", authorityName: null, publicationDate: null, effectiveDate: null, deadlineDate: null, citedArticles: [], affectedTopics: [], affectedWorkerTypes: [], affectedDocumentTypes: [], affectedRegions: [] };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackExtraction(row.title, text);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 2000,
        system: `You extract structured data from Polish/EU regulatory updates for a staffing agency. Ground ALL output in the provided text. Do NOT invent information. If a field is not present in the text, return null or empty array.

Return ONLY valid JSON:
{
  "summaryPL": "2-3 sentence summary in Polish",
  "summaryEN": "same summary in English",
  "authorityName": "issuing authority name or null",
  "publicationDate": "YYYY-MM-DD or null",
  "effectiveDate": "YYYY-MM-DD when it takes effect or null",
  "deadlineDate": "YYYY-MM-DD compliance deadline or null",
  "citedArticles": ["Art. 108 Ustawa o cudzoziemcach", ...],
  "affectedTopics": ["work_permits", "trc_renewal", ...],
  "affectedWorkerTypes": ["all_foreigners", "ukrainian_nationals", "eu_citizens", "posted_workers", ...],
  "affectedDocumentTypes": ["work_permit", "residence_card", "a1_certificate", "employment_contract", ...],
  "affectedRegions": ["PL", "PL-MZ", "EU", ...]
}`,
        messages: [{ role: "user", content: `Title: ${row.title}\n\nContent:\n${text.slice(0, 4000)}` }],
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json() as any;
    const raw = data.content?.find((b: any) => b.type === "text")?.text ?? "";
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

    const result: ExtractionResult = {
      summaryPL: String(json.summaryPL ?? "").slice(0, 3000),
      summaryEN: String(json.summaryEN ?? "").slice(0, 3000),
      authorityName: json.authorityName ?? null,
      publicationDate: normalizeDate(json.publicationDate),
      effectiveDate: normalizeDate(json.effectiveDate),
      deadlineDate: normalizeDate(json.deadlineDate),
      citedArticles: Array.isArray(json.citedArticles) ? json.citedArticles.map(String).slice(0, 20) : [],
      affectedTopics: Array.isArray(json.affectedTopics) ? json.affectedTopics.map(String).slice(0, 10) : [],
      affectedWorkerTypes: Array.isArray(json.affectedWorkerTypes) ? json.affectedWorkerTypes.map(String).slice(0, 10) : [],
      affectedDocumentTypes: Array.isArray(json.affectedDocumentTypes) ? json.affectedDocumentTypes.map(String).slice(0, 10) : [],
      affectedRegions: Array.isArray(json.affectedRegions) ? json.affectedRegions.map(String).slice(0, 10) : [],
    };

    // Ensure EN summary exists
    if (!result.summaryEN && result.summaryPL) {
      result.summaryEN = await translateToEnglish(result.summaryPL, "Regulatory update summary");
    }

    return result;
  } catch {
    return fallbackExtraction(row.title, text);
  }
}

// ═══ PERSIST EXTRACTION ═══════════════════════════════════��═════════════════

export async function extractAndPersist(updateId: string): Promise<ExtractionResult | null> {
  const result = await extractFromUpdate(updateId);
  if (!result) return null;

  await execute(
    `UPDATE regulatory_updates SET
      summary_pl = $1, summary_en = $2, authority_name = $3,
      publication_date = $4, effective_date = $5, deadline_date = $6,
      cited_articles = $7::jsonb, relevant_topics = COALESCE(relevant_topics, '[]'::jsonb),
      affected_worker_types = $8::jsonb, affected_document_types = $9::jsonb,
      affected_regions = $10::jsonb, status = 'INGESTED', updated_at = NOW()
     WHERE id = $11`,
    [result.summaryPL, result.summaryEN, result.authorityName,
     result.publicationDate, result.effectiveDate, result.deadlineDate,
     JSON.stringify(result.citedArticles), JSON.stringify(result.affectedWorkerTypes),
     JSON.stringify(result.affectedDocumentTypes), JSON.stringify(result.affectedRegions), updateId]
  );

  return result;
}

// ═══ HELPERS ════════════════════════════════════════════════════════════════

function normalizeDate(val: any): string | null {
  if (!val) return null;
  try { const d = new Date(String(val)); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); } catch { return null; }
}

function fallbackExtraction(title: string, text: string): ExtractionResult {
  // Best-effort extraction without AI
  const summaryPL = text.slice(0, 300);
  const articles = [...text.matchAll(/Art\.\s*\d+[a-z]?\s*(?:ust\.\s*\d+)?(?:\s*pkt\s*\d+)?/gi)].map(m => m[0]).slice(0, 10);
  return {
    summaryPL, summaryEN: "", authorityName: null, publicationDate: null,
    effectiveDate: null, deadlineDate: null, citedArticles: articles,
    affectedTopics: [], affectedWorkerTypes: [], affectedDocumentTypes: [], affectedRegions: [],
  };
}
