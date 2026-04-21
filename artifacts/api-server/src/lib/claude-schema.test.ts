import { describe, it, expect, vi, beforeEach } from "vitest";
import { callClaudeWithSchema } from "./claude-schema.js";

const SAMPLE_SCHEMA = {
  type: "object",
  properties: { field: { type: "string" } },
  required: ["field"],
};

const TOOL_NAME = "emit_sample_output";

// Minimal fetch response helper
function mockResponse(body: unknown, status = 200): Response {
  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

describe("callClaudeWithSchema", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed input object when Claude emits the requested tool", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({
      content: [
        { type: "tool_use", name: TOOL_NAME, input: { field: "hello" } },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callClaudeWithSchema<{ field: string }>({
      apiKey: "test-key", maxTokens: 1024,
      system: "test", userMessage: "hi",
      toolName: TOOL_NAME, toolDescription: "Emit sample", inputSchema: SAMPLE_SCHEMA,
    });

    expect(result).toEqual({ field: "hello" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tool_choice).toEqual({ type: "tool", name: TOOL_NAME });
    expect(body.tools[0].name).toBe(TOOL_NAME);
    expect(body.tools[0].input_schema).toEqual(SAMPLE_SCHEMA);
  });

  it("throws a clear error when Claude returns text instead of a tool_use block", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
      content: [{ type: "text", text: "Sorry, I cannot comply with this request." }],
    })));

    await expect(callClaudeWithSchema({
      apiKey: "k", maxTokens: 100,
      system: "s", userMessage: "u",
      toolName: TOOL_NAME, toolDescription: "d", inputSchema: SAMPLE_SCHEMA,
    })).rejects.toThrow(/did not emit required tool/i);
  });

  it("throws when Claude emits a different tool name than requested", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
      content: [{ type: "tool_use", name: "wrong_tool_name", input: { field: "x" } }],
    })));

    await expect(callClaudeWithSchema({
      apiKey: "k", maxTokens: 100,
      system: "s", userMessage: "u",
      toolName: TOOL_NAME, toolDescription: "d", inputSchema: SAMPLE_SCHEMA,
    })).rejects.toThrow(/did not emit required tool/i);
  });

  it("propagates HTTP errors with status and body preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse("rate limited", 429)));

    await expect(callClaudeWithSchema({
      apiKey: "k", maxTokens: 100,
      system: "s", userMessage: "u",
      toolName: TOOL_NAME, toolDescription: "d", inputSchema: SAMPLE_SCHEMA,
    })).rejects.toThrow(/Claude API error 429.*rate limited/);
  });

  it("throws when tool_use block is present but input is non-object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
      content: [{ type: "tool_use", name: TOOL_NAME, input: "not-an-object" }],
    })));

    await expect(callClaudeWithSchema({
      apiKey: "k", maxTokens: 100,
      system: "s", userMessage: "u",
      toolName: TOOL_NAME, toolDescription: "d", inputSchema: SAMPLE_SCHEMA,
    })).rejects.toThrow(/non-object input/i);
  });
});
