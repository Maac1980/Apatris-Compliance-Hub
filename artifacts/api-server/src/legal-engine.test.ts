import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  evaluateWorkerLegalProtection,
  type LegalProtectionInput,
  type LegalProtectionResult,
} from "./services/legal-engine.js";

// ═══ DATE MOCKING ═══════════════════════════════════════════════════════════
// The engine uses `new Date()` internally. We freeze time to 2026-04-07
// so all tests are deterministic regardless of when they run.

const FROZEN_NOW = new Date("2026-04-07T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══ HELPERS ════════════════════════════════════════════════════════════════

/** Create a date string N days from the frozen "now" */
function daysFromNow(days: number): string {
  return new Date(FROZEN_NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Shorthand for the engine call */
function evaluate(input: Partial<LegalProtectionInput>): LegalProtectionResult {
  return evaluateWorkerLegalProtection({
    filingDate: null,
    permitExpiryDate: null,
    ...input,
  });
}

// ═══ A. MISSING DATA ════════════════════════════════════════════════════════

describe("A. Missing data", () => {
  it("A1: missing permitExpiryDate → REVIEW_REQUIRED", () => {
    const r = evaluate({ permitExpiryDate: null });
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.legalBasis).toBe("REVIEW_REQUIRED");
    expect(r.riskLevel).toBe("HIGH");
  });

  it("A2: missing filingDate with expired permit → EXPIRED_NOT_PROTECTED", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(-10), filingDate: null });
    expect(r.status).toBe("EXPIRED_NOT_PROTECTED");
    expect(r.legalBasis).toBe("NO_LEGAL_BASIS");
    expect(r.riskLevel).toBe("CRITICAL");
  });

  it("A3: completely empty input → REVIEW_REQUIRED", () => {
    const r = evaluate({});
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.legalBasis).toBe("REVIEW_REQUIRED");
  });

  it("A4: permitExpiryDate present but no filingDate, permit still valid → VALID", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(90) });
    expect(r.status).toBe("VALID");
  });
});

// ═══ B. PERMIT VALIDITY ════════════════════════════════════════════════════

describe("B. Permit validity", () => {
  it("B1: permit valid with 90 days remaining → VALID + LOW risk", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(90) });
    expect(r.status).toBe("VALID");
    expect(r.legalBasis).toBe("PERMIT_VALID");
    expect(r.riskLevel).toBe("LOW");
    expect(r.warnings).toHaveLength(0);
    expect(r.requiredActions).toHaveLength(0);
  });

  it("B2: permit valid with 45 days → VALID + 60-day warning", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(45) });
    expect(r.status).toBe("VALID");
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.includes("45 days"))).toBe(true);
    expect(r.requiredActions.some((a) => a.includes("Begin TRC"))).toBe(true);
  });

  it("B3: permit valid with 15 days → VALID + urgent 30-day warning", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(15) });
    expect(r.status).toBe("VALID");
    expect(r.warnings.some((w) => w.includes("15 days") && w.includes("urgent"))).toBe(true);
    expect(r.requiredActions.some((a) => a.includes("immediately"))).toBe(true);
  });

  it("B4: permit valid + filing already exists before expiry → VALID with transition condition", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(30),
      filingDate: daysFromNow(-10), // filed 10 days ago
    });
    expect(r.status).toBe("VALID");
    expect(r.legalBasis).toBe("PERMIT_VALID");
    expect(r.conditions.some((c) => c.includes("TRC application already filed"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("Art. 108 continuity protection will be evaluated"))).toBe(true);
  });

  it("B5: permit expiry threshold — exactly 30 days → urgent warning", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(30) });
    expect(r.status).toBe("VALID");
    expect(r.warnings.some((w) => w.includes("30 days") && w.includes("urgent"))).toBe(true);
  });

  it("B6: permit expiry threshold — exactly 31 days → plan renewal (not urgent)", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(31) });
    expect(r.status).toBe("VALID");
    expect(r.warnings.some((w) => w.includes("31 days") && w.includes("plan renewal"))).toBe(true);
  });

  it("B7: permit expiry threshold — exactly 60 days → plan renewal warning", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(60) });
    expect(r.status).toBe("VALID");
    expect(r.warnings.some((w) => w.includes("60 days"))).toBe(true);
  });

  it("B8: permit expiry threshold — exactly 61 days → no warning", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(61) });
    expect(r.status).toBe("VALID");
    expect(r.warnings).toHaveLength(0);
  });
});

// ═══ C. ART. 108 CONTINUITY ═══════════════════════════════════════════════

describe("C. Art. 108 continuity protection", () => {
  it("C1: full continuity → PROTECTED_PENDING + ART_108", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-30),
      filingDate: daysFromNow(-60), // filed 30 days before expiry
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
      formalDefect: false,
    });
    expect(r.status).toBe("PROTECTED_PENDING");
    expect(r.legalBasis).toBe("ART_108");
    expect(r.riskLevel).toBe("MEDIUM");
    expect(r.conditions.some((c) => c.includes("before permit expiry"))).toBe(true);
    expect(r.conditions.some((c) => c.includes("same employer"))).toBe(true);
  });

  it("C2: full continuity — formalDefect undefined (not true) still grants protection", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
      // formalDefect not set — defaults to undefined
    });
    expect(r.status).toBe("PROTECTED_PENDING");
    expect(r.legalBasis).toBe("ART_108");
  });
});

// ═══ D. BOUNDARY: FILING DATE == EXPIRY DATE ═══════════════════════════════

describe("D. Boundary: filing date equals permit expiry date", () => {
  it("D1: filing on exact expiry day with full continuity → PROTECTED_PENDING (not late)", () => {
    const expiryDate = daysFromNow(-5);
    const r = evaluate({
      permitExpiryDate: expiryDate,
      filingDate: expiryDate, // same day
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
    });
    expect(r.status).toBe("PROTECTED_PENDING");
    expect(r.legalBasis).toBe("ART_108");
  });

  it("D2: filing on exact expiry day without full continuity → REVIEW_REQUIRED (not expired)", () => {
    const expiryDate = daysFromNow(-5);
    const r = evaluate({
      permitExpiryDate: expiryDate,
      filingDate: expiryDate,
      hadPriorRightToWork: true,
      // sameEmployer missing
    });
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.legalBasis).toBe("REVIEW_REQUIRED");
    // Should NOT be EXPIRED_NOT_PROTECTED — filing was on time
    expect(r.status).not.toBe("EXPIRED_NOT_PROTECTED");
  });
});

// ═══ E. PARTIAL CONTINUITY ═════════════════════════════════════════════════

describe("E. Partial continuity / unclear data", () => {
  it("E1: filed before expiry but missing sameEmployer → REVIEW_REQUIRED", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      hadPriorRightToWork: true,
      sameRole: true,
      // sameEmployer missing
    });
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.summary).toContain("same employer not confirmed");
  });

  it("E2: filed before expiry but missing sameRole → REVIEW_REQUIRED", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      hadPriorRightToWork: true,
      sameEmployer: true,
      // sameRole missing
    });
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.summary).toContain("same role not confirmed");
  });

  it("E3: filed before expiry but missing hadPriorRightToWork → REVIEW_REQUIRED", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      sameEmployer: true,
      sameRole: true,
      // hadPriorRightToWork missing
    });
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.summary).toContain("prior right to work not confirmed");
  });

  it("E4: filed before expiry with all flags missing → REVIEW_REQUIRED with all 3 missing", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
    });
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.summary).toContain("prior right to work not confirmed");
    expect(r.summary).toContain("same employer not confirmed");
    expect(r.summary).toContain("same role not confirmed");
  });
});

// ═══ F. LATE FILING ════════════════════════════════════════════════════════

describe("F. Late filing", () => {
  it("F1: filing after permit expiry → EXPIRED_NOT_PROTECTED", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-30),
      filingDate: daysFromNow(-10), // filed 20 days AFTER expiry
    });
    expect(r.status).toBe("EXPIRED_NOT_PROTECTED");
    expect(r.legalBasis).toBe("NO_LEGAL_BASIS");
    expect(r.riskLevel).toBe("CRITICAL");
    expect(r.warnings.some((w) => w.includes("BEFORE the permit expires"))).toBe(true);
  });

  it("F2: filing 1 day after permit expiry → still EXPIRED_NOT_PROTECTED", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-9), // 1 day late
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
    });
    expect(r.status).toBe("EXPIRED_NOT_PROTECTED");
    expect(r.legalBasis).toBe("NO_LEGAL_BASIS");
  });
});

// ═══ G. FORMAL DEFECT ═══════════════════════════════════════════════════════

describe("G. Formal defect", () => {
  it("G1: formal defect on expired permit → REVIEW_REQUIRED (blocks Art. 108)", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20), // filed before expiry
      formalDefect: true,
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
    });
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.riskLevel).toBe("HIGH");
    expect(r.summary).toContain("formal defect");
    // Must NOT be PROTECTED_PENDING despite full continuity flags
    expect(r.status).not.toBe("PROTECTED_PENDING");
  });

  it("G2: formal defect must block Art. 108 even with perfect continuity", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-5),
      filingDate: daysFromNow(-15),
      formalDefect: true,
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
    });
    expect(r.legalBasis).not.toBe("ART_108");
    expect(r.status).toBe("REVIEW_REQUIRED");
  });

  it("G3: formal defect with no continuity flags → still REVIEW_REQUIRED", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      formalDefect: true,
    });
    expect(r.status).toBe("REVIEW_REQUIRED");
  });

  it("G4: formal defect = false → does not block protection", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      formalDefect: false,
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
    });
    expect(r.status).toBe("PROTECTED_PENDING");
    expect(r.legalBasis).toBe("ART_108");
  });
});

// ═══ H. UKRAINIAN / CUKR PATH ═════════════════════════════════════════════

describe("H. Ukrainian Special Act (CUKR)", () => {
  it("H1: UKR + CUKR + after cutoff → PROTECTED_PENDING + SPECUSTAWA_UKR", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      nationality: "UKR",
      hasCukrApplication: true,
    });
    expect(r.status).toBe("PROTECTED_PENDING");
    expect(r.legalBasis).toBe("SPECUSTAWA_UKR");
    expect(r.riskLevel).toBe("MEDIUM");
  });

  it("H2: UKR nationality (lowercase) + CUKR → still works", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      nationality: "ukr",
      hasCukrApplication: true,
    });
    expect(r.status).toBe("PROTECTED_PENDING");
    expect(r.legalBasis).toBe("SPECUSTAWA_UKR");
  });

  it("H3: UKR but hasCukrApplication = false → falls through to Art. 108 path", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      nationality: "UKR",
      hasCukrApplication: false,
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
    });
    // Should use Art. 108 path, not CUKR
    expect(r.legalBasis).toBe("ART_108");
    expect(r.status).toBe("PROTECTED_PENDING");
  });

  it("H4: non-UKR nationality + hasCukrApplication → does not get CUKR", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      nationality: "PH",
      hasCukrApplication: true,
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
    });
    expect(r.legalBasis).not.toBe("SPECUSTAWA_UKR");
    expect(r.legalBasis).toBe("ART_108"); // falls to Art. 108
  });
});

// ═══ I. FORMAL DEFECT + UKR ═══════════════════════════════════════════════

describe("I. Formal defect + Ukrainian path", () => {
  it("I1: UKR + CUKR + formal defect → REVIEW_REQUIRED (defect blocks CUKR)", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      nationality: "UKR",
      hasCukrApplication: true,
      formalDefect: true,
    });
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.riskLevel).toBe("HIGH");
    // Must NOT be PROTECTED_PENDING
    expect(r.status).not.toBe("PROTECTED_PENDING");
    expect(r.legalBasis).not.toBe("SPECUSTAWA_UKR");
  });

  it("I2: UKR + CUKR + formal defect + full continuity → still REVIEW_REQUIRED", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      nationality: "UKR",
      hasCukrApplication: true,
      formalDefect: true,
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
    });
    expect(r.status).toBe("REVIEW_REQUIRED");
    expect(r.summary).toContain("formal defect");
  });
});

// ═══ J. RISK LEVEL MAPPING ═════════════════════════════════════════════════

describe("J. Risk level mapping", () => {
  it("J1: VALID → LOW", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(90) });
    expect(r.riskLevel).toBe("LOW");
  });

  it("J2: PROTECTED_PENDING → MEDIUM", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
    });
    expect(r.riskLevel).toBe("MEDIUM");
  });

  it("J3: REVIEW_REQUIRED → HIGH", () => {
    const r = evaluate({ permitExpiryDate: null });
    expect(r.riskLevel).toBe("HIGH");
  });

  it("J4: EXPIRED_NOT_PROTECTED → CRITICAL", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(-10), filingDate: null });
    expect(r.riskLevel).toBe("CRITICAL");
  });
});

// ═══ K. LEGAL BASIS MAPPING ════════════════════════════════════════════════

describe("K. Legal basis mapping", () => {
  it("K1: valid permit → PERMIT_VALID", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(90) });
    expect(r.legalBasis).toBe("PERMIT_VALID");
  });

  it("K2: Art. 108 continuity → ART_108", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      hadPriorRightToWork: true,
      sameEmployer: true,
      sameRole: true,
    });
    expect(r.legalBasis).toBe("ART_108");
  });

  it("K3: Ukrainian CUKR → SPECUSTAWA_UKR", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(-10),
      filingDate: daysFromNow(-20),
      nationality: "UKR",
      hasCukrApplication: true,
    });
    expect(r.legalBasis).toBe("SPECUSTAWA_UKR");
  });

  it("K4: missing data → REVIEW_REQUIRED", () => {
    const r = evaluate({ permitExpiryDate: null });
    expect(r.legalBasis).toBe("REVIEW_REQUIRED");
  });

  it("K5: expired no filing → NO_LEGAL_BASIS", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(-10), filingDate: null });
    expect(r.legalBasis).toBe("NO_LEGAL_BASIS");
  });
});

// ═══ L. ADDITIONAL EDGE CASES ══════════════════════════════════════════════

describe("L. Additional edge cases", () => {
  it("L1: permit valid + filing exists + formal defect → still VALID (defect checked only on expired path)", () => {
    const r = evaluate({
      permitExpiryDate: daysFromNow(30),
      filingDate: daysFromNow(-10),
      formalDefect: true,
    });
    // Permit is still valid, so formal defect on the TRC filing
    // does not change the current status — permit itself is valid
    expect(r.status).toBe("VALID");
    expect(r.legalBasis).toBe("PERMIT_VALID");
  });

  it("L2: permit expires today (0 days) → treated as expired (daysUntilExpiry <= 0)", () => {
    const r = evaluate({
      permitExpiryDate: FROZEN_NOW.toISOString().slice(0, 10),
      filingDate: null,
    });
    // daysUntilExpiry = ceil((expiry - now) / day) — when same day, this is 0 or negative
    // Engine checks daysUntilExpiry > 0 for VALID, so 0 = expired path
    expect(r.status).toBe("EXPIRED_NOT_PROTECTED");
  });

  it("L3: permit expires tomorrow (1 day) → VALID", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(1) });
    expect(r.status).toBe("VALID");
  });

  it("L4: all output fields are present and correctly typed", () => {
    const r = evaluate({ permitExpiryDate: daysFromNow(90) });
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("legalBasis");
    expect(r).toHaveProperty("riskLevel");
    expect(r).toHaveProperty("label");
    expect(r).toHaveProperty("summary");
    expect(r).toHaveProperty("conditions");
    expect(r).toHaveProperty("warnings");
    expect(r).toHaveProperty("requiredActions");
    expect(typeof r.status).toBe("string");
    expect(typeof r.summary).toBe("string");
    expect(Array.isArray(r.conditions)).toBe(true);
    expect(Array.isArray(r.warnings)).toBe(true);
    expect(Array.isArray(r.requiredActions)).toBe(true);
  });

  it("L5: labels match expected values for each status", () => {
    expect(evaluate({ permitExpiryDate: daysFromNow(90) }).label).toBe("Valid Work Authorization");
    expect(evaluate({ permitExpiryDate: null }).label).toBe("Manual Review Required");
    expect(evaluate({ permitExpiryDate: daysFromNow(-10), filingDate: null }).label).toBe("Expired — Not Protected");
  });
});
