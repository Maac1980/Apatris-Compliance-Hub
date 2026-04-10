/**
 * AI Provider — Centralized AI integration layer.
 *
 * All AI model interactions go through this provider.
 * Currently wraps Anthropic Claude. Ready for multi-model routing.
 *
 * Usage:
 *   import { getAIProvider } from "../services/ai-provider.js";
 *   const ai = getAIProvider();
 *   if (ai) { const result = await ai.complete("..."); }
 */

export interface AIProvider {
  name: string;
  complete(prompt: string, options?: AICompletionOptions): Promise<string>;
  isAvailable(): boolean;
}

export interface AICompletionOptions {
  system?: string;
  maxTokens?: number;
  model?: string;
}

let _provider: AIProvider | null = null;
let _initialized = false;

/**
 * Get the AI provider instance. Returns null if no API key is configured.
 * Lazy-initializes on first call.
 */
export function getAIProvider(): AIProvider | null {
  if (_initialized) return _provider;
  _initialized = true;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[AI] No ANTHROPIC_API_KEY set — AI features disabled.");
    return null;
  }

  _provider = {
    name: "anthropic-claude",

    isAvailable(): boolean {
      return !!apiKey;
    },

    async complete(prompt: string, options: AICompletionOptions = {}): Promise<string> {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: options.model ?? "claude-sonnet-4-6",
          max_tokens: options.maxTokens ?? 1024,
          system: options.system ?? "You are a helpful assistant.",
          messages: [{ role: "user", content: prompt }],
        });
        return response.content[0]?.type === "text" ? response.content[0].text : "";
      } catch (err) {
        console.error("[AI] Completion failed:", err instanceof Error ? err.message : err);
        return "";
      }
    },
  };

  console.log("[AI] Anthropic Claude provider initialized.");
  return _provider;
}

/**
 * Check if AI is available without initializing.
 */
export function isAIConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ═══ BILINGUAL LEGAL OUTPUT ═════════════════════════════════════════════════

/**
 * System-level strategy for legal AI output:
 *  - Input documents are ALWAYS Polish (this is Poland)
 *  - AI reads Polish, processes in Polish
 *  - All legal output = Polish primary + English translation
 *  - Every legal response includes both versions
 *
 * This function wraps any legal prompt and enforces bilingual output.
 * Services call this instead of raw fetch for any legal content generation.
 */

export interface BilingualResult {
  pl: string;
  en: string;
  confidence: number;
}

const BILINGUAL_WRAPPER = `

LANGUAGE RULES (MANDATORY):
- The uploaded document is in Polish. Read and understand it in Polish.
- Your PRIMARY response must be in Polish (język polski) — this is the authoritative version.
- You must ALSO provide an English translation of the same content.
- The English version must preserve all legal meaning, article references, and arguments.
- Do NOT simplify the English version — it is for lawyers, not for workers.
- Structure your response with these exact markers:

---PL---
[Polish version here]
---END_PL---

---EN---
[English version here]
---END_EN---`;

export async function completeBilingual(
  prompt: string,
  options: AICompletionOptions & { legalContext?: boolean } = {},
): Promise<BilingualResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { pl: "", en: "", confidence: 0 };

  const system = (options.system ?? "You are a Polish immigration law assistant.") + BILINGUAL_WRAPPER;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model ?? "claude-sonnet-4-6",
        max_tokens: options.maxTokens ?? 4096,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return { pl: "", en: "", confidence: 0 };

    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const raw = data.content?.find(b => b.type === "text")?.text ?? "";

    const plMatch = raw.match(/---PL---\s*([\s\S]*?)\s*---END_PL---/);
    const enMatch = raw.match(/---EN---\s*([\s\S]*?)\s*---END_EN---/);

    const pl = plMatch?.[1]?.trim() ?? raw;
    const en = enMatch?.[1]?.trim() ?? "";

    // If markers weren't used, the full response is treated as PL (since that's the primary)
    const confidence = (plMatch && enMatch) ? 0.9 : (plMatch || enMatch) ? 0.6 : 0.4;

    return { pl, en, confidence };
  } catch (err) {
    console.error("[AI] Bilingual completion failed:", err instanceof Error ? err.message : err);
    return { pl: "", en: "", confidence: 0 };
  }
}

/**
 * Parse bilingual markers from any AI response string.
 * Use this when a service already has the raw AI text and needs to split PL/EN.
 */
export function parseBilingualMarkers(raw: string): { pl: string; en: string } {
  const plMatch = raw.match(/---PL---\s*([\s\S]*?)\s*---END_PL---/);
  const enMatch = raw.match(/---EN---\s*([\s\S]*?)\s*---END_EN---/);
  return {
    pl: plMatch?.[1]?.trim() ?? raw,
    en: enMatch?.[1]?.trim() ?? "",
  };
}
