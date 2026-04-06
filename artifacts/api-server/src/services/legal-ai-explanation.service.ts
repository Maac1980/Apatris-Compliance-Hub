/**
 * Legal AI Explanation Service — uses Claude to generate explanation drafts
 * based on existing Apatris legal truth.
 *
 * RULES:
 *  - AI explains existing results only
 *  - AI does NOT decide legal status
 *  - AI does NOT override legalBasis, riskLevel, or deployability
 *  - Worker explanations are drafts for internal review
 *  - All requests/responses are stored for audit
 *  - If AI fails, falls back to existing summary/conditions
 */

import { query, queryOne, execute } from "../lib/db.js";
import { getWorkerLegalSnapshot, type LegalSnapshot } from "./legal-status.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type ExplanationAudience = "internal" | "worker";

export interface ExplainCaseInput {
  workerId: string;
  tenantId: string;
  audience: ExplanationAudience;
}

export interface ExplanationResult {
  audience: ExplanationAudience;
  explanation: string;
  nextSteps: string[];
  confidence: number;
  reviewRequired: boolean;
  requestId: string;
  responseId: string;
  source: "ai" | "fallback";
}

interface ClaudeOutput {
  audience: string;
  explanation: string;
  nextSteps: string[];
  confidence: number;
  reviewRequired: boolean;
}

// ═══ CORE ═══════════════════════════════════════════════════════════════════

export async function explainCase(input: ExplainCaseInput): Promise<ExplanationResult> {
  const { workerId, tenantId, audience } = input;

  // 1. Load existing legal snapshot (the source of truth)
  let snapshot: LegalSnapshot;
  try {
    snapshot = await getWorkerLegalSnapshot(workerId, tenantId);
  } catch {
    throw new Error("No legal snapshot available for this worker. Cannot generate explanation without legal data.");
  }

  // 2. Load minimal worker identity context
  const worker = await queryOne<any>(
    "SELECT full_name, nationality FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );

  // 3. Build structured input for Claude
  const snapshotInput = {
    legalStatus: snapshot.legalStatus,
    legalBasis: snapshot.legalBasis,
    riskLevel: snapshot.riskLevel,
    summary: snapshot.summary,
    conditions: snapshot.conditions,
    warnings: snapshot.warnings,
    requiredActions: snapshot.requiredActions,
    permitExpiresAt: snapshot.permitExpiresAt,
    trcApplicationSubmitted: snapshot.trcApplicationSubmitted,
    legalProtectionFlag: snapshot.legalProtectionFlag,
    formalDefectStatus: snapshot.formalDefectStatus,
    workerName: worker?.full_name ?? "the worker",
    nationality: worker?.nationality ?? null,
  };

  // 4. Store the request for audit
  const aiRequest = await queryOne<any>(
    `INSERT INTO ai_requests (tenant_id, worker_id, task_type, audience_type, model_provider, model_name, prompt_text, input_json, status)
     VALUES ($1, $2, 'legal_explanation', $3, 'anthropic', 'claude-sonnet-4-6', $4, $5, 'pending') RETURNING *`,
    [tenantId, workerId, audience, buildPrompt(snapshotInput, audience), JSON.stringify(snapshotInput)]
  );

  // 5. Attempt Claude call
  let result: ExplanationResult;
  try {
    const claudeOutput = await callClaude(snapshotInput, audience);

    // Store successful response
    const aiResponse = await queryOne<any>(
      `INSERT INTO ai_responses (ai_request_id, response_json, confidence_score, requires_review)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [aiRequest.id, JSON.stringify(claudeOutput), claudeOutput.confidence, claudeOutput.reviewRequired]
    );

    await execute("UPDATE ai_requests SET status = 'completed', updated_at = NOW() WHERE id = $1", [aiRequest.id]);

    result = {
      audience,
      explanation: claudeOutput.explanation,
      nextSteps: claudeOutput.nextSteps,
      confidence: claudeOutput.confidence,
      reviewRequired: claudeOutput.reviewRequired,
      requestId: aiRequest.id,
      responseId: aiResponse.id,
      source: "ai",
    };
  } catch {
    // 6. Fallback: use existing snapshot data directly
    await execute("UPDATE ai_requests SET status = 'failed', updated_at = NOW() WHERE id = $1", [aiRequest.id]);

    const fallback = buildFallback(snapshot, audience);
    const aiResponse = await queryOne<any>(
      `INSERT INTO ai_responses (ai_request_id, response_json, confidence_score, requires_review)
       VALUES ($1, $2, 0, TRUE) RETURNING *`,
      [aiRequest.id, JSON.stringify(fallback)]
    );

    result = {
      ...fallback,
      requestId: aiRequest.id,
      responseId: aiResponse.id,
      source: "fallback",
    };
  }

  return result;
}

export async function getExplanationHistory(
  workerId: string,
  tenantId: string,
  audience?: ExplanationAudience,
): Promise<any[]> {
  let sql = `SELECT r.id as request_id, r.audience_type, r.status, r.created_at,
                    resp.response_json, resp.confidence_score, resp.requires_review, resp.approved_by
             FROM ai_requests r
             LEFT JOIN ai_responses resp ON resp.ai_request_id = r.id
             WHERE r.worker_id = $1 AND r.tenant_id = $2 AND r.task_type = 'legal_explanation'`;
  const params: unknown[] = [workerId, tenantId];
  if (audience) {
    params.push(audience);
    sql += ` AND r.audience_type = $${params.length}`;
  }
  sql += " ORDER BY r.created_at DESC LIMIT 20";
  return query(sql, params);
}

// ═══ CLAUDE CALL ════════════════════════════════════════════════════════════

async function callClaude(snapshotInput: Record<string, unknown>, audience: ExplanationAudience): Promise<ClaudeOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const prompt = buildPrompt(snapshotInput, audience);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find((b) => b.type === "text");
  const raw = textBlock?.text ?? "";

  return parseClaudeResponse(raw, audience);
}

function parseClaudeResponse(raw: string, audience: ExplanationAudience): ClaudeOutput {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        audience: parsed.audience ?? audience,
        explanation: String(parsed.explanation ?? "").slice(0, 3000),
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.map(String).slice(0, 10) : [],
        confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0,
        reviewRequired: parsed.reviewRequired !== false,
      };
    }
  } catch { /* fall through */ }

  // If we can't parse JSON, use raw text as explanation
  return {
    audience,
    explanation: raw.slice(0, 3000),
    nextSteps: [],
    confidence: 0,
    reviewRequired: true,
  };
}

// ═══ PROMPTS ════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are an internal legal explanation assistant for Apatris, a Polish staffing agency.

Your role:
- EXPLAIN existing legal assessment results in clear language
- You do NOT decide legal status — it is already decided by the legal engine
- You do NOT invent legal rights, change legal basis, or override any field
- You base your explanation ONLY on the structured data provided

Output format — return ONLY a JSON object:
{
  "audience": "internal" or "worker",
  "explanation": "clear explanation text",
  "nextSteps": ["action 1", "action 2"],
  "confidence": 0.0 to 1.0,
  "reviewRequired": true or false
}

For "internal" audience:
- Use precise legal/operational language
- Reference Art. 108, Specustawa, continuity conditions as relevant
- Include operational implications

For "worker" audience:
- Use simple, calm language
- Do not use legal jargon
- Do not overstate certainty
- Do not say "you have the right to..." — instead say "based on current records..."
- Always note that the employer will provide further guidance

NEVER return markdown, only the JSON object.`;

function buildPrompt(snapshotInput: Record<string, unknown>, audience: ExplanationAudience): string {
  return `Generate a ${audience} explanation for this worker's legal status.

LEGAL SNAPSHOT DATA (this is the truth — do not contradict it):
${JSON.stringify(snapshotInput, null, 2)}

Audience: ${audience}
Return the structured JSON explanation.`;
}

// ═══ FALLBACK ═══════════════════════════════════════════════════════════════

function buildFallback(snapshot: LegalSnapshot, audience: ExplanationAudience): Omit<ExplanationResult, "requestId" | "responseId"> {
  // Use existing engine output directly when AI is unavailable
  const isWorker = audience === "worker";

  let explanation: string;
  if (isWorker) {
    switch (snapshot.legalStatus) {
      case "VALID":
      case "EXPIRING_SOON":
        explanation = "Your work permit is currently valid. Your employer will contact you if any action is needed.";
        break;
      case "PROTECTED_PENDING":
        explanation = "Your renewal application is on file. You may continue working under the current conditions while it is being processed.";
        break;
      case "REVIEW_REQUIRED":
        explanation = "Your status is being reviewed. Please contact your employer for more information.";
        break;
      default:
        explanation = "Please contact your employer regarding your current work authorization status.";
    }
  } else {
    explanation = snapshot.summary || `Worker legal status: ${snapshot.legalStatus}. Legal basis: ${snapshot.legalBasis}. Risk level: ${snapshot.riskLevel}.`;
  }

  return {
    audience,
    explanation,
    nextSteps: snapshot.requiredActions.length > 0 ? snapshot.requiredActions : ["Review current legal status"],
    confidence: 0,
    reviewRequired: true,
    source: "fallback",
  };
}
