import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { approveEntity, isApproved, type ApprovableEntity } from "../services/legal-approval.service.js";

const router = Router();
const VALID_ENTITIES: ApprovableEntity[] = ["authority_pack", "ai_response", "rejection_analysis"];

// POST /api/v1/legal/approve — approve a legal output entity
router.post("/v1/legal/approve", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { entityType, entityId } = req.body as { entityType?: string; entityId?: string };
    if (!entityType || !VALID_ENTITIES.includes(entityType as ApprovableEntity)) {
      return res.status(400).json({ error: `entityType must be one of: ${VALID_ENTITIES.join(", ")}` });
    }
    if (!entityId) return res.status(400).json({ error: "entityId is required" });

    const approvedBy = (req as any).adminEmail ?? (req as any).user?.email ?? "unknown";
    const result = await approveEntity(entityType as ApprovableEntity, entityId, approvedBy, req.tenantId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Approval failed" });
  }
});

// GET /api/v1/legal/approve/status — check approval status
router.get("/v1/legal/approve/status", requireAuth, async (req, res) => {
  try {
    const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
    if (!entityType || !VALID_ENTITIES.includes(entityType as ApprovableEntity)) {
      return res.status(400).json({ error: `entityType must be one of: ${VALID_ENTITIES.join(", ")}` });
    }
    if (!entityId) return res.status(400).json({ error: "entityId is required" });

    const status = await isApproved(entityType as ApprovableEntity, entityId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to check approval status" });
  }
});

export default router;
