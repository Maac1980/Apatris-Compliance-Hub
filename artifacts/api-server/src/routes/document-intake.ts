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

// POST /api/v1/intake/sandbox — AI extraction with ZERO database writes
// Admin-only in production, open in development. For demos + lawyer training + QA.
router.post("/v1/intake/sandbox", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    if (!req.file && !req.body?.file) {
      // Handle multipart via multer-like buffer extraction
    }

    const multer = (await import("multer")).default;
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }).single("file");

    upload(req as any, res as any, async (err: any) => {
      if (err) return res.status(400).json({ error: "File upload failed" });
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: "No file provided" });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.json({ sandbox: true, error: "No AI key configured", extraction: null });

      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });

        const base64 = file.buffer.toString("base64");
        const mediaType = file.mimetype as "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

        let content: any[];
        if (mediaType === "application/pdf") {
          content = [
            { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } },
            { type: "text" as const, text: "Extract ALL data from this document. Return JSON with: documentType, fullName, dateOfBirth, nationality, passportNumber, pesel, issuedDate, expiryDate, issuingAuthority, caseNumber, any other fields found. Also assess: legalImpact (IDENTITY_ONLY|PERMIT_VALIDITY|FILING_CONTINUITY|LEGAL_STAY_PROTECTION|REJECTION_APPEAL_RISK|APPROVAL_DECISION|EXPIRY_UPDATE|NO_LEGAL_IMPACT), riskLevel (LOW|MEDIUM|HIGH|CRITICAL), and list suggestedActions." },
          ];
        } else {
          content = [
            { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: base64 } },
            { type: "text" as const, text: "Extract ALL data from this document image. Return JSON with: documentType, fullName, dateOfBirth, nationality, passportNumber, pesel, issuedDate, expiryDate, issuingAuthority, caseNumber, any other fields found. Also assess: legalImpact, riskLevel, and suggestedActions." },
          ];
        }

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 2048,
          system: "You are a Polish immigration document specialist. Extract structured data from uploaded documents. Return valid JSON only. Be precise with dates (YYYY-MM-DD format) and names.",
          messages: [{ role: "user", content }],
        });

        const text = response.content[0]?.type === "text" ? response.content[0].text : "";
        let extraction: any = {};
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) extraction = JSON.parse(jsonMatch[0]);
        } catch { extraction = { raw: text }; }

        res.json({
          sandbox: true,
          dbWritten: false,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          extraction,
          aiModel: "claude-sonnet-4-6",
          timestamp: new Date().toISOString(),
        });
      } catch (aiErr) {
        res.json({ sandbox: true, dbWritten: false, error: aiErr instanceof Error ? aiErr.message : "AI failed", extraction: null });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Sandbox failed" });
  }
});

export default router;
