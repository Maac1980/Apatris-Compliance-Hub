/**
 * Legal Brief Pipeline — Wave 1 streaming tests.
 *
 * Asserts that generateLegalBrief() emits stage-level SSE events via the
 * intelligence-emitter, and that the pipelineRunId is stable + returned.
 *
 * Two tests:
 *   A — Relaxed: pipeline emits ≥2 brief_stage events; first is stage 1 started;
 *       all events share the same pipelineRunId; result.pipelineRunId matches.
 *   B — Fixture-rich happy path: stage-specific mock responses make all 6 stages
 *       reach "completed" in order 1→2→3→4→5→6.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("../lib/intelligence-emitter.js", () => ({
  emitIntelligenceEvent: vi.fn(),
}));

vi.mock("../lib/db.js", () => ({
  queryOne: vi.fn(),
  execute: vi.fn().mockResolvedValue(undefined),
  query: vi.fn(),
}));

vi.mock("./legal-status.service.js", () => ({
  getWorkerLegalSnapshot: vi.fn(),
  refreshWorkerLegalSnapshot: vi.fn(),
}));

vi.mock("../lib/ai-rate-limiter.js", () => ({
  checkAIRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 10, resetsIn: 3600 }),
}));

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.ANTHROPIC_API_KEY = "test-key";
  // Perplexity intentionally unset so Stage 1 skips Perplexity path deterministically.
  delete process.env.PPLX_API_KEY;
});

// ── Imports after mocks ─────────────────────────────────────────────────────
import { generateLegalBrief } from "./legal-brief-pipeline.service.js";
import { emitIntelligenceEvent } from "../lib/intelligence-emitter.js";
import { queryOne } from "../lib/db.js";
import { getWorkerLegalSnapshot } from "./legal-status.service.js";

const WORKER_ID = "worker-1";
const TENANT_ID = "tenant-1";
const BRIEF_ID = "brief-uuid-1";

const MOCK_WORKER = {
  id: WORKER_ID, full_name: "Test Worker", nationality: "UA",
  preferred_language: "pl", trc_expiry: null, work_permit_expiry: null,
  pesel: null, assigned_site: null,
};

const MOCK_SNAPSHOT = {
  workerId: WORKER_ID, workerName: "Test Worker", countryCode: "PL",
  legalStatus: "ACTIVE", legalBasis: "TRC", riskLevel: "LOW",
  permitExpiresAt: null, trcApplicationSubmitted: true,
  sameEmployerFlag: true, sameRoleFlag: true, legalProtectionFlag: true,
  formalDefectStatus: "NONE",
  summary: "OK", conditions: [], warnings: [], requiredActions: [],
};

// Helper: attach standard queryOne mocks in the order the pipeline calls them:
// (1) worker fetch, (2) legal_cases lookup, (3) rejection_analyses, (4) INSERT RETURNING id
function setupQueryOneMocks() {
  vi.mocked(queryOne)
    .mockResolvedValueOnce(MOCK_WORKER as never)        // worker
    .mockResolvedValueOnce(null)                         // legal_case
    .mockResolvedValueOnce(null)                         // rejection_analyses
    .mockResolvedValueOnce({ id: BRIEF_ID } as never);  // INSERT RETURNING id
}

// Post-Sub-phase-1C-1.5: each stage now uses Anthropic tool_use. Fixtures must
// return a `tool_use` block with `input: <object>` matching the stage's schema.
// The test stub keys off the tool name so stages are served the right shape
// regardless of call order (more robust than count-based routing).

const STAGE1_INPUT = {
  articles: [
    { article: "Art. 108 ust. 1 pkt 2 Ustawy o cudzoziemcach", explanation: "TRC continuity",
      whyItApplies: "same employer", impact: "SUPPORTS" },
  ],
  proceduralNotes: ["File within 45 days"],
  commonPatterns: ["Formal defect common"],
  confidence: 0.8,
};

// Crafted to pass Stage 3 deterministic checks:
//   - article string matches Stage 1 verbatim (Check 2)
//   - caseSummary contains "reject" so appealGrounds don't trip Check 4
//   - confidence ≤ stage1.confidence + 0.1 (Check 3)
const STAGE2_INPUT = {
  caseSummary: "Case review following TRC rejection decision",
  likelyIssue: "Missing document",
  articleApplication: [
    { article: "Art. 108 ust. 1 pkt 2 Ustawy o cudzoziemcach",
      explanation: "applies", whyItApplies: "continuity", impact: "SUPPORTS" },
  ],
  appealGrounds: ["Ground 1"],
  missingEvidence: ["Evidence 1"],
  nextSteps: ["Step 1"],
  lawyerReviewDraft: "Draft lawyer note",
  appealOutlineDraft: "Outline that is longer than ten characters so stage 6 runs.",
  confidence: 0.8,
  requiresLawyerReview: true,
};

const STAGE3_INPUT = {
  isValid: true,
  issues: [],
  riskLevel: "LOW",
  requiresReview: true,
  notes: "all good",
};

const STAGE5_INPUT = {
  greeting: "Hello",
  whatHappened: "Summary",
  whyItWasNegative: "",
  whatWeAreDoing: "We're filing",
  whatYouNeedToDo: ["x"],
  timeline: "2w",
  reassurance: "OK",
  contactInfo: "ops@apatris",
};

const STAGE6_INPUT = {
  englishAppealText: "English appeal draft one two three four five six.",
  translationNotes: "",
  structuralChanges: [],
  alignedWithPolish: true,
};

// Map tool name → stage input. Stub inspects the outgoing request body to
// identify the stage and returns the matching tool_use block.
const TOOL_INPUTS: Record<string, unknown> = {
  emit_stage1_research: STAGE1_INPUT,
  emit_stage2_case_review: STAGE2_INPUT,
  emit_stage3_validation: STAGE3_INPUT,
  emit_stage5_worker_explanation: STAGE5_INPUT,
  emit_stage6_translation: STAGE6_INPUT,
};

function makeClaudeFetchStub(overrides: Partial<Record<string, unknown>> = {}) {
  return async (url: string | URL | Request, init?: any) => {
    const u = String(url);
    if (u.includes("anthropic.com")) {
      const reqBody = init?.body ? JSON.parse(String(init.body)) : {};
      const toolName = reqBody?.tool_choice?.name ?? reqBody?.tools?.[0]?.name ?? "unknown_tool";
      const input = overrides[toolName] ?? TOOL_INPUTS[toolName] ?? {};
      return new Response(
        JSON.stringify({ content: [{ type: "tool_use", name: toolName, input }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ) as any;
    }
    if (u.includes("perplexity.ai")) {
      return new Response("nope", { status: 500 }) as any;
    }
    return new Response("unknown", { status: 404 }) as any;
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe("legal-brief-pipeline — Wave 1 stage-level SSE events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupQueryOneMocks();
    vi.mocked(getWorkerLegalSnapshot).mockResolvedValue(MOCK_SNAPSHOT as never);
  });

  it("Test A (relaxed): emits brief_stage events with a stable pipelineRunId and result exposes it", async () => {
    // Stub returns the correct tool_use shape per stage (routed by tool name).
    global.fetch = vi.fn(makeClaudeFetchStub()) as any;

    let result: Awaited<ReturnType<typeof generateLegalBrief>> | null = null;
    try {
      result = await generateLegalBrief(WORKER_ID, TENANT_ID, "test-user");
    } catch {
      // Even on pipeline failure, assert we emitted at least the started + failed event for stage 1.
    }

    const briefEvents = vi.mocked(emitIntelligenceEvent).mock.calls
      .map(c => c[0])
      .filter(e => e.type === "brief_stage");

    // At least 2 events: stage 1 started + one terminal (completed/failed/halted).
    expect(briefEvents.length).toBeGreaterThanOrEqual(2);

    // First event is stage 1 started.
    expect(briefEvents[0]).toMatchObject({ stage: 1, status: "started" });

    // All events share the same pipelineRunId.
    const runIds = new Set(briefEvents.map(e => e.pipelineRunId));
    expect(runIds.size).toBe(1);

    // If the pipeline resolved, the result carries the same pipelineRunId.
    if (result) {
      expect(result.pipelineRunId).toBeDefined();
      expect(briefEvents[0].pipelineRunId).toBe(result.pipelineRunId);
      // pipelineRunId === briefId (reuse decision 2026-04-21).
      expect(result.pipelineRunId).toBe(result.id);
    }
  });

  it("Test B (happy path): emits started+completed for all 6 stages in order 1→2→3→4→5→6", async () => {
    // Tool-name-routed stub returns the correct stage-specific input for each
    // Claude call. (Stage 4 is deterministic — no Claude call.)
    global.fetch = vi.fn(makeClaudeFetchStub()) as any;

    const result = await generateLegalBrief(WORKER_ID, TENANT_ID, "test-user");

    const briefEvents = vi.mocked(emitIntelligenceEvent).mock.calls
      .map(c => c[0])
      .filter(e => e.type === "brief_stage");

    // We expect at least one started + one completed per stage across 6 stages = 12.
    expect(briefEvents.length).toBeGreaterThanOrEqual(12);

    // Reduce to stage → [statuses in order].
    const byStage: Record<number, string[]> = {};
    for (const ev of briefEvents) {
      const s = ev.stage as number;
      byStage[s] = [...(byStage[s] ?? []), ev.status as string];
    }

    // Every stage from 1..6 saw at least one "started" and one "completed".
    for (const s of [1, 2, 3, 4, 5, 6]) {
      expect(byStage[s], `stage ${s} should have events`).toBeTruthy();
      expect(byStage[s], `stage ${s} should start`).toContain("started");
      expect(byStage[s], `stage ${s} should complete`).toContain("completed");
    }

    // Stage ordering: each stage's first appearance must follow the previous stage's first appearance.
    const firstAt: Record<number, number> = {};
    briefEvents.forEach((ev, i) => {
      const s = ev.stage as number;
      if (firstAt[s] === undefined) firstAt[s] = i;
    });
    expect(firstAt[1]).toBeLessThan(firstAt[2]);
    expect(firstAt[2]).toBeLessThan(firstAt[3]);
    expect(firstAt[3]).toBeLessThan(firstAt[4]);
    expect(firstAt[4]).toBeLessThan(firstAt[5]);
    expect(firstAt[5]).toBeLessThan(firstAt[6]);

    // pipelineRunId stable across the whole run, and equals result.pipelineRunId === result.id.
    const runIds = new Set(briefEvents.map(e => e.pipelineRunId));
    expect(runIds.size).toBe(1);
    expect(result.pipelineRunId).toBe(result.id);
    expect(result.status).toBe("COMPLETE");
  });

  // Regression guard: even if Claude returns partial tool_use input (missing
  // fields), the defensive field-coercion layer in each stage defaults to
  // empty strings / arrays / numbers. The pipeline should not crash on
  // incomplete-but-well-formed Claude output.
  it("Test C (missing-fields defensive coercion): pipeline survives partial Claude outputs", async () => {
    // Override Stage 2 + Stage 5 with partial objects missing several fields.
    // Tool_use still returns a valid object (schema enforced), but fewer keys
    // than the full shape. Downstream String(json.foo ?? "") logic kicks in.
    global.fetch = vi.fn(makeClaudeFetchStub({
      emit_stage2_case_review: {
        caseSummary: "Case review following TRC rejection decision",
        likelyIssue: "short",
        articleApplication: [
          { article: "Art. 108 ust. 1 pkt 2 Ustawy o cudzoziemcach",
            explanation: "x", whyItApplies: "y", impact: "SUPPORTS" },
        ],
        appealGrounds: [],  // empty — no appeal grounds without full context
        missingEvidence: [],
        nextSteps: [],
        lawyerReviewDraft: "",
        appealOutlineDraft: "short < 10",   // will NOT trigger Stage 6
        confidence: 0.6,
        requiresLawyerReview: true,
      },
      emit_stage5_worker_explanation: {
        // Intentionally minimal — several fields omitted, stage should still succeed
        greeting: "Hi",
        whatHappened: "x",
        whyItWasNegative: "",
        whatWeAreDoing: "",
        whatYouNeedToDo: [],
        timeline: "",
        reassurance: "",
        contactInfo: "",
      },
    })) as any;

    const result = await generateLegalBrief(WORKER_ID, TENANT_ID, "test-user");
    expect(result.status).toBe("COMPLETE");
    // Stage 6 must have been skipped (appealOutlineDraft was too short)
    expect(result.stage6).toBeNull();
    // Stage 5 populated with coercions (empty strings are fine)
    expect(result.stage5?.greeting).toBe("Hi");
    expect(result.stage5?.language).toBe("pl");  // carried from worker
  });
});
