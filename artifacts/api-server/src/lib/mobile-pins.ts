import crypto from "crypto";
import { query, execute } from "./db.js";

// ── Hashing helpers (scrypt, no extra packages needed) ────────────────────
function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPinHash(pin: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const computed = crypto.scryptSync(pin, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

// ── Table & seed ───────────────────────────────────────────────────────────
export async function initMobilePinsTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS mobile_pins (
      tier      INTEGER NOT NULL,
      user_key  TEXT    NOT NULL,
      pin_hash  TEXT    NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (tier, user_key)
    )
  `);

  // Seed from env vars if the table is empty
  const rows = await query<{ count: string }>("SELECT COUNT(*) AS count FROM mobile_pins");
  if (Number(rows[0]?.count ?? 0) > 0) return;

  // Seed from configured env vars only — no hardcoded fallback passwords
  const seeds: Array<{ tier: number; userKey: string; envKey: string }> = [
    { tier: 1, userKey: "akshay",  envKey: "APATRIS_PASS_AKSHAY" },
    { tier: 1, userKey: "manish",  envKey: "APATRIS_PASS_MANISH"  },
    { tier: 2, userKey: "shared",  envKey: "MOBILE_T2_PIN"        },
    { tier: 3, userKey: "shared",  envKey: "MOBILE_T3_PIN"        },
    { tier: 4, userKey: "shared",  envKey: "MOBILE_T4_PIN"        },
    { tier: 5, userKey: "shared",  envKey: "MOBILE_T5_PIN"        },
  ];

  for (const { tier, userKey, envKey } of seeds) {
    const pin = process.env[envKey]?.trim();
    if (!pin) {
      console.warn(`[MobilePins] ${envKey} not configured — skipping seed for tier ${tier}.`);
      continue;
    }
    await execute(
      `INSERT INTO mobile_pins (tier, user_key, pin_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (tier, user_key) DO NOTHING`,
      [tier, userKey, hashPin(pin)]
    );
  }

  console.log("[MobilePins] Table seeded from environment variables.");
}

// ── Verify a specific user — hardcoded only, no database ─────────────────
export async function verifyMobilePinForUser(
  tier: number,
  userKey: string,
  pin: string
): Promise<{ name: string; role: string } | null> {
  // Just delegate to the main function which is hardcoded
  return verifyMobilePin(tier, pin);
}

// ── Verify (returns user name on success, null on failure) ────────────────
const ROLE_TO_TIER: Record<string, number> = {
  Executive: 1, LegalHead: 2, TechOps: 3, Coordinator: 4, Professional: 5,
};
const TIER_TO_ROLE: Record<number, string> = {
  1: "Executive", 2: "LegalHead", 3: "TechOps", 4: "Coordinator", 5: "Professional",
};

export async function verifyMobilePin(
  tier: number,
  pin: string
): Promise<{ name: string; role: string } | null> {
  // Verify against configured env vars only — no hardcoded fallbacks
  const checks: Array<{ tier: number; envKey: string; name: string; role: string }> = [
    { tier: 1, envKey: "APATRIS_PASS_AKSHAY", name: "Akshay",       role: "Executive" },
    { tier: 1, envKey: "APATRIS_PASS_MANISH", name: "Manish",       role: "Executive" },
    { tier: 2, envKey: "MOBILE_T2_PIN",       name: "LegalHead",    role: "LegalHead" },
    { tier: 3, envKey: "MOBILE_T3_PIN",       name: "TechOps",      role: "TechOps" },
    { tier: 4, envKey: "MOBILE_T4_PIN",       name: "Coordinator",  role: "Coordinator" },
    { tier: 5, envKey: "MOBILE_T5_PIN",       name: "Professional", role: "Professional" },
  ];
  for (const check of checks) {
    if (check.tier !== tier) continue;
    const configured = process.env[check.envKey]?.trim();
    if (configured && pin === configured) return { name: check.name, role: check.role };
  }
  return null;
}

// ── Change PIN ─────────────────────────────────────────────────────────────
export async function changeMobilePin(
  tier: number,
  userKey: string,           // 'akshay' | 'manish' | 'shared'
  currentPin: string,
  newPin: string
): Promise<{ success: boolean; error?: string }> {
  const rows = await query<{ pin_hash: string }>(
    "SELECT pin_hash FROM mobile_pins WHERE tier = $1 AND user_key = $2",
    [tier, userKey]
  );

  if (rows.length === 0) {
    return { success: false, error: "PIN record not found. Contact system administrator." };
  }

  if (!verifyPinHash(currentPin, rows[0].pin_hash)) {
    return { success: false, error: "Current PIN is incorrect." };
  }

  if (newPin.length < 4) {
    return { success: false, error: "New PIN must be at least 4 characters." };
  }

  await execute(
    `UPDATE mobile_pins
     SET pin_hash = $1, updated_at = NOW()
     WHERE tier = $2 AND user_key = $3`,
    [hashPin(newPin), tier, userKey]
  );

  return { success: true };
}

export { ROLE_TO_TIER, TIER_TO_ROLE };
