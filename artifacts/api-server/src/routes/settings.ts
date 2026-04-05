import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";

const router = Router();

// GET /api/settings/status
// Returns non-secret diagnostics about server configuration.
router.get("/settings/status", requireAuth, requireRole("Admin"), (_req, res) => {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST;

  const manishSet = !!process.env.APATRIS_PASS_MANISH;
  const akshaySet = !!process.env.APATRIS_PASS_AKSHAY;

  res.json({
    smtp: {
      configured: !!(smtpUser && smtpPass),
      fields: {
        SMTP_HOST: smtpHost ? "set" : "missing",
        SMTP_USER: smtpUser ? "set" : "missing",
        SMTP_PASS: smtpPass ? "set" : "missing",
      },
    },
    adminPasswords: {
      manish: manishSet,
      akshay: akshaySet,
      allSet: manishSet && akshaySet,
    },
  });
});

// POST /api/settings/seed-demo — Admin-only: seed demo data for empty modules
router.post("/settings/seed-demo", requireAuth, requireRole("Admin"), async (_req, res) => {
  try {
    const { seedModuleDemoData } = await import("../lib/seed-modules.js");
    // Temporarily allow in production for this explicit admin action
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    await seedModuleDemoData();
    process.env.NODE_ENV = origEnv;
    res.json({ success: true, message: "Demo data seeded for dashboard modules." });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Seeding failed" });
  }
});

export default router;
