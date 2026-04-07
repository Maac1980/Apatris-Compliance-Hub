import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  syncTrcCaseToLegalCase, linkOrphanedTrcCases,
  getLinkedCaseView, getAllLinkedCases,
} from "../services/case-sync.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

// GET /api/v1/legal/cases/linked — all cases with TRC linkage info
router.get("/v1/legal/cases/linked", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const cases = await getAllLinkedCases(req.tenantId!);
    res.json({ cases, count: cases.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch linked cases" });
  }
});

// GET /api/v1/legal/cases/:id/linked-trc — unified view for a single case
router.get("/v1/legal/cases/:id/linked-trc", requireAuth, async (req, res) => {
  try {
    const view = await getLinkedCaseView(req.params.id as string, req.tenantId!);
    if (!view) return res.status(404).json({ error: "Case not found" });
    res.json(view);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch case view" });
  }
});

// POST /api/v1/legal/cases/:id/sync — manual trigger to sync TRC ↔ legal
router.post("/v1/legal/cases/:id/sync", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    // Check if this is a legal case with a linked TRC
    const result = await syncTrcCaseToLegalCase(req.params.id as string, req.tenantId!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

// POST /api/v1/legal/cases/link-orphans — bulk-link TRC cases without legal cases
router.post("/v1/legal/cases/link-orphans", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const result = await linkOrphanedTrcCases(req.tenantId!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to link orphans" });
  }
});

export default router;
