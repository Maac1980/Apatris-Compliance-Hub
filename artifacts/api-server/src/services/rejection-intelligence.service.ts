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

// ═══ AI APPEAL LETTER GENERATOR ═════════════════════════════════════════════

export interface AppealLetter {
  appealText: string;
  appealTextPL: string;
  legalBasis: string[];
  arguments: string[];
  evidenceRequired: string[];
  deadlineDate: string | null;
  reviewRequired: true;
}

export async function generateAppealLetter(
  workerId: string,
  analysisId: string,
  tenantId: string,
): Promise<AppealLetter> {
  // 1. Load the analysis
  const analysis = await queryOne<RejectionAnalysis>(
    "SELECT * FROM rejection_analyses WHERE id = $1 AND tenant_id = $2",
    [analysisId, tenantId]
  );
  if (!analysis) throw new Error("Rejection analysis not found");

  // 2. Load worker data
  const worker = await queryOne<any>(
    `SELECT id, full_name, pesel, email, phone,
            trc_expiry, work_permit_expiry, specialization, assigned_site
     FROM workers WHERE id = $1 AND tenant_id = $2`,
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");

  // 3. Load legal snapshot context
  let snapshotContext = "No legal snapshot available";
  try {
    const snap = await getWorkerLegalSnapshot(workerId, tenantId);
    snapshotContext = `Legal status: ${snap.legalStatus}, Basis: ${snap.legalBasis}, Risk: ${snap.riskLevel}`;
  } catch { /* non-blocking */ }

  // 4. Calculate deadline (14 days from decision date if available)
  let deadlineDate: string | null = null;
  const dateMatch = analysis.rejection_text.match(/(\d{1,2})[.\s/](marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia|stycznia|lutego|\d{1,2})[.\s/](\d{4})/i);
  if (dateMatch) {
    const monthMap: Record<string, number> = {
      stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
      lipca: 7, sierpnia: 8, września: 9, października: 10, listopada: 11, grudnia: 12,
    };
    const day = parseInt(dateMatch[1]);
    const monthStr = dateMatch[2].toLowerCase();
    const month = monthMap[monthStr] ?? parseInt(monthStr);
    const year = parseInt(dateMatch[3]);
    if (day && month && year) {
      const decisionDate = new Date(year, month - 1, day);
      decisionDate.setDate(decisionDate.getDate() + 14);
      deadlineDate = decisionDate.toISOString().slice(0, 10);
    }
  }

  // 5. Call AI to generate the full appeal letter
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI not configured — cannot generate appeal letter");

  // Extract nationality from the rejection text itself (AI classified it)
  const nationalityMatch = analysis.rejection_text.match(/obywatel(?:k[ąi]|em?)\s+(\w+)/i);
  const extractedNationality = nationalityMatch?.[1] ?? null;

  const workerInfo = [
    `Name: ${worker.full_name ?? "Unknown"}`,
    extractedNationality ? `Nationality (from decision): ${extractedNationality}` : null,
    worker.pesel ? `PESEL: ${worker.pesel}` : null,
    worker.specialization ? `Specialization: ${worker.specialization}` : null,
    worker.assigned_site ? `Assigned site: ${worker.assigned_site}` : null,
    worker.trc_expiry ? `TRC expiry: ${worker.trc_expiry}` : null,
    worker.work_permit_expiry ? `Work permit expiry: ${worker.work_permit_expiry}` : null,
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: `You are an expert Polish immigration lawyer drafting appeal letters (odwołanie) against negative decisions from Polish Voivodes (Wojewoda) to the Head of Office for Foreigners (Szef Urzędu do Spraw Cudzoziemców).

You MUST:
- Write a COMPLETE, formal appeal letter in Polish legal format
- Include proper legal headings, references to specific articles of Ustawa o cudzoziemcach
- Address each rejection reason with specific counter-arguments
- Reference applicable EU directives and Polish administrative procedure (KPA)
- Include a request section (petitum) asking to overturn the decision
- Be factually accurate about Polish immigration law as of 2026

Format the appeal as a real legal document that a lawyer can review and file.

You must also return a JSON section with structured metadata.

CRITICAL: This is a DRAFT for lawyer review. Mark it clearly as PROJEKT/DRAFT.`,
      messages: [{
        role: "user",
        content: `Generate a complete appeal letter (odwołanie) for this case.

REJECTION DECISION TEXT:
"${analysis.rejection_text}"

CLASSIFICATION: ${analysis.category}
EXPLANATION: ${analysis.explanation}
LIKELY CAUSE: ${analysis.likely_cause ?? "Unknown"}
APPEAL POSSIBLE: ${analysis.appeal_possible}

WORKER INFO:
${workerInfo}

LEGAL CONTEXT:
${snapshotContext}

${deadlineDate ? `DEADLINE: Appeal must be filed by ${deadlineDate} (14 days from decision)` : ""}

Please return your response in this exact format:

---APPEAL_PL---
[Full appeal letter in Polish - complete legal document]
---END_APPEAL_PL---

---APPEAL_EN---
[English translation of the appeal for internal reference]
---END_APPEAL_EN---

---METADATA---
{
  "legalBasis": ["Art. X Ustawy...", ...],
  "arguments": ["Argument 1...", ...],
  "evidenceRequired": ["Document 1...", ...]
}
---END_METADATA---`,
      }],
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`AI appeal generation failed: ${(errData as any).error?.message ?? res.statusText}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const raw = data.content?.find(b => b.type === "text")?.text ?? "";

  // Parse the structured response
  const plMatch = raw.match(/---APPEAL_PL---\s*([\s\S]*?)\s*---END_APPEAL_PL---/);
  const enMatch = raw.match(/---APPEAL_EN---\s*([\s\S]*?)\s*---END_APPEAL_EN---/);
  const metaMatch = raw.match(/---METADATA---\s*([\s\S]*?)\s*---END_METADATA---/);

  const appealTextPL = plMatch?.[1]?.trim() ?? raw;
  const appealText = enMatch?.[1]?.trim() ?? "See Polish version";

  let legalBasis: string[] = [];
  let arguments_: string[] = [];
  let evidenceRequired: string[] = [];

  if (metaMatch) {
    try {
      const jsonStr = metaMatch[1].match(/\{[\s\S]*\}/)?.[0] ?? "{}";
      const meta = JSON.parse(jsonStr);
      legalBasis = Array.isArray(meta.legalBasis) ? meta.legalBasis.map(String) : [];
      arguments_ = Array.isArray(meta.arguments) ? meta.arguments.map(String) : [];
      evidenceRequired = Array.isArray(meta.evidenceRequired) ? meta.evidenceRequired.map(String) : [];
    } catch { /* parse error — non-blocking */ }
  }

  const appeal: AppealLetter = {
    appealText,
    appealTextPL,
    legalBasis,
    arguments: arguments_,
    evidenceRequired,
    deadlineDate,
    reviewRequired: true,
  };

  // Store appeal on the analysis record
  await execute(
    "UPDATE rejection_analyses SET draft_json = $1, updated_at = NOW() WHERE id = $2",
    [JSON.stringify(appeal), analysisId]
  );

  return appeal;
}
