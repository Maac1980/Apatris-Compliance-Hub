/**
 * AI Provider — abstraction layer for AI model access.
 *
 * Currently supports: Anthropic Claude (via existing @anthropic-ai/sdk)
 * Prepared for: OpenAI, Gemini, Ollama
 *
 * Usage:
 *   const provider = getProvider();
 *   if (provider) {
 *     const response = await provider.complete({ prompt: "..." });
 *   }
 */

import type { AIProvider, AICompletionRequest, AICompletionResponse } from "./types.js";

// ═══ ANTHROPIC PROVIDER ═════════════════════════════════════════════════════

function createAnthropicProvider(apiKey: string): AIProvider {
  return {
    name: "anthropic-claude",
    isAvailable: () => true,
    async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: req.model ?? "claude-sonnet-4-6",
        max_tokens: req.maxTokens ?? 512,
        system: req.system ?? "You are a helpful assistant for a workforce management platform.",
        messages: [{ role: "user", content: req.prompt }],
      });
      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      return { text, model: req.model ?? "claude-sonnet-4-6" };
    },
  };
}

// ═══ PROVIDER REGISTRY ══════════════════════════════════════════════════════

let _provider: AIProvider | null = null;
let _initialized = false;

export function getProvider(): AIProvider | null {
  if (_initialized) return _provider;
  _initialized = true;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    _provider = createAnthropicProvider(anthropicKey);
    console.log("[AI] Provider: Anthropic Claude");
    return _provider;
  }

  // Future: check for OPENAI_API_KEY, GEMINI_API_KEY, etc.

  console.log("[AI] No AI provider configured — AI features will use rule-based fallbacks.");
  return null;
}

export function isAIAvailable(): boolean {
  return getProvider()?.isAvailable() ?? false;
}
