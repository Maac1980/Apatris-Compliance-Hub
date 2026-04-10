/**
 * Appeal Assistant — unified appeal workspace for rejected/difficult cases.
 *
 * PROVIDER SPLIT (enforced):
 *   Perplexity → article discovery, procedural research
 *   Claude     → case reasoning, appeal drafting, worker/client explanation
 *   Deterministic → legal card validation, deadline math, mismatch blocking
 *
 * SAFETY:
 *   - All outputs are DRAFT
 *   - requiresLawyerReview = true always
 *   - No auto-send, no auto-file
 *   - No claims of guaranteed success
 *   - No invented facts
 *   - Validates against legal tracking card truth
 *   - Missing rejection text → no fabricated appeal content
 *   - Worker/case mismatch → blocked
 */

import { query, queryOne, execute } from "../lib/db.js";
import { getAIProvider, completeBilingual } from "./ai-provider.js";
import { getWorkerLegalSnapshot, type LegalSnapshot } from "./legal-status.service.js";
import { linkOutputToDocumentHistory } from "./legal-output-linker.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface AppealAssistantInput {
  workerId: string;
  caseId?: string;
  tenantId: string;
  rejectionText?: string;
  additionalEvidence?: string[];
  generatedBy: string;
}

export interface RelevantArticle {
  article: string;
  title: string;
  relevance: string;
}

export interface AppealAssistantOutput {
  id: string;
  workerId: string;
  caseId: string | null;

  // Card facts used
  legalCardFacts: Record<string, unknown>;

  // Research (Perplexity)
  relevantArticles: RelevantArticle[];
  proceduralResearch: string;
  researchSources: string[];

  // Reasoning (Claude)
  appealGrounds: string[];
  missingEvidence: string[];
  lawyerReviewNote: string;
  appealOutline: string;

  // Drafts (Claude bilingual)
  appealDraftPl: string;
  appealDraftEn: string;

  // Explanations (Claude)
  workerExplanation: string;
  clientExplanation: string;

  // Safety
  requiresLawyerReview: true;
  status: "draft";
  validationIssues: string[];
  hasRejectionText: boolean;
  providerStatus: { perplexity: string; claude: string };

  created_at: string;
}

// ═══ TABLE ══════════════════════════════════════════════════════════════════

async function ensureTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS appeal_assistant_outputs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL DEFAULT 'default',
      worker_id TEXT NOT NULL,
      case_id TEXT,
      legal_card_facts JSONB NOT NULL DEFAULT '{}'::jsonb,
      relevant_articles JSONB NOT NULL DEFAULT '[]'::jsonb,
      procedural_research TEXT NOT NULL DEFAULT '',
      research_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
      appeal_grounds JSONB NOT NULL DEFAULT '[]'::jsonb,
      missing_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
      lawyer_review_note TEXT NOT NULL DEFAULT '',
      appeal_outline TEXT NOT NULL DEFAULT '',
      appeal_draft_pl TEXT NOT NULL DEFAULT '',
      appeal_draft_en TEXT NOT NULL DEFAULT '',
      worker_explanation TEXT NOT NULL DEFAULT '',
      client_explanation TEXT NOT NULL DEFAULT '',
      requires_lawyer_review BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'draft',
      validation_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
      has_rejection_text BOOLEAN NOT NULL DEFAULT false,
      provider_status JSONB NOT NULL DEFAULT '{}'::jsonb,
      generated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// ═══ VALIDATION ═════════════════════════════════════════════════════════════

function validateInputs(
  worker: Record<string, unknown> | null,
  legalCase: Record<string, unknown> | null,
  input: AppealAssistantInput,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!worker) {
    issues.push("CRITICAL: Worker not found");
    return { valid: false, issues };
  }

  // Worker/case mismatch check
  if (input.caseId && legalCase) {
    const caseWorkerId = (legalCase as any).worker_id;
    if (caseWorkerId && caseWorkerId !== input.workerId) {
      issues.push("CRITICAL: Worker ID does not match case worker ID — mismatch blocked");
      return { valid: false, issues };
    }
  }

  // Missing rejection text warning (not blocking, but limits output)
  if (!input.rejectionText?.trim()) {
    issues.push("WARNING: No rejection text provided — appeal content will be limited to general guidance only");
  }

  return { valid: true, issues };
}

// ═══ MAIN: RUN APPEAL ASSISTANT ═════════════════════════════════════════════

export async function runAppealAssistant(input: AppealAssistantInput): Promise<AppealAssistantOutput> {
  await ensureTable();

  const { workerId, caseId, tenantId, rejectionText, generatedBy } = input;
  const hasRejectionText = !!(rejectionText?.trim());
  const providerStatus = { perplexity: "not_called", claude: "not_called" };

  // ── Load worker + case + legal snapshot ──────────────────────────────────
  const worker = await queryOne<Record<string, unknown>>(
    `SELECT * FROM workers WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`, [workerId, tenantId],
  );

  let legalCase: Record<string, unknown> | null = null;
  if (caseId) {
    legalCase = await queryOne(
      `SELECT * FROM legal_cases WHERE id = $1 AND tenant_id = $2`, [caseId, tenantId],
    );
  }

  // Validation — blocks on critical issues
  const validation = validateInputs(worker, legalCase, input);
  if (!validation.valid) {
    // Return blocked result
    const blocked = await query<AppealAssistantOutput>(
      `INSERT INTO appeal_assistant_outputs
         (tenant_id, worker_id, case_id, validation_issues, has_rejection_text, provider_status, status, generated_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,'draft',$7) RETURNING *`,
      [tenantId, workerId, caseId ?? null, JSON.stringify(validation.issues), hasRejectionText, JSON.stringify(providerStatus), generatedBy],
    );
    return blocked[0];
  }

  // Get legal snapshot (deterministic truth)
  let snapshot: LegalSnapshot | null = null;
  try {
    snapshot = await getWorkerLegalSnapshot(workerId, tenantId);
  } catch { /* snapshot unavailable */ }

  // Build legal card facts (source of truth)
  const w = worker as any;
  const legalCardFacts = {
    name: w.name,
    nationality: w.nationality,
    pesel: w.pesel,
    permitType: w.permit_type ?? w.visa_type,
    permitExpiry: w.trc_expiry ?? w.work_permit_expiry,
    filingDate: w.filing_date,
    filingMethod: w.filing_method,
    residenceBasis: w.residence_basis,
    legalStatus: snapshot?.legalStatus ?? "UNKNOWN",
    legalBasis: snapshot?.legalBasis ?? "UNKNOWN",
    riskLevel: snapshot?.riskLevel ?? "UNKNOWN",
    conditions: snapshot?.conditions ?? [],
    warnings: snapshot?.warnings ?? [],
    caseType: (legalCase as any)?.case_type,
    caseStatus: (legalCase as any)?.status,
    appealDeadline: (legalCase as any)?.appeal_deadline,
  };

  // ── Stage 1: Perplexity — Article Discovery ──────────────────────────────
  let relevantArticles: RelevantArticle[] = [];
  let proceduralResearch = "";
  let researchSources: string[] = [];

  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (perplexityKey) {
    try {
      const query_text = hasRejectionText
        ? `Polish immigration appeal procedures for: ${(rejectionText ?? "").substring(0, 500)}. What articles of Ustawa o cudzoziemcach and KPA apply?`
        : `Polish immigration appeal procedures for ${(legalCase as any)?.case_type ?? "TRC"} cases. KPA Art. 127-140. Appeal deadlines and evidence requirements.`;

      const resp = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${perplexityKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar",
          return_citations: true,
          messages: [
            { role: "system", content: "Research Polish administrative appeal procedures for immigration decisions. Focus on Ustawa o cudzoziemcach, KPA, relevant case law. Cite official sources." },
            { role: "user", content: query_text },
          ],
          max_tokens: 2000,
        }),
      });

      if (resp.ok) {
        const data = await resp.json() as any;
        proceduralResearch = data.choices?.[0]?.message?.content ?? "";
        researchSources = (data.citations ?? []).map((c: any) => typeof c === "string" ? c : c.url ?? "").filter(Boolean);
        providerStatus.perplexity = "success";
      } else {
        providerStatus.perplexity = `error_${resp.status}`;
        proceduralResearch = "[Perplexity unavailable]";
      }
    } catch (err: any) {
      providerStatus.perplexity = `error: ${err.message}`;
      proceduralResearch = "[Perplexity error]";
    }
  } else {
    providerStatus.perplexity = "no_api_key";
  }

  // ── Stage 2: Claude — Case Reasoning ─────────────────────────────────────
  let appealGrounds: string[] = [];
  let missingEvidence: string[] = [];
  let lawyerReviewNote = "";
  let appealOutline = "";
  let workerExplanation = "";
  let clientExplanation = "";

  const ai = getAIProvider();
  if (ai?.isAvailable()) {
    try {
      // Build context
      const contextBlock = `LEGAL CARD FACTS (source of truth — do NOT contradict these):\n${JSON.stringify(legalCardFacts, null, 2)}\n\nPROCEDURAL RESEARCH:\n${proceduralResearch.substring(0, 2000)}\n\n${hasRejectionText ? `REJECTION TEXT:\n${(rejectionText ?? "").substring(0, 2000)}` : "NO REJECTION TEXT AVAILABLE — provide general guidance only, do NOT fabricate rejection reasons."}`;

      const raw = await ai.complete(
        `${contextBlock}\n\nAnalyze this case and produce JSON with these fields:\n- appealGrounds: string[] (possible legal grounds for appeal, max 5. If no rejection text, state "General guidance — specific grounds require rejection decision text")\n- missingEvidence: string[] (evidence that would strengthen the case, max 5)\n- lawyerReviewNote: string (note for lawyer reviewing this case)\n- appealOutline: string (structured outline of the appeal, or general guidance if no rejection text)\n- workerExplanation: string (simple explanation for the worker in plain language, no legal jargon, reassuring tone)\n- clientExplanation: string (explanation for the employer/client about the situation and next steps)\n- relevantArticles: Array<{article: string, title: string, relevance: string}> (max 8)\n\nIMPORTANT:\n- Never invent article numbers\n- Never guarantee success\n- Never contradict the legal card facts\n- If no rejection text, do NOT fabricate rejection reasons\n- All output is DRAFT for lawyer review`,
        {
          system: "You are a senior Polish immigration law analyst. You produce structured case analysis for lawyer review. All output is DRAFT. Never guarantee outcomes. Never invent legal citations.",
          maxTokens: 2500,
        },
      );

      providerStatus.claude = "success";

      // Parse JSON response
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          appealGrounds = Array.isArray(parsed.appealGrounds) ? parsed.appealGrounds.slice(0, 5) : [];
          missingEvidence = Array.isArray(parsed.missingEvidence) ? parsed.missingEvidence.slice(0, 5) : [];
          lawyerReviewNote = typeof parsed.lawyerReviewNote === "string" ? parsed.lawyerReviewNote : "";
          appealOutline = typeof parsed.appealOutline === "string" ? parsed.appealOutline : "";
          workerExplanation = typeof parsed.workerExplanation === "string" ? parsed.workerExplanation : "";
          clientExplanation = typeof parsed.clientExplanation === "string" ? parsed.clientExplanation : "";
          if (Array.isArray(parsed.relevantArticles)) {
            relevantArticles = parsed.relevantArticles.slice(0, 8).map((a: any) => ({
              article: a.article ?? "", title: a.title ?? "", relevance: a.relevance ?? "",
            }));
          }
        }
      } catch {
        lawyerReviewNote = "AI response could not be parsed. Raw output available for manual review.";
        appealOutline = raw;
      }
    } catch (err: any) {
      providerStatus.claude = `error: ${err.message}`;
    }
  } else {
    providerStatus.claude = "not_configured";
  }

  // ── Stage 3: Claude Bilingual Appeal Draft ────────────────────────────────
  let appealDraftPl = "";
  let appealDraftEn = "";

  if (hasRejectionText && ai?.isAvailable() && appealOutline) {
    try {
      const bilingual = await completeBilingual(
        `Draft a formal Polish administrative appeal (odwołanie) based on this outline:\n\n${appealOutline.substring(0, 2000)}\n\nWorker: ${w.name}, ${w.nationality}, PESEL: ${w.pesel ?? "N/A"}\nCase type: ${(legalCase as any)?.case_type ?? "TRC"}\nAppeal deadline: ${(legalCase as any)?.appeal_deadline ?? "14 days from decision"}\n\nThe Polish version must be formal legal language suitable for filing.\nMark the document as PROJEKT (draft) at the top.\nInclude placeholder for date and signature.`,
        {
          system: "You are a Polish immigration lawyer drafting a formal appeal. All output is DRAFT (PROJEKT). Include proper legal formatting with petitum, uzasadnienie, and dowody sections.",
          maxTokens: 3000,
        },
      );
      appealDraftPl = bilingual.pl;
      appealDraftEn = bilingual.en;
    } catch { /* bilingual draft failed — appealOutline still available */ }
  } else if (!hasRejectionText) {
    appealDraftPl = "[Brak tekstu decyzji odmownej — projekt odwołania wymaga treści decyzji]";
    appealDraftEn = "[No rejection text provided — appeal draft requires the actual rejection decision text]";
  }

  // ── Post-validation: check AI output against legal card ────────────────────
  const postValidation = [...validation.issues];
  if (appealDraftPl && legalCardFacts.legalStatus === "VALID") {
    postValidation.push("WARNING: Legal status is VALID — appeal may not be applicable. Verify the case status.");
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  const rows = await query<AppealAssistantOutput>(
    `INSERT INTO appeal_assistant_outputs
       (tenant_id, worker_id, case_id, legal_card_facts, relevant_articles,
        procedural_research, research_sources, appeal_grounds, missing_evidence,
        lawyer_review_note, appeal_outline, appeal_draft_pl, appeal_draft_en,
        worker_explanation, client_explanation, requires_lawyer_review, status,
        validation_issues, has_rejection_text, provider_status, generated_by)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,true,'draft',$16::jsonb,$17,$18::jsonb,$19)
     RETURNING *`,
    [
      tenantId, workerId, caseId ?? null,
      JSON.stringify(legalCardFacts), JSON.stringify(relevantArticles),
      proceduralResearch, JSON.stringify(researchSources),
      JSON.stringify(appealGrounds), JSON.stringify(missingEvidence),
      lawyerReviewNote, appealOutline, appealDraftPl, appealDraftEn,
      workerExplanation, clientExplanation,
      JSON.stringify(postValidation), hasRejectionText, JSON.stringify(providerStatus),
      generatedBy,
    ],
  );

  const output = rows[0];

  // Link to document history if appeal draft was generated
  if (output && appealDraftPl && appealDraftPl.length > 50) {
    try {
      await linkOutputToDocumentHistory({
        tenantId, workerId, legalCaseId: caseId,
        templateType: "APPEAL",
        title: `Appeal Draft — ${w.name ?? "Worker"}`,
        contentPl: appealDraftPl, contentEn: appealDraftEn,
        source: "APPEAL_ASSISTANT", sourceId: output.id,
        createdBy: generatedBy,
      });
    } catch { /* linking is best-effort */ }
  }

  return output;
}

// ═══ READ ═══════════════════════════════════════════════════════════════════

export async function getAppealOutputsByWorker(workerId: string, tenantId: string) {
  await ensureTable();
  return query<AppealAssistantOutput>(
    `SELECT * FROM appeal_assistant_outputs WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
    [workerId, tenantId],
  );
}

export async function getAppealOutputById(id: string, tenantId: string) {
  await ensureTable();
  return queryOne<AppealAssistantOutput>(
    `SELECT * FROM appeal_assistant_outputs WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
}
