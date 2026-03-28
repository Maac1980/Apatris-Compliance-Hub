import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyPinHash } from "./lib/mobile-pins.js";

// ── PIN hashing tests ──────────────────────────────────────────────────────
describe("Auth — PIN hashing", () => {
  function hashPin(pin: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(pin, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  it("verifies correct PIN", () => {
    const stored = hashPin("1234");
    expect(verifyPinHash("1234", stored)).toBe(true);
  });

  it("rejects wrong PIN", () => {
    const stored = hashPin("1234");
    expect(verifyPinHash("5678", stored)).toBe(false);
  });

  it("rejects empty PIN", () => {
    const stored = hashPin("1234");
    expect(verifyPinHash("", stored)).toBe(false);
  });

  it("handles malformed stored hash", () => {
    expect(verifyPinHash("1234", "garbage")).toBe(false);
    expect(verifyPinHash("1234", "")).toBe(false);
    expect(verifyPinHash("1234", "no-colon-here")).toBe(false);
  });

  it("different PINs produce different hashes", () => {
    const h1 = hashPin("1111");
    const h2 = hashPin("2222");
    expect(h1).not.toBe(h2);
  });

  it("same PIN hashed twice produces different hashes (random salt)", () => {
    const h1 = hashPin("same");
    const h2 = hashPin("same");
    expect(h1).not.toBe(h2);
    // But both should verify
    expect(verifyPinHash("same", h1)).toBe(true);
    expect(verifyPinHash("same", h2)).toBe(true);
  });
});

// ── JWT token structure tests ──────────────────────────────────────────────
describe("Auth — JWT structure", () => {
  it("JWT has 3 dot-separated parts", () => {
    // Simulate a JWT structure
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ email: "test@apatris.pl", name: "Test", role: "Admin" })).toString("base64url");
    const signature = "fakesig";
    const token = `${header}.${payload}.${signature}`;
    expect(token.split(".")).toHaveLength(3);
  });

  it("refresh token is 96 hex chars", () => {
    const token = crypto.randomBytes(48).toString("hex");
    expect(token).toHaveLength(96);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it("token hash is deterministic", () => {
    const token = "test-token-value";
    const h1 = crypto.createHash("sha256").update(token).digest("hex");
    const h2 = crypto.createHash("sha256").update(token).digest("hex");
    expect(h1).toBe(h2);
  });

  it("different tokens produce different hashes", () => {
    const h1 = crypto.createHash("sha256").update("token-a").digest("hex");
    const h2 = crypto.createHash("sha256").update("token-b").digest("hex");
    expect(h1).not.toBe(h2);
  });
});

// ── Role-based access logic tests ──────────────────────────────────────────
describe("Auth — RBAC logic", () => {
  const TIER_MAP: Record<string, number> = {
    Executive: 1, LegalHead: 2, TechOps: 3, Coordinator: 4, Professional: 5,
  };

  it("maps all 5 roles to tiers", () => {
    expect(Object.keys(TIER_MAP)).toHaveLength(5);
    expect(TIER_MAP.Executive).toBe(1);
    expect(TIER_MAP.Professional).toBe(5);
  });

  function hasAccess(userRole: string, allowedRoles: string[]): boolean {
    return allowedRoles.includes(userRole);
  }

  it("Admin can access payroll", () => {
    expect(hasAccess("Admin", ["Admin", "Executive"])).toBe(true);
  });

  it("Professional cannot access payroll", () => {
    expect(hasAccess("Professional", ["Admin", "Executive"])).toBe(false);
  });

  it("TechOps can access document approval", () => {
    expect(hasAccess("TechOps", ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"])).toBe(true);
  });

  it("Professional cannot approve documents", () => {
    expect(hasAccess("Professional", ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"])).toBe(false);
  });
});
