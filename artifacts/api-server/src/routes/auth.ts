import { Router } from "express";
import crypto from "crypto";
import { findCoordinatorByEmail, verifyCoordinatorPassword } from "../lib/site-coordinators.js";
import { sendOtpEmail, isMailConfigured } from "../lib/mailer.js";
import { appendAuditLog } from "../lib/audit-log.js";

const router = Router();

const ALLOWED_USERS = [
  {
    email: "manish@apatris.pl",
    name: "Manish",
    role: "Admin",
    passEnvKey: "APATRIS_PASS_MANISH",
  },
  {
    email: "akshay@apatris.pl",
    name: "Akshay",
    role: "Admin",
    passEnvKey: "APATRIS_PASS_AKSHAY",
  },
];

// In-memory OTP store: session → { otp, expires, userData }
const otpStore = new Map<string, {
  otp: string;
  expires: number;
  userData: { email: string; name: string; role: string; assignedSite?: string };
}>();

// Clean up expired OTPs every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpStore) {
    if (val.expires < now) otpStore.delete(key);
  }
}, 10 * 60 * 1000);

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = ALLOWED_USERS.find((u) => u.email === normalizedEmail);

    if (user) {
      const storedPassword = process.env[user.passEnvKey];
      if (!storedPassword || storedPassword !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const userData = { email: user.email, name: user.name, role: user.role };

      // 2FA: if SMTP is configured, send OTP and require verification
      if (isMailConfigured()) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const session = crypto.randomUUID();
        otpStore.set(session, {
          otp,
          expires: Date.now() + 5 * 60 * 1000,
          userData,
        });
        try {
          await sendOtpEmail(user.email, user.name, otp);
        } catch (e) {
          console.error("[Auth] Failed to send OTP email:", e);
          // On email failure, fall back to direct login so admin is never locked out
          appendAuditLog({ timestamp: new Date().toISOString(), actor: user.name, actorEmail: user.email, action: "ADMIN_LOGIN", workerId: "—", workerName: "—", note: "Direct login (OTP email failed)" });
          return res.json(userData);
        }
        return res.json({ otpRequired: true, session });
      }

      // No SMTP: direct login
      appendAuditLog({ timestamp: new Date().toISOString(), actor: user.name, actorEmail: user.email, action: "ADMIN_LOGIN", workerId: "—", workerName: "—", note: "Direct login (SMTP not configured)" });
      return res.json(userData);
    }

    // Check site coordinator accounts (no 2FA for coordinators)
    const coordinator = findCoordinatorByEmail(normalizedEmail);
    if (coordinator) {
      if (!verifyCoordinatorPassword(coordinator, password)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      return res.json({
        email: coordinator.email,
        name: coordinator.name,
        role: "Coordinator",
        assignedSite: coordinator.assignedSite,
      });
    }

    return res.status(403).json({ error: "Access Denied: Contact Administrator." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return res.status(500).json({ error: message });
  }
});

// ─── POST /api/auth/verify-otp ───────────────────────────────────────────────
router.post("/auth/verify-otp", (req, res) => {
  try {
    const { session, otp } = req.body as { session?: string; otp?: string };

    if (!session || !otp) {
      return res.status(400).json({ error: "Session and OTP code are required" });
    }

    const entry = otpStore.get(session);

    if (!entry) {
      return res.status(401).json({ error: "Session not found. Please log in again." });
    }

    if (entry.expires < Date.now()) {
      otpStore.delete(session);
      return res.status(401).json({ error: "Code expired. Please log in again." });
    }

    if (entry.otp !== otp.trim()) {
      return res.status(401).json({ error: "Invalid code. Please try again." });
    }

    otpStore.delete(session);

    appendAuditLog({
      timestamp: new Date().toISOString(),
      actor: entry.userData.name,
      actorEmail: entry.userData.email,
      action: "ADMIN_LOGIN",
      workerId: "—",
      workerName: "—",
      note: "Login verified via 2FA OTP",
    });

    return res.json(entry.userData);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return res.status(500).json({ error: message });
  }
});

export default router;
