import { Router } from "express";

const router = Router();

// GET /api/settings/status
// Returns non-secret diagnostics about server configuration.
router.get("/settings/status", (_req, res) => {
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

export default router;
