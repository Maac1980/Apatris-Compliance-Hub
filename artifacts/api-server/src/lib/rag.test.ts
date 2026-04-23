import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db.query BEFORE importing rag.ts (vi.mock is hoisted).
vi.mock("./db.js", () => ({
  query: vi.fn(),
}));

import { query as dbQueryMod } from "./db.js";
import {
  retrieveSimilarRejections,
  retrieveRelevantArticles,
  retrieveAppealTemplates,
  retrieveSimilarWorkers,
  embedQueryText,
  composeProfileString,
} from "./rag.js";
import { _resetEmbeddingCacheForTests } from "./embeddings.js";

const queryMock = dbQueryMod as unknown as ReturnType<typeof vi.fn>;

function makeEmbed(dim = 1024, seed = 0.1): number[] {
  const v: number[] = [];
  for (let i = 0; i < dim; i++) v.push(seed + i * 0.0001);
  return v;
}

function mockVoyageOnce(vec: number[] = makeEmbed()): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [{ embedding: vec, index: 0 }],
        model: "voyage-multilingual-2",
        usage: { total_tokens: 10 },
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ),
  );
}

function mockVoyage500(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce(
      new Response("internal error", { status: 500 }),
    ),
  );
}

beforeEach(() => {
  queryMock.mockReset();
  vi.unstubAllGlobals();
  _resetEmbeddingCacheForTests();
  vi.stubEnv("APATRIS_VOYAGE_API_KEY", "vk-test");
});

// ── Shared helper tests ─────────────────────────────────────────────────

describe("embedQueryText", () => {
  it("returns null when APATRIS_VOYAGE_API_KEY is unset", async () => {
    vi.stubEnv("APATRIS_VOYAGE_API_KEY", "");
    const r = await embedQueryText("hello");
    expect(r).toBeNull();
  });

  it("returns null on Voyage API error (no throw)", async () => {
    mockVoyage500();
    const r = await embedQueryText("hello");
    expect(r).toBeNull();
  });

  it("uses inputType=query for query-side embedding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ embedding: makeEmbed(), index: 0 }],
        model: "voyage-multilingual-2",
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await embedQueryText("hello");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.input_type).toBe("query");
  });
});

describe("composeProfileString", () => {
  it("joins present fields with commas in stable order", () => {
    expect(composeProfileString({
      nationality: "Ukrainian", specialization: "TIG welder",
      caseType: "TRC renewal", voivodeship: "mazowieckie",
    })).toBe("Ukrainian, TIG welder, case type: TRC renewal, voivodeship: mazowieckie");
  });
  it("omits missing fields", () => {
    expect(composeProfileString({ nationality: "Polish" })).toBe("Polish");
  });
  it("returns empty string for fully-empty input", () => {
    expect(composeProfileString({})).toBe("");
  });
});

// ── Type B — Relevant Articles (richest test surface; only type with real data) ─

describe("retrieveRelevantArticles", () => {
  it("returns confidence=high when >=3 results and top similarity >= 0.5", async () => {
    queryMock.mockResolvedValueOnce([{ n: 12 }]);
    queryMock.mockResolvedValueOnce([
      { id: "1", title: "A", content: "x", category: "MOS", source_name: null, source_url: null, tags: [], similarity: 0.72 },
      { id: "2", title: "B", content: "y", category: "TRC", source_name: null, source_url: null, tags: [], similarity: 0.55 },
      { id: "3", title: "C", content: "z", category: "ZUS", source_name: null, source_url: null, tags: [], similarity: 0.51 },
    ]);
    mockVoyageOnce();

    const r = await retrieveRelevantArticles("what is MOS 2.0?");
    expect(r.confidence).toBe("high");
    expect(r.results).toHaveLength(3);
    expect(r.topSimilarity).toBeCloseTo(0.72);
    expect(r.reason).toMatch(/3 hits/);
  });

  it("returns confidence=low when top similarity is between 0.35 and 0.5", async () => {
    queryMock.mockResolvedValueOnce([{ n: 12 }]);
    queryMock.mockResolvedValueOnce([
      { id: "1", title: "A", content: "x", category: "MOS", source_name: null, source_url: null, tags: [], similarity: 0.42 },
    ]);
    mockVoyageOnce();

    const r = await retrieveRelevantArticles("what is MOS 2.0?");
    expect(r.confidence).toBe("low");
    expect(r.reason).toMatch(/below high threshold/);
  });

  it("returns confidence=low when >=3 hits but top < 0.5 (strong-shape but weak-signal)", async () => {
    queryMock.mockResolvedValueOnce([{ n: 12 }]);
    queryMock.mockResolvedValueOnce([
      { id: "1", title: "A", content: "x", category: "MOS", source_name: null, source_url: null, tags: [], similarity: 0.48 },
      { id: "2", title: "B", content: "y", category: "TRC", source_name: null, source_url: null, tags: [], similarity: 0.4 },
      { id: "3", title: "C", content: "z", category: "ZUS", source_name: null, source_url: null, tags: [], similarity: 0.38 },
    ]);
    mockVoyageOnce();

    const r = await retrieveRelevantArticles("what is MOS 2.0?");
    expect(r.confidence).toBe("low");
  });

  it("returns confidence=none when top similarity is below 0.35", async () => {
    queryMock.mockResolvedValueOnce([{ n: 12 }]);
    queryMock.mockResolvedValueOnce([
      { id: "1", title: "A", content: "x", category: "ZUS", source_name: null, source_url: null, tags: [], similarity: 0.22 },
    ]);
    mockVoyageOnce();

    const r = await retrieveRelevantArticles("something totally unrelated");
    expect(r.confidence).toBe("none");
  });

  it("empty-table early return: no Voyage call when no rows are embedded", async () => {
    queryMock.mockResolvedValueOnce([{ n: 0 }]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await retrieveRelevantArticles("anything");
    expect(r.confidence).toBe("none");
    expect(r.reason).toMatch(/empty/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledOnce();
  });

  it("returns confidence=none on Voyage API error without throwing", async () => {
    queryMock.mockResolvedValueOnce([{ n: 12 }]);
    mockVoyage500();

    const r = await retrieveRelevantArticles("anything");
    expect(r.confidence).toBe("none");
    expect(r.reason).toMatch(/voyage api/i);
  });

  it("returns confidence=none on DB error without throwing", async () => {
    queryMock.mockResolvedValueOnce([{ n: 12 }]);
    queryMock.mockRejectedValueOnce(new Error("connection reset"));
    mockVoyageOnce();

    const r = await retrieveRelevantArticles("anything");
    expect(r.confidence).toBe("none");
    expect(r.reason).toMatch(/db error/i);
  });

  it("respects topK override in SQL LIMIT parameter", async () => {
    queryMock.mockResolvedValueOnce([{ n: 12 }]);
    queryMock.mockResolvedValueOnce([]);
    mockVoyageOnce();

    await retrieveRelevantArticles("q", { topK: 3 });
    const mainCall = queryMock.mock.calls[1]!;
    const params = mainCall[1] as unknown[];
    expect(params[params.length - 1]).toBe(3);
  });

  it("uses default topK=10 when none provided", async () => {
    queryMock.mockResolvedValueOnce([{ n: 12 }]);
    queryMock.mockResolvedValueOnce([]);
    mockVoyageOnce();

    await retrieveRelevantArticles("q");
    const mainCall = queryMock.mock.calls[1]!;
    const params = mainCall[1] as unknown[];
    expect(params[params.length - 1]).toBe(10);
  });

  it("minSimilarity override raises the effective high-confidence threshold", async () => {
    queryMock.mockResolvedValueOnce([{ n: 12 }]);
    queryMock.mockResolvedValueOnce([
      { id: "1", title: "A", content: "x", category: "MOS", source_name: null, source_url: null, tags: [], similarity: 0.55 },
      { id: "2", title: "B", content: "y", category: "TRC", source_name: null, source_url: null, tags: [], similarity: 0.52 },
      { id: "3", title: "C", content: "z", category: "ZUS", source_name: null, source_url: null, tags: [], similarity: 0.51 },
    ]);
    mockVoyageOnce();

    // Without override: would be "high" (0.55 >= 0.5, 3 hits)
    // With minSimilarity=0.7 override: threshold becomes 0.7, so "low"
    const r = await retrieveRelevantArticles("q", { minSimilarity: 0.7 });
    expect(r.confidence).toBe("low");
  });

  it("maps source_name/source_url/tags columns to camelCase fields", async () => {
    queryMock.mockResolvedValueOnce([{ n: 12 }]);
    queryMock.mockResolvedValueOnce([
      {
        id: "1", title: "A", content: "x", category: "MOS",
        source_name: "Ustawa", source_url: "https://isap.sejm.gov.pl/x",
        tags: ["a", "b"], similarity: 0.6,
      },
    ]);
    mockVoyageOnce();

    const r = await retrieveRelevantArticles("q");
    expect(r.results[0]!.sourceName).toBe("Ustawa");
    expect(r.results[0]!.sourceUrl).toBe("https://isap.sejm.gov.pl/x");
    expect(r.results[0]!.tags).toEqual(["a", "b"]);
  });
});

// ── Type A — Similar Rejections ──────────────────────────────────────────

describe("retrieveSimilarRejections", () => {
  it("returns confidence=none when rejection_analyses index is empty (Phase 2 reality)", async () => {
    queryMock.mockResolvedValueOnce([{ n: 0 }]);
    const r = await retrieveSimilarRejections("TRC denied");
    expect(r.confidence).toBe("none");
    expect(r.reason).toMatch(/rejection_analyses index empty/);
  });

  it("filters by tenantId when provided", async () => {
    queryMock.mockResolvedValueOnce([{ n: 5 }]);
    queryMock.mockResolvedValueOnce([]);
    mockVoyageOnce();

    await retrieveSimilarRejections("TRC denied", { tenantId: "tenant-abc" });
    const sql = (queryMock.mock.calls[1]![0] as string).replace(/\s+/g, " ");
    const params = queryMock.mock.calls[1]![1] as unknown[];
    expect(sql).toMatch(/tenant_id = \$\d+/);
    expect(params).toContain("tenant-abc");
  });

  it("does NOT include tenant_id filter when tenantId omitted", async () => {
    queryMock.mockResolvedValueOnce([{ n: 5 }]);
    queryMock.mockResolvedValueOnce([]);
    mockVoyageOnce();

    await retrieveSimilarRejections("TRC denied");
    const sql = (queryMock.mock.calls[1]![0] as string).replace(/\s+/g, " ");
    expect(sql).not.toMatch(/tenant_id/);
  });

  it("returns populated SimilarRejection objects when the index has data (happy path)", async () => {
    queryMock.mockResolvedValueOnce([{ n: 5 }]);
    queryMock.mockResolvedValueOnce([
      {
        id: "rej-1", anonymized_text: "Rejection: [WORKER_NAME] ...",
        category: "formal_defect", appeal_possible: true,
        confidence_score: "0.85", legal_case_id: "case-1",
        similarity: "0.58",
      },
    ]);
    mockVoyageOnce();

    const r = await retrieveSimilarRejections("employer did not sign Annex 1");
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({
      id: "rej-1", appealPossible: true, confidenceScore: 0.85,
    });
    expect(r.results[0]!.similarity).toBeCloseTo(0.58);
  });
});

// ── Type C — Appeal Templates ────────────────────────────────────────────

describe("retrieveAppealTemplates", () => {
  it("returns confidence=none when index is empty (Phase 2 reality: 0 rows)", async () => {
    queryMock.mockResolvedValueOnce([{ n: 0 }]);
    const r = await retrieveAppealTemplates("rejection body text");
    expect(r.confidence).toBe("none");
    expect(r.reason).toMatch(/case_generated_docs index empty/);
  });

  it("hard-filters to status IN ('APPROVED','SENT') in SQL", async () => {
    queryMock.mockResolvedValueOnce([{ n: 2 }]);
    queryMock.mockResolvedValueOnce([]);
    mockVoyageOnce();

    await retrieveAppealTemplates("q");
    const sql = (queryMock.mock.calls[1]![0] as string).replace(/\s+/g, " ");
    expect(sql).toMatch(/status IN \('APPROVED','SENT'\)/);
  });

  it("uses default topK=3", async () => {
    queryMock.mockResolvedValueOnce([{ n: 2 }]);
    queryMock.mockResolvedValueOnce([]);
    mockVoyageOnce();

    await retrieveAppealTemplates("q");
    const params = queryMock.mock.calls[1]![1] as unknown[];
    expect(params[params.length - 1]).toBe(3);
  });
});

// ── Type D — Similar Workers ─────────────────────────────────────────────

describe("retrieveSimilarWorkers", () => {
  it("returns confidence=none when no profile fields provided", async () => {
    queryMock.mockResolvedValueOnce([{ n: 5 }]);
    const r = await retrieveSimilarWorkers({});
    expect(r.confidence).toBe("none");
    expect(r.reason).toMatch(/no profile fields/);
  });

  it("returns confidence=none when workers profile index is empty", async () => {
    queryMock.mockResolvedValueOnce([{ n: 0 }]);
    const r = await retrieveSimilarWorkers({ nationality: "Polish" });
    expect(r.confidence).toBe("none");
    expect(r.reason).toMatch(/workers profile index empty/);
  });

  it("strips fullName when tenantId is omitted (cross-tenant defense)", async () => {
    queryMock.mockResolvedValueOnce([{ n: 5 }]);
    queryMock.mockResolvedValueOnce([
      { id: "w-1", full_name: "Jan Kowalski", nationality: "Polish", specialization: "TIG welder", similarity: "0.6" },
    ]);
    mockVoyageOnce();

    const r = await retrieveSimilarWorkers({ nationality: "Polish", specialization: "TIG welder" });
    expect(r.results[0]!.fullName).toBeNull();
    expect(r.results[0]!.nationality).toBe("Polish");
  });

  it("preserves fullName when tenantId is supplied (same-tenant)", async () => {
    queryMock.mockResolvedValueOnce([{ n: 5 }]);
    queryMock.mockResolvedValueOnce([
      { id: "w-1", full_name: "Jan Kowalski", nationality: "Polish", specialization: "TIG welder", similarity: "0.6" },
    ]);
    mockVoyageOnce();

    const r = await retrieveSimilarWorkers(
      { nationality: "Polish" },
      { tenantId: "tenant-1" },
    );
    expect(r.results[0]!.fullName).toBe("Jan Kowalski");
  });
});
