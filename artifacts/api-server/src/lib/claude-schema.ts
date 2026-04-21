/**
 * Schema-enforced Claude call helper.
 *
 * Uses Anthropic's tool_use feature to guarantee the response is a JSON object
 * matching the supplied input_schema. Eliminates the fragile "regex-extract +
 * JSON.parse" pattern that failed in staging v14 on the Stage 2 Case Review
 * (brief c9f29264-..., error at position 5765).
 *
 * Contract: the model is constrained server-side to call exactly one tool with
 * name `toolName` and arguments matching `inputSchema`. The helper returns the
 * parsed arguments as a typed object. Malformed JSON cannot reach the caller.
 *
 * Does NOT add a new runtime dependency — raw fetch against the 2023-06-01
 * Anthropic Messages API (same version the rest of the codebase uses).
 */

export interface ClaudeSchemaCall<T> {
  /** Anthropic API key. Caller validates presence. */
  apiKey: string;
  /** Model name. Defaults to claude-sonnet-4-6. */
  model?: string;
  /** Max output tokens. */
  maxTokens: number;
  /** System prompt (legal safety rules, task description). MUST NOT include "Return ONLY JSON" — the schema enforces that. */
  system: string;
  /** Single user message string, OR full messages array for multi-turn. */
  userMessage: string | Array<{ role: "user" | "assistant"; content: string }>;
  /** Tool name — snake_case stage identifier (e.g., "emit_stage2_case_review"). */
  toolName: string;
  /** One-line tool description (passed to Claude to clarify intent). */
  toolDescription: string;
  /** JSON Schema (draft-07 shape) describing the required output. */
  inputSchema: Record<string, unknown>;
  /** Optional AbortSignal for cancellation (Wave 2 prep). */
  signal?: AbortSignal;
  /** Result type hint — caller provides the shape for their own clarity. Helper does not validate at the TS level. */
  _typeTag?: T;
}

export async function callClaudeWithSchema<T>(opts: ClaudeSchemaCall<T>): Promise<T> {
  const model = opts.model ?? "claude-sonnet-4-6";
  const messages = typeof opts.userMessage === "string"
    ? [{ role: "user" as const, content: opts.userMessage }]
    : opts.userMessage;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      tools: [{
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.inputSchema,
      }],
      tool_choice: { type: "tool", name: opts.toolName },
      messages,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const bodyPreview = await res.text().catch(() => "<unreadable>");
    throw new Error(`Claude API error ${res.status}: ${bodyPreview.slice(0, 300)}`);
  }

  const data = await res.json() as { content?: Array<Record<string, unknown>> };
  const blocks = Array.isArray(data.content) ? data.content : [];
  const toolBlock = blocks.find(
    (b) => b["type"] === "tool_use" && b["name"] === opts.toolName,
  );

  if (!toolBlock) {
    const types = blocks.map((b) => String(b["type"] ?? "?")).join(",");
    const textPreview = (blocks.find((b) => b["type"] === "text")?.["text"] as string | undefined)?.slice(0, 300) ?? "";
    throw new Error(
      `Claude did not emit required tool "${opts.toolName}". Got blocks=[${types}]. Text preview: ${textPreview}`,
    );
  }

  const input = toolBlock["input"];
  if (!input || typeof input !== "object") {
    throw new Error(`Claude tool "${opts.toolName}" returned non-object input (type=${typeof input})`);
  }
  return input as T;
}
