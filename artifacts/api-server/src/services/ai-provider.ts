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
