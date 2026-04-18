import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("./lib/db.js", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

beforeAll(() => {
  process.env.NODE_ENV = "test";
  delete process.env.APATRIS_ENCRYPTION_KEY;
  delete process.env.APATRIS_LOOKUP_KEY;
});

import { query, queryOne } from "./lib/db.js";
import { fetchAllWorkers, fetchWorkerById } from "./lib/workers-db.js";
import { encrypt, maskForRole } from "./lib/encryption.js";
import { mapRowToWorker } from "./lib/compliance.js";
import { sanitizePiiFromAuditText } from "./lib/audit-log.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcOf = (rel: string): string => readFileSync(join(__dirname, rel), "utf8");

describe("Read paths — decrypt + role masking + Compliance Card + audit sanitizer (Prompt 8)", () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    vi.mocked(queryOne).mockReset();
  });

  // ── Tests 1-4: workers-db decrypt behavior ──
  it("Test 1: fetchWorkerById decrypts pesel before returning", async () => {
    const ct = encrypt("12345678901");
    vi.mocked(queryOne).mockResolvedValueOnce({
      id: "w1", full_name: "Jan", pesel: ct, iban: null, passport_number: null, nip: null,
    } as never);
    const w = await fetchWorkerById("w1", "t1");
    expect(w?.pesel).toBe("12345678901");
  });

  it("Test 2: fetchWorkerById passes legacy plaintext through unchanged", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({
      id: "w1", full_name: "Jan", pesel: "98765432101", iban: null, passport_number: null, nip: null,
    } as never);
    const w = await fetchWorkerById("w1", "t1");
    expect(w?.pesel).toBe("98765432101"); // legacy passthrough via decrypt() on non-prefix value
  });

  it("Test 3: fetchAllWorkers decrypts all rows", async () => {
    const ct1 = encrypt("11111111111");
    const ct2 = encrypt("22222222222");
    vi.mocked(query).mockResolvedValueOnce([
      { id: "w1", full_name: "A", pesel: ct1, iban: null, passport_number: null, nip: null },
      { id: "w2", full_name: "B", pesel: ct2, iban: null, passport_number: null, nip: null },
    ] as never);
    const ws = await fetchAllWorkers("t1");
    expect(ws[0]!.pesel).toBe("11111111111");
    expect(ws[1]!.pesel).toBe("22222222222");
  });

  it("Test 4: fetchWorkerById does NOT decrypt nip (Blocker 2 — nip stays plaintext at rest)", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({
      id: "w1", full_name: "Jan", pesel: null, iban: null, passport_number: null, nip: "5252828706",
    } as never);
    const w = await fetchWorkerById("w1", "t1");
    // nip is stored plaintext (Blocker 2) — should pass through unchanged, NOT decrypted
    expect(w?.nip).toBe("5252828706");
  });

  // ── Tests 5-9: maskForRole tier verification ──
  it("Test 5: T1 user → maskForRole returns plaintext", () => {
    expect(maskForRole(encrypt("12345678901"), "T1")).toBe("12345678901");
  });

  it("Test 6: T2 user → plaintext", () => {
    expect(maskForRole(encrypt("12345678901"), "T2")).toBe("12345678901");
  });

  it("Test 7: T3 user → ***-****-<last4>", () => {
    expect(maskForRole(encrypt("12345678901"), "T3")).toBe("***-****-8901");
  });

  it("Test 8: T4 user → masked", () => {
    expect(maskForRole(encrypt("12345678901"), "T4")).toBe("***-****-8901");
  });

  it("Test 9: T5 user → masked DEFAULT (no Compliance Card flag)", () => {
    expect(maskForRole(encrypt("12345678901"), "T5")).toBe("***-****-8901");
  });

  // ── Tests 10-12: Compliance Card route scenarios (structural) ──
  it("Test 10: /workers/me with ?purpose=compliance_card on own record returns plaintext", () => {
    const src = srcOf("routes/workers.ts");
    expect(src).toContain('purpose === "compliance_card"');
    // The plaintext-return path includes worker.pesel, worker.iban, worker.passport_number directly
    expect(src).toMatch(/pesel:\s*worker\.pesel,/);
    expect(src).toMatch(/iban:\s*worker\.iban,/);
    expect(src).toMatch(/passport_number:\s*worker\.passport_number,/);
  });

  it("Test 11: /workers/me with ?purpose=compliance_card on someone else's record → masked (own-record check enforced)", () => {
    const src = srcOf("routes/workers.ts");
    // Own-record check: worker_id != resolved → fall back to mapRowToWorker(worker, T5) which masks
    expect(src).toContain("ownRecord");
    expect(src).toMatch(/!ownRecord[\s\S]+?mapRowToWorker\(worker,\s*"T5"\)/);
  });

  it("Test 12: /workers/me with unknown ?purpose value → masked + console.warn (Addition 5)", () => {
    const src = srcOf("routes/workers.ts");
    expect(src).toContain("unexpected purpose value");
    expect(src).toContain("console.warn");
  });

  // ── Test 13: audit entry on Compliance Card success ──
  it("Test 13: Compliance Card success writes PLAINTEXT_PII_VIEWED audit entry with required fields", () => {
    const src = srcOf("routes/workers.ts");
    // The plaintext-return branch writes PLAINTEXT_PII_VIEWED audit entry
    expect(src).toMatch(/action:\s*["']PLAINTEXT_PII_VIEWED["']\s*as\s*any/);
    expect(src).toMatch(/note:\s*["']purpose=compliance_card["']/);
    expect(src).toContain("workerId: worker.id");
    expect(src).toContain("actorEmail: userEmail");
  });

  // ── Test 14: fraud.ts hash-column GROUP BY ──
  it("Test 14: fraud.ts duplicate detection uses GROUP BY pesel_hash and iban_hash (not plaintext)", () => {
    const src = srcOf("routes/fraud.ts");
    expect(src).toContain("GROUP BY pesel_hash");
    expect(src).toContain("GROUP BY iban_hash");
    expect(src).not.toMatch(/GROUP BY pesel\b(?!_)/); // no bare GROUP BY pesel
    expect(src).not.toMatch(/GROUP BY iban\b(?!_)/);
  });

  // ── Tests 15a-d: audit sanitizer (Addition 3) ──
  it("Test 15a: audit sanitizer redacts PESEL pattern (\\d{11}) to [encrypted]", () => {
    expect(sanitizePiiFromAuditText("Worker 12345678901 updated")).toBe("Worker [encrypted] updated");
  });

  it("Test 15b: audit sanitizer redacts IBAN PL pattern to [encrypted]", () => {
    const result = sanitizePiiFromAuditText("IBAN PL61 1090 1014 0000 0712 1981 2874 changed");
    expect(result).toContain("[encrypted]");
    expect(result).not.toContain("1090");
    expect(result).not.toContain("2874");
  });

  it("Test 15c: audit sanitizer over-redacts random 11-digit numbers (accepted trade-off per PC-3)", () => {
    // Conservative regex over-redacts non-PII 11-digit strings — acceptable in audit-log notes
    expect(sanitizePiiFromAuditText("Invoice 12345678901 paid")).toBe("Invoice [encrypted] paid");
    expect(sanitizePiiFromAuditText("Order 99999999999 cancelled")).toBe("Order [encrypted] cancelled");
  });

  it("Test 15d: audit sanitizer leaves plain text without PII patterns unchanged", () => {
    expect(sanitizePiiFromAuditText("Worker name updated")).toBe("Worker name updated");
    expect(sanitizePiiFromAuditText("Status changed to APPROVED")).toBe("Status changed to APPROVED");
    expect(sanitizePiiFromAuditText(null)).toBe(null);
    expect(sanitizePiiFromAuditText(undefined)).toBe(null);
  });

  // ── Tests 16-18: Integration tests (structural) ──
  it("Test 16: GET /workers/:id projection uses role-aware mapRowToWorker (T5 sees masked, T1 sees plaintext)", () => {
    const src = srcOf("routes/workers.ts");
    // Multiple GET single-worker routes pass req.user.role to mapRowToWorker
    expect(src).toMatch(/mapRowToWorker\(row, \(req as any\)\.user\?\.role as Tier\)/);
  });

  it("Test 17: /workers/me?purpose=compliance_card own JWT → plaintext pesel + audit entry created", () => {
    const src = srcOf("routes/workers.ts");
    // Plaintext path constructs worker response with raw decrypted fields (NOT via mapRowToWorker)
    expect(src).toMatch(/pesel:\s*worker\.pesel/);
    // And writes PLAINTEXT_PII_VIEWED audit
    expect(src).toMatch(/PLAINTEXT_PII_VIEWED[\s\S]+?worker\.id/);
  });

  it("Test 18 / Test #11b (R2): /workers/me cross-worker attempt → masked + PLAINTEXT_PII_ACCESS_DENIED audit", () => {
    const src = srcOf("routes/workers.ts");
    // Failed own-record check writes denied audit AND falls back to masked
    expect(src).toMatch(/!ownRecord[\s\S]+?PLAINTEXT_PII_ACCESS_DENIED/);
    expect(src).toMatch(/!ownRecord[\s\S]+?mapRowToWorker\(worker,\s*"T5"\)/);
  });
});
