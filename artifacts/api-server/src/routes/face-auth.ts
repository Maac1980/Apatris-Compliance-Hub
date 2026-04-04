import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { sensitiveLimiter } from "../lib/rate-limit.js";
import { enrollFace, getWorkerFaces, deleteWorkerFaces, verifyFace } from "../lib/face-recognition.js";
import { fetchWorkerById } from "../lib/workers-db.js";
import { logGdprAction } from "../lib/gdpr.js";
import { isMailConfigured, sendOtpEmail } from "../lib/mailer.js";
import { otpStore } from "./auth.js";

const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_EXPIRES_IN = "15m";
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const ADMIN_EMAILS = new Set(["manishshetty79@gmail.com", "akshay@apatris.pl"]);

function signToken(userData: Record<string, unknown>) {
  return jwt.sign(userData, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

const router = Router();

// POST /api/face/enroll — register a face for a worker (requires auth + admin role)
router.post(
  "/face/enroll",
  requireAuth,
  requireRole("Admin", "Executive", "TechOps", "Coordinator"),
  async (req, res) => {
    try {
      const { workerId, descriptor, qualityScore } = req.body as {
        workerId?: string;
        descriptor?: number[];
        qualityScore?: number;
      };

      if (!workerId || !descriptor) {
        return res.status(400).json({ error: "workerId and descriptor are required" });
      }

      // Verify worker exists
      const worker = await fetchWorkerById(workerId, req.tenantId!);
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      const encoding = await enrollFace({
        tenantId: req.tenantId!,
        workerId,
        workerName: worker.full_name,
        descriptor,
        qualityScore,
        enrolledBy: req.user!.name,
      });

      // Log for GDPR (biometric data)
      await logGdprAction({
        tenantId: req.tenantId!,
        action: "BIOMETRIC_ENROLLMENT",
        targetType: "worker",
        targetId: workerId,
        targetName: worker.full_name,
        performedBy: req.user!.name,
        details: { encodingId: encoding.id, qualityScore },
      });

      res.status(201).json({
        success: true,
        encoding: { id: encoding.id, workerName: encoding.workerName, enrolledAt: encoding.enrolledAt },
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Enrollment failed" });
    }
  }
);

// GET /api/face/enrollments/:workerId — list face enrollments for a worker
router.get(
  "/face/enrollments/:workerId",
  requireAuth,
  async (req, res) => {
    try {
      const faces = await getWorkerFaces(req.params.workerId, req.tenantId!);
      // Don't return the raw descriptors — just metadata
      res.json({
        enrollments: faces.map(f => ({
          id: f.id,
          workerName: f.workerName,
          qualityScore: f.qualityScore,
          enrolledAt: f.enrolledAt,
          enrolledBy: f.enrolledBy,
        })),
        count: faces.length,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch enrollments" });
    }
  }
);

// DELETE /api/face/enrollments/:workerId — delete all face data for a worker
router.delete(
  "/face/enrollments/:workerId",
  requireAuth,
  requireRole("Admin", "Executive"),
  async (req, res) => {
    try {
      const count = await deleteWorkerFaces(req.params.workerId, req.tenantId!);

      await logGdprAction({
        tenantId: req.tenantId!,
        action: "BIOMETRIC_DELETION",
        targetType: "worker",
        targetId: req.params.workerId,
        performedBy: req.user!.name,
        details: { encodingsDeleted: count },
      });

      res.json({ success: true, deleted: count });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Deletion failed" });
    }
  }
);

// POST /api/face/verify — face login (no auth required — this IS the login)
router.post("/face/verify", sensitiveLimiter, async (req, res) => {
  try {
    const { descriptor, tenantSlug } = req.body as {
      descriptor?: number[];
      tenantSlug?: string;
    };

    if (!descriptor || !Array.isArray(descriptor)) {
      return res.status(400).json({ error: "descriptor array is required" });
    }

    // Resolve tenant — use slug or fall back to request tenant
    let tenantId = req.tenantId!;
    if (tenantSlug) {
      const { queryOne } = await import("../lib/db.js");
      const tenant = await queryOne<{ id: string }>(
        "SELECT id FROM tenants WHERE slug = $1 AND is_active = TRUE",
        [tenantSlug]
      );
      if (tenant) tenantId = tenant.id;
    }

    const result = await verifyFace(descriptor, tenantId);

    if (!result.matched || !result.worker) {
      // Check if any faces are enrolled at all
      const { query: dbQuery } = await import("../lib/db.js");
      const enrollCount = await dbQuery<{ count: string }>(
        "SELECT count(*)::text as count FROM face_encodings WHERE tenant_id = $1",
        [tenantId]
      );
      const hasEnrollments = parseInt(enrollCount[0]?.count ?? "0", 10) > 0;

      return res.status(401).json({
        matched: false,
        error: hasEnrollments
          ? "Face not recognized. Please try again or use PIN login."
          : "No faces enrolled yet. Ask your administrator to register your face before using Face Login.",
        noEnrollments: !hasEnrollments,
        confidence: result.confidence,
      });
    }

    // Fetch full worker details for the JWT
    const { fetchWorkerById } = await import("../lib/workers-db.js");
    const worker = await fetchWorkerById(result.worker.id, tenantId);

    const userData = {
      email: worker?.email ?? `${result.worker.name.toLowerCase().replace(/\s+/g, ".")}@worker.apatris.pl`,
      name: result.worker.name,
      role: "Professional",  // Face login is for T5 workers
      tenantId,
    };

    if (ADMIN_EMAILS.has(userData.email.toLowerCase())) {
      if (!isMailConfigured()) {
        return res.status(503).json({ error: "Two-factor login is temporarily unavailable. Contact the administrator." });
      }

      const session = crypto.randomBytes(24).toString("hex");
      const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

      otpStore.set(session, {
        otp,
        expires: Date.now() + OTP_EXPIRY_MS,
        userData: {
          email: userData.email,
          name: userData.name,
          role: "Admin",
          tenantId,
        },
      });

      try {
        await sendOtpEmail(userData.email, userData.name, otp);
      } catch (err) {
        otpStore.delete(session);
        console.error("[FaceAuth] Failed to send OTP email:", err instanceof Error ? err.message : err);
        return res.status(503).json({ error: "We could not send your verification code. Please try again or contact the administrator." });
      }

      return res.json({
        matched: true,
        confidence: result.confidence,
        otpRequired: true,
        session,
      });
    }

    const accessToken = signToken(userData);

    // Create refresh token
    const { execute } = await import("../lib/db.js");
    const refreshToken = crypto.randomBytes(48).toString("hex");
    const refreshHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await execute(
      `INSERT INTO refresh_tokens (token_hash, user_email, user_name, user_role, tenant_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [refreshHash, userData.email, userData.name, userData.role, tenantId, expiresAt]
    );

    res.json({
      matched: true,
      confidence: result.confidence,
      worker: {
        id: result.worker.id,
        name: result.worker.name,
        site: worker?.assigned_site ?? null,
      },
      jwt: accessToken,
      refreshToken,
      role: "Professional",
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Face verification failed" });
  }
});

export default router;
