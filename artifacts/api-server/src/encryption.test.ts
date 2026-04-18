import { describe, it, expect, vi, beforeAll } from "vitest";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  delete process.env.APATRIS_ENCRYPTION_KEY;
  delete process.env.APATRIS_LOOKUP_KEY;
});

import {
  encrypt,
  decrypt,
  isEncrypted,
  encryptIfPresent,
  lookupHash,
  maskForRole,
} from "./lib/encryption.js";

describe("encryption — encrypt / decrypt", () => {
  it("round-trips simple ASCII", () => {
    const plain = "12345678901";
    const ct = encrypt(plain);
    expect(isEncrypted(ct)).toBe(true);
    expect(ct.startsWith("enc:v1:")).toBe(true);
    expect(decrypt(ct)).toBe(plain);
  });

  it("round-trips Polish UTF-8", () => {
    const plain = "Łódź ąćęłńóśźż";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("round-trips a 64-char hex string (proves it works on any string)", () => {
    const plain = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('encrypt("") returns ""', () => {
    expect(encrypt("")).toBe("");
  });

  it("encrypt(encrypt(x)) === encrypt(x) — no double-encrypt", () => {
    const once = encrypt("test-value");
    const twice = encrypt(once);
    expect(twice).toBe(once);
  });

  it("decrypt(null) returns null", () => {
    expect(decrypt(null)).toBe(null);
  });

  it("decrypt(undefined) returns null", () => {
    expect(decrypt(undefined)).toBe(null);
  });

  it("decrypt(legacy plaintext) returns input unchanged (passthrough)", () => {
    expect(decrypt("12345678901")).toBe("12345678901");
    expect(decrypt("PL00000000000000000000001234")).toBe("PL00000000000000000000001234");
  });

  it('decrypt("enc:v1:garbage") returns null and logs error', () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(decrypt("enc:v1:garbage")).toBe(null);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("encryptIfPresent returns undefined for non-strings and empty values", () => {
    expect(encryptIfPresent(undefined)).toBe(undefined);
    expect(encryptIfPresent(null)).toBe(undefined);
    expect(encryptIfPresent(123)).toBe(undefined);
    expect(encryptIfPresent("")).toBe(undefined);
    expect(encryptIfPresent("   ")).toBe(undefined);
  });

  it("encryptIfPresent encrypts a trimmed present value", () => {
    const ct = encryptIfPresent("  hello  ");
    expect(ct).toBeDefined();
    expect(isEncrypted(ct!)).toBe(true);
    expect(decrypt(ct!)).toBe("hello");
  });
});

describe("encryption — lookupHash", () => {
  it("is deterministic — same input returns same hash (3 runs)", () => {
    const a = lookupHash("12345678901");
    const b = lookupHash("12345678901");
    const c = lookupHash("12345678901");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("different inputs produce different hashes", () => {
    expect(lookupHash("12345678901")).not.toBe(lookupHash("12345678902"));
  });

  it("trims whitespace before hashing", () => {
    expect(lookupHash("  12345  ")).toBe(lookupHash("12345"));
  });

  it("output is exactly 64 lowercase hex chars (SHA-256)", () => {
    const h = lookupHash("any-value");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("encryption — maskForRole", () => {
  const encrypted = encrypt("12345678901");

  it("T1 returns plaintext of encrypted value", () => {
    expect(maskForRole(encrypted, "T1")).toBe("12345678901");
  });

  it("T2 returns plaintext of encrypted value", () => {
    expect(maskForRole(encrypted, "T2")).toBe("12345678901");
  });

  it("T3 returns ***-****-<last4>", () => {
    expect(maskForRole(encrypted, "T3")).toBe("***-****-8901");
  });

  it("T4 returns masked", () => {
    expect(maskForRole(encrypted, "T4")).toBe("***-****-8901");
  });

  it("T5 returns masked by DEFAULT (Compliance Card exception is route-level, not here)", () => {
    expect(maskForRole(encrypted, "T5")).toBe("***-****-8901");
  });

  it("unknown role returns ***", () => {
    expect(maskForRole(encrypted, "unknown")).toBe("***");
    expect(maskForRole(encrypted, "Executive")).toBe("***");
    expect(maskForRole(encrypted, "")).toBe("***");
  });

  it("null input returns null", () => {
    expect(maskForRole(null, "T1")).toBe(null);
    expect(maskForRole(null, "T3")).toBe(null);
  });

  it("legacy plaintext input: T1 returns as-is; T3 returns masked last4", () => {
    expect(maskForRole("12345678901", "T1")).toBe("12345678901");
    expect(maskForRole("12345678901", "T3")).toBe("***-****-8901");
  });

  it("short plaintext (<=4 chars) masked to *** instead of last-4 format", () => {
    expect(maskForRole(encrypt("abc"), "T3")).toBe("***");
    expect(maskForRole("abcd", "T3")).toBe("***");
  });
});

describe("encryption — isEncrypted", () => {
  it("detects encrypted strings by prefix", () => {
    expect(isEncrypted(encrypt("x"))).toBe(true);
  });

  it("rejects non-strings and plaintext", () => {
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
    expect(isEncrypted(123)).toBe(false);
    expect(isEncrypted("12345")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });
});
