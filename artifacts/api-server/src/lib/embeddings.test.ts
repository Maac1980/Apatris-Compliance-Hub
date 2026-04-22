import { describe, it, expect, vi, beforeEach } from "vitest";
import { callVoyageEmbed, _resetEmbeddingCacheForTests } from "./embeddings.js";

function mockResponse(body: unknown, status = 200): Response {
  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function makeEmbedding(dim = 1024, seed = 0.1): number[] {
  const v: number[] = [];
  for (let i = 0; i < dim; i++) v.push(seed + i * 0.0001);
  return v;
}

describe("callVoyageEmbed", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    _resetEmbeddingCacheForTests();
  });

  it("returns embeddings + model + token usage on a successful call", async () => {
    const vec = makeEmbedding();
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({
      data: [{ embedding: vec, index: 0 }],
      model: "voyage-multilingual-2",
      usage: { total_tokens: 42 },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callVoyageEmbed({
      apiKey: "vk-test", input: "hello world",
    });

    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toHaveLength(1024);
    expect(result.model).toBe("voyage-multilingual-2");
    expect(result.totalTokens).toBe(42);
    expect(result.cacheHits).toBe(0);

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("voyage-multilingual-2");
    expect(body.input).toEqual(["hello world"]);
    expect(body.input_type).toBe("document");
  });

  it("propagates HTTP errors with status and body preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse("unauthorized", 401)));

    await expect(callVoyageEmbed({
      apiKey: "vk-bad", input: "x",
    })).rejects.toThrow(/Voyage API error 401.*unauthorized/);
  });

  it("throws on rate limit (429) with body preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(
      { error: "rate_limited" }, 429,
    )));

    await expect(callVoyageEmbed({
      apiKey: "vk-ok", input: "x",
    })).rejects.toThrow(/Voyage API error 429/);
  });

  it("throws when response array length does not match input length", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
      data: [{ embedding: makeEmbedding(), index: 0 }],  // only 1 returned
      model: "voyage-multilingual-2",
    })));

    await expect(callVoyageEmbed({
      apiKey: "vk", input: ["a", "b"],                    // but 2 requested
    })).rejects.toThrow(/returned 1 embeddings for 2 inputs/);
  });

  it("propagates AbortSignal to fetch (cancellation hook)", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new Error("AbortError"));
      }
      return Promise.resolve(mockResponse({
        data: [{ embedding: makeEmbedding(), index: 0 }],
        model: "voyage-multilingual-2",
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    controller.abort();
    await expect(callVoyageEmbed({
      apiKey: "vk", input: "x", signal: controller.signal,
    })).rejects.toThrow(/abort/i);
  });

  it("returns cached embedding (cacheHits=1) on a second identical call without hitting fetch", async () => {
    const vec = makeEmbedding();
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({
      data: [{ embedding: vec, index: 0 }],
      model: "voyage-multilingual-2",
      usage: { total_tokens: 10 },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await callVoyageEmbed({ apiKey: "vk", input: "same text" });
    const second = await callVoyageEmbed({ apiKey: "vk", input: "same text" });

    expect(first.cacheHits).toBe(0);
    expect(second.cacheHits).toBe(1);
    expect(second.embeddings[0]).toEqual(first.embeddings[0]);
    expect(fetchMock).toHaveBeenCalledOnce();  // only the first call hit the API
  });
});
