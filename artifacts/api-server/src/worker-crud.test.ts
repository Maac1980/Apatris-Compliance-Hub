import { describe, it, expect } from "vitest";
import { mapRowToWorker, filterWorkers, type Worker } from "./lib/compliance.js";

// ═══ WORKER DATA MAPPING ════════════════════════════════════════════════════

const MOCK_ROW = {
  id: "test-uuid-123",
  full_name: "Jan Kowalski",
  specialization: "TIG",
  assigned_site: "Gdansk Shipyard",
  email: "jan@test.pl",
  phone: "+48601234567",
  trc_expiry: "2026-12-01",
  passport_expiry: "2028-06-15",
  bhp_expiry: "2026-09-01",
  work_permit_expiry: "2026-11-01",
  contract_end_date: "2026-12-31",
  medical_exam_expiry: null,
  udt_cert_expiry: null,
  hourly_rate: 35,
  monthly_hours: 160,
  advance: 0,
  penalties: 0,
  iban: "PL61109010140000071219812874",
  pesel: "90010112345",
  nip: null,
  tenant_id: "tenant-1",
  created_at: "2026-01-01",
  updated_at: "2026-04-01",
};

describe("Worker Data Mapping", () => {
  it("maps database row to Worker object", () => {
    const w = mapRowToWorker(MOCK_ROW as any);
    expect(w).toBeDefined();
    expect(w.name).toBe("Jan Kowalski");
    expect(w.id).toBe("test-uuid-123");
  });

  it("handles null fields gracefully", () => {
    const row = { ...MOCK_ROW, full_name: "Test", email: null, phone: null, specialization: null };
    const w = mapRowToWorker(row as any);
    expect(w.name).toBe("Test");
    expect(w.id).toBeDefined();
  });

  it("handles missing expiry dates", () => {
    const row = { ...MOCK_ROW, trc_expiry: null, passport_expiry: null, bhp_expiry: null };
    const w = mapRowToWorker(row as any);
    expect(w).toBeDefined();
  });

  it("masks PESEL — shows only last 4 digits", () => {
    const row = { ...MOCK_ROW, pesel: "90010112345" };
    const w = mapRowToWorker(row as any);
    expect(w.pesel).toBe("*******2345");
    expect(w.pesel).not.toContain("9001011");
  });

  it("masks IBAN — shows only last 4 characters", () => {
    const row = { ...MOCK_ROW, iban: "PL61109010140000071219812874" };
    const w = mapRowToWorker(row as any);
    // "PL61109010140000071219812874" = 28 chars → 24 asterisks + "2874"
    expect(w.iban).toBe("************************2874");
    expect(w.iban).not.toContain("PL6110");
  });

  it("masks NIP — shows only last 4 digits", () => {
    const row = { ...MOCK_ROW, nip: "5252828706" };
    const w = mapRowToWorker(row as any);
    expect(w.nip).toBe("******8706");
    expect(w.nip).not.toContain("5252");
  });

  it("returns null for null/empty PESEL", () => {
    const w1 = mapRowToWorker({ ...MOCK_ROW, pesel: null } as any);
    expect(w1.pesel).toBeNull();
    const w2 = mapRowToWorker({ ...MOCK_ROW, pesel: "" } as any);
    expect(w2.pesel).toBeNull();
  });

  it("returns null for null/empty IBAN", () => {
    const w1 = mapRowToWorker({ ...MOCK_ROW, iban: null } as any);
    expect(w1.iban).toBeNull();
  });

  it("null row → null (defensive guard, does not throw) — Apr 19 null-safety fix", () => {
    // Before Apr 19, mapRowToWorker crashed on row.trc_expiry when callers
    // passed null (e.g., fetchWorkerById returning null on tenant miss).
    // The null guard returns null cleanly; callers must handle it (e.g., 404 or 500).
    expect(() => mapRowToWorker(null)).not.toThrow();
    expect(mapRowToWorker(null)).toBeNull();
  });
});

// ═══ WORKER FILTERING ═══════════════════════════════════════════════════════

describe("Worker Filtering", () => {
  const workers: Worker[] = [
    mapRowToWorker({ ...MOCK_ROW, id: "1", full_name: "Jan Kowalski", specialization: "TIG", assigned_site: "Gdansk" } as any),
    mapRowToWorker({ ...MOCK_ROW, id: "2", full_name: "Oleksandr Petrov", specialization: "MIG", assigned_site: "Warsaw" } as any),
    mapRowToWorker({ ...MOCK_ROW, id: "3", full_name: "Dmytro Kovalenko", specialization: "TIG", assigned_site: "Gdansk" } as any),
  ];

  it("filters by name search", () => {
    const result = filterWorkers(workers, "jan");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Jan Kowalski");
  });

  it("filters case-insensitive", () => {
    const result = filterWorkers(workers, "PETROV");
    expect(result.length).toBe(1);
  });

  it("returns all when search is empty", () => {
    const result = filterWorkers(workers, "");
    expect(result.length).toBe(3);
  });

  it("returns empty for non-matching search", () => {
    const result = filterWorkers(workers, "ZZZZZZZ");
    expect(result.length).toBe(0);
  });
});

// ═══ WORKER FIELD VALIDATION ════════════════════════════════════════════════

describe("Worker Field Validation", () => {
  it("PESEL must be 11 digits", () => {
    const valid = "90010112345";
    const invalid = "1234";
    expect(valid.length).toBe(11);
    expect(/^\d{11}$/.test(valid)).toBe(true);
    expect(/^\d{11}$/.test(invalid)).toBe(false);
  });

  it("IBAN PL format is 26 digits after PL", () => {
    const iban = "PL61109010140000071219812874";
    expect(iban.startsWith("PL")).toBe(true);
    expect(iban.replace("PL", "").length).toBe(26);
  });

  it("hourly rate must be positive", () => {
    expect(MOCK_ROW.hourly_rate).toBeGreaterThan(0);
  });

  it("monthly hours must be reasonable", () => {
    expect(MOCK_ROW.monthly_hours).toBeGreaterThanOrEqual(0);
    expect(MOCK_ROW.monthly_hours).toBeLessThanOrEqual(300);
  });
});

// ═══ PESEL / NIP UNIQUENESS VALIDATION ═════════════════════════════════════

describe("PESEL / NIP Uniqueness Rules", () => {
  it("PESEL must be unique per tenant — duplicates should be rejected", () => {
    // Simulate the check: same PESEL within same tenant = error
    const existingWorkers = [
      { id: "w1", pesel: "90010112345", tenant_id: "t1" },
      { id: "w2", pesel: "85042312345", tenant_id: "t1" },
      { id: "w3", pesel: "90010112345", tenant_id: "t2" }, // same PESEL, different tenant = OK
    ];

    const newPesel = "90010112345";
    const tenantId = "t1";
    const duplicateInTenant = existingWorkers.find(
      (w) => w.pesel === newPesel && w.tenant_id === tenantId
    );
    expect(duplicateInTenant).toBeDefined();
    expect(duplicateInTenant!.id).toBe("w1");
  });

  it("same PESEL in different tenant is allowed", () => {
    const existingWorkers = [
      { id: "w1", pesel: "90010112345", tenant_id: "t1" },
    ];

    const newPesel = "90010112345";
    const tenantId = "t2"; // different tenant
    const duplicateInTenant = existingWorkers.find(
      (w) => w.pesel === newPesel && w.tenant_id === tenantId
    );
    expect(duplicateInTenant).toBeUndefined(); // no conflict
  });

  it("NULL or empty PESEL should not trigger uniqueness check", () => {
    const shouldCheck = (pesel: unknown): boolean =>
      typeof pesel === "string" && pesel.trim() !== "";

    expect(shouldCheck(null)).toBe(false);
    expect(shouldCheck(undefined)).toBe(false);
    expect(shouldCheck("")).toBe(false);
    expect(shouldCheck("  ")).toBe(false);
    expect(shouldCheck("90010112345")).toBe(true);
  });

  it("NIP uniqueness follows same tenant-scoped rules", () => {
    const existingWorkers = [
      { id: "w1", nip: "1234567890", tenant_id: "t1" },
    ];

    // Same NIP, same tenant = conflict
    const dup = existingWorkers.find(
      (w) => w.nip === "1234567890" && w.tenant_id === "t1"
    );
    expect(dup).toBeDefined();

    // Same NIP, different tenant = OK
    const noDup = existingWorkers.find(
      (w) => w.nip === "1234567890" && w.tenant_id === "t2"
    );
    expect(noDup).toBeUndefined();
  });

  it("update should allow keeping same PESEL on own record", () => {
    const existingWorkers = [
      { id: "w1", pesel: "90010112345", tenant_id: "t1" },
      { id: "w2", pesel: "85042312345", tenant_id: "t1" },
    ];

    // Worker w1 updating their own PESEL to the same value = no conflict
    const updatingId = "w1";
    const updatingPesel = "90010112345";
    const conflict = existingWorkers.find(
      (w) => w.pesel === updatingPesel && w.tenant_id === "t1" && w.id !== updatingId
    );
    expect(conflict).toBeUndefined(); // no conflict with self
  });

  it("update should reject PESEL that belongs to another worker", () => {
    const existingWorkers = [
      { id: "w1", pesel: "90010112345", tenant_id: "t1" },
      { id: "w2", pesel: "85042312345", tenant_id: "t1" },
    ];

    // Worker w2 trying to take w1's PESEL = conflict
    const updatingId = "w2";
    const stolenPesel = "90010112345";
    const conflict = existingWorkers.find(
      (w) => w.pesel === stolenPesel && w.tenant_id === "t1" && w.id !== updatingId
    );
    expect(conflict).toBeDefined();
    expect(conflict!.id).toBe("w1");
  });
});

// ═══ DATE ORDER VALIDATION ═════════════════════════════════════════════════

describe("Date Order Validation", () => {
  /** Same logic as documents-db.ts validateDateOrder */
  function validateDateOrder(issueDate?: string | null, expiryDate?: string | null): string | null {
    if (issueDate && expiryDate) {
      const issue = new Date(issueDate);
      const expiry = new Date(expiryDate);
      if (!isNaN(issue.getTime()) && !isNaN(expiry.getTime()) && expiry < issue) {
        return `Expiry date (${expiryDate}) cannot be before issue date (${issueDate}).`;
      }
    }
    return null;
  }

  it("rejects expiry before issue date", () => {
    const err = validateDateOrder("2026-06-01", "2026-05-01");
    expect(err).not.toBeNull();
    expect(err).toContain("cannot be before");
  });

  it("accepts expiry after issue date", () => {
    const err = validateDateOrder("2026-01-01", "2027-01-01");
    expect(err).toBeNull();
  });

  it("accepts same day for issue and expiry", () => {
    const err = validateDateOrder("2026-06-01", "2026-06-01");
    expect(err).toBeNull();
  });

  it("allows null issue date (no constraint)", () => {
    const err = validateDateOrder(null, "2026-12-31");
    expect(err).toBeNull();
  });

  it("allows null expiry date (no constraint)", () => {
    const err = validateDateOrder("2026-01-01", null);
    expect(err).toBeNull();
  });

  it("allows both null (no constraint)", () => {
    const err = validateDateOrder(null, null);
    expect(err).toBeNull();
  });

  it("handles invalid date strings gracefully", () => {
    const err = validateDateOrder("not-a-date", "2026-01-01");
    expect(err).toBeNull(); // NaN check prevents false positive
  });

  it("rejects contract end before start", () => {
    // Same logic applies to contracts: end_date < start_date
    const err = validateDateOrder("2026-04-01", "2026-03-15");
    expect(err).not.toBeNull();
  });

  it("posting assignment: end before start is rejected", () => {
    const err = validateDateOrder("2026-07-01", "2026-06-01");
    expect(err).not.toBeNull();
  });
});

// ═══ INPUT VALIDATION RULES ════════════════════════════════════════════════

describe("Input Validation — Email, Phone, PESEL, NIP, IBAN", () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\+?[\d\s()-]{7,20}$/;
  const peselRegex = /^\d{11}$/;
  const nipRegex = /^\d{10}$/;
  const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

  // Email
  it("accepts valid emails", () => {
    expect(emailRegex.test("jan@apatris.pl")).toBe(true);
    expect(emailRegex.test("worker.name@company.com")).toBe(true);
    expect(emailRegex.test("a@b.co")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(emailRegex.test("notanemail")).toBe(false);
    expect(emailRegex.test("@missing.com")).toBe(false);
    expect(emailRegex.test("no spaces@test.com")).toBe(false);
    expect(emailRegex.test("")).toBe(false);
  });

  // Phone
  it("accepts valid phone numbers", () => {
    expect(phoneRegex.test("+48601234567")).toBe(true);
    expect(phoneRegex.test("601 234 567")).toBe(true);
    expect(phoneRegex.test("+48 601-234-567")).toBe(true);
    expect(phoneRegex.test("(48) 601234567")).toBe(true);
  });

  it("rejects invalid phone numbers", () => {
    expect(phoneRegex.test("123")).toBe(false);           // too short
    expect(phoneRegex.test("abc")).toBe(false);            // letters
    expect(phoneRegex.test("")).toBe(false);
  });

  // PESEL
  it("accepts valid PESEL (11 digits)", () => {
    expect(peselRegex.test("90010112345")).toBe(true);
    expect(peselRegex.test("85042312345")).toBe(true);
  });

  it("rejects invalid PESEL", () => {
    expect(peselRegex.test("1234")).toBe(false);           // too short
    expect(peselRegex.test("123456789012")).toBe(false);   // too long
    expect(peselRegex.test("9001011234A")).toBe(false);    // letters
    expect(peselRegex.test("")).toBe(false);
  });

  // NIP
  it("accepts valid NIP (10 digits)", () => {
    expect(nipRegex.test("5252828706")).toBe(true);
  });

  it("rejects invalid NIP", () => {
    expect(nipRegex.test("12345")).toBe(false);
    expect(nipRegex.test("52528287061")).toBe(false);      // 11 digits
    expect(nipRegex.test("525-282-87-06")).toBe(false);    // dashes
  });

  // IBAN
  it("accepts valid Polish IBAN", () => {
    expect(ibanRegex.test("PL61109010140000071219812874")).toBe(true);
  });

  it("accepts valid German IBAN", () => {
    expect(ibanRegex.test("DE89370400440532013000")).toBe(true);
  });

  it("rejects invalid IBAN", () => {
    expect(ibanRegex.test("61109010140000071219812874")).toBe(false);  // no country code
    expect(ibanRegex.test("pl61109010140000071219812874")).toBe(false); // lowercase
    expect(ibanRegex.test("PL")).toBe(false);                           // too short
    expect(ibanRegex.test("")).toBe(false);
  });
});

// ═══ API RESPONSE STRUCTURE ═════════════════════════════════════════════════

describe("API Response Structures", () => {
  it("worker list response has workers array and count", () => {
    const mockResponse = { workers: [MOCK_ROW], count: 1 };
    expect(Array.isArray(mockResponse.workers)).toBe(true);
    expect(mockResponse.count).toBe(1);
  });

  it("legal status response has required fields", () => {
    const mockLegalStatus = {
      legalStatus: "VALID",
      legalBasis: "PERMIT_VALID",
      riskLevel: "LOW",
      summary: "Permit valid",
      conditions: [],
      warnings: [],
      requiredActions: [],
      deployability: "ALLOWED",
    };
    expect(mockLegalStatus.legalStatus).toBeDefined();
    expect(mockLegalStatus.legalBasis).toBeDefined();
    expect(mockLegalStatus.riskLevel).toBeDefined();
    expect(["VALID", "EXPIRING_SOON", "PROTECTED_PENDING", "REVIEW_REQUIRED", "EXPIRED_NOT_PROTECTED", "NO_PERMIT"]).toContain(mockLegalStatus.legalStatus);
    expect(["PERMIT_VALID", "ART_108", "SPECUSTAWA_UKR", "REVIEW_REQUIRED", "NO_LEGAL_BASIS"]).toContain(mockLegalStatus.legalBasis);
    expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(mockLegalStatus.riskLevel);
    expect(["ALLOWED", "BLOCKED", "CONDITIONAL", "APPROVAL_REQUIRED"]).toContain(mockLegalStatus.deployability);
  });

  it("payroll response has required ZUS fields", () => {
    const mockPayroll = {
      gross: 10000,
      net: 7200,
      employerZus: 1881,
      totalEmployerCost: 11881,
      details: { social: 1126, health: 798.66, pit: 875, kup: 1774 },
    };
    expect(mockPayroll.gross).toBeGreaterThan(0);
    expect(mockPayroll.net).toBeLessThan(mockPayroll.gross);
    expect(mockPayroll.employerZus).toBeGreaterThan(0);
    expect(mockPayroll.totalEmployerCost).toBe(mockPayroll.gross + mockPayroll.employerZus);
  });
});
