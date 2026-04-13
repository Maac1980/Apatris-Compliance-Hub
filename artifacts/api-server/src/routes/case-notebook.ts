import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  addNotebookEntry, getNotebookEntries, getRecentEntriesAcrossCases, searchNotebook,
} from "../services/case-notebook.service.js";
import { vaultSearch } from "../services/vault-search.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

// GET /api/v1/vault/notebook/:caseId — all entries for a case
router.get("/v1/vault/notebook/:caseId", requireAuth, async (req, res) => {
  try {
    const entries = await getNotebookEntries(req.params.caseId as string, req.tenantId!);
    res.json({ entries, count: entries.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/vault/notebook — recent entries across all cases
router.get("/v1/vault/notebook", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const entries = await getRecentEntriesAcrossCases(req.tenantId!, limit);
    res.json({ entries, count: entries.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/notebook/:caseId — add manual entry
router.post("/v1/vault/notebook/:caseId", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { title, content } = req.body as { title?: string; content?: string };
    if (!title || !content) return res.status(400).json({ error: "title and content required" });
    const entry = await addNotebookEntry(
      req.params.caseId as string, req.tenantId!, "manual", title, content,
      { author: (req as any).user?.email || "unknown" }
    );
    res.status(201).json({ entry });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/search — search notebook entries
router.post("/v1/vault/search/notebook", requireAuth, async (req, res) => {
  try {
    const { query: q } = req.body as { query?: string };
    if (!q?.trim()) return res.status(400).json({ error: "query required" });
    const entries = await searchNotebook(req.tenantId!, q);
    res.json({ entries, count: entries.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/vault/search — unified search across all legal content
router.post("/v1/vault/search", requireAuth, async (req, res) => {
  try {
    const { query: q, limit } = req.body as { query?: string; limit?: number };
    if (!q?.trim()) return res.status(400).json({ error: "query required" });
    const results = await vaultSearch(req.tenantId!, q, Math.min(limit ?? 30, 100));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
