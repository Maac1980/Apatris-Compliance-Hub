import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { sensitiveLimiter } from "../lib/rate-limit.js";
import {
  CONSENT_TYPES,
  getWorkerConsents,
  grantConsent,
  revokeConsent,
  logGdprAction,
  getGdprLog,
  eraseWorkerData,
  exportWorkerData,
  purgeExpiredData,
} from "../lib/gdpr.js";
import { queryOne } from "../lib/db.js";

const router = Router();

// ── Consent Management ─────────────────────────────────────────────────────

// GET /api/gdpr/consent-types — list all consent types
router.get("/gdpr/consent-types", requireAuth, (_req, res) => {
  res.json({ consentTypes: CONSENT_TYPES });
});

// GET /api/gdpr/consents/:workerId — get consent status for a worker
router.get("/gdpr/consents/:workerId", requireAuth, async (req, res) => {
  try {
    const consents = await getWorkerConsents(req.params.workerId, req.tenantId!);
    res.json({ consents });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch consents" });
  }
});

// POST /api/gdpr/consents — grant a consent
router.post("/gdpr/consents", requireAuth, async (req, res) => {
  try {
    const { workerId, workerName, consentType, version } = req.body as {
      workerId?: string; workerName?: string; consentType?: string; version?: string;
    };
    if (!workerId || !workerName || !consentType) {
      return res.status(400).json({ error: "workerId, workerName, and consentType are required" });
    }
    if (!CONSENT_TYPES.includes(consentType as any)) {
      return res.status(400).json({ error: `Invalid consent type. Must be one of: ${CONSENT_TYPES.join(", ")}` });
    }
    const consent = await grantConsent({
      tenantId: req.tenantId!,
      workerId,
      workerName,
      consentType,
      ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip,
      userAgent: req.headers["user-agent"],
      version,
    });
    await logGdprAction({
      tenantId: req.tenantId!,
      action: "CONSENT_GRANTED",
      targetType: "worker",
      targetId: workerId,
      targetName: workerName,
      performedBy: req.user!.name,
      details: { consentType, version: version ?? "1.0" },
    });
    res.status(201).json({ consent });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to grant consent" });
  }
});

// DELETE /api/gdpr/consents — revoke a consent
router.delete("/gdpr/consents", requireAuth, async (req, res) => {
  try {
    const { workerId, consentType } = req.body as { workerId?: string; consentType?: string };
    if (!workerId || !consentType) {
      return res.status(400).json({ error: "workerId and consentType are required" });
    }
    await revokeConsent({ tenantId: req.tenantId!, workerId, consentType });
    await logGdprAction({
      tenantId: req.tenantId!,
      action: "CONSENT_REVOKED",
      targetType: "worker",
      targetId: workerId,
      performedBy: req.user!.name,
      details: { consentType },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to revoke consent" });
  }
});

// ── Right to Erasure (Article 17) ──────────────────────────────────────────

// DELETE /api/gdpr/erase/:workerId — permanently delete all worker data
router.delete(
  "/gdpr/erase/:workerId",
  requireAuth,
  requireRole("Admin", "Executive"),
  sensitiveLimiter,
  async (req, res) => {
    try {
      const result = await eraseWorkerData(req.params.workerId, req.tenantId!, req.user!.name);
      res.json({
        success: true,
        message: "All personal data has been permanently deleted.",
        ...result,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Erasure failed" });
    }
  }
);

// ── Data Subject Access Request (Article 15) ───────────────────────────────

// GET /api/gdpr/export/:workerId — export all data for a worker
router.get(
  "/gdpr/export/:workerId",
  requireAuth,
  requireRole("Admin", "Executive", "LegalHead"),
  async (req, res) => {
    try {
      const data = await exportWorkerData(req.params.workerId, req.tenantId!, req.user!.name);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Export failed" });
    }
  }
);

// ── GDPR Audit Log ─────────────────────────────────────────────────────────

// GET /api/gdpr/log — view GDPR audit trail
router.get(
  "/gdpr/log",
  requireAuth,
  requireRole("Admin", "Executive", "LegalHead"),
  async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const log = await getGdprLog(req.tenantId!, limit);
      res.json({ log });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch GDPR log" });
    }
  }
);

// ── Data Retention Purge ───────────────────────────────────────────────────

// POST /api/gdpr/purge — trigger data retention purge (admin only)
router.post(
  "/gdpr/purge",
  requireAuth,
  requireRole("Admin"),
  sensitiveLimiter,
  async (req, res) => {
    try {
      const tenant = await queryOne<{ data_retention_days: number }>(
        "SELECT data_retention_days FROM tenants WHERE id = $1",
        [req.tenantId!]
      );
      const retentionDays = tenant?.data_retention_days ?? 2555;
      const result = await purgeExpiredData(req.tenantId!, retentionDays);
      res.json({
        success: true,
        retentionDays,
        ...result,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Purge failed" });
    }
  }
);

export default router;
