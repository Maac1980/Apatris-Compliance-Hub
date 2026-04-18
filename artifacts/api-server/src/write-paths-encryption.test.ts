import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Mock db.js BEFORE importing anything that uses it (workers-db)
vi.mock("./lib/db.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcOf = (rel: string): string => readFileSync(join(__dirname, rel), "utf8");

beforeAll(() => {
  process.env.NODE_ENV = "test";
  delete process.env.APATRIS_ENCRYPTION_KEY;
  delete process.env.APATRIS_LOOKUP_KEY;
});

import { query, queryOne } from "./lib/db.js";
import { createWorker, updateWorker } from "./lib/workers-db.js";
import { encrypt, decrypt, lookupHash, isEncrypted } from "./lib/encryption.js";

// ── Helpers to parse mock calls ──────────────────────────────────────────────
function parseInsert(call: readonly unknown[]): { cols: string[]; params: unknown[] } {
  const sql = call[0] as string;
  const match = sql.match(/INSERT INTO \w+\s*\(([^)]+)\)/);
  const cols = match ? match[1].split(",").map((c) => c.trim()) : [];
  const params = (call[1] as unknown[]) ?? [];
  return { cols, params };
}

function parseUpdate(call: readonly unknown[]): { sets: string[]; params: unknown[] } {
  const sql = call[0] as string;
  const match = sql.match(/SET\s+(.+?)\s+WHERE/is);
  const sets = match ? match[1].split(",").map((s) => s.trim()) : [];
  const params = (call[1] as unknown[]) ?? [];
  return { sets, params };
}

function valueAt(cols: string[], params: unknown[], col: string): unknown {
  const idx = cols.indexOf(col);
  return idx === -1 ? undefined : params[idx];
}

function paramForSet(sets: string[], params: unknown[], prefix: string): unknown {
  const idx = sets.findIndex((s) => s.startsWith(prefix));
  return idx === -1 ? undefined : params[idx];
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Write paths — encryption + hash-column atomicity (Prompt 7)", () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    vi.mocked(queryOne).mockReset();
    vi.mocked(query).mockResolvedValue([{ id: "w1" }] as never);
    vi.mocked(queryOne).mockResolvedValue(null);
  });

  // ── Test 1-3: createWorker encrypts each PII field + populates its hash column ──
  it("Test 1: createWorker encrypts pesel + populates pesel_hash", async () => {
    await createWorker({ pesel: "12345678901", fullName: "Jan" } as never, "t1");
    const { cols, params } = parseInsert(vi.mocked(query).mock.calls[0]);
    expect(cols).toContain("pesel");
    expect(cols).toContain("pesel_hash");
    const peselCt = valueAt(cols, params, "pesel") as string;
    const peselHash = valueAt(cols, params, "pesel_hash") as string;
    expect(isEncrypted(peselCt)).toBe(true);
    expect(decrypt(peselCt)).toBe("12345678901");
    expect(peselHash).toBe(lookupHash("12345678901"));
    expect(peselHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("Test 2: createWorker encrypts iban + populates iban_hash", async () => {
    await createWorker({ iban: "PL61109010140000071219812874", fullName: "Jan" } as never, "t1");
    const { cols, params } = parseInsert(vi.mocked(query).mock.calls[0]);
    expect(cols).toContain("iban");
    expect(cols).toContain("iban_hash");
    const ibanCt = valueAt(cols, params, "iban") as string;
    const ibanHash = valueAt(cols, params, "iban_hash") as string;
    expect(isEncrypted(ibanCt)).toBe(true);
    expect(decrypt(ibanCt)).toBe("PL61109010140000071219812874");
    expect(ibanHash).toBe(lookupHash("PL61109010140000071219812874"));
  });

  it("Test 3: createWorker encrypts passport_number + populates passport_hash", async () => {
    await createWorker({ passport_number: "EU1234567", fullName: "Jan" } as never, "t1");
    const { cols, params } = parseInsert(vi.mocked(query).mock.calls[0]);
    expect(cols).toContain("passport_number");
    expect(cols).toContain("passport_hash");
    const passCt = valueAt(cols, params, "passport_number") as string;
    const passHash = valueAt(cols, params, "passport_hash") as string;
    expect(isEncrypted(passCt)).toBe(true);
    expect(decrypt(passCt)).toBe("EU1234567");
    expect(passHash).toBe(lookupHash("EU1234567"));
  });

  // ── Test 4: NIP scope enforcement — Blocker 2 ──
  it("Test 4: createWorker leaves nip plaintext (Blocker 2 — NIP out of scope)", async () => {
    await createWorker({ nip: "5252828706", fullName: "Jan" } as never, "t1");
    const { cols, params } = parseInsert(vi.mocked(query).mock.calls[0]);
    expect(cols).toContain("nip");
    expect(cols).not.toContain("nip_hash"); // no nip_hash column EVER
    const nipVal = valueAt(cols, params, "nip") as string;
    expect(nipVal).toBe("5252828706"); // plaintext
    expect(isEncrypted(nipVal)).toBe(false);
  });

  // ── Test 5: updateWorker re-encrypts + re-hashes ──
  it("Test 5: updateWorker re-encrypts on update + re-computes hash", async () => {
    await updateWorker("w1", { pesel: "99999999999" }, "t1");
    const { sets, params } = parseUpdate(vi.mocked(query).mock.calls[0]);
    const peselCt = paramForSet(sets, params, "pesel =") as string;
    const peselHash = paramForSet(sets, params, "pesel_hash =") as string;
    expect(isEncrypted(peselCt)).toBe(true);
    expect(decrypt(peselCt)).toBe("99999999999");
    expect(peselHash).toBe(lookupHash("99999999999"));
  });

  // ── Test 6: null input → null in both columns ──
  it("Test 6: createWorker with null pesel → pesel=null + pesel_hash=null (atomic null)", async () => {
    await createWorker({ pesel: null, fullName: "Jan" } as never, "t1");
    const { cols, params } = parseInsert(vi.mocked(query).mock.calls[0]);
    expect(cols).toContain("pesel");
    expect(cols).toContain("pesel_hash");
    expect(valueAt(cols, params, "pesel")).toBe(null);
    expect(valueAt(cols, params, "pesel_hash")).toBe(null);
  });

  // ── Test 7: already-encrypted input → passthrough (no double-encrypt) ──
  it("Test 7: createWorker with already-encrypted pesel → passthrough (no double-encrypt), hash still correct", async () => {
    const alreadyCt = encrypt("12345678901");
    await createWorker({ pesel: alreadyCt, fullName: "Jan" } as never, "t1");
    const { cols, params } = parseInsert(vi.mocked(query).mock.calls[0]);
    const storedPesel = valueAt(cols, params, "pesel") as string;
    const storedHash = valueAt(cols, params, "pesel_hash") as string;
    // encryptIfPresent passes through already-encrypted value unchanged
    expect(storedPesel).toBe(alreadyCt);
    expect(decrypt(storedPesel)).toBe("12345678901");
    // Hash still matches plaintext (piiHashFromInput decrypts then hashes)
    expect(storedHash).toBe(lookupHash("12345678901"));
  });

  // ── Test 8: Duplicate-PESEL on create → hash-column lookup ──
  it("Test 8: Duplicate-PESEL check on create uses pesel_hash lookup, throws on match", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({ id: "existing", full_name: "Other Jan" } as never);
    await expect(
      createWorker({ pesel: "12345678901", fullName: "Jan" } as never, "t1")
    ).rejects.toThrow(/PESEL.*already exists/);

    const dupCall = vi.mocked(queryOne).mock.calls[0];
    const dupSQL = dupCall[0] as string;
    const dupParams = dupCall[1] as unknown[];
    expect(dupSQL).toContain("pesel_hash = $2");
    expect(dupSQL).not.toMatch(/\bpesel\s*=\s*\$/); // no plaintext comparison
    expect(dupParams[1]).toBe(lookupHash("12345678901"));
  });

  // ── Test 9: Duplicate-PESEL on update → hash-column lookup + id-exclude ──
  it("Test 9: Duplicate-PESEL check on update uses pesel_hash lookup with id != self-exclude", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({ id: "other", full_name: "Other" } as never);
    await expect(
      updateWorker("w1", { pesel: "12345678901" }, "t1")
    ).rejects.toThrow(/PESEL.*already exists/);

    const dupCall = vi.mocked(queryOne).mock.calls[0];
    const dupSQL = dupCall[0] as string;
    expect(dupSQL).toContain("pesel_hash = $2");
    expect(dupSQL).toContain("id != $3");
  });

  // ── Test 10: Integration roundtrip ──
  it("Test 10: Integration roundtrip — createWorker → decrypt(stored) === original plaintext", async () => {
    const originalPesel = "87654321098";
    await createWorker({ pesel: originalPesel, fullName: "Jan" } as never, "t1");
    const { cols, params } = parseInsert(vi.mocked(query).mock.calls[0]);
    const storedPesel = valueAt(cols, params, "pesel") as string;
    const storedHash = valueAt(cols, params, "pesel_hash") as string;
    expect(decrypt(storedPesel)).toBe(originalPesel);
    expect(storedHash).toBe(lookupHash(originalPesel));
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── Test 11: Partial update preserves existing encrypted values (undefined-vs-null discipline) ──
  it("Test 11: updateWorker({someOtherField}) — no pesel/iban/passport in payload → NONE appear in SET (existing values preserved)", async () => {
    await updateWorker("w1", { phone: "new-phone-number" }, "t1");
    const { sets } = parseUpdate(vi.mocked(query).mock.calls[0]);
    expect(sets.some((s) => s.startsWith("pesel"))).toBe(false);
    expect(sets.some((s) => s.startsWith("pesel_hash"))).toBe(false);
    expect(sets.some((s) => s.startsWith("iban"))).toBe(false);
    expect(sets.some((s) => s.startsWith("iban_hash"))).toBe(false);
    expect(sets.some((s) => s.startsWith("passport_number"))).toBe(false);
    expect(sets.some((s) => s.startsWith("passport_hash"))).toBe(false);
    expect(sets.some((s) => s.startsWith("phone ="))).toBe(true);
  });

  // ── Test 12: Hash-Column Atomicity invariant ──
  it("Test 12: Atomicity invariant — updating encrypted column ALWAYS pairs with hash column in same SET (all 3 PII fields)", async () => {
    // pesel
    await updateWorker("w1", { pesel: "99999999999" }, "t1");
    const p = parseUpdate(vi.mocked(query).mock.calls[0]);
    expect(p.sets.some((s) => s.startsWith("pesel ="))).toBe(true);
    expect(p.sets.some((s) => s.startsWith("pesel_hash ="))).toBe(true);

    vi.mocked(query).mockClear();
    vi.mocked(queryOne).mockClear();

    // iban
    await updateWorker("w1", { iban: "PL00000000000000000000009999" }, "t1");
    const i = parseUpdate(vi.mocked(query).mock.calls[0]);
    expect(i.sets.some((s) => s.startsWith("iban ="))).toBe(true);
    expect(i.sets.some((s) => s.startsWith("iban_hash ="))).toBe(true);

    vi.mocked(query).mockClear();
    vi.mocked(queryOne).mockClear();

    // passport_number
    await updateWorker("w1", { passport_number: "X9999999" }, "t1");
    const pn = parseUpdate(vi.mocked(query).mock.calls[0]);
    expect(pn.sets.some((s) => s.startsWith("passport_number ="))).toBe(true);
    expect(pn.sets.some((s) => s.startsWith("passport_hash ="))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Route + service wrap smoke tests (Tests 13-19)
// Structural tests that verify the wrap is in place at each site. Paired with
// Tests 1-12 which behaviorally verify encryptIfPresent/lookupHash/hash-column
// atomicity, these give end-to-end confidence that the 14 wraps are live.
// ─────────────────────────────────────────────────────────────────────────────
describe("Route + service wrap smoke tests — wraps 5-11 (Tests 13-19)", () => {
  it("Test 13: contracts.ts POST /poa INSERT wraps pesel with encryptIfPresent (wrap #5)", () => {
    const src = srcOf("routes/contracts.ts");
    // The POA INSERT must contain encryptIfPresent(pesel) in its VALUES tuple
    expect(src).toMatch(/INSERT INTO power_of_attorney[\s\S]+?encryptIfPresent\(pesel\)/);
  });

  it("Test 14: contracts.ts PATCH /poa/:id fieldMap wraps pesel in dynamic SET (wrap #6)", () => {
    const src = srcOf("routes/contracts.ts");
    // Dynamic fieldMap loop must pick encryptIfPresent when col is pesel
    expect(src).toMatch(/col === "pesel" \? encryptIfPresent\(body\[key\]\) : body\[key\]/);
  });

  it("Test 15: trc-service.ts POST /trc/cases INSERT wraps passportNumber with encryptIfPresent (wrap #7)", () => {
    const src = srcOf("routes/trc-service.ts");
    expect(src).toMatch(/INSERT INTO trc_cases[\s\S]+?encryptIfPresent\(passportNumber\)/);
  });

  it("Test 16: trc-service.ts PATCH /trc/cases/:id fieldMap wraps passport_number in dynamic SET (wrap #8)", () => {
    const src = srcOf("routes/trc-service.ts");
    expect(src).toMatch(/col === "passport_number" \? encryptIfPresent\(body\[key\]\) : body\[key\]/);
  });

  it("Test 17: worker-email.ts INSERT poa_registry wraps worker_passport_number (wrap #9)", () => {
    const src = srcOf("routes/worker-email.ts");
    expect(src).toMatch(/INSERT INTO poa_registry[\s\S]+?encryptIfPresent\(b\.workerPassportNumber\)/);
  });

  it("Test 18: self-service.ts PATCH /self-service/profile wraps iban + iban_hash atomically (wrap #10)", () => {
    const src = srcOf("routes/self-service.ts");
    // Both iban = $ and iban_hash = $ SET clauses must be present in same path
    expect(src).toContain('sets.push(`iban = $${idx++}`)');
    expect(src).toContain('sets.push(`iban_hash = $${idx++}`)');
    expect(src).toContain("encryptIfPresent(body[key])");
    expect(src).toContain("lookupHash(plaintext)");
  });

  it("Test 19: document-intake.service.ts confirmIntake UPDATE wraps passport_number + passport_hash atomically (wrap #11)", () => {
    const src = srcOf("services/document-intake.service.ts");
    // Both passport_number = $ and passport_hash = $ must be pushed atomically with the encryption + hash
    expect(src).toContain("updates.push(`passport_number = $${idx++}`)");
    expect(src).toContain("updates.push(`passport_hash = $${idx++}`)");
    expect(src).toContain("encryptIfPresent(fields.passportNumber)");
    expect(src).toContain("lookupHash(plaintext)");
  });
});
