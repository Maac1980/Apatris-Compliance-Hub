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
export const JWT_SECRET =
  process.env.JWT_SECRET ||
  (() => {
    const fallback = crypto.randomBytes(48).toString("hex");
    console.warn("[Auth] JWT_SECRET not set — using ephemeral secret. Sessions will be lost on restart.");
    return fallback;
  })();

const JWT_EXPIRES_IN = "15m"; // 15 minutes (short-lived access token)

const ALLOWED_USERS = [
  {
    email: "manishshetty79@gmail.com",
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

function getRequiredSecret(envKey: string): string | null {
  const value = process.env[envKey]?.trim();
  if (!value) {
    console.error(`[Auth] Required secret ${envKey} is not configured.`);
    return null;
  }
  return value;
}

// Database-backed OTP store (works across multiple Fly.io machines)
// Hash OTP before storing so it's not in plaintext in the DB
function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

async function storeOtpSession(session: string, otp: string, userData: Record<string, unknown>, expiresMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresMs);
  await execute(
    "INSERT INTO otp_sessions (session, otp_hash, user_data, expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT (session) DO UPDATE SET otp_hash=$2, user_data=$3, expires_at=$4",
    [session, hashOtp(otp), JSON.stringify(userData), expiresAt]
  );
}

async function verifyOtpSession(session: string, otp: string): Promise<{ ok: boolean; userData?: any; error?: string }> {
  const row = await queryOne<{ otp_hash: string; user_data: any; expires_at: string }>(
    "DELETE FROM otp_sessions WHERE session = $1 RETURNING otp_hash, user_data, expires_at",
    [session]
  );
  if (!row) return { ok: false, error: "Session not found. Please log in again." };
  if (new Date(row.expires_at) < new Date()) return { ok: false, error: "Code expired. Please log in again." };
  if (row.otp_hash !== hashOtp(otp.trim())) return { ok: false, error: "Invalid code. Please try again." };
  return { ok: true, userData: typeof row.user_data === "string" ? JSON.parse(row.user_data) : row.user_data };
}

async function deleteOtpSession(session: string): Promise<void> {
  await execute("DELETE FROM otp_sessions WHERE session = $1", [session]).catch(() => {});
}

// Legacy export for face-auth compatibility
export const otpStore = {
  set: (session: string, data: { otp: string; expires: number; userData: any }) => {
    storeOtpSession(session, data.otp, data.userData, data.expires - Date.now()).catch(console.error);
  },
  delete: (session: string) => { deleteOtpSession(session).catch(console.error); },
};

// Clean up expired OTP sessions every 10 minutes
setInterval(() => {
  execute("DELETE FROM otp_sessions WHERE expires_at < NOW()").catch(() => {});
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
const OTP_EXPIRY_MS = 10 * 60 * 1000;

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
      const storedPassword = getRequiredSecret(user.passEnvKey);
      if (!storedPassword) {
        return res.status(503).json({ error: "Login is temporarily unavailable. Contact the administrator." });
      }
      if (storedPassword !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const userData = { email: user.email, name: user.name, role: user.role, tenantId: req.tenantId, tenantSlug: req.tenantSlug };

      // Direct JWT login — OTP disabled for internal team use
      // Re-enable OTP when Brevo SMTP latency is resolved
      const accessToken = signToken(userData);
      const refreshToken = await createRefreshToken(userData);
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

    const result = await verifyOtpSession(session, otp);

    if (!result.ok) {
      return res.status(401).json({ error: result.error });
    }

    const accessToken = signToken(result.userData);
    const refreshToken = await createRefreshToken(result.userData);

    appendAuditLog({
      timestamp: new Date().toISOString(),
      actor: result.userData.name,
      actorEmail: result.userData.email,
      action: "ADMIN_LOGIN",
      workerId: "—",
      workerName: "—",
      note: "Login verified via 2FA OTP",
    });

    setJwtCookie(res, accessToken);
    return res.json({ ...result.userData, jwt: accessToken, refreshToken });
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

// ─── POST /api/auth/mobile-login — HARDCODED PINS ONLY ───────────────────────
const PINS: Record<string, { tier: number; envKey: string; name: string; role: string }> = {
  manish:  { tier: 1, envKey: "APATRIS_PASS_MANISH", name: "Manish",       role: "Executive" },
  akshay:  { tier: 1, envKey: "APATRIS_PASS_AKSHAY", name: "Akshay",       role: "Executive" },
  t2:      { tier: 2, envKey: "MOBILE_T2_PIN",       name: "LegalHead",    role: "LegalHead" },
  t3:      { tier: 3, envKey: "MOBILE_T3_PIN",       name: "TechOps",      role: "TechOps" },
  t4:      { tier: 4, envKey: "MOBILE_T4_PIN",       name: "Coordinator",  role: "Coordinator" },
  t5:      { tier: 5, envKey: "MOBILE_T5_PIN",       name: "Professional", role: "Professional" },
};

router.post("/auth/mobile-login", validateBody(MobileLoginSchema), async (req, res) => {
  try {
    const { tier, password, name } = req.body as { tier?: number; password?: string; name?: string };
    console.log(`[mobile-login] tier=${tier} name=${name ?? "none"}`);

    if (!tier || !password) {
      return res.status(400).json({ error: "Tier and password required." });
    }

    // Find matching PIN entry
    let matched: typeof PINS[string] | null = null;
    if (tier === 1 && name) {
      const key = name.trim().toLowerCase();
      const entry = PINS[key];
      const configuredSecret = entry ? getRequiredSecret(entry.envKey) : null;
      if (entry && configuredSecret && configuredSecret === password.trim()) matched = entry;
    }
    if (!matched) {
      // Try all entries for this tier
      for (const entry of Object.values(PINS)) {
        const configuredSecret = getRequiredSecret(entry.envKey);
        if (entry.tier === tier && configuredSecret && configuredSecret === password.trim()) {
          matched = entry;
          break;
        }
      }
    }

    if (!matched) {
      const hasConfiguredSecretForTier = Object.values(PINS).some((entry) => (
        entry.tier === tier && !!getRequiredSecret(entry.envKey)
      ));
      if (!hasConfiguredSecretForTier) {
        return res.status(503).json({ error: "Mobile login is temporarily unavailable. Contact the administrator." });
      }
      return res.status(401).json({ error: "Incorrect password. Contact your administrator." });
    }

    const mobileUserData = {
      email: matched.name.toLowerCase() === "manish" ? "manishshetty79@gmail.com" : `${matched.name.toLowerCase()}@apatris.pl`,
      name: matched.name,
      role: matched.role,
      tenantId: req.tenantId,
      tenantSlug: req.tenantSlug,
    };
    const accessToken = signToken(mobileUserData);
    const refreshToken = await createRefreshToken(mobileUserData);

    setJwtCookie(res, accessToken);
    return res.json({ role: matched.role, name: matched.name, jwt: accessToken, refreshToken });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Login failed" });
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
// Revoke all refresh tokens for the authenticated user (or the provided token)
router.post("/auth/logout", async (req, res) => {
  try {
    // Try to identify the user from JWT (cookie or header) to revoke all their tokens
    const cookieToken = req.cookies?.apatris_jwt;
    const authHeader = req.headers.authorization;
    const token = cookieToken || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET) as { email: string };
        // Revoke ALL refresh tokens for this user — full logout
        await execute(
          "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_email = $1 AND revoked_at IS NULL",
          [payload.email]
        );
      } catch {
        // Token expired/invalid — fall back to revoking just the provided refresh token
        const { refreshToken } = req.body as { refreshToken?: string };
        if (refreshToken) {
          const hash = hashToken(refreshToken);
          await execute("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1", [hash]);
        }
      }
    } else {
      // No JWT at all — revoke the provided refresh token if any
      const { refreshToken } = req.body as { refreshToken?: string };
      if (refreshToken) {
        const hash = hashToken(refreshToken);
        await execute("UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1", [hash]);
      }
    }

    clearJwtCookie(res);
    return res.json({ success: true });
  } catch {
    clearJwtCookie(res);
    return res.json({ success: true }); // Always succeed on logout
  }
});

export default router;
