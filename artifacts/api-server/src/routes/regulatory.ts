import { Router, type Request, type Response } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, execute } from "../lib/db.js";
import { mapAIResponseToStructuredAnswer } from "../services/legal-answer.service.js";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tables regulatory_updates and immigration_searches are created by init-db.ts at startup

// ─── Seed sample regulatory data if table is empty ──────────────────────────

async function seedRegulatoryData() {
  const rows = await query<{ cnt: number }>("SELECT COUNT(*)::int AS cnt FROM regulatory_updates");
  if ((rows[0]?.cnt ?? 0) > 0) return;

  const seedData = [
    { source: "praca.gov.pl", title: "Work Permit Fee Increase Effective July 2026", summary: "The Ministry of Family, Labor and Social Policy has announced a significant increase in work permit application fees. Type A permits will rise from 100 PLN to 200 PLN, and seasonal work permits from 30 PLN to 50 PLN.", category: "work_permits", severity: "critical", fineAmount: "N/A", workersAffected: 500, costImpact: "Estimated additional cost of 50,000-100,000 PLN annually", actionRequired: ["Update internal fee schedules before July 1, 2026", "Notify all clients with pending applications", "Submit pending applications before fee increase"] },
    { source: "zus.pl", title: "ZUS Contribution Rate Changes for Q3 2026", summary: "ZUS has published revised social security contribution rates effective from July 2026. The accident insurance base rate increases by 0.2 percentage points.", category: "zus", severity: "warning", fineAmount: "Up to 5,000 PLN per worker", workersAffected: 1000, costImpact: "Approximately 0.2% increase in total labor costs", actionRequired: ["Update payroll systems with new rates", "Recalculate net salaries", "Submit corrected ZUS DRA declarations"] },
    { source: "mos.gov.pl", title: "New MOS Portal Features for Employer Registration", summary: "The MOS portal has launched updated employer registration features including batch work permit applications and real-time status tracking.", category: "labor_law", severity: "info", fineAmount: null, workersAffected: 0, costImpact: "Potential time savings of 40-60%", actionRequired: ["Register for updated MOS portal access", "Train staff on batch application features"] },
    { source: "pip.gov.pl", title: "PIP Maximum Fine Increase for Labor Law Violations", summary: "Maximum fines for employing foreigners without valid work permits increase from 30,000 PLN to 50,000 PLN per worker.", category: "fines", severity: "critical", fineAmount: "Up to 50,000 PLN per worker", workersAffected: 200, costImpact: "Potential exposure increased by 66% per violation", actionRequired: ["Audit all current work permits immediately", "Implement automated permit expiry alerts", "Review compliance procedures for PIP inspections"] },
    { source: "gov.pl", title: "7-Day Reporting Obligation Extended to All Permit Types", summary: "The 7-day reporting obligation has been extended to cover all permit types including Oswiadczenie and seasonal permits.", category: "reporting", severity: "warning", fineAmount: "1,000-3,000 PLN per late report", workersAffected: 800, costImpact: "Minimal if timely; significant if delayed", actionRequired: ["Update onboarding checklists", "Set up automated reminders for worker start dates", "Train HR staff on expanded obligations"] },
  ];

  for (const item of seedData) {
    await query(
      `INSERT INTO regulatory_updates (source, title, summary, category, severity, fine_amount, workers_affected, cost_impact, action_required) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [item.source, item.title, item.summary, item.category, item.severity, item.fineAmount, item.workersAffected, item.costImpact, JSON.stringify(item.actionRequired)]
    );
  }
  console.log("[Regulatory] Seeded 5 sample regulatory updates.");
}

// Seed demo data only in non-production (tables created by init-db.ts)
if (process.env.NODE_ENV !== "production") {
  seedRegulatoryData().catch((err) => console.error("[Regulatory] Seed failed:", err));
}

// ─── Regulatory Intelligence Endpoints ───────────────────────────────────────

router.get("/regulatory/updates", requireAuth, async (req: Request, res: Response) => {
  try {
    const { category, severity, unreadOnly } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (category && category !== "all") {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }
    if (severity) {
      conditions.push(`severity = $${idx++}`);
      params.push(severity);
    }
    if (unreadOnly === "true") {
      conditions.push(`read_by_admin = false`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await query(`SELECT * FROM regulatory_updates ${where} ORDER BY fetched_at DESC LIMIT 100`, params);
    res.json({ updates: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/regulatory/summary", requireAuth, async (_req: Request, res: Response) => {
  try {
    const stats = await query(`
      SELECT
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE severity = 'warning') as warning_count,
        COALESCE(SUM(workers_affected) FILTER (WHERE severity IN ('critical','warning')), 0) as workers_affected
      FROM regulatory_updates
      WHERE fetched_at > NOW() - INTERVAL '7 days'
    `);
    const s = stats[0] as any ?? { critical_count: 0, warning_count: 0, workers_affected: 0 };

    const latest = await query(`
      SELECT id, source, title, summary, category, severity, fetched_at
      FROM regulatory_updates ORDER BY fetched_at DESC LIMIT 5
    `);

    res.json({
      criticalCount: Number(s.critical_count ?? 0),
      warningCount: Number(s.warning_count ?? 0),
      workersAffected: Number(s.workers_affected ?? 0),
      latest,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/regulatory/scan", requireAuth, async (_req: Request, res: Response) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    }

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey });

    const queries = [
      { q: "Polish work permit regulation changes 2026 praca.gov.pl", category: "work_permits" },
      { q: "Poland ZUS contribution rate changes 2026", category: "zus" },
      { q: "Polish labor law amendments Kodeks Pracy 2026", category: "labor_law" },
      { q: "EU Posted Workers Directive Poland compliance 2026", category: "eu_law" },
      { q: "PIP labor inspection fines Poland 2026 maximum penalties PLN", category: "fines" },
      { q: "Poland 7-day reporting obligation foreign workers 2026", category: "reporting" },
    ];

    const updates: any[] = [];
    for (const { q, category } of queries) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: `You are a Polish labor law compliance analyst. Analyze recent regulatory changes and return a JSON object with: title (string), summary (string, 2-3 sentences), severity ("info"|"warning"|"critical"), fineAmount (string or null), workersAffected (number estimate), costImpact (string or null), actionRequired (string array). Respond ONLY with valid JSON.`,
          messages: [{ role: "user", content: q }],
        });

        const content = response.content[0]?.type === "text" ? response.content[0].text : "";
        if (content) {
          const parsed = JSON.parse(content);
          await query(
            `INSERT INTO regulatory_updates (source, title, summary, category, severity, fine_amount, workers_affected, cost_impact, action_required) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
            [q.split(" ")[0] ?? "gov.pl", parsed.title ?? q, parsed.summary ?? "", category, parsed.severity ?? "info", parsed.fineAmount ?? null, parsed.workersAffected ?? 0, parsed.costImpact ?? null, JSON.stringify(parsed.actionRequired ?? [])]
          );
          updates.push(parsed);
        }
      } catch {
        // Skip failed individual queries
      }
    }

    res.json({ scanned: queries.length, updates: updates.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/regulatory/updates/:id/read", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: "Invalid ID format" });
    await query(`UPDATE regulatory_updates SET read_by_admin = true WHERE id = $1::uuid`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/regulatory/updates/read-all", requireAuth, async (_req: Request, res: Response) => {
  try {
    await execute(`UPDATE regulatory_updates SET read_by_admin = true WHERE read_by_admin = false`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Immigration Search Knowledge Base (fallback when AI unavailable) ────────

const IMMIGRATION_KB: Array<{ patterns: RegExp[]; answer: any }> = [
  {
    patterns: [/type\s*a\s*work\s*permit/i, /zezwolenie.*typ.*a/i, /work\s*permit.*type\s*a/i],
    answer: {
      answer: "A Type A work permit (zezwolenie na pracę typ A) allows a foreign national to work in Poland for a specific employer. It is the most common type, issued by the voivode (wojewoda) of the region where the employer is registered. Valid for up to 3 years.",
      operator_summary: "Type A is the standard employer-specific work permit. Employer applies to the voivode. Valid up to 3 years.",
      legal_summary: "Regulated by the Act of 20 April 2004 on Employment Promotion and Labour Market Institutions (Art. 88).",
      legal_basis: [{ law: "Act on Employment Promotion", article: "Art. 88", explanation: "Defines types of work permits for foreigners" }],
      applies_to: "Non-EU/EEA nationals working for a Polish employer",
      required_documents: ["Passport copy", "Employment contract or preliminary agreement", "Employer's KRS/CEIDG extract", "Labour market test (informacja starosty) unless exempt", "Power of attorney if applying via representative"],
      process_steps: ["Employer files application at the voivodeship office", "Labour market test conducted (14 days)", "Voivode reviews application (1-2 months)", "Permit issued — worker applies for visa or TRC"],
      deadlines: ["Labour market test: 14 working days", "Permit processing: 1-2 months standard", "Permit valid: up to 3 years"],
      risks: ["Employing without a valid permit: fine up to 30,000 PLN", "Worker working without permit: may face deportation"],
      next_actions: ["Verify if labour market test exemption applies", "Prepare employment contract", "Submit application to voivodeship office"],
      decision: "PROCEED", sources: [], confidence: 0.9, human_review_required: false,
    },
  },
  {
    patterns: [/processing\s*time/i, /how\s*long/i, /czas.*rozpatrzenia/i, /ile.*trwa/i],
    answer: {
      answer: "Standard processing times in Poland: Work permit (Type A): 1-2 months. TRC (Temporary Residence Card): 1-6 months depending on voivodeship. Oświadczenie (declaration): 7 working days. Visa: 15-60 calendar days.",
      operator_summary: "Work permits take 1-2 months, TRC takes 1-6 months, Oświadczenie is 7 days, visas 15-60 days.",
      legal_summary: "Processing times governed by KPA (Code of Administrative Procedure) Art. 35 — standard 1 month, complex cases 2 months.",
      legal_basis: [{ law: "Code of Administrative Procedure (KPA)", article: "Art. 35", explanation: "Sets standard processing deadlines" }],
      applies_to: "All applicants for work permits, TRC, and visas in Poland",
      required_documents: [], process_steps: [],
      deadlines: ["Work permit: 1-2 months", "TRC: 1-6 months", "Oświadczenie: 7 working days", "Visa: 15-60 calendar days"],
      risks: ["Delays possible in Warsaw and other major voivodeships", "Incomplete applications reset the processing clock"],
      next_actions: ["Submit complete applications to avoid delays", "Track application status via voivodeship portal"],
      decision: "PROCEED", sources: [], confidence: 0.85, human_review_required: false,
    },
  },
  {
    patterns: [/zus/i, /social\s*security/i, /contribution/i, /składk/i],
    answer: {
      answer: "ZUS (Social Insurance Institution) contributions in Poland: Employee pays ~13.71% of gross salary (pension 9.76%, disability 1.5%, sickness 2.45%). Employer pays ~19.48-22.14% (pension 9.76%, disability 6.5%, accident 0.67-3.33%, Labour Fund 2.45%, FGŚP 0.10%). Health insurance: 9% of gross (deducted from salary).",
      operator_summary: "Employee ZUS ~13.71% + 9% health. Employer ZUS ~20%. Both mandatory for all employment contracts.",
      legal_summary: "Governed by the Act on Social Insurance System of 13 October 1998.",
      legal_basis: [{ law: "Act on Social Insurance System", article: "Art. 6-12", explanation: "Defines mandatory contributions" }],
      applies_to: "All workers on employment contracts (umowa o pracę) in Poland, including foreign nationals",
      required_documents: ["ZUS ZUA registration form", "Worker's PESEL or passport", "Employment contract"],
      process_steps: ["Register worker with ZUS within 7 days of employment start", "Calculate monthly contributions", "Submit ZUS DRA declaration monthly", "Pay contributions by the 15th of following month"],
      deadlines: ["ZUS registration: within 7 days", "Monthly declaration: by 15th of following month"],
      risks: ["Late registration: fine up to 5,000 PLN", "Unpaid contributions: interest + enforcement proceedings"],
      next_actions: ["Verify worker registration status", "Ensure monthly DRA declarations are current"],
      decision: "PROCEED", sources: [], confidence: 0.9, human_review_required: false,
    },
  },
  {
    patterns: [/oświadczenie|oswiadczenie|declaration.*employ/i],
    answer: {
      answer: "Oświadczenie o powierzeniu pracy (Employer's Declaration) allows citizens of Armenia, Belarus, Georgia, Moldova, Ukraine, and Russia to work in Poland for up to 24 months without a full work permit. Registered at the local PUP (Powiatowy Urząd Pracy).",
      operator_summary: "Simplified work authorization for 6 nationalities. Max 24 months. Registered at local PUP office.",
      legal_summary: "Based on Art. 87 and Art. 88z of the Act on Employment Promotion and Labour Market Institutions.",
      legal_basis: [{ law: "Act on Employment Promotion", article: "Art. 88z", explanation: "Oświadczenie procedure for specific nationalities" }],
      applies_to: "Citizens of Armenia, Belarus, Georgia, Moldova, Ukraine, Russia",
      required_documents: ["Passport copy", "Employer's KRS/CEIDG", "Oświadczenie form", "Fee payment (100 PLN)"],
      process_steps: ["Employer registers oświadczenie at PUP", "PUP processes within 7 working days", "Worker starts employment", "Must notify PUP of employment start within 7 days"],
      deadlines: ["PUP processing: 7 working days", "Notify PUP of start: within 7 days", "Maximum duration: 24 months"],
      risks: ["Working without registered oświadczenie: fine up to 30,000 PLN", "Failing to notify PUP: administrative penalty"],
      next_actions: ["Check if worker's nationality qualifies", "Register oświadczenie at local PUP"],
      decision: "PROCEED", sources: [], confidence: 0.88, human_review_required: false,
    },
  },
  {
    patterns: [/pip|inspection|fine|penalty|kara|kontrola/i],
    answer: {
      answer: "PIP (Państwowa Inspekcja Pracy — National Labour Inspectorate) can impose fines for employing foreigners without valid work authorization: up to 30,000 PLN per worker. Additional fines for: no written contract (up to 30,000 PLN), health and safety violations (up to 30,000 PLN), unpaid wages. Criminal penalties possible for repeat offenders.",
      operator_summary: "PIP fines up to 30,000 PLN per violation. Covers illegal employment, missing contracts, safety breaches.",
      legal_summary: "Enforcement under the Act on Employment Promotion Art. 120-121 and Labour Code Art. 281-283.",
      legal_basis: [{ law: "Act on Employment Promotion", article: "Art. 120", explanation: "Penalties for illegal employment of foreigners" }],
      applies_to: "All employers in Poland employing foreign nationals",
      required_documents: [], process_steps: [],
      deadlines: ["Inspection can occur without notice"],
      risks: ["Fine up to 30,000 PLN per worker", "Criminal proceedings for repeat offenders", "Deportation of illegally employed workers"],
      next_actions: ["Audit all worker permits for validity", "Ensure written contracts exist for all workers", "Verify BHP (safety) certificates are current"],
      decision: "CAUTION", sources: [], confidence: 0.85, human_review_required: false,
    },
  },
];

function findKBAnswer(searchQuery: string): any | null {
  const q = searchQuery.toLowerCase();
  for (const entry of IMMIGRATION_KB) {
    if (entry.patterns.some(p => p.test(q))) return entry.answer;
  }
  return null;
}

// ─── Immigration Search Engine ───────────────────────────────────────────────

router.post("/immigration/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const { query: searchQuery, language = "en" } = req.body;
    if (!searchQuery) return res.status(400).json({ error: "query required" });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const isKeyValid = apiKey && !apiKey.includes("REPLACE") && apiKey.length > 20;

    // Try AI-powered search first
    if (isKeyValid) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });

        const jsonSchema = `{
  "answer": "Full detailed answer to the question",
  "operator_summary": "Simple, actionable explanation in 2-3 lines for the operations team",
  "legal_summary": "Formal legal explanation citing relevant law",
  "legal_basis": [{"law": "Name of the act", "article": "Art. number", "explanation": "Why it applies"}],
  "applies_to": "Who exactly this applies to, e.g. non-EU nationals on Type A work permits in Poland",
  "required_documents": ["Specific documents needed"],
  "process_steps": ["Step-by-step procedure in order"],
  "deadlines": ["Specific timeframes, e.g. 30 days from permit expiry"],
  "risks": ["Penalties, fines, or consequences of non-compliance"],
  "next_actions": ["Concrete actions the employer or worker should take now"],
  "decision": "PROCEED or CAUTION or BLOCKED — overall assessment of whether the action can go ahead",
  "sources": [{"url": "string", "title": "string"}],
  "confidence": 0.85,
  "human_review_required": false
}`;
        const systemPrompt = language === "pl"
          ? `Jestes ekspertem od polskiego prawa imigracyjnego i prawa pracy. Odpowiadaj na pytania dotyczace pozwolen na prace, wiz, ZUS, umow o prace w Polsce. Odpowiedz TYLKO czystym JSON (bez markdown, bez komentarzy). Schemat:\n${jsonSchema}`
          : `You are an expert on Polish immigration law and labor regulations. Answer questions about work permits, visas, ZUS contributions, employment contracts in Poland. Respond ONLY with clean JSON (no markdown, no commentary). Schema:\n${jsonSchema}`;

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: searchQuery }],
        });

        let content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
        content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        let parsed: any;
        try { parsed = JSON.parse(content); } catch {
          const m = content.match(/\{[\s\S]*\}/);
          try { parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
          if (!parsed) parsed = { answer: content, sources: [], confidence: 0.5 };
        }

        const responseBody = mapAIResponseToStructuredAnswer(parsed);
        const userEmail = (req as any).user?.email ?? "unknown";
        await query(
          `INSERT INTO immigration_searches (tenant_id, user_email, question, language, answer, sources, confidence, action_items) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)`,
          [req.tenantId!, userEmail, searchQuery, language, responseBody.answer, JSON.stringify(responseBody.sources), responseBody.confidence, JSON.stringify(responseBody.next_actions)]
        ).catch(() => {});

        console.log("[IMMIGRATION SEARCH] AI response for:", searchQuery.slice(0, 60));
        return res.json(responseBody);
      } catch (aiErr: any) {
        console.error("[IMMIGRATION SEARCH] AI failed, trying knowledge base:", aiErr.message?.slice(0, 100));
        // Fall through to knowledge base
      }
    }

    // Fallback 2: Perplexity live search (real-time web results)
    const pplxKey = process.env.PERPLEXITY_API_KEY;
    if (pplxKey && pplxKey.length > 10) {
      try {
        const pplxRes = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${pplxKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: `You are a Polish immigration and labor law expert. Answer questions about work permits, TRC, Art. 108, ZUS, MOS 2026, and employment law in Poland. Respond in JSON format: {"answer":"...","legal_basis":[{"law":"...","article":"...","explanation":"..."}],"risks":["..."],"deadlines":["..."],"next_actions":["..."],"decision":"PROCEED|CAUTION|BLOCKED","confidence":0.8,"sources":[{"url":"...","title":"..."}]}${language === "pl" ? " Odpowiedz po polsku." : ""}` },
              { role: "user", content: searchQuery },
            ],
          }),
        });
        if (pplxRes.ok) {
          const pplxData = await pplxRes.json();
          let pplxContent = pplxData.choices?.[0]?.message?.content ?? "";
          pplxContent = pplxContent.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
          let pplxParsed: any;
          try { pplxParsed = JSON.parse(pplxContent); } catch {
            const m = pplxContent.match(/\{[\s\S]*\}/);
            try { pplxParsed = m ? JSON.parse(m[0]) : null; } catch { pplxParsed = null; }
            if (!pplxParsed) pplxParsed = { answer: pplxContent, sources: pplxData.citations?.map((c: string) => ({ url: c, title: "Web Source" })) ?? [], confidence: 0.7 };
          }
          // Add Perplexity citations as sources
          if (pplxData.citations?.length > 0 && (!pplxParsed.sources || pplxParsed.sources.length === 0)) {
            pplxParsed.sources = pplxData.citations.map((c: string) => ({ url: c, title: "Web Source" }));
          }
          const responseBody = mapAIResponseToStructuredAnswer(pplxParsed);
          const userEmail = (req as any).user?.email ?? "unknown";
          await query(
            `INSERT INTO immigration_searches (tenant_id, user_email, question, language, answer, sources, confidence, action_items) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)`,
            [req.tenantId!, userEmail, searchQuery, language, responseBody.answer, JSON.stringify(responseBody.sources), responseBody.confidence, JSON.stringify(responseBody.next_actions)]
          ).catch(() => {});
          console.log("[IMMIGRATION SEARCH] Perplexity response for:", searchQuery.slice(0, 60));
          return res.json(responseBody);
        }
      } catch (pplxErr: any) {
        console.error("[IMMIGRATION SEARCH] Perplexity failed:", pplxErr.message?.slice(0, 100));
      }
    }

    // Fallback 3: knowledge base lookup
    const kbAnswer = findKBAnswer(searchQuery);
    if (kbAnswer) {
      const responseBody = mapAIResponseToStructuredAnswer(kbAnswer);
      const userEmail = (req as any).user?.email ?? "unknown";
      await query(
        `INSERT INTO immigration_searches (tenant_id, user_email, question, language, answer, sources, confidence, action_items) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)`,
        [req.tenantId!, userEmail, searchQuery, language, responseBody.answer, JSON.stringify(responseBody.sources), responseBody.confidence, JSON.stringify(responseBody.next_actions)]
      ).catch(() => {});
      console.log("[IMMIGRATION SEARCH] KB response for:", searchQuery.slice(0, 60));
      return res.json(responseBody);
    }

    // No AI, no Perplexity, no KB match
    const fallback = mapAIResponseToStructuredAnswer({
      answer: "This question could not be answered by the AI, live search, or knowledge base. Please try rephrasing or ask about: work permits, ZUS contributions, Art. 108, MOS 2026 filing, Schengen rules, or PIP inspections.",
      operator_summary: "No answer available. Try a more specific legal question.",
      decision: "CAUTION",
      confidence: 0.3,
      human_review_required: true,
      sources: [], next_actions: ["Configure ANTHROPIC_API_KEY for full AI-powered search", "Consult an immigration lawyer for complex questions"],
    });
    console.log("[IMMIGRATION SEARCH] No AI, no KB match for:", searchQuery.slice(0, 60));
    res.json(fallback);
  } catch (err: any) {
    console.error("[IMMIGRATION SEARCH] ERROR:", err.message);
    res.status(500).json({ error: "Immigration search failed. Please try again or rephrase your question." });
  }
});

router.get("/immigration/history", requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await query(`SELECT id, question, language, confidence, searched_at FROM immigration_searches WHERE tenant_id = $1 ORDER BY searched_at DESC LIMIT 50`, [req.tenantId!]);
    res.json({ history: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/immigration/history/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: "Invalid ID format" });
    const rows = await query(`SELECT * FROM immigration_searches WHERE id = $1::uuid AND tenant_id = $2`, [req.params.id, req.tenantId!]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/immigration/popular", requireAuth, async (_req: Request, res: Response) => {
  res.json({
    questions: [
      { en: "What documents are needed for a Type A work permit in Poland?", pl: "Jakie dokumenty sa potrzebne do zezwolenia na prace typu A?" },
      { en: "How long does a work permit application take?", pl: "Ile trwa rozpatrywanie wniosku o zezwolenie na prace?" },
      { en: "What is the 7-day reporting obligation for foreign workers?", pl: "Czym jest obowiazek 7-dniowego zgloszenia pracownikow?" },
      { en: "What are the current ZUS contribution rates for Umowa Zlecenie?", pl: "Jakie sa aktualne stawki ZUS dla Umowy Zlecenie?" },
      { en: "Can a worker change employers while on a work permit?", pl: "Czy pracownik moze zmienic pracodawce podczas zezwolenia na prace?" },
      { en: "What is the Oswiadczenie process and how long is it valid?", pl: "Czym jest Oswiadczenie i jak dlugo jest wazne?" },
      { en: "What are the maximum PIP fines for labor law violations?", pl: "Jakie sa maksymalne kary PIP za naruszenia prawa pracy?" },
      { en: "What are the EU Posted Workers Directive requirements for Poland?", pl: "Jakie sa wymagania Dyrektywy o Pracownikach Delegowanych UE dla Polski?" },
    ],
  });
});

export default router;
