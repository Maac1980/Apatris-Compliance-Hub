/**
 * Legal Copilot Service — contextual Q&A about a worker's legal situation.
 *
 * NOT a general chatbot. Answers are grounded in actual Apatris data only.
 *
 * RULES:
 *  - Uses ONLY provided structured context
 *  - Does NOT contradict legal snapshot
 *  - Does NOT create new legal conclusions
 *  - Does NOT modify any data
 *  - All outputs stored for audit
 *  - All outputs marked requires_review = true
 */

import { query, queryOne, execute } from "../lib/db.js";
import { getWorkerLegalSnapshot } from "./legal-status.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface CopilotResponse {
  answer: string;
  reasoning: string;
  nextSteps: string[];
  riskLevel: string;
  confidence: number;
  requiresReview: true;
  requestId: string;
  responseId: string;
  source: "ai" | "fallback";
}

interface WorkerLegalContext {
  worker: { name: string; nationality: string | null; site: string | null };
  snapshot: {
    legalStatus: string; legalBasis: string; riskLevel: string;
    summary: string; conditions: string[]; warnings: string[]; requiredActions: string[];
    permitExpiresAt: string | null; trcApplicationSubmitted: boolean;
    legalProtectionFlag: boolean; formalDefectStatus: string | null;
    deployability: string;
  };
  permit: { type: string | null; expiryDate: string | null; status: string | null } | null;
  trcCase: { status: string | null; voivodeship: string | null; employer: string | null } | null;
  legalCase: { status: string | null; type: string | null; appealDeadline: string | null; nextAction: string | null } | null;
  evidence: { count: number; hasVerified: boolean; latestFilingDate: string | null };
  authorityPack: { status: string | null; approved: boolean } | null;
  rejection: { category: string | null; appealPossible: boolean | null } | null;
}

// ═══ CONTEXT BUILDER ════════════════════════════════════════════════════════

export async function buildWorkerLegalContext(workerId: string, tenantId: string): Promise<WorkerLegalContext> {
  // Worker
  const worker = await queryOne<any>(
    "SELECT full_name, nationality, assigned_site FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");

  // Snapshot
  const snapshot = await getWorkerLegalSnapshot(workerId, tenantId);

  // Deployability
  const { evaluateDeployability } = await import("./legal-status.service.js");
  const deploy = evaluateDeployability({
    legalStatus: snapshot.legalStatus,
    legalBasis: snapshot.legalBasis,
    riskLevel: snapshot.riskLevel,
  });

  // Permit
  const permit = await queryOne<any>(
    "SELECT permit_type, expiry_date, status FROM immigration_permits WHERE worker_id = $1 AND tenant_id = $2 ORDER BY expiry_date DESC NULLS LAST LIMIT 1",
    [workerId, tenantId]
  );

  // TRC case
  const trc = await queryOne<any>(
    "SELECT status, voivodeship, employer_name FROM trc_cases WHERE worker_id = $1::text AND tenant_id = $2::text ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  // Legal case
  const legalCase = await queryOne<any>(
    "SELECT status, case_type, appeal_deadline, next_action FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  // Evidence
  const evRows = await query<any>(
    "SELECT filing_date, verification_status FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
    [workerId, tenantId]
  );

  // Authority pack
  const pack = await queryOne<any>(
    "SELECT pack_status, is_approved FROM authority_response_packs WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  // Rejection
  const rejection = await queryOne<any>(
    "SELECT category, appeal_possible FROM rejection_analyses WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  return {
    worker: { name: worker.full_name ?? "Unknown", nationality: worker.nationality, site: worker.assigned_site },
    snapshot: {
      legalStatus: snapshot.legalStatus, legalBasis: snapshot.legalBasis, riskLevel: snapshot.riskLevel,
      summary: snapshot.summary, conditions: snapshot.conditions, warnings: snapshot.warnings,
      requiredActions: snapshot.requiredActions, permitExpiresAt: snapshot.permitExpiresAt,
      trcApplicationSubmitted: snapshot.trcApplicationSubmitted, legalProtectionFlag: snapshot.legalProtectionFlag,
      formalDefectStatus: snapshot.formalDefectStatus, deployability: deploy.deployability,
    },
    permit: permit ? { type: permit.permit_type, expiryDate: permit.expiry_date ? new Date(permit.expiry_date).toISOString().slice(0, 10) : null, status: permit.status } : null,
    trcCase: trc ? { status: trc.status, voivodeship: trc.voivodeship, employer: trc.employer_name } : null,
    legalCase: legalCase ? { status: legalCase.status, type: legalCase.case_type, appealDeadline: legalCase.appeal_deadline, nextAction: legalCase.next_action } : null,
    evidence: {
      count: evRows.length,
      hasVerified: evRows.some((e: any) => e.verification_status === "VERIFIED"),
      latestFilingDate: evRows[0]?.filing_date ? new Date(evRows[0].filing_date).toISOString().slice(0, 10) : null,
    },
    authorityPack: pack ? { status: pack.pack_status, approved: pack.is_approved === true || pack.pack_status === "APPROVED" } : null,
    rejection: rejection ? { category: rejection.category, appealPossible: rejection.appeal_possible } : null,
  };
}

// ═══ COPILOT ════════════════════════════════════════════════════════════════

export async function askLegalCopilot(
  workerId: string,
  tenantId: string,
  question: string,
): Promise<CopilotResponse> {
  // Build context
  const ctx = await buildWorkerLegalContext(workerId, tenantId);

  // Store request
  const aiReq = await queryOne<any>(
    `INSERT INTO ai_requests (tenant_id, worker_id, task_type, audience_type, model_provider, model_name, prompt_text, input_json, status)
     VALUES ($1, $2, 'legal_copilot', 'internal', 'anthropic', 'claude-sonnet-4-6', $3, $4, 'pending') RETURNING *`,
    [tenantId, workerId, question, JSON.stringify(ctx)]
  );

  try {
    const result = await callClaude(question, ctx);

    const aiResp = await queryOne<any>(
      `INSERT INTO ai_responses (ai_request_id, response_json, confidence_score, requires_review)
       VALUES ($1, $2, $3, TRUE) RETURNING *`,
      [aiReq.id, JSON.stringify(result), result.confidence]
    );

    await execute("UPDATE ai_requests SET status = 'completed', updated_at = NOW() WHERE id = $1", [aiReq.id]);

    return {
      ...result,
      requiresReview: true,
      requestId: aiReq.id,
      responseId: aiResp.id,
      source: "ai",
    };
  } catch {
    // Fallback
    await execute("UPDATE ai_requests SET status = 'failed', updated_at = NOW() WHERE id = $1", [aiReq.id]);

    const fallback = buildFallback(question, ctx);
    const aiResp = await queryOne<any>(
      `INSERT INTO ai_responses (ai_request_id, response_json, confidence_score, requires_review)
       VALUES ($1, $2, 0, TRUE) RETURNING *`,
      [aiReq.id, JSON.stringify(fallback)]
    );

    return {
      ...fallback,
      requiresReview: true,
      requestId: aiReq.id,
      responseId: aiResp.id,
      source: "fallback",
    };
  }
}

// ═══ CLAUDE CALL ════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are a legal operations copilot for Apatris, a Polish staffing agency managing foreign workers.

STRICT RULES:
1. You may ONLY use the structured data provided in the context. Do NOT invent facts or law.
2. You may NOT contradict the legal snapshot — the legal engine has already decided the status.
3. You may NOT create new legal conclusions or rights.
4. You explain, guide, and suggest next steps ONLY.
5. If asked something outside the provided data, say "I don't have enough data to answer this."
6. Always note that your answer is a draft requiring internal review.

Return ONLY a JSON object:
{
  "answer": "direct answer to the question",
  "reasoning": "why, based on the data provided",
  "nextSteps": ["action 1", "action 2"],
  "riskLevel": "current risk assessment from snapshot",
  "confidence": 0.0 to 1.0
}

No markdown. JSON only.`;

async function callClaude(question: string, ctx: WorkerLegalContext): Promise<Omit<CopilotResponse, "requiresReview" | "requestId" | "responseId" | "source">> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

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
      messages: [{
        role: "user",
        content: `WORKER LEGAL CONTEXT:\n${JSON.stringify(ctx, null, 2)}\n\nQUESTION: ${question}`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error ${res.status}`);

  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const raw = data.content?.find(b => b.type === "text")?.text ?? "";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const p = JSON.parse(jsonMatch[0]);
      return {
        answer: String(p.answer ?? "").slice(0, 2000),
        reasoning: String(p.reasoning ?? "").slice(0, 1000),
        nextSteps: Array.isArray(p.nextSteps) ? p.nextSteps.map(String).slice(0, 8) : [],
        riskLevel: String(p.riskLevel ?? ctx.snapshot.riskLevel),
        confidence: typeof p.confidence === "number" ? Math.min(1, Math.max(0, p.confidence)) : 0.5,
      };
    }
  } catch { /* fall through */ }

  return {
    answer: raw.slice(0, 2000) || "Could not parse response.",
    reasoning: "", nextSteps: [], riskLevel: ctx.snapshot.riskLevel, confidence: 0,
  };
}

// ═══ FALLBACK ═══════════════════════════════════════════════════════════════

function buildFallback(question: string, ctx: WorkerLegalContext): Omit<CopilotResponse, "requiresReview" | "requestId" | "responseId" | "source"> {
  const s = ctx.snapshot;
  const q = question.toLowerCase();

  // Deploy question
  if (q.includes("deploy") || q.includes("assign") || q.includes("work")) {
    return {
      answer: s.deployability === "ALLOWED"
        ? `${ctx.worker.name} can be deployed. Legal status: ${s.legalStatus}, deployability: ALLOWED.`
        : s.deployability === "CONDITIONAL"
          ? `${ctx.worker.name} may be deployed conditionally. Status: ${s.legalStatus} (${s.legalBasis}). Verify continuity conditions before assignment.`
          : `${ctx.worker.name} cannot be deployed. Status: ${s.legalStatus}, deployability: ${s.deployability}. ${s.requiredActions[0] ?? "Review required."}`,
      reasoning: `Based on legal snapshot: ${s.legalStatus}, basis: ${s.legalBasis}, risk: ${s.riskLevel}.`,
      nextSteps: s.requiredActions.slice(0, 3),
      riskLevel: s.riskLevel,
      confidence: 0,
    };
  }

  // Risk question
  if (q.includes("risk")) {
    return {
      answer: `Current risk level: ${s.riskLevel}. Status: ${s.legalStatus}. ${s.warnings[0] ?? ""}`,
      reasoning: `Risk derived from legal status ${s.legalStatus} and basis ${s.legalBasis}.`,
      nextSteps: s.requiredActions.slice(0, 3),
      riskLevel: s.riskLevel,
      confidence: 0,
    };
  }

  // Missing docs
  if (q.includes("missing") || q.includes("document") || q.includes("evidence")) {
    const missing = ctx.evidence.count === 0 ? "No filing evidence uploaded." : `${ctx.evidence.count} evidence record(s) on file.`;
    return {
      answer: `${missing} ${s.requiredActions.filter(a => a.toLowerCase().includes("document") || a.toLowerCase().includes("upload") || a.toLowerCase().includes("verify")).join(" ") || "Check required documents."}`,
      reasoning: `Evidence count: ${ctx.evidence.count}, verified: ${ctx.evidence.hasVerified}.`,
      nextSteps: s.requiredActions.slice(0, 3),
      riskLevel: s.riskLevel,
      confidence: 0,
    };
  }

  // Next steps
  if (q.includes("next") || q.includes("what should") || q.includes("action")) {
    return {
      answer: s.requiredActions.length > 0
        ? `Recommended next steps: ${s.requiredActions.join(". ")}`
        : `No immediate actions required. Status: ${s.legalStatus}.`,
      reasoning: s.summary,
      nextSteps: s.requiredActions,
      riskLevel: s.riskLevel,
      confidence: 0,
    };
  }

  // Generic
  return {
    answer: `${ctx.worker.name}: Legal status is ${s.legalStatus} (${s.legalBasis}), risk: ${s.riskLevel}, deployability: ${s.deployability}. ${s.summary}`,
    reasoning: "General status summary from legal snapshot.",
    nextSteps: s.requiredActions.slice(0, 3),
    riskLevel: s.riskLevel,
    confidence: 0,
  };
}
