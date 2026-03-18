// WebAuthn-based biometric authentication helpers.
// The actual PIN/password is stored in localStorage; biometric acts as the locker.

const PIN_PREFIX = "wf_saved_pin";
const CRED_PREFIX = "wf_bio_cred";

// ── Key helpers ────────────────────────────────────────────────────────────────

function credKey(tier: number, userKey?: string): string {
  return userKey ? `${PIN_PREFIX}_t${tier}_${userKey}` : `${PIN_PREFIX}_t${tier}`;
}

function bioKey(tier: number, userKey?: string): string {
  return userKey ? `${CRED_PREFIX}_t${tier}_${userKey}` : `${CRED_PREFIX}_t${tier}`;
}

// ── PIN storage ────────────────────────────────────────────────────────────────

export function savePin(tier: number, password: string, userKey?: string): void {
  localStorage.setItem(credKey(tier, userKey), password);
}

export function getSavedPin(tier: number, userKey?: string): string | null {
  return localStorage.getItem(credKey(tier, userKey));
}

export function clearSavedPin(tier: number, userKey?: string): void {
  localStorage.removeItem(credKey(tier, userKey));
  localStorage.removeItem(bioKey(tier, userKey));
}

export function hasSavedPin(tier: number, userKey?: string): boolean {
  return getSavedPin(tier, userKey) !== null;
}

export function hasBiometric(tier: number, userKey?: string): boolean {
  return localStorage.getItem(bioKey(tier, userKey)) !== null;
}

// ── WebAuthn support detection ─────────────────────────────────────────────────

export async function isBiometricAvailable(): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !window.PublicKeyCredential ||
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function"
  ) {
    return false;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function randomBytes(len: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(len));
}

function base64urlDecode(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ── Registration ───────────────────────────────────────────────────────────────
// Call after a successful password login when "Remember this device" is checked.
// Returns true if biometric was registered, false if unavailable or denied.

export async function registerBiometric(tier: number, userKey?: string): Promise<boolean> {
  const key = bioKey(tier, userKey);
  try {
    const challenge = randomBytes(32);
    const userId = new TextEncoder().encode(key);
    const hostname = window.location.hostname;

    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Apatris Workforce", id: hostname },
        user: { id: userId, name: key, displayName: "Apatris User" },
        pubKeyCredParams: [
          { alg: -7,   type: "public-key" }, // ES256
          { alg: -257, type: "public-key" }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null;

    if (!cred) return false;
    localStorage.setItem(key, cred.id);
    return true;
  } catch {
    return false;
  }
}

// ── Authentication ─────────────────────────────────────────────────────────────
// Call when the user taps the biometric button.
// Returns true if biometric passed; the caller then retrieves the saved PIN.

export async function authenticateBiometric(tier: number, userKey?: string): Promise<boolean> {
  const key = bioKey(tier, userKey);
  const storedCredId = localStorage.getItem(key);
  if (!storedCredId) return false;

  try {
    const challenge = randomBytes(32);
    const hostname = window.location.hostname;
    const rawId = base64urlDecode(storedCredId);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: hostname,
        allowCredentials: [{ id: rawId, type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });

    return assertion !== null;
  } catch {
    return false;
  }
}
