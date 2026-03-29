import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { db } from "../lib/db.js";
import { sql, eq, and, desc, count } from "drizzle-orm";
import { regulatoryUpdates, immigrationSearches } from "@workspace/db/schema";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// ─── Seed sample regulatory data if table is empty ──────────────────────────

async function seedRegulatoryData() {
  const result = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM regulatory_updates`);
  const rowCount = Number((result.rows?.[0] as any)?.cnt ?? 0);
  if (rowCount > 0) return;

  const seedData = [
    {
      source: "praca.gov.pl",
      title: "Work Permit Fee Increase Effective July 2026",
      summary: "The Ministry of Family, Labor and Social Policy has announced a significant increase in work permit application fees. Type A permits will rise from 100 PLN to 200 PLN, and seasonal work permits from 30 PLN to 50 PLN. Agencies must update fee schedules and inform clients before the July 1 deadline.",
      category: "work_permits",
      severity: "critical",
      fineAmount: "N/A",
      workersAffected: 500,
      costImpact: "Estimated additional cost of 50,000-100,000 PLN annually for mid-size agencies",
      actionRequired: JSON.stringify([
        "Update internal fee schedules before July 1, 2026",
        "Notify all clients with pending applications about increased costs",
        "Submit pending applications before fee increase takes effect",
      ]),
    },
    {
      source: "zus.pl",
      title: "ZUS Contribution Rate Changes for Q3 2026",
      summary: "ZUS has published revised social security contribution rates effective from July 2026. The accident insurance base rate increases by 0.2 percentage points. Employers must update payroll systems and recalculate worker deductions. Non-compliance may result in penalties during ZUS audits.",
      category: "zus",
      severity: "warning",
      fineAmount: "Up to 5,000 PLN per worker for incorrect contributions",
      workersAffected: 1000,
      costImpact: "Approximately 0.2% increase in total labor costs",
      actionRequired: JSON.stringify([
        "Update payroll systems with new contribution rates",
        "Recalculate net salaries for all foreign workers",
        "Submit corrected ZUS DRA declarations if affected",
      ]),
    },
    {
      source: "mos.gov.pl",
      title: "New MOS Portal Features for Employer Registration",
      summary: "The Modular Foreigners Service (MOS) portal has launched updated employer registration features including batch work permit applications and real-time status tracking. Agencies can now submit up to 50 applications simultaneously through the new batch processing module.",
      category: "labor_law",
      severity: "info",
      fineAmount: null,
      workersAffected: 0,
      costImpact: "Potential time savings of 40-60% on application processing",
      actionRequired: JSON.stringify([
        "Register for updated MOS portal access",
        "Train staff on new batch application features",
        "Migrate existing application workflows to new system",
      ]),
    },
    {
      source: "pip.gov.pl",
      title: "PIP Maximum Fine Increase for Labor Law Violations",
      summary: "The National Labour Inspectorate (PIP) has received authority to impose significantly higher fines for labor law violations. Maximum fines for employing foreigners without valid work permits increase from 30,000 PLN to 50,000 PLN per worker. Repeat offenders face criminal proceedings.",
      category: "fines",
      severity: "critical",
      fineAmount: "Up to 50,000 PLN per worker (increased from 30,000 PLN)",
      workersAffected: 200,
      costImpact: "Potential exposure increased by 66% per violation",
      actionRequired: JSON.stringify([
        "Audit all current work permits for validity immediately",
        "Implement automated permit expiry alerts",
        "Review and update compliance procedures for PIP inspections",
        "Ensure all employment contracts match work permit conditions",
      ]),
    },
    {
      source: "gov.pl",
      title: "7-Day Reporting Obligation Extended to All Permit Types",
      summary: "The 7-day reporting obligation for foreign worker commencement of employment has been extended to cover all permit types including Oswiadczenie and seasonal permits. Employers must notify the relevant Voivode within 7 days of a worker starting or not starting employment. Late reporting now carries administrative penalties.",
      category: "reporting",
      severity: "warning",
      fineAmount: "1,000-3,000 PLN per late report",
      workersAffected: 800,
      costImpact: "Minimal if reporting is timely; significant exposure if delayed",
      actionRequired: JSON.stringify([
        "Update onboarding checklists to include 7-day notification for all permit types",
        "Set up automated reminders for worker start dates",
        "Train HR staff on expanded reporting obligations",
      ]),
    },
  ];

  for (const item of seedData) {
    await db.execute(sql`
      INSERT INTO regulatory_updates (source, title, summary, category, severity, fine_amount, workers_affected, cost_impact, action_required)
      VALUES (${item.source}, ${item.title}, ${item.summary}, ${item.category}, ${item.severity}, ${item.fineAmount}, ${item.workersAffected}, ${item.costImpact}, ${item.actionRequired}::jsonb)
    `);
  }

  console.log("[Regulatory] Seeded 5 sample regulatory updates.");
}

// Init tables on import
ensureRegulatoryTable()
  .then(() => seedRegulatoryData())
  .catch((err) => console.error("[Regulatory] Table init/seed failed:", err));
ensureImmigrationTable().catch((err) => console.error("[Immigration] Table init failed:", err));

// ─── Regulatory Intelligence Endpoints ───────────────────────────────────────

// GET /api/regulatory/updates — list all regulatory updates (parameterized)
router.get("/regulatory/updates", requireAuth, async (req: Request, res: Response) => {
  try {
    const { category, severity, unreadOnly } = req.query;

    // Build query using safe parameterized sql fragments
    const conditions: ReturnType<typeof sql>[] = [];
    if (category && category !== "all") {
      conditions.push(sql`category = ${category as string}`);
    }
    if (severity) {
      conditions.push(sql`severity = ${severity as string}`);
    }
    if (unreadOnly === "true") {
      conditions.push(sql`read_by_admin = false`);
    }

    let query;
    if (conditions.length > 0) {
      let whereClause = conditions[0]!;
      for (let i = 1; i < conditions.length; i++) {
        whereClause = sql`${whereClause} AND ${conditions[i]}`;
      }
      query = sql`SELECT * FROM regulatory_updates WHERE ${whereClause} ORDER BY fetched_at DESC LIMIT 100`;
    } else {
      query = sql`SELECT * FROM regulatory_updates ORDER BY fetched_at DESC LIMIT 100`;
    }

    const result = await db.execute(query);
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
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: "Invalid ID format" });
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
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: "Invalid ID format" });
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
