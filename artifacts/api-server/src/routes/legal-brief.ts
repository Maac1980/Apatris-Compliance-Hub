/**
 * Legal Brief Pipeline API
 *
 * POST /api/v1/legal/brief/generate — run full 4-stage pipeline
 * GET  /api/v1/legal/brief/:id — get brief by ID
 * GET  /api/v1/legal/briefs/:workerId — list briefs for worker
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { generateLegalBrief, getBriefById, getBriefsByWorker } from "../services/legal-brief-pipeline.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

router.post("/v1/legal/brief/generate", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const { workerId, caseId, rejectionText } = req.body as {
      workerId?: string; caseId?: string; rejectionText?: string;
    };
    if (!workerId) return res.status(400).json({ error: "workerId is required" });

    const result = await generateLegalBrief(
      workerId, req.tenantId!, req.user?.name ?? "unknown", caseId, rejectionText,
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Brief generation failed" });
  }
});

router.get("/v1/legal/brief/:id", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const brief = await getBriefById(req.params.id, req.tenantId!);
    if (!brief) return res.status(404).json({ error: "Brief not found" });
    res.json(brief);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch brief" });
  }
});

router.get("/v1/legal/briefs/:workerId", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const briefs = await getBriefsByWorker(req.params.workerId, req.tenantId!);
    res.json({ briefs, count: briefs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch briefs" });
  }
});

// GET /api/v1/legal/brief/:id/worker-explanation — shareable worker explanation
router.get("/v1/legal/brief/:id/worker-explanation", requireAuth, requireRole(...LEGAL_ROLES, "Coordinator"), async (req, res) => {
  try {
    const brief = await getBriefById(req.params.id, req.tenantId!);
    if (!brief) return res.status(404).json({ error: "Brief not found" });
    const finalBrief = typeof brief.final_brief_json === "string" ? JSON.parse(brief.final_brief_json) : brief.final_brief_json;
    const stage5 = finalBrief?.stage5 ?? null;
    if (!stage5) return res.status(404).json({ error: "Worker explanation not available — brief may be incomplete or halted" });
    res.json(stage5);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch explanation" });
  }
});

export default router;
