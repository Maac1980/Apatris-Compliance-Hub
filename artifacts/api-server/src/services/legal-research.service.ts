/**
 * Legal Research Service — fetches Polish immigration law updates via Perplexity API.
 *
 * INTERNAL ONLY. No legal decisions, no status changes, no engine integration.
 * Fetch → parse → store → view.
 */

import { query, queryOne, execute } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface LawArticle {
  id: string;
  tenant_id: string | null;
  title: string;
  summary: string;
  source_url: string | null;
  article_ref: string | null;
  jurisdiction: string;
  query_used: string | null;
  created_at: string;
  updated_at: string;
}

interface PerplexityMessage {
  role: string;
  content: string;
}

interface PerplexityChoice {
  message: PerplexityMessage;
}

interface PerplexityResponse {
  choices: PerplexityChoice[];
  citations?: string[];
}

interface ParsedArticle {
  title: string;
  summary: string;
  sourceUrl: string | null;
  articleRef: string | null;
}

// ═══ PERPLEXITY CALL ════════════════════════════════════════════════════════

const RESEARCH_QUERY = "latest Polish immigration law TRC updates 2026 MOS system CUKR changes temporary residence card voivodeship office procedures";

async function callPerplexity(customQuery?: string): Promise<{ articles: ParsedArticle[]; rawResponse: string }> {
  const apiKey = process.env.PPLX_API_KEY;
  if (!apiKey) throw new Error("PPLX_API_KEY not configured");

  const searchQuery = customQuery ?? RESEARCH_QUERY;

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content: "You are a legal research assistant specializing in Polish immigration law. Return structured results as a JSON array. Each item must have: title (string), summary (string, 2-3 sentences), sourceUrl (string or null), articleRef (string or null, e.g. 'Art. 108'). Return ONLY the JSON array, no markdown fences.",
        },
        {
          role: "user",
          content: `Find the latest updates and changes regarding: ${searchQuery}. Return up to 5 results as a JSON array.`,
        },
      ],
      max_tokens: 2048,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Perplexity API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as PerplexityResponse;
  const rawContent = data.choices?.[0]?.message?.content ?? "";
  const citations = data.citations ?? [];

  // Parse the response into structured articles
  const articles = parsePerplexityResponse(rawContent, citations);

  return { articles, rawResponse: rawContent };
}

function parsePerplexityResponse(content: string, citations: string[]): ParsedArticle[] {
  // Try to extract JSON array from response
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item: any) => item.title && item.summary)
          .slice(0, 10)
          .map((item: any) => ({
            title: String(item.title).slice(0, 500),
            summary: String(item.summary).slice(0, 2000),
            sourceUrl: item.sourceUrl ?? item.source_url ?? null,
            articleRef: item.articleRef ?? item.article_ref ?? null,
          }));
      }
    }
  } catch { /* fall through to text parsing */ }

  // Fallback: treat the whole response as a single article
  if (content.trim().length > 20) {
    return [{
      title: "Polish Immigration Law Update",
      summary: content.slice(0, 2000),
      sourceUrl: citations[0] ?? null,
      articleRef: null,
    }];
  }

  return [];
}

// ═══ SERVICE FUNCTIONS ══════════════════════════════════════════════════════

export async function fetchLatestUpdates(tenantId: string, customQuery?: string): Promise<LawArticle[]> {
  // Rate limit check
  const { checkAIRateLimit } = await import("../lib/ai-rate-limiter.js");
  const limit = checkAIRateLimit(tenantId, "perplexity");
  if (!limit.allowed) throw new Error(`Perplexity rate limit exceeded. Resets in ${limit.resetsIn}s.`);

  const searchQuery = customQuery ?? RESEARCH_QUERY;
  const { articles } = await callPerplexity(customQuery);

  if (articles.length === 0) return [];

  const saved: LawArticle[] = [];
  for (const a of articles) {
    const row = await queryOne<LawArticle>(
      `INSERT INTO law_articles (tenant_id, title, summary, source_url, article_ref, jurisdiction, query_used)
       VALUES ($1, $2, $3, $4, $5, 'PL', $6) RETURNING *`,
      [tenantId, a.title, a.summary, a.sourceUrl, a.articleRef, searchQuery]
    );
    if (row) saved.push(row);
  }

  return saved;
}

export async function listArticles(tenantId: string, limit = 50): Promise<LawArticle[]> {
  return query<LawArticle>(
    "SELECT * FROM law_articles WHERE tenant_id = $1 OR tenant_id IS NULL ORDER BY created_at DESC LIMIT $2",
    [tenantId, limit]
  );
}
