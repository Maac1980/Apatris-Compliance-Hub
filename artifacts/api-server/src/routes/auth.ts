import { Router, type Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { findCoordinatorByEmail, verifyCoordinatorPassword } from "../lib/coordinators-db.js";
import { sendOtpEmail, isMailConfigured } from "../lib/mailer.js";
import { query, queryOne, execute } from "../lib/db.js";
import { appendAuditLog } from "../lib/audit-log.js";
import { verifyMobilePin, verifyMobilePinForUser, changeMobilePin, ROLE_TO_TIER } from "../lib/mobile-pins.js";
import { authLimiter, sensitiveLimiter } from "../lib/rate-limit.js";
import { validateBody, LoginSchema, MobileLoginSchema, ChangePinSchema } from "../lib/validate.js";

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

const JWT_EXPIRES_IN = "15m"; // 15 minutes (short-lived access token)

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
  userData: { email: string; name: string; role: string; assignedSite?: string; tenantId?: string; tenantSlug?: string };
}>();

// Clean up expired OTPs every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpStore) {
    if (val.expires < now) otpStore.delete(key);
  }
}, 10 * 60 * 1000);

function signToken(userData: { email: string; name: string; role: string; assignedSite?: string; tenantId?: string; tenantSlug?: string }) {
  return jwt.sign(userData, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

function setJwtCookie(res: Response, token: string) {
  res.cookie("apatris_jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });
}

function clearJwtCookie(res: Response) {
  res.clearCookie("apatris_jwt", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createRefreshToken(userData: {
  email: string; name: string; role: string;
  assignedSite?: string; tenantId?: string;
}): Promise<string> {
  const token = crypto.randomBytes(48).toString("hex");
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await execute(
    `INSERT INTO refresh_tokens (token_hash, user_email, user_name, user_role, tenant_id, assigned_site, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [hash, userData.email, userData.name, userData.role, userData.tenantId ?? null, userData.assignedSite ?? null, expiresAt]
  );
  return token;
}

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post("/auth/login", authLimiter, validateBody(LoginSchema), async (req, res) => {
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

      const userData = { email: user.email, name: user.name, role: user.role, tenantId: req.tenantId, tenantSlug: req.tenantSlug };

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
          const accessToken = signToken(userData);
          const refreshToken = await createRefreshToken(userData);
          appendAuditLog({ timestamp: new Date().toISOString(), actor: user.name, actorEmail: user.email, action: "ADMIN_LOGIN", workerId: "—", workerName: "—", note: "Direct login (OTP email failed)" });
          setJwtCookie(res, accessToken);
          return res.json({ ...userData, jwt: accessToken, refreshToken });
        }
        return res.json({ otpRequired: true, session });
      }

      // No SMTP: direct login with JWT
      const accessToken = signToken(userData);
      const refreshToken = await createRefreshToken(userData);
      appendAuditLog({ timestamp: new Date().toISOString(), actor: user.name, actorEmail: user.email, action: "ADMIN_LOGIN", workerId: "—", workerName: "—", note: "Direct login (SMTP not configured)" });
      setJwtCookie(res, accessToken);
      return res.json({ ...userData, jwt: accessToken, refreshToken });
    }

    // Check site coordinator accounts (no 2FA for coordinators)
    const coordinator = findCoordinatorByEmail(normalizedEmail, req.tenantId!);
    if (coordinator) {
      if (!verifyCoordinatorPassword(coordinator, password)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const userData = {
        email: coordinator.email,
        name: coordinator.name,
        role: "Coordinator",
        assignedSite: coordinator.assignedSite,
        tenantId: req.tenantId,
        tenantSlug: req.tenantSlug,
      };
      const accessToken = signToken(userData);
      const refreshToken = await createRefreshToken(userData);
      setJwtCookie(res, accessToken);
      return res.json({ ...userData, jwt: accessToken, refreshToken });
    }

    return res.status(403).json({ error: "Access Denied: Contact Administrator." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return res.status(500).json({ error: message });
  }
});

// ─── POST /api/auth/verify-otp ───────────────────────────────────────────────
router.post("/auth/verify-otp", authLimiter, async (req, res) => {
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

    const accessToken = signToken(entry.userData);
    const refreshToken = await createRefreshToken(entry.userData);

    appendAuditLog({
      timestamp: new Date().toISOString(),
      actor: entry.userData.name,
      actorEmail: entry.userData.email,
      action: "ADMIN_LOGIN",
      workerId: "—",
      workerName: "—",
      note: "Login verified via 2FA OTP",
    });

    setJwtCookie(res, accessToken);
    return res.json({ ...entry.userData, jwt: accessToken, refreshToken });
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
    // Check cookie first, then Authorization header
    const cookieToken = req.cookies?.apatris_jwt;
    const authHeader = req.headers.authorization;
    const token = cookieToken || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
    if (!token) {
      return res.status(401).json({ error: "No token" });
    }
    const payload = jwt.verify(token, JWT_SECRET) as {
      email: string; name: string; role: string; assignedSite?: string; tenantId?: string; tenantSlug?: string;
    };
    return res.json({
      email: payload.email,
      name: payload.name,
      role: payload.role,
      assignedSite: payload.assignedSite,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
      jwt: token,
    });
  } catch {
    return res.status(401).json({ error: "Token invalid or expired" });
  }
});

// ─── POST /api/auth/mobile-login ─────────────────────────────────────────────
router.post("/auth/mobile-login", authLimiter, validateBody(MobileLoginSchema), async (req, res) => {
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

    const mobileUserData = {
      email: `${result.name.toLowerCase()}@apatris.pl`,
      name: result.name,
      role: result.role,
      tenantId: req.tenantId,
      tenantSlug: req.tenantSlug,
    };
    const accessToken = signToken(mobileUserData);
    const refreshToken = await createRefreshToken(mobileUserData);

    setJwtCookie(res, accessToken);
    return res.json({ role: result.role, name: result.name, jwt: accessToken, refreshToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return res.status(500).json({ error: message });
  }
});

// ─── POST /api/auth/mobile-change-pin ────────────────────────────────────────
// Requires a valid JWT. Changes the PIN for the authenticated tier/user.
router.post("/auth/mobile-change-pin", sensitiveLimiter, validateBody(ChangePinSchema), async (req, res) => {
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

// ─── POST /api/auth/refresh ─────────────────────────────────────────────────
// Exchange refresh token for new access + refresh tokens (rotation)
router.post("/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required." });
    }

    const hash = hashToken(refreshToken);
    const row = await queryOne<{
      id: string; user_email: string; user_name: string; user_role: string;
      tenant_id: string; assigned_site: string; expires_at: string; revoked_at: string | null;
    }>(
      "SELECT * FROM refresh_tokens WHERE token_hash = $1",
      [hash]
    );

    if (!row) {
      return res.status(401).json({ error: "Invalid refresh token." });
    }

    if (row.revoked_at) {
      // Token was already used — possible token theft. Revoke ALL tokens for this user.
      await execute(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_email = $1 AND revoked_at IS NULL",
        [row.user_email]
      );
      return res.status(401).json({ error: "Refresh token reuse detected. All sessions revoked." });
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ error: "Refresh token expired. Please log in again." });
    }

    // Rotate: revoke old token, issue new pair
    await execute(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1",
      [row.id]
    );

    const userData = {
      email: row.user_email,
      name: row.user_name,
      role: row.user_role,
      assignedSite: row.assigned_site || undefined,
      tenantId: row.tenant_id || undefined,
    };

    const newAccessToken = signToken(userData);
    const newRefreshToken = await createRefreshToken(userData);

    setJwtCookie(res, newAccessToken);
    return res.json({
      ...userData,
      jwt: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token refresh failed";
    return res.status(500).json({ error: message });
  }
});

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
// Revoke the provided refresh token
router.post("/auth/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      const hash = hashToken(refreshToken);
      await execute("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1", [hash]);
    }
    clearJwtCookie(res);
    return res.json({ success: true });
  } catch {
    clearJwtCookie(res);
    return res.json({ success: true }); // Always succeed on logout
  }
});

export default router;
