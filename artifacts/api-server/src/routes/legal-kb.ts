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

    // Fallback: use Immigration Search KB if no AI answer
    if (!answer) {
      try {
        const { mapAIResponseToStructuredAnswer } = await import("../services/legal-answer.service.js");

        // Inline KB patterns (same as regulatory.ts)
        const KB: Array<{ patterns: RegExp[]; answer: string }> = [
          { patterns: [/type\s*a\s*work\s*permit/i, /zezwolenie.*typ.*a/i, /work\s*permit/i], answer: "A Type A work permit (zezwolenie na prace typ A) allows a foreign national to work in Poland for a specific employer. It is the most common type, issued by the voivode of the region where the employer is registered. Valid for up to 3 years. Employer files application at the voivodeship office after labour market test (14 days). Processing takes 1-2 months. Legal basis: Act on Employment Promotion Art. 88." },
          { patterns: [/processing\s*time/i, /how\s*long/i, /czas.*rozpatrzenia/i], answer: "Standard processing times in Poland: Work permit (Type A): 1-2 months. TRC (Temporary Residence Card): 1-6 months depending on voivodeship. Oswiadczenie: 7 working days. Visa: 15-60 calendar days. Legal basis: KPA Art. 35." },
          { patterns: [/zus/i, /social\s*security/i, /contribution/i, /skladk/i], answer: "ZUS contributions: Employee ~13.71% + 9% health. Employer ~19-22%. Registration within 7 days. Monthly DRA declaration by 15th. Legal basis: Act on Social Insurance System Art. 6-12." },
          { patterns: [/oswiadczenie|declaration.*employ/i], answer: "Oswiadczenie o powierzeniu pracy: Simplified work authorization for citizens of Armenia, Belarus, Georgia, Moldova, Ukraine, Russia. Max 24 months. Registered at local PUP (7 working days). Legal basis: Act on Employment Promotion Art. 88z." },
          { patterns: [/pip|inspection|fine|penalty|kara/i], answer: "PIP (National Labour Inspectorate) can impose fines up to 30,000 PLN per worker for illegal employment. Additional fines for missing contracts, safety violations. Criminal penalties for repeat offenders. Legal basis: Act on Employment Promotion Art. 120." },
          { patterns: [/art.*108|article.*108|continuity|ochrona/i], answer: "Article 108 of the Act on Foreigners provides legal continuity of stay when a TRC application is filed before permit expiry. Since April 2026, protection activates upon MOS 'Correct Submission' notification (UPO). The worker must remain with the same employer and same role. Filing is now digital-only via the MOS 2.0 portal." },
          { patterns: [/mos|digital.*filing|electronic.*submission|portal/i], answer: "MOS 2.0 (Modul Obslugi Spraw) became the exclusive filing portal on April 27, 2026. Paper applications are no longer accepted. The employer receives an encrypted digital link to sign Annex 1 within 30 days. A Trusted Profile (Profil Zaufany) or qualified e-signature is mandatory. The UPO (digital receipt) replaces the physical stamp as proof of legal stay." },
          { patterns: [/ees|entry.*exit|biometric|schengen.*90/i], answer: "EU Entry/Exit System (EES) launched April 10, 2026. Border guards no longer stamp passports — entries are recorded biometrically. The 90/180-day Schengen rule must be tracked via the EES portal. Non-EU workers on short stays must monitor their day count to avoid overstay." },
          { patterns: [/new.*rule|april.*2026|zmian|nowe.*przepis|immigrant/i], answer: "Key Poland immigration changes April 2026: (1) MOS 2.0 digital-only filing from April 27 — paper rejected. (2) EES biometric border tracking from April 10 — no more passport stamps. (3) UPO digital receipt replaces physical stamp for Art. 108 protection. (4) Employer must sign Annex 1 via encrypted link within 30 days. (5) Fees quadrupled to PLN 400-800. (6) Trusted Profile or e-signature mandatory for employers. (7) Art. 108 activates on 'Correct Submission' in MOS, not at filing." },
        ];

        const q = question.toLowerCase();
        const match = KB.find(k => k.patterns.some(p => p.test(q)));
        if (match) {
          answer = match.answer;
          sourcesUsed.push({ title: "Legal Knowledge Base", category: "KB", source: "Apatris Immigration KB" });
        }
      } catch { /* ignore */ }
    }

    if (!answer) {
      answer = "This question is not covered by the current knowledge base. Please try asking about: work permits, ZUS contributions, Article 108 protection, MOS digital filing, EES border system, PIP inspections, or the April 2026 rule changes.";
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
