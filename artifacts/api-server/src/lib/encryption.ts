import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export type Tier = "T1" | "T2" | "T3" | "T4" | "T5";

function resolveKey(envVarName: "APATRIS_ENCRYPTION_KEY" | "APATRIS_LOOKUP_KEY"): Buffer {
  const raw = process.env[envVarName]?.trim();

  if (!raw) {
    if (process.env.NODE_ENV === "test") {
      const testHex = envVarName === "APATRIS_ENCRYPTION_KEY" ? "00".repeat(32) : "11".repeat(32);
      return Buffer.from(testHex, "hex");
    }
    throw new Error(`[encryption] ${envVarName} is required`);
  }

  if (!/^[0-9a-f]{64}$/.test(raw)) {
    throw new Error(`[encryption] ${envVarName} must be exactly 64 lowercase hex chars`);
  }

  return Buffer.from(raw, "hex");
}

let cachedEncryptionKey: Buffer | null = null;
let cachedLookupKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (!cachedEncryptionKey) cachedEncryptionKey = resolveKey("APATRIS_ENCRYPTION_KEY");
  return cachedEncryptionKey;
}

function getLookupKey(): Buffer {
  if (!cachedLookupKey) cachedLookupKey = resolveKey("APATRIS_LOOKUP_KEY");
  return cachedLookupKey;
}

export function isEncrypted(s: unknown): boolean {
  return typeof s === "string" && s.startsWith(PREFIX);
}

export function encrypt(plain: string): string {
  if (typeof plain !== "string" || plain.length === 0) return plain;
  if (isEncrypted(plain)) return plain;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getEncryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decrypt(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (typeof stored !== "string") return null;
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const parts = stored.slice(PREFIX.length).split(":");
    if (parts.length !== 3) {
      console.error("[encryption] decrypt failed: malformed ciphertext (expected 3 parts)");
      return null;
    }
    const [ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const decipher = createDecipheriv(ALGO, getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch (e) {
    console.error("[encryption] decrypt failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export function encryptIfPresent(value: unknown): string | null {
  if (value == null || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return encrypt(trimmed);
}

export function lookupHash(plain: string | null | undefined): string | null {
  if (plain == null || typeof plain !== "string") return null;
  const trimmed = plain.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith(PREFIX)) {
    throw new Error("[encryption] lookupHash called with already-encrypted value — caller must pass plaintext, not ciphertext");
  }
  return createHmac("sha256", getLookupKey()).update(trimmed).digest("hex");
}

// Role-to-tier mapping for JWT role strings (staff-vs-worker page-level masking, locked 2026-04-19).
// Staff roles (Admin/Executive/LegalHead/TechOps/Coordinator) → T1 plaintext.
// Only Professional (workers) is masked by default; their plaintext PII access is gated
// via /workers/me?purpose=compliance_card own-record flow in Prompt 8.
const ROLE_TO_TIER: Record<string, Tier> = {
  Admin: "T1",
  Executive: "T1",
  LegalHead: "T1",
  TechOps: "T1",
  Coordinator: "T1",
  Professional: "T5",
};

export function maskForRole(value: string | null, role: string | null): string | null {
  if (value == null) return null;
  if (role == null) return "***";
  // Accept either legacy role name (Admin/Executive/...) or tier string (T1-T5) directly.
  const tier = ROLE_TO_TIER[role] ?? role;
  if (tier === "T1" || tier === "T2") {
    return decrypt(value);
  }
  if (tier === "T3" || tier === "T4" || tier === "T5") {
    const plain = decrypt(value);
    if (plain == null) return null;
    if (plain.length <= 4) return "***";
    return `***-****-${plain.slice(-4)}`;
  }
  return "***";
}

export function __resetKeyCacheForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("__resetKeyCacheForTests is only callable under NODE_ENV=test");
  }
  cachedEncryptionKey = null;
  cachedLookupKey = null;
}
