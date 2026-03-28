import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { findCoordinatorByEmail, verifyCoordinatorPassword } from "../lib/coordinators-db.js";
import { sendOtpEmail, isMailConfigured } from "../lib/mailer.js";
import { appendAuditLog } from "../lib/audit-log.js";
import { verifyMobilePin, verifyMobilePinForUser, changeMobilePin, ROLE_TO_TIER } from "../lib/mobile-pins.js";

const router = Router();

// JWT secret — set JWT_SECRET env var in production; falls back to a random
// per-process secret (sessions invalidated on server restart).
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (() => {
    const fallback = crypto.randomBytes(48).toString("hex");
    console.warn("[Auth] JWT_SECRET not set — using ephemeral secret. Sessions will be lost on restart.");
    return fallback;
  })();

const JWT_EXPIRES_IN = "72h"; // 3 days

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

function signToken(userData: { email: string; name: string; role: string; assignedSite?: string }) {
  return jwt.sign(userData, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

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
          const token = signToken(userData);
          appendAuditLog({ timestamp: new Date().toISOString(), actor: user.name, actorEmail: user.email, action: "ADMIN_LOGIN", workerId: "—", workerName: "—", note: "Direct login (OTP email failed)" });
          return res.json({ ...userData, jwt: token });
        }
        return res.json({ otpRequired: true, session });
      }

      // No SMTP: direct login with JWT
      const token = signToken(userData);
      appendAuditLog({ timestamp: new Date().toISOString(), actor: user.name, actorEmail: user.email, action: "ADMIN_LOGIN", workerId: "—", workerName: "—", note: "Direct login (SMTP not configured)" });
      return res.json({ ...userData, jwt: token });
    }

    // Check site coordinator accounts (no 2FA for coordinators)
    const coordinator = findCoordinatorByEmail(normalizedEmail);
    if (coordinator) {
      if (!verifyCoordinatorPassword(coordinator, password)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const userData = {
        email: coordinator.email,
        name: coordinator.name,
        role: "Coordinator",
        assignedSite: coordinator.assignedSite,
      };
      const token = signToken(userData);
      return res.json({ ...userData, jwt: token });
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

    const token = signToken(entry.userData);

    appendAuditLog({
      timestamp: new Date().toISOString(),
      actor: entry.userData.name,
      actorEmail: entry.userData.email,
      action: "ADMIN_LOGIN",
      workerId: "—",
      workerName: "—",
      note: "Login verified via 2FA OTP",
    });

    return res.json({ ...entry.userData, jwt: token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return res.status(500).json({ error: message });
  }
});

// ─── GET /api/auth/verify ─────────────────────────────────────────────────────
// Validates a stored JWT and returns fresh user data. Used by the frontend
// to silently restore a session without a full login flow.
router.get("/auth/verify", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token" });
    }
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as {
      email: string; name: string; role: string; assignedSite?: string;
    };
    return res.json({
      email: payload.email,
      name: payload.name,
      role: payload.role,
      assignedSite: payload.assignedSite,
      jwt: token,
    });
  } catch {
    return res.status(401).json({ error: "Token invalid or expired" });
  }
});

// ─── POST /api/auth/mobile-login ─────────────────────────────────────────────
router.post("/auth/mobile-login", async (req, res) => {
  try {
    const { tier, password, name } = req.body as { tier?: unknown; password?: unknown; name?: unknown };

    if (typeof tier !== "number" || tier < 1 || tier > 5) {
      return res.status(400).json({ error: "Invalid tier." });
    }
    if (typeof password !== "string" || !password.trim()) {
      return res.status(400).json({ error: "Password is required." });
    }

    // For T1, accept an optional name to verify against a specific user record
    let result: { name: string; role: string } | null;
    if (tier === 1 && typeof name === "string" && name.trim()) {
      result = await verifyMobilePinForUser(1, name.trim().toLowerCase(), password.trim());
    } else {
      result = await verifyMobilePin(tier, password.trim());
    }

    if (!result) {
      return res.status(401).json({ error: "Incorrect password. Contact your administrator." });
    }

    const token = signToken({
      email: `${result.name.toLowerCase()}@apatris.pl`,
      name: result.name,
      role: result.role,
    });

    return res.json({ role: result.role, name: result.name, jwt: token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return res.status(500).json({ error: message });
  }
});

// ─── POST /api/auth/mobile-change-pin ────────────────────────────────────────
// Requires a valid JWT. Changes the PIN for the authenticated tier/user.
router.post("/auth/mobile-change-pin", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const token = authHeader.slice(7);
    let payload: { name: string; role: string };
    try {
      payload = jwt.verify(token, JWT_SECRET) as { name: string; role: string };
    } catch {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    const { currentPin, newPin, confirmPin } = req.body as {
      currentPin?: string; newPin?: string; confirmPin?: string;
    };

    if (!currentPin || !newPin || !confirmPin) {
      return res.status(400).json({ error: "All three fields are required." });
    }
    if (newPin !== confirmPin) {
      return res.status(400).json({ error: "New PIN and confirmation do not match." });
    }
    if (newPin.length < 4) {
      return res.status(400).json({ error: "New PIN must be at least 4 characters." });
    }

    const tier = ROLE_TO_TIER[payload.role];
    if (!tier) {
      return res.status(400).json({ error: "Unknown role." });
    }

    // Determine user_key: T1 users have individual keys; T2-T5 share one
    const userKey = tier === 1 ? payload.name.toLowerCase() : "shared";

    const result = await changeMobilePin(tier, userKey, currentPin, newPin);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({ success: true, message: "PIN updated successfully." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to change PIN";
    return res.status(500).json({ error: message });
  }
});

export default router;
