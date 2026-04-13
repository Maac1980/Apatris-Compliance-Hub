/**
 * Intelligence Router — 3-tier legal Q&A pipeline.
 *
 * Tier 1: KB (verified articles — free, instant, defensible)
 * Tier 2: Perplexity (sourced search — fast, cited)
 * Tier 3: Claude (AI synthesis — accurate, slower)
 *
 * Each tier is attempted in order. First tier with a confident answer wins.
 * Response includes source_tier so the consumer knows trustworthiness.
 */

import { query } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type SourceTier = "kb" | "perplexity" | "claude" | "fallback";

export interface IntelligenceAnswer {
  answer: string;
  sourceTier: SourceTier;
  confidence: number; // 0-100
  citations: Array<{ title: string; source: string; url?: string }>;
  tiersAttempted: SourceTier[];
  latencyMs: number;
}

// ═══ TIER 1: KNOWLEDGE BASE ════════════════════════════════════════════════

async function tryKB(question: string, tenantId: string): Promise<IntelligenceAnswer | null> {
  const articles = await query<Record<string, any>>(
    "SELECT * FROM legal_knowledge WHERE tenant_id = $1 ORDER BY category",
    [tenantId]
  );
  if (articles.length === 0) return null;

  const searchTerms = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const scored = articles
    .map(a => {
      let score = 0;
      const text = `${a.title} ${a.content} ${JSON.stringify(a.tags ?? [])}`.toLowerCase();
      for (const term of searchTerms) {
        if (text.includes(term)) score += 1;
      }
      return { ...a, relevance: score };
    })
    .filter(a => a.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);

  if (scored.length === 0) return null;

  // Strong match: top article matches at least 40% of search terms
  const topMatchRatio = scored[0].relevance / Math.max(searchTerms.length, 1);
  if (topMatchRatio < 0.3) return null;

  const answer = scored.map(a => `**${a.title}**\n${a.content}`).join("\n\n---\n\n");
  const citations = scored.map(a => ({
    title: a.title,
    source: a.source_name || "Apatris Legal KB",
    url: a.source_url || undefined,
  }));

  return {
    answer,
    sourceTier: "kb",
    confidence: Math.min(95, 60 + topMatchRatio * 35),
    citations,
    tiersAttempted: ["kb"],
    latencyMs: 0,
  };
}

// ═══ TIER 2: PERPLEXITY ════════════════════════════════════════════════════

async function tryPerplexity(question: string): Promise<IntelligenceAnswer | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: "You are a Polish immigration and labour law expert. Answer accurately with legal citations. Focus on: TRC, Art. 108, work permits, ZUS, MOS 2026, posted workers, A1 certificates. Cite specific articles of Polish law.",
          },
          { role: "user", content: question },
        ],
        max_tokens: 1024,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content;
    if (!answer) return null;

    const citations = (data.citations ?? []).map((url: string, i: number) => ({
      title: `Source ${i + 1}`,
      source: "Perplexity Search",
      url,
    }));

    return {
      answer,
      sourceTier: "perplexity",
      confidence: 75,
      citations,
      tiersAttempted: ["kb", "perplexity"],
      latencyMs: 0,
    };
  } catch {
    return null;
  }
}

// ═══ TIER 3: CLAUDE ════════════════════════════════════════════════════════

async function tryClaude(question: string, language: string): Promise<IntelligenceAnswer | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are a Polish immigration and labour law expert. Answer accurately based on current Polish law (2026). Cover: TRC (Temporary Residence Card), Art. 108 continuity, MOS electronic filing, work permits (Type A/B/C), ZUS, PIT, Posted Workers Directive 96/71, GDPR, A1 certificates, oświadczenie, BHP. Always cite the relevant legal basis (e.g. "Art. 108 Ustawy o cudzoziemcach"). If uncertain, say so clearly.${language === "pl" ? " Odpowiedz po polsku." : ""}`,
      messages: [{ role: "user", content: question }],
    });

    const answer = response.content[0]?.type === "text" ? response.content[0].text : "";
    if (!answer) return null;

    return {
      answer,
      sourceTier: "claude",
      confidence: 65,
      citations: [{ title: "AI Legal Expert", source: "Claude (general knowledge)" }],
      tiersAttempted: ["kb", "perplexity", "claude"],
      latencyMs: 0,
    };
  } catch {
    return null;
  }
}

// ═══ ROUTER ════════════════════════════════════════════════════════════════

export async function routeIntelligenceQuery(
  question: string,
  tenantId: string,
  language: string = "en",
): Promise<IntelligenceAnswer> {
  const start = Date.now();

  // Tier 1: KB
  const kbResult = await tryKB(question, tenantId);
  if (kbResult) {
    kbResult.latencyMs = Date.now() - start;
    return kbResult;
  }

  // Tier 2: Perplexity
  const perplexityResult = await tryPerplexity(question);
  if (perplexityResult) {
    perplexityResult.latencyMs = Date.now() - start;
    return perplexityResult;
  }

  // Tier 3: Claude
  const claudeResult = await tryClaude(question, language);
  if (claudeResult) {
    claudeResult.latencyMs = Date.now() - start;
    return claudeResult;
  }

  // Fallback
  return {
    answer: "This question could not be answered by the current knowledge base, search, or AI. Please try rephrasing or ask about: work permits, ZUS, Article 108, MOS filing, EES, PIP inspections, or April 2026 rule changes.",
    sourceTier: "fallback",
    confidence: 0,
    citations: [],
    tiersAttempted: ["kb", "perplexity", "claude"],
    latencyMs: Date.now() - start,
  };
}
