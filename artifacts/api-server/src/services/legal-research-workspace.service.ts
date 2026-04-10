/**
 * Legal Research Workspace — Perplexity-powered research memos.
 *
 * PROVIDER SPLIT (enforced):
 *   Perplexity → cited legal/procedural research, article discovery
 *   Claude     → structured summaries, action items, case reasoning
 *   Deterministic → validation, card truth, deadline math
 *
 * Each memo: title, owner, prompt, cited answer, sources,
 *            summary, action items, linked worker/case/employer, status.
 *
 * Safety: no legal decisions, no status changes, DRAFT only.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { getAIProvider } from "./ai-provider.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type MemoType =
  | "legal_research"
  | "appeal_support"
  | "employer_compliance"
  | "trc_requirements"
  | "sector_labor_intel"
  | "procedural_guide"
  | "custom";

export type MemoStatus = "draft" | "in_review" | "approved" | "archived";

export interface ResearchMemo {
  id: string;
  tenant_id: string;
  title: string;
  memo_type: MemoType;
  prompt: string;
  perplexity_answer: string;
  sources: string[];
  summary: string;
  action_items: string[];
  owner: string;
  linked_worker_id: string | null;
  linked_case_id: string | null;
  linked_employer: string | null;
  linked_city: string | null;
  status: MemoStatus;
  requires_review: boolean;
  created_at: string;
  updated_at: string;
}

// ═══ SYSTEM PROMPTS PER MEMO TYPE ═══════════════════════════════════════════

const PERPLEXITY_PROMPTS: Record<MemoType, string> = {
  legal_research:
    "Research Polish immigration and employment law on this topic. Focus on applicable articles from Ustawa o cudzoziemcach, Kodeks pracy, KPA. Include processing times, requirements, recent changes. Cite isap.sejm.gov.pl, cudzoziemcy.gov.pl, praca.gov.pl.",
  appeal_support:
    "Research Polish administrative appeal procedures for immigration decisions. Focus on KPA Art. 127-140, appeal deadlines, required evidence, relevant case law. Cite official sources.",
  employer_compliance:
    "Research Polish employer obligations for hiring foreign workers. Include: notification duties, contract requirements, ZUS registration, PIP inspection readiness, penalties. Cite praca.gov.pl, pip.gov.pl, zus.pl.",
  trc_requirements:
    "Research current TRC (Temporary Residence Card / Karta Pobytu) requirements in Poland. Include: required documents, processing times, fees, Art. 108 sticker, voivodeship differences. Cite cudzoziemcy.gov.pl, gov.pl.",
  sector_labor_intel:
    "Research the labour market for this sector/city in Poland. Include: worker availability, salary ranges, competing demand, relevant regulations, hiring challenges. Cite pracuj.pl, GUS data, regional labour offices.",
  procedural_guide:
    "Research the step-by-step administrative procedure for this process in Poland. Include: forms needed, authorities involved, timelines, common pitfalls, costs. Cite official government sources.",
  custom:
    "Research the following topic thoroughly in the context of Polish immigration and labour law. Provide cited findings with source URLs.",
};

const CLAUDE_SUMMARY_SYSTEM =
  "You are a senior Polish immigration law analyst for a staffing agency. Create structured, actionable memos. Never invent legal articles. Never guarantee outcomes. All output is DRAFT for review.";

// ═══ TABLE CREATION ═════════════════════════════════════════════════════════

export async function ensureResearchMemosTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS research_memos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL DEFAULT 'default',
      title TEXT NOT NULL,
      memo_type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      perplexity_answer TEXT NOT NULL DEFAULT '',
      sources JSONB NOT NULL DEFAULT '[]'::jsonb,
      summary TEXT NOT NULL DEFAULT '',
      action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      owner TEXT NOT NULL DEFAULT '',
      linked_worker_id TEXT,
      linked_case_id TEXT,
      linked_employer TEXT,
      linked_city TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      requires_review BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// ═══ CORE: CREATE MEMO ══════════════════════════════════════════════════════

export interface CreateMemoInput {
  tenantId: string;
  title: string;
  memoType: MemoType;
  prompt: string;
  owner: string;
  linkedWorkerId?: string;
  linkedCaseId?: string;
  linkedEmployer?: string;
  linkedCity?: string;
}

export async function createResearchMemo(input: CreateMemoInput): Promise<ResearchMemo> {
  await ensureResearchMemosTable();

  const {
    tenantId, title, memoType, prompt, owner,
    linkedWorkerId, linkedCaseId, linkedEmployer, linkedCity,
  } = input;

  // ── Stage 1: Perplexity Research ──────────────────────────────────────────
  let perplexityAnswer = "";
  let sources: string[] = [];
  const perplexityKey = process.env.PERPLEXITY_API_KEY;

  if (perplexityKey) {
    try {
      const systemPrompt = PERPLEXITY_PROMPTS[memoType] ?? PERPLEXITY_PROMPTS.custom;
      const userPrompt = `${prompt}${linkedCity ? ` Location context: ${linkedCity}, Poland.` : ""}${linkedEmployer ? ` Employer: ${linkedEmployer}.` : ""}`;

      const resp = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${perplexityKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar",
          return_citations: true,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 2000,
        }),
      });

      if (resp.ok) {
        const data = await resp.json() as any;
        perplexityAnswer = data.choices?.[0]?.message?.content ?? "";
        sources = (data.citations ?? [])
          .map((c: any) => (typeof c === "string" ? c : c.url ?? ""))
          .filter(Boolean);
      } else {
        perplexityAnswer = `[Perplexity returned ${resp.status}] Research unavailable — manual research required.`;
      }
    } catch (err: any) {
      perplexityAnswer = `[Perplexity error] ${err.message}`;
    }
  } else {
    perplexityAnswer = "[No Perplexity API key] Manual research required.";
  }

  // ── Stage 2: Claude Summary + Action Items ────────────────────────────────
  let summary = "";
  let actionItems: string[] = [];

  const ai = getAIProvider();
  if (ai?.isAvailable() && perplexityAnswer && !perplexityAnswer.startsWith("[")) {
    try {
      const raw = await ai.complete(
        `Summarize this research into a structured memo for a staffing agency legal team.\n\nResearch findings:\n${perplexityAnswer.substring(0, 3000)}\n\nOriginal question: ${prompt}\n\nCreate:\n1. EXECUTIVE SUMMARY (3-4 sentences)\n2. KEY FINDINGS (bullet points, max 8)\n3. ACTION ITEMS (what the team should do, max 5)\n4. RISK/OPPORTUNITY (1-2 sentences)\n5. LIMITATIONS (what this research does NOT cover)\n\nKeep it practical and actionable. Never invent article numbers. Never guarantee outcomes.`,
        { system: CLAUDE_SUMMARY_SYSTEM, maxTokens: 1200 },
      );

      summary = raw;

      // Extract action items
      const actionMatch = raw.match(/ACTION ITEMS[\s\S]*?(?=\n\n|RISK|LIMITATION|$)/i);
      if (actionMatch) {
        actionItems = actionMatch[0]
          .split("\n")
          .filter(l => l.trim().startsWith("-") || l.trim().startsWith("•") || /^\d+\./.test(l.trim()))
          .map(l => l.replace(/^[-•\d.]+\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 5);
      }
    } catch {
      summary = perplexityAnswer; // Fallback: use raw Perplexity output as summary
    }
  } else {
    summary = perplexityAnswer;
  }

  // ── Stage 3: Persist ──────────────────────────────────────────────────────
  const rows = await query<ResearchMemo>(
    `INSERT INTO research_memos
       (tenant_id, title, memo_type, prompt, perplexity_answer, sources, summary, action_items,
        owner, linked_worker_id, linked_case_id, linked_employer, linked_city, status, requires_review)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11,$12,$13,'draft',true)
     RETURNING *`,
    [
      tenantId, title, memoType, prompt, perplexityAnswer,
      JSON.stringify(sources), summary, JSON.stringify(actionItems),
      owner, linkedWorkerId ?? null, linkedCaseId ?? null,
      linkedEmployer ?? null, linkedCity ?? null,
    ],
  );

  return rows[0];
}

// ═══ READ ═══════════════════════════════════════════════════════════════════

export async function listMemos(tenantId: string, limit = 30): Promise<ResearchMemo[]> {
  await ensureResearchMemosTable();
  return query<ResearchMemo>(
    `SELECT * FROM research_memos WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit],
  );
}

export async function getMemoById(id: string, tenantId: string): Promise<ResearchMemo | null> {
  await ensureResearchMemosTable();
  return queryOne<ResearchMemo>(
    `SELECT * FROM research_memos WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
}

export async function getMemosByWorker(workerId: string, tenantId: string): Promise<ResearchMemo[]> {
  await ensureResearchMemosTable();
  return query<ResearchMemo>(
    `SELECT * FROM research_memos WHERE linked_worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
    [workerId, tenantId],
  );
}

// ═══ UPDATE STATUS ══════════════════════════════════════════════════════════

export async function updateMemoStatus(id: string, tenantId: string, status: MemoStatus): Promise<void> {
  await execute(
    `UPDATE research_memos SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
    [status, id, tenantId],
  );
}

// ═══ MEMO TYPES CATALOG ═════════════════════════════════════════════════════

export function getMemoTypes() {
  return [
    { id: "legal_research", label: "Legal / Procedural Research", description: "Immigration law, permit requirements, processing times, applicable articles" },
    { id: "appeal_support", label: "Appeal Support Research", description: "Appeal procedures, deadlines, evidence requirements, KPA provisions" },
    { id: "employer_compliance", label: "Employer Compliance Memo", description: "Employer obligations, notification duties, PIP readiness, penalties" },
    { id: "trc_requirements", label: "TRC Requirements Memo", description: "Karta Pobytu documents, processing, Art. 108, voivodeship specifics" },
    { id: "sector_labor_intel", label: "Sector / City Labour Intelligence", description: "Market rates, worker availability, demand trends, regional data" },
    { id: "procedural_guide", label: "Procedural Guide", description: "Step-by-step admin procedures, forms, authorities, timelines" },
    { id: "custom", label: "Custom Research", description: "Any research topic with cited sources" },
  ];
}
