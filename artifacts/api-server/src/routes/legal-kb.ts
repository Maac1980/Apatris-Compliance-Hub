import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// GET /api/legal-kb/articles
router.get("/legal-kb/articles", requireAuth, async (req, res) => {
  try {
    const { category } = req.query as Record<string, string>;
    let sql = "SELECT * FROM legal_knowledge WHERE tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
    sql += " ORDER BY category, title";
    res.json({ articles: await query(sql, params) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/legal-kb/categories
router.get("/legal-kb/categories", requireAuth, async (req, res) => {
  try {
    const rows = await query<Record<string, any>>("SELECT category, COUNT(*) AS count FROM legal_knowledge WHERE tenant_id = $1 GROUP BY category ORDER BY category", [req.tenantId!]);
    res.json({ categories: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/legal-kb/articles — admin adds article
router.post("/legal-kb/articles", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.category || !b.title || !b.content) return res.status(400).json({ error: "category, title, content required" });
    const row = await queryOne(
      `INSERT INTO legal_knowledge (tenant_id, category, title, content, source_url, source_name, language, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId!, b.category, b.title, b.content, b.sourceUrl ?? null, b.sourceName ?? null, b.language || "en", JSON.stringify(b.tags || [])]);
    res.status(201).json({ article: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/legal-kb/query — AI answers from verified articles
router.post("/legal-kb/query", requireAuth, async (req, res) => {
  try {
    const { question, language } = req.body as { question?: string; language?: string };
    if (!question) return res.status(400).json({ error: "question required" });

    // Search knowledge base for relevant articles
    const searchTerms = question.toLowerCase().split(" ").filter(w => w.length > 3);
    let relevantArticles = await query<Record<string, any>>("SELECT * FROM legal_knowledge WHERE tenant_id = $1 ORDER BY category", [req.tenantId!]);

    // Simple relevance scoring
    const scored = relevantArticles.map(a => {
      let score = 0;
      const text = `${a.title} ${a.content} ${JSON.stringify(a.tags)}`.toLowerCase();
      for (const term of searchTerms) { if (text.includes(term)) score += 1; }
      return { ...a, relevance: score };
    }).filter(a => a.relevance > 0).sort((a, b) => b.relevance - a.relevance).slice(0, 5);

    let answer = "";
    const sourcesUsed = scored.map(a => ({ title: a.title, category: a.category, source: a.source_name }));

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (scored.length > 0 && apiKey) {
      // AI generates answer from verified articles
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });
        const articlesContext = scored.map(a => `[${a.category}] ${a.title}: ${a.content}`).join("\n\n");
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 1024,
          system: `You are a Polish immigration and labour law assistant. Answer the question using ONLY the verified articles provided below. Do not make up information. Cite which article you used. If the answer is not in the articles, say so.${language === "pl" ? " Odpowiedz po polsku." : ""}\n\nVERIFIED ARTICLES:\n${articlesContext}`,
          messages: [{ role: "user", content: question }],
        });
        answer = response.content[0]?.type === "text" ? response.content[0].text : "";
      } catch { /* fall through */ }
    }

    // If knowledge base is empty or AI didn't answer, use Claude directly with legal expertise
    if (!answer && apiKey) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 1024,
          system: `You are a Polish immigration and labour law expert. Answer the question accurately based on current Polish law (2026). Cover: TRC (Temporary Residence Card), Art. 108 continuity, MOS electronic filing, work permits, ZUS, PIT, Posted Workers, GDPR, A1 certificates. Always cite the relevant legal basis (e.g. "Art. 108 Ustawy o cudzoziemcach"). If uncertain, say so.${language === "pl" ? " Odpowiedz po polsku." : ""}`,
          messages: [{ role: "user", content: question }],
        });
        answer = response.content[0]?.type === "text" ? response.content[0].text : "";
        if (answer) sourcesUsed.push({ title: "AI Legal Expert", category: "AI", source: "Claude (general knowledge)" });
      } catch { /* fall through */ }
    }

    if (!answer) {
      answer = "I could not generate an answer at this time. Please check that the AI service is configured and try again.";
    }

    // Log query
    await execute(
      "INSERT INTO legal_queries (tenant_id, user_id, question, answer, sources_used, language) VALUES ($1,$2,$3,$4,$5,$6)",
      [req.tenantId!, (req as any).user?.email || "unknown", question, answer, JSON.stringify(sourcesUsed), language || "en"]
    );

    res.json({ answer, sources: sourcesUsed, articlesSearched: relevantArticles.length, articlesMatched: scored.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/legal-kb/history — query history
router.get("/legal-kb/history", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM legal_queries WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50", [req.tenantId!]);
    res.json({ queries: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
