import { Router, type Request, type Response } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, execute } from "../lib/db.js";

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

// ─── Immigration Search Engine ───────────────────────────────────────────────

router.post("/immigration/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const { query: searchQuery, language = "en" } = req.body;
    if (!searchQuery) return res.status(400).json({ error: "query required" });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    }

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey });

    const systemPrompt = language === "pl"
      ? `Jestes ekspertem od polskiego prawa imigracyjnego i prawa pracy. Odpowiadaj na pytania dotyczace pozwolen na prace, wiz, ZUS, umow o prace w Polsce. Odpowiedz TYLKO w formacie JSON: { "answer": string, "sources": [{"url": string, "title": string}], "confidence": number (0-1), "actionItems": string[] }`
      : `You are an expert on Polish immigration law and labor regulations. Answer questions about work permits, visas, ZUS contributions, employment contracts in Poland. Respond ONLY in JSON format: { "answer": string, "sources": [{"url": string, "title": string}], "confidence": number (0-1), "actionItems": string[] }`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: searchQuery }],
    });

    const content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(content);

    const userEmail = (req as any).user?.email ?? "unknown";
    await query(
      `INSERT INTO immigration_searches (tenant_id, user_email, question, language, answer, sources, confidence, action_items) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)`,
      [req.tenantId!, userEmail, searchQuery, language, parsed.answer ?? "", JSON.stringify(parsed.sources ?? []), parsed.confidence ?? 0, JSON.stringify(parsed.actionItems ?? [])]
    );

    res.json({
      answer: parsed.answer ?? "No answer available",
      sources: parsed.sources ?? [],
      confidence: parsed.confidence ?? 0,
      actionItems: parsed.actionItems ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
