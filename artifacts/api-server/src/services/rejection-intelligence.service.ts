/**
 * Rejection Intelligence Service — classifies negative decisions and suggests next steps.
 *
 * Hybrid approach:
 *  1. Rule-first: pattern matching on known rejection categories
 *  2. AI-assisted: Claude helps with unclear text
 *
 * RULES:
 *  - AI is advisory only
 *  - All results marked reviewRequired = true
 *  - Does NOT change legal status, case status, or any engine output
 *  - Internal use only
 */

import { query, queryOne, execute } from "../lib/db.js";
import { getWorkerLegalSnapshot } from "./legal-status.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type RejectionCategory =
  | "MISSING_DOCS"
  | "EMPLOYER_ERROR"
  | "TIMING_ERROR"
  | "FORMAL_DEFECT"
  | "LEGAL_BASIS_PROBLEM"
  | "OTHER_REVIEW_REQUIRED";

export type SourceType = "RULE" | "AI_ASSISTED" | "HYBRID";

export interface ClassifyInput {
  workerId: string;
  caseId?: string;
  rejectionText: string;
  tenantId: string;
}

export interface ClassifyResult {
  id: string;
  category: RejectionCategory;
  explanation: string;
  likelyCause: string;
  nextSteps: string[];
  appealPossible: boolean;
  confidence: number;
  reviewRequired: true;
  sourceType: SourceType;
}

export interface RejectionDraft {
  internalSummary: string;
  suggestedAppealFocus: string;
  requiredDocuments: string[];
  suggestedNextActions: string[];
  reviewRequired: true;
}

export interface RejectionAnalysis {
  id: string;
  tenant_id: string;
  worker_id: string;
  legal_case_id: string | null;
  rejection_text: string;
  category: string;
  explanation: string;
  likely_cause: string | null;
  next_steps_json: unknown;
  appeal_possible: boolean;
  confidence_score: number;
  source_type: string;
  draft_json: unknown;
  created_at: string;
  updated_at: string;
}

// ═══ RULE-BASED PATTERNS ════════════════════════════════════════════════════

interface RuleMatch {
  category: RejectionCategory;
  explanation: string;
  likelyCause: string;
  nextSteps: string[];
  appealPossible: boolean;
  confidence: number;
}

const RULES: Array<{ patterns: RegExp[]; match: RuleMatch }> = [
  {
    patterns: [
      /brak\s+(dokumentu|dokument|załącznik)/i,
      /missing\s+(document|attachment|file)/i,
      /nie\s+dołączono/i,
      /nie\s+przedłożono/i,
      /brak\s+wymaganych/i,
    ],
    match: {
      category: "MISSING_DOCS",
      explanation: "Rejection appears to be due to missing or incomplete documentation.",
      likelyCause: "Required documents were not submitted or were incomplete at the time of filing.",
      nextSteps: [
        "Identify exact documents listed in the rejection notice",
        "Upload missing documents to the worker's file",
        "Prepare corrected submission package",
        "Submit within the correction deadline if specified",
      ],
      appealPossible: true,
      confidence: 0.85,
    },
  },
  {
    patterns: [
      /brak\s+formalny/i,
      /formal\s+defect/i,
      /wezwanie\s+do\s+uzupełnienia/i,
      /termin\s+na\s+uzupełnienie/i,
    ],
    match: {
      category: "FORMAL_DEFECT",
      explanation: "Application has a formal defect (brak formalny) that must be corrected.",
      likelyCause: "Application form or supporting documents contained errors or omissions identified by the authority.",
      nextSteps: [
        "Read the defect notice carefully — identify each point",
        "Correct each identified defect",
        "Submit corrections within the deadline specified in the notice",
        "Confirm submission with UPO or filing receipt",
        "Review formal defect correction with immigration lawyer if substantive",
      ],
      appealPossible: true,
      confidence: 0.9,
    },
  },
  {
    patterns: [
      /po\s+terminie/i,
      /after\s+(the\s+)?deadline/i,
      /after\s+(the\s+)?expir/i,
      /po\s+upływie/i,
      /spóźnion/i,
      /late\s+fil/i,
    ],
    match: {
      category: "TIMING_ERROR",
      explanation: "Rejection relates to timing — application filed after permit expiry or past a deadline.",
      likelyCause: "Application was submitted after the relevant deadline, possibly after permit expiry.",
      nextSteps: [
        "Verify exact filing date vs. permit expiry date",
        "Check if any extension or grace period applies",
        "Consult immigration lawyer on options (new application, voluntary departure)",
        "If filing was on time, gather evidence of timely submission (UPO, MoS stamp)",
      ],
      appealPossible: false,
      confidence: 0.8,
    },
  },
  {
    patterns: [
      /pracodawc/i,
      /employer/i,
      /zmiana\s+pracodawcy/i,
      /change\s+of\s+employer/i,
      /inny\s+podmiot/i,
    ],
    match: {
      category: "EMPLOYER_ERROR",
      explanation: "Rejection relates to employer continuity — worker may have changed employer or employer details are incorrect.",
      likelyCause: "Worker changed employer after filing, or employer details on the application don't match the current employment.",
      nextSteps: [
        "Confirm current employer matches the permit/application employer",
        "If employer changed, assess whether a new application is needed",
        "Verify employer NIP and registration details",
        "Update records if employer data was incorrect",
      ],
      appealPossible: true,
      confidence: 0.75,
    },
  },
  {
    patterns: [
      /podstaw\w*\s+prawn/i,
      /legal\s+basis/i,
      /nie\s+spełnia\s+warunków/i,
      /does\s+not\s+meet/i,
      /brak\s+podstaw/i,
      /no\s+(legal\s+)?grounds/i,
    ],
    match: {
      category: "LEGAL_BASIS_PROBLEM",
      explanation: "Rejection questions the legal basis for the application or the worker's eligibility.",
      likelyCause: "Authority determined that statutory conditions for the requested permit type were not met.",
      nextSteps: [
        "Review rejection notice for specific legal grounds cited",
        "Consult immigration lawyer on alternative permit paths",
        "Assess whether a different permit type may be applicable",
        "Prepare appeal if legal interpretation is contestable",
      ],
      appealPossible: true,
      confidence: 0.7,
    },
  },
];

// ═══ RULE ENGINE ════════════════════════════════════════════════════════════

function classifyByRules(text: string): RuleMatch | null {
  const normalized = text.toLowerCase();
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) {
        return rule.match;
      }
    }
  }
  return null;
}

// ═══ AI CLASSIFICATION ══════════════════════════════════════════════════════

async function classifyByAI(text: string, snapshotContext: string): Promise<RuleMatch | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
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
        system: `You classify Polish immigration/work permit rejection notices into categories. Return ONLY a JSON object with these fields:
- category: one of MISSING_DOCS, EMPLOYER_ERROR, TIMING_ERROR, FORMAL_DEFECT, LEGAL_BASIS_PROBLEM, OTHER_REVIEW_REQUIRED
- explanation: 1-2 sentence summary of the rejection
- likelyCause: what likely caused this rejection
- nextSteps: array of 3-5 actionable steps
- appealPossible: boolean
- confidence: 0.0-1.0

You must NOT invent legal rights or make final legal determinations. This is triage only.`,
        messages: [{
          role: "user",
          content: `Classify this rejection notice:\n\n"${text}"\n\nWorker context:\n${snapshotContext}\n\nReturn JSON only.`,
        }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const raw = data.content?.find(b => b.type === "text")?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const validCategories = ["MISSING_DOCS", "EMPLOYER_ERROR", "TIMING_ERROR", "FORMAL_DEFECT", "LEGAL_BASIS_PROBLEM", "OTHER_REVIEW_REQUIRED"];

    return {
      category: validCategories.includes(parsed.category) ? parsed.category : "OTHER_REVIEW_REQUIRED",
      explanation: String(parsed.explanation ?? "AI classification — review required.").slice(0, 2000),
      likelyCause: String(parsed.likelyCause ?? "Unclear from AI analysis.").slice(0, 1000),
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.map(String).slice(0, 8) : ["Review rejection notice manually"],
      appealPossible: parsed.appealPossible === true,
      confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.3,
    };
  } catch {
    return null;
  }
}

// ═══ CORE: classifyRejection ════════════════════════════════════════════════

export async function classifyRejection(input: ClassifyInput): Promise<ClassifyResult> {
  const { workerId, rejectionText, tenantId } = input;
  // Only use caseId if it's a valid UUID — admin case references like "WSC-II-..." are not UUIDs
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const caseId = input.caseId && UUID_RE.test(input.caseId) ? input.caseId : null;

  // Load snapshot context for AI
  let snapshotContext = "No snapshot available";
  try {
    const snap = await getWorkerLegalSnapshot(workerId, tenantId);
    snapshotContext = `Status: ${snap.legalStatus}, Basis: ${snap.legalBasis}, Risk: ${snap.riskLevel}`;
  } catch { /* non-blocking */ }

  // Step 1: Try rules first
  const ruleResult = classifyByRules(rejectionText);
  let result: RuleMatch;
  let sourceType: SourceType;

  if (ruleResult && ruleResult.confidence >= 0.7) {
    // Rule matched with good confidence
    result = ruleResult;
    sourceType = "RULE";
  } else {
    // Step 2: Try AI
    const aiResult = await classifyByAI(rejectionText, snapshotContext);

    if (ruleResult && aiResult) {
      // Hybrid: rule had partial match, AI refined
      result = aiResult.confidence > ruleResult.confidence ? aiResult : ruleResult;
      sourceType = "HYBRID";
    } else if (aiResult) {
      result = aiResult;
      sourceType = "AI_ASSISTED";
    } else if (ruleResult) {
      result = ruleResult;
      sourceType = "RULE";
    } else {
      // Neither matched
      result = {
        category: "OTHER_REVIEW_REQUIRED",
        explanation: "Rejection could not be automatically classified. Manual review required.",
        likelyCause: "Rejection text does not match known patterns.",
        nextSteps: ["Read the rejection notice carefully", "Consult immigration lawyer", "Identify specific grounds for rejection"],
        appealPossible: false,
        confidence: 0,
      };
      sourceType = "RULE";
    }
  }

  // Persist
  const row = await queryOne<RejectionAnalysis>(
    `INSERT INTO rejection_analyses (tenant_id, worker_id, legal_case_id, rejection_text, category, explanation,
      likely_cause, next_steps_json, appeal_possible, confidence_score, source_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [tenantId, workerId, caseId ?? null, rejectionText, result.category, result.explanation,
     result.likelyCause, JSON.stringify(result.nextSteps), result.appealPossible,
     result.confidence, sourceType]
  );

  return {
    id: row!.id,
    category: result.category as RejectionCategory,
    explanation: result.explanation,
    likelyCause: result.likelyCause,
    nextSteps: result.nextSteps,
    appealPossible: result.appealPossible,
    confidence: result.confidence,
    reviewRequired: true,
    sourceType,
  };
}

// ═══ generateRejectionDraft ═════════════════════════════════════════════════

export async function generateRejectionDraft(
  workerId: string,
  analysisId: string,
  tenantId: string,
): Promise<RejectionDraft> {
  const analysis = await queryOne<RejectionAnalysis>(
    "SELECT * FROM rejection_analyses WHERE id = $1 AND tenant_id = $2",
    [analysisId, tenantId]
  );
  if (!analysis) throw new Error("Rejection analysis not found");

  const nextSteps: string[] = Array.isArray(analysis.next_steps_json)
    ? (analysis.next_steps_json as string[])
    : JSON.parse(String(analysis.next_steps_json ?? "[]"));

  // Build draft from structured analysis data
  const draft: RejectionDraft = {
    internalSummary: `Rejection category: ${analysis.category}. ${analysis.explanation} Likely cause: ${analysis.likely_cause ?? "Unknown"}.`,
    suggestedAppealFocus: buildAppealFocus(analysis.category, analysis.likely_cause),
    requiredDocuments: buildRequiredDocs(analysis.category),
    suggestedNextActions: nextSteps.length > 0 ? nextSteps : ["Review rejection notice manually"],
    reviewRequired: true,
  };

  // Store draft on the analysis record
  await execute(
    "UPDATE rejection_analyses SET draft_json = $1, updated_at = NOW() WHERE id = $2",
    [JSON.stringify(draft), analysisId]
  );

  return draft;
}

function buildAppealFocus(category: string, cause: string | null): string {
  switch (category) {
    case "MISSING_DOCS":
      return "Focus on completeness: demonstrate all required documents are now available and submit a corrected package.";
    case "FORMAL_DEFECT":
      return "Focus on correction: address each defect point from the notice and submit corrections within the deadline.";
    case "TIMING_ERROR":
      return "Focus on evidence of timely filing: if filing was on time, provide UPO/MoS stamp evidence. If late, consult lawyer on alternatives.";
    case "EMPLOYER_ERROR":
      return "Focus on employer continuity: confirm current employer matches application, provide updated employer documentation if needed.";
    case "LEGAL_BASIS_PROBLEM":
      return "Focus on eligibility: review whether conditions are actually met, or consider an alternative permit type.";
    default:
      return "Review the rejection notice with an immigration lawyer to identify the specific appeal strategy.";
  }
}

function buildRequiredDocs(category: string): string[] {
  const base = ["Copy of the rejection notice", "Current passport copy"];
  switch (category) {
    case "MISSING_DOCS":
      return [...base, "All documents listed in the rejection", "Updated document checklist"];
    case "FORMAL_DEFECT":
      return [...base, "Corrected application form", "Documents addressing each defect point"];
    case "TIMING_ERROR":
      return [...base, "Filing evidence (UPO, MoS stamp, receipt)", "Permit copy showing expiry date"];
    case "EMPLOYER_ERROR":
      return [...base, "Current employment contract", "Employer NIP verification", "ZUS registration confirmation"];
    case "LEGAL_BASIS_PROBLEM":
      return [...base, "Legal opinion from immigration lawyer", "Supporting evidence for eligibility"];
    default:
      return [...base, "All relevant supporting documents"];
  }
}

// ═══ READ OPERATIONS ════════════════════════════════════════════════════════

export async function getAnalysesByWorker(workerId: string, tenantId: string): Promise<RejectionAnalysis[]> {
  return query<RejectionAnalysis>(
    "SELECT * FROM rejection_analyses WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
    [workerId, tenantId]
  );
}

export async function getAnalysisById(id: string, tenantId: string): Promise<RejectionAnalysis | null> {
  return queryOne<RejectionAnalysis>(
    "SELECT * FROM rejection_analyses WHERE id = $1 AND tenant_id = $2",
    [id, tenantId]
  );
}
