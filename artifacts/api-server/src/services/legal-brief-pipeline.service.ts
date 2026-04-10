/**
 * Legal Brief Pipeline — 4-stage sequential AI legal intelligence.
 *
 * Stage 1: Legal Research (Perplexity + Claude) — find applicable articles
 * Stage 2: Case Review (Claude) — structured analysis for lawyer
 * Stage 3: Validation (Claude) — check for invented facts, consistency
 * Stage 4: Pressure Check (deterministic + Claude) — deadline/urgency layer
 *
 * SAFETY:
 *  - Legal snapshot is SOURCE OF TRUTH — never overridden
 *  - Pipeline halts if Stage 3 validation fails
 *  - All output marked requiresLawyerReview: true
 *  - Each stage stored separately for audit
 *  - No auto-apply of any legal conclusions
 */

import { queryOne, execute } from "../lib/db.js";
import { getWorkerLegalSnapshot, type LegalSnapshot } from "./legal-status.service.js";
import { checkAIRateLimit } from "../lib/ai-rate-limiter.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface ArticleMapping {
  article: string;
  explanation: string;
  whyItApplies: string;
  impact: "SUPPORTS" | "WEAKENS" | "UNCLEAR";
}

export interface Stage1Result {
  articles: ArticleMapping[];
  proceduralNotes: string[];
  commonPatterns: string[];
  perplexityResearch: string | null;
  perplexityAvailable: boolean;
  confidence: number;
}

export interface Stage2Result {
  caseSummary: string;
  likelyIssue: string;
  articleApplication: ArticleMapping[];
  appealGrounds: string[];
  missingEvidence: string[];
  nextSteps: string[];
  lawyerReviewDraft: string;
  appealOutlineDraft: string;
  confidence: number;
  requiresLawyerReview: true;
}

export interface Stage3Result {
  isValid: boolean;
  issues: Array<{ type: string; description: string; severity: string }>;
  riskLevel: string;
  requiresReview: boolean;
  notes: string;
}

export interface Stage4Result {
  pressureLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  deadlineRisk: string;
  immediateActions: string[];
  delayImpact: string;
  daysUntilDeadline: number | null;
}

export interface Stage5Result {
  greeting: string;
  whatHappened: string;
  whyItWasNegative: string;
  whatWeAreDoing: string;
  whatYouNeedToDo: string[];
  timeline: string;
  reassurance: string;
  contactInfo: string;
  language: string;
  toneCalibration: "REASSURING" | "CALM" | "MODERATE" | "CAREFUL" | "NEUTRAL";
}

export interface Stage6Result {
  englishAppealText: string;
  translationNotes: string;
  structuralChanges: string[];
  alignedWithPolish: boolean;
}

export interface LegalBriefResult {
  id: string;
  workerId: string;
  workerName: string;
  status: "COMPLETE" | "HALTED" | "FAILED";
  stage1: Stage1Result | null;
  stage2: Stage2Result | null;
  stage3: Stage3Result | null;
  stage4: Stage4Result | null;
  stage5: Stage5Result | null;
  stage6: Stage6Result | null;
  overallConfidence: number;
  isValid: boolean;
  requiresReview: boolean;
  pressureLevel: string;
  haltedAt: string | null;
  haltReason: string | null;
  createdAt: string;
}

// ═══ MAIN PIPELINE ══════════════════════════════════════════════════════════

export async function generateLegalBrief(
  workerId: string,
  tenantId: string,
  generatedBy: string,
  caseId?: string,
  rejectionText?: string,
): Promise<LegalBriefResult> {
  const createdAt = new Date().toISOString();

  // Load worker + snapshot
  const worker = await queryOne<any>(
    "SELECT id, full_name, trc_expiry, work_permit_expiry, nationality, pesel, assigned_site, preferred_language FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");

  let snapshot: LegalSnapshot;
  try {
    snapshot = await getWorkerLegalSnapshot(workerId, tenantId);
  } catch {
    throw new Error("Cannot generate brief — legal snapshot unavailable");
  }

  // Load legal case if provided — MUST belong to this worker
  let legalCase: any = null;
  if (caseId) {
    legalCase = await queryOne<any>(
      "SELECT * FROM legal_cases WHERE id = $1 AND tenant_id = $2 AND worker_id = $3", [caseId, tenantId, workerId]
    );
    if (!legalCase) throw new Error("Case does not belong to this worker — cannot generate brief for unrelated worker/case pair");
  } else {
    legalCase = await queryOne<any>(
      "SELECT * FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1", [workerId, tenantId]
    );
  }

  // Load rejection analyses
  const latestRejection = await queryOne<any>(
    "SELECT * FROM rejection_analyses WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  ).catch(() => null);

  // Determine if rejection text is available from any source
  const effectiveRejectionText = rejectionText ?? latestRejection?.rejection_text ?? null;
  const hasRejectionContext = !!effectiveRejectionText;

  // Build structured case data
  const caseData = buildCaseData(worker, snapshot, legalCase, latestRejection, rejectionText);

  // Create DB record
  const row = await queryOne<{ id: string }>(
    `INSERT INTO legal_briefs (tenant_id, worker_id, case_id, generated_by, rejection_text, status)
     VALUES ($1,$2,$3,$4,$5,'GENERATING') RETURNING id`,
    [tenantId, workerId, caseId ?? legalCase?.id ?? null, generatedBy, rejectionText ?? latestRejection?.rejection_text ?? null]
  );
  const briefId = row!.id;

  try {
    // ── STAGE 1: Legal Research ──────────────────────────────────────────
    const stage1 = await runStage1(caseData, tenantId);
    await execute("UPDATE legal_briefs SET stage1_research_json = $1, updated_at = NOW() WHERE id = $2",
      [JSON.stringify(stage1), briefId]);

    // ── STAGE 2: Case Review ─────────────────────────────────────────────
    const stage2 = await runStage2(caseData, snapshot, stage1, effectiveRejectionText, hasRejectionContext);
    await execute("UPDATE legal_briefs SET stage2_review_json = $1, updated_at = NOW() WHERE id = $2",
      [JSON.stringify(stage2), briefId]);

    // ── STAGE 3: Validation ──────────────────────────────────────────────
    const stage3 = await runStage3(snapshot, stage1, stage2);
    await execute("UPDATE legal_briefs SET stage3_validation_json = $1, updated_at = NOW() WHERE id = $2",
      [JSON.stringify(stage3), briefId]);

    // HALT if validation fails
    if (!stage3.isValid) {
      await execute(
        "UPDATE legal_briefs SET status = 'HALTED', pipeline_halted_at = 'STAGE_3', pipeline_halt_reason = $1, is_valid = false, requires_review = true, overall_confidence = $2, updated_at = NOW() WHERE id = $3",
        [stage3.notes, Math.min(stage1.confidence, stage2.confidence) * 0.5, briefId]
      );
      return {
        id: briefId, workerId, workerName: worker.full_name, status: "HALTED",
        stage1, stage2, stage3, stage4: null, stage5: null, stage6: null,
        overallConfidence: Math.min(stage1.confidence, stage2.confidence) * 0.5,
        isValid: false, requiresReview: true, pressureLevel: "UNKNOWN",
        haltedAt: "STAGE_3", haltReason: stage3.notes, createdAt,
      };
    }

    // ── STAGE 4: Pressure Check ──────────────────────────────────────────
    const stage4 = runStage4(snapshot, legalCase, caseData);

    // ── STAGE 5: Worker Explanation ──────────────────────────────────────
    const workerLang = worker.preferred_language ?? "en";
    const rejectionCategory = latestRejection?.category ?? null;
    const stage5 = await runStage5(worker.full_name, stage2, stage4, rejectionCategory, workerLang);

    // ── STAGE 6: English Appeal Translation ─────────────────────────────
    let stage6: Stage6Result | null = null;
    if (stage2.appealOutlineDraft && stage2.appealOutlineDraft.length > 10) {
      stage6 = await runStage6(stage2.appealOutlineDraft);
    }

    // Compute overall confidence
    const overallConfidence = Math.round(Math.min(stage1.confidence, stage2.confidence) * (stage3.isValid ? 1.0 : 0.5) * 100) / 100;

    // Finalize
    await execute(
      `UPDATE legal_briefs SET status = 'COMPLETE', stage4_pressure_json = $1, final_brief_json = $2,
       overall_confidence = $3, is_valid = true, requires_review = true, pressure_level = $4, updated_at = NOW()
       WHERE id = $5`,
      [JSON.stringify(stage4), JSON.stringify({ stage1, stage2, stage3, stage4, stage5, stage6 }), overallConfidence, stage4.pressureLevel, briefId]
    );

    return {
      id: briefId, workerId, workerName: worker.full_name, status: "COMPLETE",
      stage1, stage2, stage3, stage4, stage5, stage6,
      overallConfidence, isValid: true, requiresReview: true,
      pressureLevel: stage4.pressureLevel, haltedAt: null, haltReason: null, createdAt,
    };

  } catch (err) {
    await execute("UPDATE legal_briefs SET status = 'FAILED', pipeline_halt_reason = $1, updated_at = NOW() WHERE id = $2",
      [err instanceof Error ? err.message : "Unknown error", briefId]);
    throw err;
  }
}

// ═══ CASE DATA BUILDER ══════════════════════════════════════════════════════

function buildCaseData(worker: any, snapshot: LegalSnapshot, legalCase: any, rejection: any, rejectionText?: string): string {
  const parts = [
    `WORKER: ${worker.full_name}`,
    worker.nationality ? `Nationality: ${worker.nationality}` : null,
    worker.trc_expiry ? `TRC Expiry: ${worker.trc_expiry}` : null,
    worker.work_permit_expiry ? `Work Permit Expiry: ${worker.work_permit_expiry}` : null,
    `\nLEGAL SNAPSHOT (SOURCE OF TRUTH):`,
    `Status: ${snapshot.legalStatus}`,
    `Basis: ${snapshot.legalBasis}`,
    `Risk: ${snapshot.riskLevel}`,
    `Protection: ${snapshot.legalProtectionFlag ? "YES" : "NO"}`,
    `TRC Application Submitted: ${snapshot.trcApplicationSubmitted ? "YES" : "NO"}`,
    `Same Employer: ${snapshot.sameEmployerFlag ? "YES" : "NO"}`,
    snapshot.summary ? `Summary: ${snapshot.summary}` : null,
    snapshot.warnings.length > 0 ? `Warnings: ${snapshot.warnings.join("; ")}` : null,
    snapshot.requiredActions.length > 0 ? `Required Actions: ${snapshot.requiredActions.join("; ")}` : null,
  ];

  if (legalCase) {
    parts.push(`\nLEGAL CASE:`, `Type: ${legalCase.case_type}`, `Status: ${legalCase.status}`);
    if (legalCase.appeal_deadline) parts.push(`Appeal Deadline: ${legalCase.appeal_deadline}`);
    if (legalCase.mos_status) parts.push(`MoS Status: ${legalCase.mos_status}`);
  }

  if (rejection) {
    parts.push(`\nREJECTION ANALYSIS:`, `Category: ${rejection.category}`, `Explanation: ${rejection.explanation}`);
    if (rejection.likely_cause) parts.push(`Likely Cause: ${rejection.likely_cause}`);
    parts.push(`Appeal Possible: ${rejection.appeal_possible ? "YES" : "NO"}`);
  }

  if (rejectionText) {
    parts.push(`\nREJECTION TEXT:\n"${rejectionText.slice(0, 3000)}"`);
  }

  return parts.filter(Boolean).join("\n");
}

// ═══ STAGE 1: LEGAL RESEARCH ════════════════════════════════════════════════

async function runStage1(caseData: string, tenantId: string): Promise<Stage1Result> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI not configured");

  // Try Perplexity for real-time law research
  let perplexityResearch: string | null = null;
  try {
    const pplxKey = process.env.PPLX_API_KEY;
    const limit = checkAIRateLimit(tenantId, "perplexity");
    if (pplxKey && limit.allowed) {
      const pRes = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${pplxKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar-pro", max_tokens: 2048, temperature: 0.1,
          messages: [
            { role: "system", content: "You are a Polish immigration law research assistant. Find the most current and relevant legal provisions, court decisions, and procedural rules for this specific case. Focus on 2025-2026 changes." },
            { role: "user", content: `Research Polish immigration law relevant to this case:\n\n${caseData.slice(0, 2000)}\n\nReturn: applicable articles, recent changes, procedural deadlines, common rejection patterns for this scenario.` },
          ],
        }),
      });
      if (pRes.ok) {
        const pData = await pRes.json() as any;
        perplexityResearch = pData.choices?.[0]?.message?.content ?? null;
      }
    }
  } catch { /* Perplexity failed — tracked below */ }

  const perplexityAvailable = perplexityResearch !== null;
  const perplexityNote = perplexityAvailable
    ? `RECENT RESEARCH (from Perplexity real-time search):\n${perplexityResearch}\n\nUse this research to inform your analysis.`
    : "NOTE: Real-time legal research was NOT available for this analysis. Base your analysis on your training data only. Be MORE CONSERVATIVE with confidence scores — reduce by at least 0.15.";

  // Claude for structured article mapping
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 3000,
      system: `You are an immigration lawyer assistant specializing in Polish law. You are NOT making legal decisions. You are NOT giving final legal advice. You must connect legal provisions to THIS specific case. If unsure, say "uncertain" — do not guess.

Identify relevant Polish immigration law: TRC provisions, Art. 108 continuity, deadlines, formal defects, appeals, Ustawa o cudzoziemcach, KPA procedures.

${perplexityNote}

Return ONLY valid JSON:
{
  "articles": [{"article":"Art. X","explanation":"...","whyItApplies":"...","impact":"SUPPORTS|WEAKENS|UNCLEAR"}],
  "proceduralNotes": ["..."],
  "commonPatterns": ["..."],
  "confidence": 0.0-1.0
}`,
      messages: [{ role: "user", content: caseData }],
    }),
  });

  if (!res.ok) throw new Error(`Stage 1 AI error: ${res.status}`);
  const data = await res.json() as any;
  const raw = data.content?.find((b: any) => b.type === "text")?.text ?? "";
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

  const rawConfidence = typeof json.confidence === "number" ? Math.min(1, Math.max(0, json.confidence)) : 0.5;
  const adjustedConfidence = perplexityAvailable ? rawConfidence : Math.max(0, rawConfidence - 0.15);

  const notes = Array.isArray(json.proceduralNotes) ? json.proceduralNotes.map(String) : [];
  if (!perplexityAvailable) notes.unshift("Real-time legal research unavailable — analysis based on model training data only");

  return {
    articles: Array.isArray(json.articles) ? json.articles.map((a: any) => ({
      article: String(a.article ?? ""), explanation: String(a.explanation ?? ""),
      whyItApplies: String(a.whyItApplies ?? ""), impact: ["SUPPORTS", "WEAKENS", "UNCLEAR"].includes(a.impact) ? a.impact : "UNCLEAR",
    })) : [],
    proceduralNotes: notes,
    commonPatterns: Array.isArray(json.commonPatterns) ? json.commonPatterns.map(String) : [],
    perplexityResearch,
    perplexityAvailable,
    confidence: adjustedConfidence,
  };
}

// ═══ STAGE 2: CASE REVIEW ═══════════════════════════════════════════════════

async function runStage2(caseData: string, snapshot: LegalSnapshot, stage1: Stage1Result, rejectionText: string | null, hasRejectionContext: boolean): Promise<Stage2Result> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const rejectionWarning = hasRejectionContext ? "" :
    "\n\nCRITICAL: NO REJECTION TEXT IS AVAILABLE. You MUST:\n- NOT generate an appeal outline (set appealOutlineDraft to empty string)\n- NOT fabricate appeal grounds (set appealGrounds to empty array)\n- Mark the brief as INCOMPLETE in caseSummary\n- Cap your confidence at 0.5 maximum\n- Note in lawyerReviewDraft that rejection text is needed for appeal analysis";

  const stage1Context = `STAGE 1 RESEARCH RESULTS:\nArticles found: ${stage1.articles.map(a => `${a.article} (${a.impact}): ${a.explanation}`).join("\n")}\nProcedural notes: ${stage1.proceduralNotes.join("; ")}\nCommon patterns: ${stage1.commonPatterns.join("; ")}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 4096,
      system: `You are a legal assistant helping a lawyer review a Polish immigration case. Do NOT override the legal snapshot. Do NOT invent facts. Use ONLY provided data and research. This is for lawyer review only.

${stage1Context}${rejectionWarning}

TASK:
1. Case summary (2-3 sentences)
2. Likely issue (what caused the problem)
3. Map articles to this specific case
4. Appeal grounds (if applicable)
5. Missing evidence (what's needed)
6. Next steps (prioritized)
7. Draft lawyer note (internal, 3-5 sentences)
8. Draft appeal outline (if appeal is possible)

Return ONLY valid JSON:
{
  "caseSummary": "",
  "likelyIssue": "",
  "articleApplication": [{"article":"","explanation":"","whyItApplies":"","impact":"SUPPORTS|WEAKENS|UNCLEAR"}],
  "appealGrounds": [],
  "missingEvidence": [],
  "nextSteps": [],
  "lawyerReviewDraft": "",
  "appealOutlineDraft": "",
  "confidence": 0.0-1.0,
  "requiresLawyerReview": true
}`,
      messages: [{ role: "user", content: `${caseData}\n\n${rejectionText ? `REJECTION TEXT:\n"${rejectionText.slice(0, 3000)}"` : ""}` }],
    }),
  });

  if (!res.ok) throw new Error(`Stage 2 AI error: ${res.status}`);
  const data = await res.json() as any;
  const raw = data.content?.find((b: any) => b.type === "text")?.text ?? "";
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

  return {
    caseSummary: String(json.caseSummary ?? "").slice(0, 3000),
    likelyIssue: String(json.likelyIssue ?? "").slice(0, 2000),
    articleApplication: Array.isArray(json.articleApplication) ? json.articleApplication.map((a: any) => ({
      article: String(a.article ?? ""), explanation: String(a.explanation ?? ""),
      whyItApplies: String(a.whyItApplies ?? ""), impact: ["SUPPORTS", "WEAKENS", "UNCLEAR"].includes(a.impact) ? a.impact : "UNCLEAR",
    })) : [],
    appealGrounds: hasRejectionContext ? (Array.isArray(json.appealGrounds) ? json.appealGrounds.map(String) : []) : [],
    missingEvidence: Array.isArray(json.missingEvidence) ? json.missingEvidence.map(String) : [],
    nextSteps: Array.isArray(json.nextSteps) ? json.nextSteps.map(String) : [],
    lawyerReviewDraft: String(json.lawyerReviewDraft ?? "").slice(0, 5000),
    appealOutlineDraft: hasRejectionContext ? String(json.appealOutlineDraft ?? "").slice(0, 5000) : "",
    confidence: hasRejectionContext
      ? (typeof json.confidence === "number" ? Math.min(1, Math.max(0, json.confidence)) : 0.5)
      : Math.min(0.5, typeof json.confidence === "number" ? json.confidence : 0.5),
    requiresLawyerReview: true,
  };
}

// ═══ STAGE 3: VALIDATION ════════════════════════════════════════════════════

async function runStage3(snapshot: LegalSnapshot, stage1: Stage1Result, stage2: Stage2Result): Promise<Stage3Result> {
  const deterministicIssues: Array<{ type: string; description: string; severity: string }> = [];

  // ── DETERMINISTIC PRE-CHECKS (run before AI) ──────────────────────────

  // Check 1: Status contradiction — if Stage 2 summary mentions "valid" but snapshot says expired
  const summaryLower = (stage2.caseSummary + " " + stage2.likelyIssue).toLowerCase();
  if (snapshot.legalStatus === "EXPIRED_NOT_PROTECTED" && (summaryLower.includes("valid permit") || summaryLower.includes("permit is valid") || summaryLower.includes("status is valid"))) {
    deterministicIssues.push({ type: "MISMATCH", description: `Stage 2 implies valid permit but snapshot says ${snapshot.legalStatus}`, severity: "CRITICAL" });
  }
  if (snapshot.legalStatus === "VALID" && (summaryLower.includes("expired") || summaryLower.includes("no protection") || summaryLower.includes("illegal stay"))) {
    deterministicIssues.push({ type: "MISMATCH", description: `Stage 2 implies expired/unprotected but snapshot says ${snapshot.legalStatus}`, severity: "CRITICAL" });
  }

  // Check 2: Stage 2 references articles not found in Stage 1
  const stage1ArticleSet = new Set(stage1.articles.map(a => a.article.toLowerCase().replace(/\s+/g, "")));
  for (const a of stage2.articleApplication) {
    const normalized = a.article.toLowerCase().replace(/\s+/g, "");
    if (normalized && !stage1ArticleSet.has(normalized)) {
      deterministicIssues.push({ type: "IRRELEVANT_ARTICLE", description: `Stage 2 cites "${a.article}" which was not found in Stage 1 research`, severity: "MEDIUM" });
    }
  }

  // Check 3: Confidence inflation — Stage 2 cannot be more confident than Stage 1
  if (stage2.confidence > stage1.confidence + 0.1) {
    deterministicIssues.push({ type: "INVENTED_FACT", description: `Stage 2 confidence (${stage2.confidence}) exceeds Stage 1 (${stage1.confidence}) — downstream cannot be more certain than research`, severity: "HIGH" });
  }

  // Check 4: Appeal grounds without rejection context
  if (stage2.appealGrounds.length > 0 && !stage2.caseSummary.toLowerCase().includes("reject")) {
    // Could be legitimate — mark as warning not critical
    deterministicIssues.push({ type: "INCONSISTENT_ACTION", description: "Appeal grounds generated but case summary doesn't mention rejection", severity: "LOW" });
  }

  // ── AI VALIDATION (adds to deterministic checks) ──────────────────────

  const apiKey = process.env.ANTHROPIC_API_KEY!;
  let aiIssues: Array<{ type: string; description: string; severity: string }> = [];
  let aiValid = true;
  let aiNotes = "";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 1500,
        system: `You are a legal AI output validator. Do NOT generate new legal reasoning. ONLY validate.

LEGAL SNAPSHOT (SOURCE OF TRUTH — do NOT contradict):
Status: ${snapshot.legalStatus}
Basis: ${snapshot.legalBasis}
Risk: ${snapshot.riskLevel}
Protection: ${snapshot.legalProtectionFlag}
TRC Submitted: ${snapshot.trcApplicationSubmitted}
Warnings: ${snapshot.warnings.join("; ")}

You MUST set isValid to false if:
- ANY claim contradicts the legal snapshot
- ANY fact is invented (not in provided data)
- Articles cited are not relevant to this specific case type
- Suggested actions are inconsistent with the legal status

Return ONLY valid JSON:
{
  "isValid": true/false,
  "issues": [{"type":"MISMATCH|INVENTED_FACT|IRRELEVANT_ARTICLE|INCONSISTENT_ACTION|SAFETY|INCOMPLETE","description":"...","severity":"LOW|MEDIUM|HIGH|CRITICAL"}],
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "requiresReview": true,
  "notes": "overall assessment"
}`,
        messages: [{
          role: "user",
          content: `STAGE 1 OUTPUT:\n${JSON.stringify(stage1, null, 1).slice(0, 3000)}\n\nSTAGE 2 OUTPUT:\n${JSON.stringify(stage2, null, 1).slice(0, 4000)}`,
        }],
      }),
    });

    if (res.ok) {
      const data = await res.json() as any;
      const raw = data.content?.find((b: any) => b.type === "text")?.text ?? "";
      const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      aiValid = json.isValid === true;
      aiIssues = Array.isArray(json.issues) ? json.issues.map((i: any) => ({
        type: String(i.type ?? "UNKNOWN"), description: String(i.description ?? ""), severity: String(i.severity ?? "MEDIUM"),
      })) : [];
      aiNotes = String(json.notes ?? "").slice(0, 2000);
    }
  } catch { /* AI validation failed — rely on deterministic checks */ }

  // ── MERGE + CRITICAL OVERRIDE ─────────────────────────────────────────

  const allIssues = [...deterministicIssues, ...aiIssues];
  const hasCritical = allIssues.some(i => i.severity === "CRITICAL");
  const hasHigh = allIssues.filter(i => i.severity === "HIGH").length >= 2;

  // CRITICAL override: if ANY issue is CRITICAL, force isValid = false regardless of AI
  const isValid = hasCritical ? false : hasHigh ? false : (aiValid && deterministicIssues.length === 0);

  const riskLevel = hasCritical ? "CRITICAL" : hasHigh ? "HIGH" : allIssues.length > 0 ? "MEDIUM" : "LOW";

  const notes = [
    deterministicIssues.length > 0 ? `Deterministic checks found ${deterministicIssues.length} issue(s).` : "Deterministic checks passed.",
    aiNotes || "AI validation complete.",
    hasCritical ? "HALTED: Critical issue detected — pipeline cannot continue." : "",
  ].filter(Boolean).join(" ");

  return { isValid, issues: allIssues, riskLevel, requiresReview: true, notes };
}

// ═══ STAGE 4: PRESSURE CHECK (DETERMINISTIC + CONTEXT) ══════════════════════

function runStage4(snapshot: LegalSnapshot, legalCase: any, caseData: string): Stage4Result {
  let pressureLevel: Stage4Result["pressureLevel"] = "LOW";
  const immediateActions: string[] = [];
  let daysUntilDeadline: number | null = null;
  let deadlineRisk = "No immediate deadline pressure";
  let delayImpact = "Minimal impact from short delays";

  // Appeal deadline
  if (legalCase?.appeal_deadline) {
    const days = Math.ceil((new Date(legalCase.appeal_deadline).getTime() - Date.now()) / 86400000);
    daysUntilDeadline = days;
    if (days < 0) {
      pressureLevel = "CRITICAL";
      deadlineRisk = `Appeal deadline PASSED ${Math.abs(days)} days ago`;
      immediateActions.push("Consult lawyer immediately for alternative remedies");
      delayImpact = "Appeal window closed — limited options remain";
    } else if (days <= 3) {
      pressureLevel = "CRITICAL";
      deadlineRisk = `Only ${days} days to appeal — file immediately`;
      immediateActions.push("File appeal TODAY", "Prepare minimal required documents", "Contact Szef UdSC office");
      delayImpact = "Each day of delay reduces appeal preparation time critically";
    } else if (days <= 7) {
      pressureLevel = "HIGH";
      deadlineRisk = `${days} days to appeal deadline`;
      immediateActions.push("Finalize appeal letter", "Gather all supporting evidence", "Review with lawyer");
      delayImpact = "Delay risks insufficient preparation time for appeal";
    } else if (days <= 14) {
      pressureLevel = "MEDIUM";
      deadlineRisk = `${days} days to appeal — adequate time if started now`;
      immediateActions.push("Begin appeal preparation", "Collect missing evidence");
      delayImpact = "Moderate — delay compresses available preparation time";
    }
  }

  // Permit expiry pressure
  if (snapshot.legalStatus === "EXPIRING_SOON" && pressureLevel === "LOW") {
    pressureLevel = "MEDIUM";
    deadlineRisk = "Permit expiring soon — renewal should be initiated";
    immediateActions.push("Submit TRC renewal application before expiry", "Gather required documents");
    delayImpact = "If permit expires without filing, worker loses Art. 108 protection eligibility";
  }

  if (snapshot.legalStatus === "EXPIRED_NOT_PROTECTED") {
    pressureLevel = "CRITICAL";
    deadlineRisk = "Permit EXPIRED with no protection — worker may be in illegal stay";
    immediateActions.push("URGENT: Consult lawyer about regularization options", "Check if any filing proof exists", "Do NOT deploy worker until status clarified");
    delayImpact = "Each day increases risk of PIP inspection fine and deportation proceedings";
  }

  if (snapshot.legalStatus === "NO_PERMIT") {
    pressureLevel = "HIGH";
    immediateActions.push("Verify if worker needs a permit", "Check if exempt category applies", "Begin permit application process");
    delayImpact = "Worker cannot legally work without valid permit documentation";
  }

  // Deployability
  if (snapshot.riskLevel === "CRITICAL") {
    if (pressureLevel !== "CRITICAL") pressureLevel = "HIGH";
    immediateActions.push("Review worker deployability before assigning to any site");
  }

  return { pressureLevel, deadlineRisk, immediateActions, delayImpact, daysUntilDeadline };
}

// ═══ STAGE 5: WORKER EXPLANATION ═════════════════════════════════════════════

const TONE_MAP: Record<string, Stage5Result["toneCalibration"]> = {
  MISSING_DOCS: "REASSURING",
  FORMAL_DEFECT: "CALM",
  TIMING_ERROR: "MODERATE",
  EMPLOYER_ERROR: "CALM",
  LEGAL_BASIS_PROBLEM: "CAREFUL",
  OTHER_REVIEW_REQUIRED: "NEUTRAL",
};

async function runStage5(
  workerName: string,
  stage2: Stage2Result,
  stage4: Stage4Result,
  rejectionCategory: string | null,
  language: string,
): Promise<Stage5Result> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const tone = TONE_MAP[rejectionCategory ?? ""] ?? "NEUTRAL";
  const firstName = workerName.split(/\s+/)[0];

  const languageInstruction = language === "pl"
    ? "Write in simple Polish (język polski). Use formal but warm tone (Pan/Pani)."
    : language === "uk"
      ? "Write in simple Ukrainian (українська мова). Use warm and clear language."
      : language === "es"
        ? "Write in simple Spanish (español). Use formal but warm tone (usted)."
        : "Write in simple English. Use clear, short sentences.";

  const toneInstruction =
    tone === "REASSURING" ? "This is usually easy to fix. Be encouraging." :
    tone === "CALM" ? "This is a procedural issue, not the worker's fault. Be matter-of-fact and calm." :
    tone === "MODERATE" ? "There is a complication, but we are working on it. Be honest but supportive." :
    tone === "CAREFUL" ? "This is a complex situation. Do NOT promise success. Be honest and supportive without false hope." :
    "Provide a clear, neutral explanation.";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 2000,
      system: `You are writing a personal explanation for a worker named ${firstName} about their immigration case. ${languageInstruction}

TONE: ${toneInstruction}

STRICT RULES:
- NO legal articles (no "Art. 108", no "KPA", no "Ustawa")
- NO legal jargon (no "voivodeship", no "TRC", no "formal defect")
- NO internal codes or system terms
- NO promises of success or percentages
- Short paragraphs (2-3 sentences each)
- Calm, human, reassuring tone
- Address the worker by first name

Return ONLY valid JSON:
{
  "greeting": "Dear [FirstName],",
  "whatHappened": "simple explanation of what happened",
  "whyItWasNegative": "simple explanation of why the decision was negative",
  "whatWeAreDoing": "what the legal team is doing about it",
  "whatYouNeedToDo": ["action 1", "action 2"],
  "timeline": "when they will hear back",
  "reassurance": "reassuring message appropriate to severity",
  "contactInfo": "who to contact if they have questions"
}`,
      messages: [{
        role: "user",
        content: `Case summary: ${stage2.caseSummary}\nLikely issue: ${stage2.likelyIssue}\nPressure: ${stage4.pressureLevel}\nDeadline: ${stage4.daysUntilDeadline !== null ? `${stage4.daysUntilDeadline} days` : "no immediate deadline"}\nNext steps: ${stage2.nextSteps.join("; ")}\nMissing evidence: ${stage2.missingEvidence.join("; ")}`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Stage 5 AI error: ${res.status}`);
  const data = await res.json() as any;
  const raw = data.content?.find((b: any) => b.type === "text")?.text ?? "";
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

  return {
    greeting: String(json.greeting ?? `Dear ${firstName},`),
    whatHappened: String(json.whatHappened ?? ""),
    whyItWasNegative: String(json.whyItWasNegative ?? ""),
    whatWeAreDoing: String(json.whatWeAreDoing ?? ""),
    whatYouNeedToDo: Array.isArray(json.whatYouNeedToDo) ? json.whatYouNeedToDo.map(String) : [],
    timeline: String(json.timeline ?? ""),
    reassurance: String(json.reassurance ?? ""),
    contactInfo: String(json.contactInfo ?? "If you have questions, contact your coordinator."),
    language,
    toneCalibration: tone,
  };
}

// ═══ STAGE 6: ENGLISH APPEAL TRANSLATION ════════════════════════════════════

async function runStage6(polishAppealDraft: string): Promise<Stage6Result> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 4096,
      system: `You are a legal translator specializing in Polish immigration law. Translate the following Polish legal appeal draft into English.

STRICT RULES:
- PRESERVE all legal meaning exactly — do not simplify legal concepts
- PRESERVE all article references (Art. 108, KPA, etc.) — keep them in the translation
- Do NOT add new arguments that are not in the Polish version
- Do NOT remove any arguments from the Polish version
- MAINTAIN formal legal English tone (similar to UK/Commonwealth legal writing)
- ADAPT structure slightly for English legal conventions:
  - "petitum" → "Prayer for Relief" or "Relief Sought"
  - "uzasadnienie" → "Grounds / Statement of Reasons"
  - Polish date format → English date format
  - Polish office names can be kept with English translation in parentheses
- This translation is for INTERNAL LEGAL UNDERSTANDING, not for submission to Polish authorities

Return ONLY valid JSON:
{
  "englishAppealText": "the full translated appeal",
  "translationNotes": "any notes about translation choices",
  "structuralChanges": ["list of structural adaptations made"],
  "alignedWithPolish": true/false
}`,
      messages: [{ role: "user", content: polishAppealDraft.slice(0, 8000) }],
    }),
  });

  if (!res.ok) throw new Error(`Stage 6 AI error: ${res.status}`);
  const data = await res.json() as any;
  const raw = data.content?.find((b: any) => b.type === "text")?.text ?? "";
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

  return {
    englishAppealText: String(json.englishAppealText ?? "").slice(0, 10000),
    translationNotes: String(json.translationNotes ?? ""),
    structuralChanges: Array.isArray(json.structuralChanges) ? json.structuralChanges.map(String) : [],
    alignedWithPolish: json.alignedWithPolish !== false,
  };
}

// ═══ READ OPERATIONS ════════════════════════════════════════════════════════

export async function getBriefById(id: string, tenantId: string): Promise<any> {
  return queryOne<any>("SELECT * FROM legal_briefs WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
}

export async function getBriefsByWorker(workerId: string, tenantId: string): Promise<any[]> {
  const { query } = await import("../lib/db.js");
  return query<any>(
    "SELECT id, status, overall_confidence, pressure_level, is_valid, created_at FROM legal_briefs WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
    [workerId, tenantId]
  );
}
