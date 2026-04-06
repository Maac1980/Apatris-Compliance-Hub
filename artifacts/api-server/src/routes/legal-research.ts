import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { fetchLatestUpdates, listArticles } from "../services/legal-research.service.js";

const router = Router();

// POST /api/v1/legal/research/fetch — trigger Perplexity search and store results
router.post("/v1/legal/research/fetch", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { query: customQuery } = req.body as { query?: string };
    const articles = await fetchLatestUpdates(req.tenantId!, customQuery);
    res.status(201).json({ articles, count: articles.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch legal updates" });
  }
});

// GET /api/v1/legal/research/articles — list stored articles
router.get("/v1/legal/research/articles", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const articles = await listArticles(req.tenantId!);
    res.json({ articles, count: articles.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list articles" });
  }
});

export default router;
