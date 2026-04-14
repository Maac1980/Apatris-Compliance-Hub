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
    if (!question?.trim()) return res.status(400).json({ error: "question required" });

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
        // Updated April 14, 2026 — verified against current Polish law
        const KB: Array<{ patterns: RegExp[]; answer: string }> = [
          { patterns: [/type\s*a\s*work\s*permit/i, /zezwolenie.*typ.*a/i, /work\s*permit/i], answer: "Type A work permit (zezwolenie na pracę typ A): allows foreign national to work for a specific Polish employer. Valid up to 3 years. Fee: PLN 400 (quadrupled from PLN 100 in 2026). IMPORTANT: Labour market test (informacja starosty) was ABOLISHED on March 23, 2026 — replaced by National Occupational Priority framework with Deficit Lists. Processing: 1-3 months. Filed at voivodeship office. Type B (board member): PLN 400. Type C (posted worker): PLN 800. Legal basis: Act on Employment Promotion Art. 88." },
          { patterns: [/processing\s*time/i, /how\s*long/i, /czas.*rozpatrzenia/i], answer: "Standard processing times in Poland (2026): Work permit Type A: 1-3 months (faster since labour market test abolished March 23, 2026). TRC (Temporary Residence Card): 1-6 months depending on voivodeship. Oświadczenie: 7 working days at PUP. Fee: PLN 400. Visa Type D: EUR 200. Visa Type C: EUR 90. Legal basis: KPA Art. 35." },
          { patterns: [/zus/i, /social\s*security/i, /contribution/i, /skladk/i], answer: "ZUS 2026 rates: Employee pension 9.76%, disability 1.5%, sickness 2.45%, health 9%. Employer pension 9.76%, disability 6.5%, accident 1.67%, FP 2.45%, FGSP 0.10%. Registration within 7 days (ZUA/ZZA form). Monthly DRA by 15th. Minimum wage: PLN 4,806/month = PLN 31.40/hour. Annual cap: PLN 282,600. IMPORTANT: From Jan 1, 2025 all umowa zlecenia have mandatory full social insurance — contributions identical to employment contracts. Legal basis: Act on Social Insurance System Art. 6-12." },
          { patterns: [/oswiadczenie|declaration.*employ/i], answer: "Oświadczenie o powierzeniu pracy (2026): Simplified work authorization for citizens of Armenia, Belarus, Moldova, Ukraine. IMPORTANT: Georgia was REMOVED from fast-track on December 1, 2025 — Georgian nationals now require standard work permits. Max 24 months. Fee: PLN 400 (was PLN 100). Registered at local PUP (7 working days). Employer must notify PUP of work commencement within 7 DAYS. If worker doesn't start: notify within 14 days. Legal basis: Act on Employment Promotion Art. 88z." },
          { patterns: [/pip|inspection|fine|penalty|kara/i], answer: "PIP fines 2026 (DOUBLED from previous year): Standard violation: up to PLN 60,000 (was 30,000). Repeated violation: up to PLN 90,000 (was 45,000). Obstruction/false info: up to PLN 50,000. Posted worker breach: up to PLN 30,000 per violation. PUP notification failure: PLN 1,000-3,000. NEW 2026: PIP can now reclassify B2B contracts to employment WITHOUT court proceedings — decision effective immediately. PIP has remote inspection powers and cross-system access to ZUS/KAS databases. Legal basis: Act on Employment Promotion Art. 120, Kodeks pracy Art. 281-283." },
          { patterns: [/art.*108|article.*108|continuity|ochrona/i], answer: "Article 108 of the Act on Foreigners (Dz.U.2025.1079): provides legal continuity of stay when TRC application is filed before permit expiry AND contains no formal defects. Since April 27, 2026: protection activates upon MOS 'Correct Submission' notification — electronic certificate with QR code replaces passport stamp. Worker must maintain: same employer + same role. Filing is digital-only via MOS 2.0. Protection does NOT apply if proceedings suspended at applicant's request (Art. 108 s.2). Legal basis: Ustawa o cudzoziemcach Art. 108, amended by Dz.U.2025.1794." },
          { patterns: [/mos|digital.*filing|electronic.*submission|portal/i], answer: "MOS 2.0 (Moduł Obsługi Spraw): exclusive electronic filing portal from April 27, 2026 (M.P.2026.370). Paper applications REJECTED. Requirements: Trusted Profile (Profil Zaufany) or qualified e-signature or EU e-ID. Employer Annex 1: must be signed with qualified e-signature within 30 days via encrypted link. UPO (electronic receipt) with QR code replaces physical stamp. Fee-exempt. Transitional: file paper before April 26, 2026 if legal stay expires before May 11, 2026. Portal: mos.cudzoziemcy.gov.pl" },
          { patterns: [/ees|entry.*exit|biometric|schengen.*90/i], answer: "EU Entry/Exit System (EES): launched April 10, 2026. No more passport stamps — entries recorded biometrically (facial image + fingerprints). 90/180-day Schengen counting is now automated across ALL Schengen states combined. Overstay detection is automatic — eliminates 'reset' trips. Workers on Art. 108 protection are exempt from 90/180 counting. Non-EU workers on short stays must monitor day count via EES portal. Legal basis: EU Regulation 2017/2226." },
          { patterns: [/new.*rule|april.*2026|zmian|nowe.*przepis|immigrant/i], answer: "Key 2026 changes: (1) Jan 1: MOS mandate + fees quadrupled (PLN 400/800) + PESEL in-person for non-EU. (2) Mar 4: Specustawa ends, CUKR framework begins. (3) Mar 5: 7-day PUP notification for ALL new contracts. (4) Mar 23: Labour market test ABOLISHED. (5) Apr 1: Non-biometric Russian passports not recognized. (6) Apr 10: EES goes live. (7) Apr 27: MOS 2.0 portal operational. (8) Aug 31: PESEL UKR photo-ID update deadline. (9) PIP fines doubled to PLN 60,000/90,000. (10) PIP can reclassify B2B without court. (11) Georgia removed from oświadczenie fast-track." },
          { patterns: [/cukr|ukraine|specustawa|ukrain.*special/i], answer: "CUKR / Ukraine Special Act: Specustawa ENDED March 4, 2026. Replaced by CUKR residence card system. CUKR card: 3-year validity, full labor market access, Schengen travel (90/180). Eligibility: held UKR status on June 4, 2025 + uninterrupted for 365+ days. Application deadline: March 4, 2027. Filed via MOS only. WARNING: obtaining CUKR card = loss of UKR status. Transitional employment: notification system for Ukrainian workers until March 4, 2029. EU temporary protection: extended to March 4, 2027 (Council Decision 2025/1460). PESEL UKR photo-ID update deadline: August 31, 2026." },
          { patterns: [/bhp|safety.*train|health.*safety|szkolenie/i], answer: "BHP training 2026: Initial (wstępne) — before work starts, valid 12 months (6 months for managers). Periodic (okresowe): blue-collar workers every 3 years, dangerous work every 1 year, engineering every 5 years, managers every 5 years, admin every 6 years. MUST be in worker's language. Fines 2026: up to PLN 60,000 (doubled from 30,000). Repeated: PLN 90,000. Legal basis: Regulation of Minister of Economy and Labor, July 27, 2004." },
          { patterns: [/medical|badania|lekarskie|health.*exam/i], answer: "Medical examinations (Badania lekarskie): Pre-employment (wstępne) — mandatory before work starts. Periodic (okresowe): general work every 5 years, moderate hazard every 2-3 years, high hazard (welding/construction) every 1-2 years. Return-to-work (kontrolne): after 30+ days absence. Employer issues referral (skierowanie), physician issues certificate (orzeczenie). Cannot allow work without valid certificate. All at employer's expense during working hours. Legal basis: Kodeks pracy Art. 229." },
          { patterns: [/pesel|registration.*number/i], answer: "PESEL 2026: Auto-assigned when registering stay >30 days. Required for: ZUS, tax, banking, healthcare. 2026 change: mandatory in-person appearance at municipal office for non-European nationals — no proxy. Ukrainian citizens with UKR status: submit PESEL application within 30 days of border crossing. DEADLINE: PESEL UKR holders must update photo-ID by August 31, 2026 or lose protection status (changed to NUE) from September 1, 2026." },
          { patterns: [/posted.*worker|delegow|a1.*certif|posting/i], answer: "Posted Workers Directive (96/71/EC) in Poland 2026: A1 certificate required (max 24 months). PIP declaration: submit no later than first day of posting via Biznes.gov.pl. Change notification: 7 working days. After 12 months (extendable to 18 with notification): virtually ALL Polish employment conditions apply. Minimum wage: PLN 4,806/month. Travel/accommodation reimbursements may NOT count toward minimum wage. Accommodation proof required for postings >90 days in 180-day period. Fines: up to PLN 30,000 per breach. Subcontractor liability for minimum wage. Legal basis: Art. 12 Ustawa o delegowaniu pracowników." },
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

// POST /api/legal-kb/ask — 3-tier intelligence routing (KB → Perplexity → Claude)
router.post("/legal-kb/ask", requireAuth, async (req, res) => {
  try {
    const { question, language } = req.body as { question?: string; language?: string };
    if (!question?.trim()) return res.status(400).json({ error: "question required" });

    const { routeIntelligenceQuery } = await import("../services/intelligence-router.service.js");
    const result = await routeIntelligenceQuery(question, req.tenantId!, language || "en");

    // Log query with tier info
    await execute(
      "INSERT INTO legal_queries (tenant_id, user_id, question, answer, sources_used, language) VALUES ($1,$2,$3,$4,$5,$6)",
      [req.tenantId!, (req as any).user?.email || "unknown", question, result.answer,
       JSON.stringify({ tier: result.sourceTier, citations: result.citations }), language || "en"]
    ).catch(() => {});

    res.json(result);
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
