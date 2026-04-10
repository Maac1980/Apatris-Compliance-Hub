/**
 * Document Intake Intelligence API routes.
 *
 * POST /api/v1/intake/process   — upload + AI analysis
 * POST /api/v1/intake/:id/confirm — confirm and apply actions
 * POST /api/v1/intake/:id/reject  — reject an intake
 * GET  /api/v1/intake/pending     — list pending reviews
 * GET  /api/v1/intake/:id         — get single intake
 */

import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  processDocumentIntake, confirmIntake, rejectIntake,
  getPendingIntakes, getIntakeById,
} from "../services/document-intake.service.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const INTAKE_ROLES = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"];

// POST /api/v1/intake/process — upload document for AI analysis
router.post("/v1/intake/process", requireAuth, requireRole(...INTAKE_ROLES), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(req.file.mimetype)) {
      return res.status(400).json({ error: `Unsupported file type: ${req.file.mimetype}. Allowed: PDF, JPEG, PNG, WebP, GIF` });
    }

    const result = await processDocumentIntake(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      req.tenantId!,
      req.user?.name ?? req.user?.email ?? "unknown",
    );

    res.status(201).json(result);
  } catch (err) {
    console.error("[intake/process] Error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Intake processing failed" });
  }
});

// POST /api/v1/intake/:id/confirm — confirm intake and apply actions
router.post("/v1/intake/:id/confirm", requireAuth, requireRole(...INTAKE_ROLES), async (req, res) => {
  try {
    const { confirmedWorkerId, confirmedFields, applyActions } = req.body as {
      confirmedWorkerId?: string;
      confirmedFields?: Record<string, any>;
      applyActions?: string[];
    };

    if (!confirmedWorkerId) return res.status(400).json({ error: "confirmedWorkerId is required" });

    const result = await confirmIntake(
      req.params.id,
      req.tenantId!,
      req.user?.name ?? req.user?.email ?? "unknown",
      confirmedWorkerId,
      confirmedFields ?? {},
      applyActions ?? [],
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Confirmation failed" });
  }
});

// POST /api/v1/intake/:id/reject — reject an intake
router.post("/v1/intake/:id/reject", requireAuth, requireRole(...INTAKE_ROLES), async (req, res) => {
  try {
    await rejectIntake(req.params.id, req.tenantId!, req.user?.name ?? "unknown");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Rejection failed" });
  }
});

// GET /api/v1/intake/pending — list pending reviews
router.get("/v1/intake/pending", requireAuth, requireRole(...INTAKE_ROLES), async (req, res) => {
  try {
    const intakes = await getPendingIntakes(req.tenantId!);
    res.json({ intakes, count: intakes.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch pending intakes" });
  }
});

// GET /api/v1/intake/:id — get single intake
router.get("/v1/intake/:id", requireAuth, requireRole(...INTAKE_ROLES), async (req, res) => {
  try {
    const intake = await getIntakeById(req.params.id, req.tenantId!);
    if (!intake) return res.status(404).json({ error: "Intake not found" });
    res.json(intake);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch intake" });
  }
});

export default router;
