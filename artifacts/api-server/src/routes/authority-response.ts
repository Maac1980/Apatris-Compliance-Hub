import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  generateAuthorityPack, getAuthorityPack, listAuthorityPacksByWorker, approveAuthorityPack,
} from "../services/authority-response.service.js";

const router = Router();

// All authority pack endpoints are restricted to Admin/Executive/LegalHead
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

// GET /api/v1/legal/authority-pack/all — list all packs for tenant
router.get("/v1/legal/authority-pack/all", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { query } = await import("../lib/db.js");
    const packs = await query(
      `SELECT ap.*, w.full_name as worker_name FROM authority_response_packs ap
       LEFT JOIN workers w ON w.id = ap.worker_id
       WHERE ap.tenant_id = $1 ORDER BY ap.created_at DESC LIMIT 100`,
      [req.tenantId!]
    );
    res.json({ packs, count: packs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/legal/authority-pack/generate — generate a new authority response pack
router.post("/v1/legal/authority-pack/generate", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { caseId, authorityQuestion } = req.body as { caseId?: string; authorityQuestion?: string };
    if (!caseId) return res.status(400).json({ error: "caseId is required" });

    const pack = await generateAuthorityPack(caseId, req.tenantId!, authorityQuestion);
    res.status(201).json({ pack });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate authority pack" });
  }
});

// GET /api/v1/legal/authority-pack/:id — get a specific pack
router.get("/v1/legal/authority-pack/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const pack = await getAuthorityPack(req.params.id as string, req.tenantId!);
    if (!pack) return res.status(404).json({ error: "Pack not found" });
    res.json({ pack });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch pack" });
  }
});

// GET /api/v1/legal/authority-pack/worker/:workerId — list packs for a worker
router.get("/v1/legal/authority-pack/worker/:workerId", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const packs = await listAuthorityPacksByWorker(req.params.workerId as string, req.tenantId!);
    res.json({ packs, count: packs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch packs" });
  }
});

// POST /api/v1/legal/authority-pack/:id/approve — approve a draft pack
router.post("/v1/legal/authority-pack/:id/approve", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const approvedBy = (req as any).adminEmail ?? (req as any).user?.email ?? "unknown";
    const pack = await approveAuthorityPack(req.params.id as string, req.tenantId!, approvedBy);
    res.json({ pack });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to approve pack" });
  }
});

export default router;
