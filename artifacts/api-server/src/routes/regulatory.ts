import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { db } from "../lib/db.js";
import { sql } from "drizzle-orm";

const router = Router();

// ─── Regulatory Updates Table (auto-created) ────────────────────────────────

async function ensureRegulatoryTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS regulatory_updates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      full_text TEXT DEFAULT '',
      category TEXT NOT NULL DEFAULT 'labor_law',
      severity TEXT NOT NULL DEFAULT 'info',
      fine_amount TEXT,
      workers_affected INTEGER DEFAULT 0,
      cost_impact TEXT,
      deadline_change TEXT,
      action_required JSONB DEFAULT '[]'::jsonb,
      source_urls JSONB DEFAULT '[]'::jsonb,
      fetched_at TIMESTAMPTZ DEFAULT NOW(),
      read_by_admin BOOLEAN DEFAULT false,
      email_sent BOOLEAN DEFAULT false
    );
  `);
}

async function ensureImmigrationTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS immigration_searches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_email TEXT,
      question TEXT NOT NULL,
      language TEXT DEFAULT 'en',
      answer TEXT,
      sources JSONB DEFAULT '[]'::jsonb,
      confidence REAL DEFAULT 0,
      action_items JSONB DEFAULT '[]'::jsonb,
      searched_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// Init tables on import
ensureRegulatoryTable().catch(() => {});
ensureImmigrationTable().catch(() => {});

// ─── Regulatory Intelligence Endpoints ───────────────────────────────────────

// GET /api/regulatory/updates — list all regulatory updates
router.get("/regulatory/updates", requireAuth, async (req: Request, res: Response) => {
  try {
    const { category, severity, unreadOnly } = req.query;
    let query = `SELECT * FROM regulatory_updates`;
    const conditions: string[] = [];
    if (category && category !== "all") conditions.push(`category = '${category}'`);
    if (severity) conditions.push(`severity = '${severity}'`);
    if (unreadOnly === "true") conditions.push(`read_by_admin = false`);
    if (conditions.length > 0) query += ` WHERE ${conditions.join(" AND ")}`;
    query += ` ORDER BY fetched_at DESC LIMIT 100`;
    const result = await db.execute(sql.raw(query));
    res.json({ updates: result.rows ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/regulatory/summary — dashboard widget data
router.get("/regulatory/summary", requireAuth, async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
        COUNT(*) FILTER (WHERE severity = 'warning') as warning_count,
        COALESCE(SUM(workers_affected) FILTER (WHERE severity IN ('critical','warning')), 0) as workers_affected
      FROM regulatory_updates
      WHERE fetched_at > NOW() - INTERVAL '7 days'
    `);
    const stats = result.rows?.[0] ?? { critical_count: 0, warning_count: 0, workers_affected: 0 };

    const latest = await db.execute(sql`
      SELECT id, source, title, summary, category, severity, fetched_at
      FROM regulatory_updates
      ORDER BY fetched_at DESC LIMIT 5
    `);

    res.json({
      criticalCount: Number(stats.critical_count ?? 0),
      warningCount: Number(stats.warning_count ?? 0),
      workersAffected: Number(stats.workers_affected ?? 0),
      latest: latest.rows ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/regulatory/scan — trigger regulatory scan using OpenAI
router.post("/regulatory/scan", requireAuth, async (_req: Request, res: Response) => {
  try {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "AI API key not configured" });
    }

    const queries = [
      { q: "Polish work permit regulation changes 2026 praca.gov.pl", category: "work_permits" },
      { q: "Poland ZUS contribution rate changes 2026", category: "zus" },
      { q: "Polish labor law amendments Kodeks Pracy 2026", category: "labor_law" },
      { q: "EU Posted Workers Directive Poland compliance 2026", category: "eu_law" },
      { q: "PIP labor inspection fines Poland 2026 maximum penalties PLN", category: "fines" },
      { q: "Poland 7-day reporting obligation foreign workers 2026", category: "reporting" },
    ];

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    const updates: any[] = [];
    for (const { q, category } of queries) {
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a Polish labor law compliance analyst. Analyze recent regulatory changes and return a JSON object with: title (string), summary (string, 2-3 sentences), severity ("info"|"warning"|"critical"), fineAmount (string or null), workersAffected (number estimate), costImpact (string or null), actionRequired (string array). Focus on actionable intelligence for a staffing agency managing foreign workers in Poland.`,
            },
            { role: "user", content: q },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          await db.execute(sql`
            INSERT INTO regulatory_updates (source, title, summary, category, severity, fine_amount, workers_affected, cost_impact, action_required)
            VALUES (${q.split(" ")[0] ?? "gov.pl"}, ${parsed.title ?? q}, ${parsed.summary ?? ""}, ${category}, ${parsed.severity ?? "info"}, ${parsed.fineAmount ?? null}, ${parsed.workersAffected ?? 0}, ${parsed.costImpact ?? null}, ${JSON.stringify(parsed.actionRequired ?? [])}::jsonb)
          `);
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

// PATCH /api/regulatory/updates/:id/read — mark as read
router.patch("/regulatory/updates/:id/read", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`UPDATE regulatory_updates SET read_by_admin = true WHERE id = ${req.params.id}::uuid`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/regulatory/updates/read-all — mark all as read
router.post("/regulatory/updates/read-all", requireAuth, async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`UPDATE regulatory_updates SET read_by_admin = true WHERE read_by_admin = false`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Immigration Search Engine ───────────────────────────────────────────────

// POST /api/immigration/search — AI-powered immigration law search
router.post("/immigration/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const { query, language = "en" } = req.body;
    if (!query) return res.status(400).json({ error: "query required" });

    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "AI API key not configured" });
    }

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    const systemPrompt = language === "pl"
      ? `Jestes ekspertem od polskiego prawa imigracyjnego i prawa pracy. Odpowiadaj na pytania dotyczace pozwolen na prace, wiz, ZUS, umow o prace w Polsce. Odpowiedz w formacie JSON: { "answer": string, "sources": [{"url": string, "title": string}], "confidence": number (0-1), "actionItems": string[] }`
      : `You are an expert on Polish immigration law and labor regulations. Answer questions about work permits, visas, ZUS contributions, employment contracts in Poland. Respond in JSON format: { "answer": string, "sources": [{"url": string, "title": string}], "confidence": number (0-1), "actionItems": string[] }`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);

    // Save to history
    const userEmail = (req as any).user?.email ?? "unknown";
    await db.execute(sql`
      INSERT INTO immigration_searches (user_email, question, language, answer, sources, confidence, action_items)
      VALUES (${userEmail}, ${query}, ${language}, ${parsed.answer ?? ""}, ${JSON.stringify(parsed.sources ?? [])}::jsonb, ${parsed.confidence ?? 0}, ${JSON.stringify(parsed.actionItems ?? [])}::jsonb)
    `);

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

// GET /api/immigration/history — search history
router.get("/immigration/history", requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT id, question, language, confidence, searched_at
      FROM immigration_searches
      ORDER BY searched_at DESC LIMIT 50
    `);
    res.json({ history: result.rows ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/immigration/history/:id — full search result
router.get("/immigration/history/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT * FROM immigration_searches WHERE id = ${req.params.id}::uuid
    `);
    const row = result.rows?.[0];
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/immigration/popular — suggested questions
router.get("/immigration/popular", async (_req: Request, res: Response) => {
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
