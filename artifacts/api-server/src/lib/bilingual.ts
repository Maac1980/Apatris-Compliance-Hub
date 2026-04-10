/**
 * Bilingual Output System — Apatris
 *
 * RULE: All legal documents in Poland are in Polish.
 *       Every legal output MUST have Polish as primary.
 *       English translation MUST be alongside for clients/team.
 *
 * This module provides:
 *  1. translateToEnglish() — takes Polish legal text, returns English
 *  2. generateBilingual() — generates content in both PL and EN in one call
 *  3. BilingualText type — standard { pl, en } structure
 *
 * Used by: rejection-intelligence, legal-brief-pipeline, case-intelligence,
 *          legal-intelligence, legal-copilot, authority-drafting
 */

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface BilingualText {
  pl: string;
  en: string;
}

export interface BilingualList {
  pl: string[];
  en: string[];
}

// ═══ TRANSLATE PL → EN ════════════════════════════════════════════════════��═

/**
 * Translate Polish legal text to formal English.
 * Preserves article references, legal meaning, formal tone.
 * For internal/client use — not for filing with Polish authorities.
 */
export async function translateToEnglish(polishText: string, context?: string): Promise<string> {
  if (!polishText || polishText.length < 10) return "";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: Math.min(4096, polishText.length * 2),
        system: `Translate this Polish legal/immigration text to formal English.
RULES:
- Preserve ALL article references (Art. 108, KPA, etc.)
- Preserve ALL legal meaning — do not simplify
- Use formal English legal style
- Keep Polish office names with English translation in parentheses
- This translation is for internal/client understanding, NOT for filing with Polish authorities
${context ? `\nContext: ${context}` : ""}`,
        messages: [{ role: "user", content: polishText.slice(0, 6000) }],
      }),
    });
    if (!res.ok) return "";
    const data = await res.json() as any;
    return data.content?.find((b: any) => b.type === "text")?.text?.trim() ?? "";
  } catch { return ""; }
}

// ═══ GENERATE BILINGUAL IN ONE CALL ═════════════════════════════════════════

/**
 * Generate content in both Polish and English in a single AI call.
 * More efficient than generating PL then translating.
 * Uses ---PL--- / ---EN--- markers.
 */
export async function generateBilingual(
  prompt: string,
  systemPrompt: string,
  maxTokens = 4096,
): Promise<BilingualText> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { pl: "", en: "" };

  const bilingualSystem = `${systemPrompt}

LANGUAGE RULES (MANDATORY):
- Generate your response in BOTH Polish and English.
- Polish is the PRIMARY/AUTHORITATIVE version (this is Poland, legal documents are Polish).
- English is the translation for internal team and clients.
- Do NOT simplify the English version.
- Preserve all article references in both versions.
- Use these exact markers:

---PL---
[Polish version here]
---END_PL---

---EN---
[English version here]
---END_EN---`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system: bilingualSystem, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return { pl: "", en: "" };
    const data = await res.json() as any;
    const raw = data.content?.find((b: any) => b.type === "text")?.text ?? "";
    return parseBilingualMarkers(raw);
  } catch { return { pl: "", en: "" }; }
}

// ═══ PARSE MARKERS ══════════════════════════════════════════════════════════

/**
 * Parse ---PL---/---EN--- markers from any AI response.
 * If markers not found, full text is treated as PL.
 */
export function parseBilingualMarkers(raw: string): BilingualText {
  const plMatch = raw.match(/---PL---\s*([\s\S]*?)\s*---END_PL---/);
  const enMatch = raw.match(/---EN---\s*([\s\S]*?)\s*---END_EN---/);
  return {
    pl: plMatch?.[1]?.trim() ?? raw.trim(),
    en: enMatch?.[1]?.trim() ?? "",
  };
}

// ═══ ENSURE ENGLISH EXISTS ══════════════════════════════════════════════════

/**
 * Given a BilingualText, ensure EN exists. If missing, translate from PL.
 * Use this as a safety net after any bilingual generation.
 */
export async function ensureEnglish(text: BilingualText, context?: string): Promise<BilingualText> {
  if (text.en && text.en.length > 10) return text;
  if (!text.pl || text.pl.length < 10) return text;
  const en = await translateToEnglish(text.pl, context);
  return { pl: text.pl, en: en || "English translation not available — see Polish version." };
}
