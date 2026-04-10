/**
 * Legal Intelligence Service — Apatris
 *
 * Deep AI-powered legal research connected to individual worker cases.
 * Uses Perplexity for real-time Polish law research + Claude for analysis.
 *
 * Features:
 *  1. Case Research — Perplexity researches specific case issues, Claude structures findings
 *  2. Appeal Assistant — builds appeal with grounds, articles, PL/EN drafts
 *  3. POA Generator — formal Polish power of attorney documents
 *  4. Authority Drafting — letters to voivodeship offices, Szef UdSC
 *  5. Legal Reasoning — explains AI's reasoning for legal status determination
 *
 * All outputs are DRAFT. No auto-send, no auto-file, no auto-approve.
 * Legal snapshot remains source of truth.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { getWorkerLegalSnapshot, type LegalSnapshot } from "./legal-status.service.js";
import { checkAIRateLimit } from "../lib/ai-rate-limiter.js";

// ═══ AI HELPERS ═════════════════════════════════════════════════════════════

async function callPerplexity(system: string, userQuery: string, tenantId: string): Promise<{ answer: string; sources: string[] }> {
  const apiKey = process.env.PPLX_API_KEY;
  const limit = checkAIRateLimit(tenantId, "perplexity");
  if (!apiKey || !limit.allowed) return { answer: apiKey ? "[Rate limit reached]" : "[Perplexity not configured]", sources: [] };

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "sonar-pro", return_citations: true, max_tokens: 2000, messages: [{ role: "system", content: system }, { role: "user", content: userQuery }] }),
    });
    if (!res.ok) return { answer: `[Perplexity ${res.status}]`, sources: [] };
    const data = await res.json() as any;
    return {
      answer: data.choices?.[0]?.message?.content ?? "",
      sources: (data.citations ?? []).map((c: any) => typeof c === "string" ? c : c.url ?? "").filter(Boolean),
    };
  } catch (err: any) { return { answer: `[Error: ${err.message}]`, sources: [] }; }
}

async function callClaude(prompt: string, system: string, maxTokens = 2000): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "[AI not configured]";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return `[AI error ${res.status}]`;
    const data = await res.json() as any;
    return data.content?.find((b: any) => b.type === "text")?.text ?? "";
  } catch (err: any) { return `[AI error: ${err.message}]`; }
}

// ═══ DB TABLES ══════════════════════════════════════════════════════════════

export async function ensureLegalIntelligenceTables(): Promise<void> {
  await execute(`CREATE TABLE IF NOT EXISTS research_memos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
    title TEXT NOT NULL, memo_type TEXT NOT NULL DEFAULT 'legal_research',
    prompt TEXT NOT NULL, perplexity_answer TEXT DEFAULT '', sources JSONB DEFAULT '[]'::jsonb,
    summary TEXT DEFAULT '', action_items JSONB DEFAULT '[]'::jsonb,
    linked_worker_id UUID, linked_case_id UUID, owner TEXT DEFAULT '',
    status TEXT DEFAULT 'draft', created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await execute(`CREATE TABLE IF NOT EXISTS appeal_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
    worker_id UUID NOT NULL, case_id UUID,
    rejection_text TEXT, appeal_draft_pl TEXT DEFAULT '', appeal_draft_en TEXT DEFAULT '',
    worker_explanation TEXT DEFAULT '', client_explanation TEXT DEFAULT '',
    appeal_grounds JSONB DEFAULT '[]'::jsonb, missing_evidence JSONB DEFAULT '[]'::jsonb,
    relevant_articles JSONB DEFAULT '[]'::jsonb, lawyer_note TEXT DEFAULT '',
    research_sources JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'draft', provider_status JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await execute(`CREATE TABLE IF NOT EXISTS poa_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
    worker_id UUID NOT NULL, case_id UUID,
    poa_type TEXT NOT NULL, content_pl TEXT NOT NULL, representative_name TEXT NOT NULL,
    status TEXT DEFAULT 'draft', created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await execute(`CREATE TABLE IF NOT EXISTS authority_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
    worker_id UUID NOT NULL, case_id UUID,
    draft_type TEXT NOT NULL, authority_name TEXT, content_pl TEXT DEFAULT '', content_en TEXT DEFAULT '',
    status TEXT DEFAULT 'draft', created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

// ═══ 1. CASE RESEARCH ══════════════════════════════════════════════════════

export async function researchCase(
  workerId: string, tenantId: string, title: string, prompt: string, owner: string, caseId?: string,
): Promise<any> {
  await ensureLegalIntelligenceTables();

  const worker = await queryOne<any>("SELECT id, full_name, nationality, trc_expiry, work_permit_expiry, specialization FROM workers WHERE id = $1 AND tenant_id = $2", [workerId, tenantId]);
  if (!worker) throw new Error("Worker not found");

  let snapshot: LegalSnapshot | null = null;
  try { snapshot = await getWorkerLegalSnapshot(workerId, tenantId); } catch {}

  // Perplexity: deep research with case context
  const contextQuery = `${prompt}\n\nContext: Worker ${worker.full_name}, nationality ${worker.nationality ?? "unknown"}, TRC expiry ${worker.trc_expiry ?? "N/A"}, legal status ${snapshot?.legalStatus ?? "unknown"}.`;

  const perp = await callPerplexity(
    "Research Polish immigration and employment law. Focus on 2025-2026 changes. Cite official sources from isap.sejm.gov.pl, cudzoziemcy.gov.pl, udsc.gov.pl. Be specific about applicable articles and procedures.",
    contextQuery, tenantId
  );

  // Claude: structure into actionable memo
  const summary = await callClaude(
    `Analyze this research for a specific immigration case:\n\nResearch:\n${perp.answer.substring(0, 3000)}\n\nWorker: ${worker.full_name} (${worker.nationality ?? "N/A"})\nLegal status: ${snapshot?.legalStatus ?? "unknown"}\nTRC expiry: ${worker.trc_expiry ?? "N/A"}\n\nCreate:\n1. CASE IMPACT — how does this research affect THIS specific worker's case?\n2. APPLICABLE ARTICLES — which legal provisions apply?\n3. RECOMMENDED ACTIONS — what should the team do for this worker?\n4. RISKS — what could go wrong?\n5. TIMELINE — any deadlines?\n\nBe specific to this case. No general advice.`,
    "You are a Polish immigration law analyst reviewing research for a specific case. All output is DRAFT for lawyer review. Never guarantee outcomes."
  );

  // Extract action items
  const actionItems: string[] = [];
  const actionMatch = summary.match(/RECOMMENDED ACTIONS[\s\S]*?(?=\n\n[A-Z]|RISKS|TIMELINE|$)/i);
  if (actionMatch) {
    actionMatch[0].split("\n").filter(l => l.trim().startsWith("-") || l.trim().startsWith("•") || /^\d+\./.test(l.trim()))
      .forEach(l => actionItems.push(l.replace(/^[-•\d.]\s*/, "").trim()));
  }

  const row = await queryOne<any>(
    `INSERT INTO research_memos (tenant_id, title, memo_type, prompt, perplexity_answer, sources, summary, action_items, linked_worker_id, linked_case_id, owner)
     VALUES ($1,$2,'legal_research',$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10) RETURNING *`,
    [tenantId, title, prompt, perp.answer, JSON.stringify(perp.sources), summary, JSON.stringify(actionItems), workerId, caseId ?? null, owner]
  );

  return { memo: row, providerStatus: { perplexity: perp.answer.startsWith("[") ? "error" : "success", claude: summary.startsWith("[") ? "error" : "success" } };
}

// ═══ 2. APPEAL ASSISTANT ════════════════════════════════════════════════════

export async function buildAppeal(
  workerId: string, tenantId: string, rejectionText?: string, caseId?: string,
): Promise<any> {
  await ensureLegalIntelligenceTables();

  const worker = await queryOne<any>("SELECT * FROM workers WHERE id = $1 AND tenant_id = $2", [workerId, tenantId]);
  if (!worker) throw new Error("Worker not found");

  let snapshot: LegalSnapshot | null = null;
  try { snapshot = await getWorkerLegalSnapshot(workerId, tenantId); } catch {}

  // Load existing rejection if no text provided
  if (!rejectionText) {
    const existing = await queryOne<any>("SELECT rejection_text FROM rejection_analyses WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1", [workerId, tenantId]);
    rejectionText = existing?.rejection_text ?? "";
  }

  const hasRejection = !!(rejectionText?.trim());
  const providerStatus = { perplexity: "not_called" as string, claude: "not_called" as string };

  // Perplexity: research appeal procedures for this specific rejection
  const perp = await callPerplexity(
    "Research Polish administrative appeal procedures for immigration decisions. Focus on KPA Art. 127, Art. 108 continuity, voivodeship appeal routes, Szef UdSC procedures. Cite official sources.",
    hasRejection ? `Appeal procedures for rejection: ${rejectionText!.substring(0, 800)}. Worker nationality: ${worker.nationality ?? "unknown"}.` : "General TRC appeal procedures under KPA Art. 127",
    tenantId
  );
  providerStatus.perplexity = perp.answer.startsWith("[") ? "error" : "success";

  // Claude: full appeal analysis
  const context = `Worker: ${worker.full_name}, ${worker.nationality ?? "N/A"}\nPESEL: ${worker.pesel ?? "N/A"}\nTRC expiry: ${worker.trc_expiry ?? "N/A"}\nLegal status: ${snapshot?.legalStatus ?? "unknown"}\nLegal basis: ${snapshot?.legalBasis ?? "unknown"}\n${hasRejection ? `Rejection text:\n${rejectionText!.substring(0, 2000)}` : "No rejection text available."}\n\nPerplexity research:\n${perp.answer.substring(0, 2000)}`;

  const aiRaw = await callClaude(
    `${context}\n\nAnalyze this case and return ONLY valid JSON:\n{\n  "appealGrounds": ["ground 1", "ground 2"],\n  "missingEvidence": ["doc 1", "doc 2"],\n  "relevantArticles": [{"article":"Art. X","law":"...","relevance":"why it applies"}],\n  "lawyerNote": "internal note for lawyer",\n  "workerExplanation": "simple explanation for worker — no legal jargon",\n  "clientExplanation": "employer-facing status update",\n  "appealOutline": "structured outline of the appeal argument"\n}`,
    "You are a Polish immigration law analyst. DRAFT only. Never guarantee success. Never invent article numbers. Use only articles from the research provided.", 3000
  );
  providerStatus.claude = aiRaw.startsWith("[") ? "error" : "success";

  let appealGrounds: string[] = [], missingEvidence: string[] = [], relevantArticles: any[] = [];
  let lawyerNote = "", workerExplanation = "", clientExplanation = "";
  let appealDraftPl = "", appealDraftEn = "";

  try {
    const jsonMatch = aiRaw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      appealGrounds = parsed.appealGrounds?.slice(0, 6) ?? [];
      missingEvidence = parsed.missingEvidence?.slice(0, 6) ?? [];
      relevantArticles = parsed.relevantArticles?.slice(0, 10) ?? [];
      lawyerNote = String(parsed.lawyerNote ?? "");
      workerExplanation = String(parsed.workerExplanation ?? "");
      clientExplanation = String(parsed.clientExplanation ?? "");

      // Generate full Polish appeal draft
      if (hasRejection && parsed.appealOutline) {
        appealDraftPl = await callClaude(
          `Draft a COMPLETE formal Polish appeal (odwołanie) based on:\n${parsed.appealOutline}\nWorker: ${worker.full_name}, ${worker.nationality ?? ""}\nPESEL: ${worker.pesel ?? "___"}\n\nAppeal grounds: ${appealGrounds.join("; ")}\nRelevant articles: ${relevantArticles.map((a: any) => a.article).join(", ")}\n\nInclude: header, legal basis, arguments addressing each rejection reason, evidence list, petitum. Mark as PROJEKT.`,
          "Draft formal Polish administrative appeal (odwołanie). PROJEKT only. Use proper Polish legal format.", 3000
        );

        // English translation
        if (appealDraftPl && !appealDraftPl.startsWith("[")) {
          appealDraftEn = await callClaude(
            `Translate this Polish legal appeal to formal English. Preserve ALL article references and legal meaning:\n\n${appealDraftPl.substring(0, 4000)}`,
            "Translate Polish legal text to formal English. Preserve all article references. For internal use only.", 3000
          );
        }
      }
    }
  } catch { /* parse failed */ }

  const row = await queryOne<any>(
    `INSERT INTO appeal_outputs (tenant_id, worker_id, case_id, rejection_text, appeal_draft_pl, appeal_draft_en,
      worker_explanation, client_explanation, appeal_grounds, missing_evidence, relevant_articles, lawyer_note, research_sources, provider_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::jsonb,$14::jsonb) RETURNING *`,
    [tenantId, workerId, caseId ?? null, rejectionText ?? null, appealDraftPl, appealDraftEn,
     workerExplanation, clientExplanation, JSON.stringify(appealGrounds), JSON.stringify(missingEvidence),
     JSON.stringify(relevantArticles), lawyerNote, JSON.stringify(perp.sources), JSON.stringify(providerStatus)]
  );

  return { output: row };
}

// ═══ 3. POA GENERATOR ══════════════════════════════════════════════════════

const POA_SCOPES: Record<string, string> = {
  GENERAL: "do reprezentowania mnie przed organami administracji publicznej Rzeczypospolitej Polskiej",
  TRC_PROCEEDINGS: "do reprezentowania mnie w postępowaniu dotyczącym zezwolenia na pobyt czasowy i pracę, prowadzonym przez Wojewodę",
  APPEAL: "do reprezentowania mnie w postępowaniu odwoławczym od decyzji w sprawie cudzoziemców, w tym do wniesienia odwołania do Szefa Urzędu do Spraw Cudzoziemców",
  FILE_INSPECTION: "do wglądu do akt sprawy prowadzonej w Urzędzie Wojewódzkim, dotyczącej mojego wniosku o zezwolenie na pobyt",
  WORK_PERMIT: "do reprezentowania mnie w postępowaniu dotyczącym zezwolenia na pracę cudzoziemca",
};

export async function generatePOA(
  workerId: string, tenantId: string, representativeName: string, poaType: string, caseId?: string,
): Promise<any> {
  await ensureLegalIntelligenceTables();

  const worker = await queryOne<any>("SELECT full_name, pesel, passport_number FROM workers WHERE id = $1 AND tenant_id = $2", [workerId, tenantId]);
  if (!worker) throw new Error("Worker not found");

  const today = new Date();
  const dateStr = `${today.getDate().toString().padStart(2, "0")}.${(today.getMonth() + 1).toString().padStart(2, "0")}.${today.getFullYear()}`;
  const scope = POA_SCOPES[poaType] ?? POA_SCOPES.GENERAL;

  const content = `PEŁNOMOCNICTWO\n(PROJEKT — wymaga podpisu)\n\nMiejscowość: Warszawa\nData: ${dateStr}\n\nJa, niżej podpisany/a:\n   Imię i nazwisko: ${worker.full_name}\n   PESEL: ${worker.pesel ?? "_______________"}\n   Nr paszportu: ${worker.passport_number ?? "_______________"}\n\nniniejszym udzielam pełnomocnictwa:\n   ${representativeName}\n\n${scope}.\n\nPełnomocnictwo obejmuje prawo do składania wszelkich oświadczeń woli, wniosków, odwołań oraz odbioru korespondencji w moim imieniu.\n\n\n_________________________________\nPodpis mocodawcy (czytelny)`;

  const row = await queryOne<any>(
    `INSERT INTO poa_documents (tenant_id, worker_id, case_id, poa_type, content_pl, representative_name)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenantId, workerId, caseId ?? null, poaType, content, representativeName]
  );

  return { poa: row };
}

// ═══ 4. AUTHORITY DRAFTING ══════════════════════════════════════════════════

export async function draftAuthorityLetter(
  workerId: string, tenantId: string, draftType: string, specificIssue: string, authorityName?: string, caseId?: string,
): Promise<any> {
  await ensureLegalIntelligenceTables();

  const worker = await queryOne<any>("SELECT full_name, nationality, pesel, trc_expiry FROM workers WHERE id = $1 AND tenant_id = $2", [workerId, tenantId]);
  if (!worker) throw new Error("Worker not found");

  let snapshot: LegalSnapshot | null = null;
  try { snapshot = await getWorkerLegalSnapshot(workerId, tenantId); } catch {}

  const authority = authorityName ?? "Wojewoda Mazowiecki";

  const contentPl = await callClaude(
    `Draft formal Polish letter to ${authority} regarding: ${specificIssue}\n\nWorker: ${worker.full_name}, nationality: ${worker.nationality ?? "N/A"}, PESEL: ${worker.pesel ?? "N/A"}\nTRC expiry: ${worker.trc_expiry ?? "N/A"}\nLegal status: ${snapshot?.legalStatus ?? "unknown"}\n\nInclude proper formal structure: addressee, reference, subject, body, closing. Mark as PROJEKT.`,
    "Draft formal Polish administrative correspondence. PROJEKT only. Proper KPA-compliant format.", 2000
  );

  let contentEn = "";
  if (contentPl && !contentPl.startsWith("[")) {
    contentEn = await callClaude(
      `Translate this Polish official letter to English preserving meaning:\n\n${contentPl.substring(0, 3000)}`,
      "Translate Polish administrative correspondence to English. For internal reference.", 1500
    );
  }

  const row = await queryOne<any>(
    `INSERT INTO authority_drafts (tenant_id, worker_id, case_id, draft_type, authority_name, content_pl, content_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tenantId, workerId, caseId ?? null, draftType, authority, contentPl, contentEn]
  );

  return { draft: row };
}

// ═══ 5. LEGAL REASONING ════════════════════════════════════════════════════

export async function explainLegalReasoning(workerId: string, tenantId: string): Promise<any> {
  const worker = await queryOne<any>("SELECT full_name, nationality, trc_expiry, work_permit_expiry FROM workers WHERE id = $1 AND tenant_id = $2", [workerId, tenantId]);
  if (!worker) throw new Error("Worker not found");

  let snapshot: LegalSnapshot | null = null;
  try { snapshot = await getWorkerLegalSnapshot(workerId, tenantId); } catch {}
  if (!snapshot) return { reasoning: "Legal snapshot unavailable — cannot explain reasoning" };

  const reasoning = await callClaude(
    `Explain the legal reasoning behind this worker's status determination.\n\nWorker: ${worker.full_name}, ${worker.nationality ?? "N/A"}\nTRC expiry: ${worker.trc_expiry ?? "N/A"}\nWork permit expiry: ${worker.work_permit_expiry ?? "N/A"}\n\nLegal status: ${snapshot.legalStatus}\nLegal basis: ${snapshot.legalBasis}\nRisk level: ${snapshot.riskLevel}\nProtection flag: ${snapshot.legalProtectionFlag}\nTRC submitted: ${snapshot.trcApplicationSubmitted}\nSame employer: ${snapshot.sameEmployerFlag}\nWarnings: ${snapshot.warnings.join("; ")}\nRequired actions: ${snapshot.requiredActions.join("; ")}\n\nExplain:\n1. WHY this status was assigned (which rules triggered)\n2. WHAT legal articles apply\n3. WHAT would change the status (better or worse)\n4. WHAT the team should watch for\n\nReturn as JSON: { "statusExplanation": "", "applicableArticles": [{"article":"","why":""}], "whatCouldChange": [{"scenario":"","newStatus":""}], "watchList": [""] }`,
    "You are explaining legal engine decisions. Be specific about which rules fired. DRAFT for internal review."
  );

  try {
    const jsonMatch = reasoning.match(/\{[\s\S]*\}/);
    if (jsonMatch) return { reasoning: JSON.parse(jsonMatch[0]), snapshot: { status: snapshot.legalStatus, basis: snapshot.legalBasis, risk: snapshot.riskLevel } };
  } catch {}

  return { reasoning: { statusExplanation: reasoning }, snapshot: { status: snapshot.legalStatus, basis: snapshot.legalBasis, risk: snapshot.riskLevel } };
}

// ═══ READ OPERATIONS ════════════════════════════════════════════════════════

export async function getResearchMemos(tenantId: string, workerId?: string): Promise<any[]> {
  await ensureLegalIntelligenceTables();
  if (workerId) return query("SELECT * FROM research_memos WHERE tenant_id = $1 AND linked_worker_id = $2 ORDER BY created_at DESC", [tenantId, workerId]);
  return query("SELECT * FROM research_memos WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 30", [tenantId]);
}

export async function getAppealOutputs(tenantId: string, workerId: string): Promise<any[]> {
  await ensureLegalIntelligenceTables();
  return query("SELECT * FROM appeal_outputs WHERE tenant_id = $1 AND worker_id = $2 ORDER BY created_at DESC", [tenantId, workerId]);
}

export async function getPOADocuments(tenantId: string, workerId: string): Promise<any[]> {
  await ensureLegalIntelligenceTables();
  return query("SELECT * FROM poa_documents WHERE tenant_id = $1 AND worker_id = $2 ORDER BY created_at DESC", [tenantId, workerId]);
}

export async function getAuthorityDrafts(tenantId: string, workerId: string): Promise<any[]> {
  await ensureLegalIntelligenceTables();
  return query("SELECT * FROM authority_drafts WHERE tenant_id = $1 AND worker_id = $2 ORDER BY created_at DESC", [tenantId, workerId]);
}
