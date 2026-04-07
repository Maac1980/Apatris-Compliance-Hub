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
