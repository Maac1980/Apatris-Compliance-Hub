import { describe, it, expect } from "vitest";
import {
  computeTypeScopedConfidence,
  REQUIRED_FIELDS_BY_TYPE,
  bucketConfidence,
  toLegacyClassification,
  type TypedIntakeExtraction,
} from "./document-schemas.js";

const EMPTY_COMMON = {
  fullName: null, pesel: null, dateOfBirth: null, nationality: null,
  authority: null, documentDate: null, language: null,
} as const;

function baseExtraction(): TypedIntakeExtraction {
  return {
    classification: "OTHER",
    commonFields: { ...EMPTY_COMMON },
    workPermit: null, trcDecision: null, trcRejection: null, filingProof: null, passport: null,
    perFieldConfidence: {},
    overallConfidence: 0,
    keyContent: "",
  };
}

// ── B2 per-type scoring tests ────────────────────────────────────────────

describe("computeTypeScopedConfidence (Sub-phase B2)", () => {
  it("TRC_REJECTION with all 5 required fields + high per-field confidence scores ≥0.95", () => {
    const typed: TypedIntakeExtraction = {
      ...baseExtraction(),
      classification: "TRC_REJECTION",
      commonFields: { ...EMPTY_COMMON, fullName: "Monica ASTHANA", authority: "Wojewoda Mazowiecki" },
      trcRejection: {
        caseReference: "WSC-II-S.6151.77212.2025",
        decisionDate: "2026-02-20",
        voivodeship: "mazowieckie",
        rejectionGrounds: "Employer did not sign Annex 1 digitally.",
        citedArticles: ["Art. 108"],
        appealDeadlineDays: 14,
      },
      perFieldConfidence: {
        "commonFields.fullName": 0.98,
        "commonFields.authority": 0.95,
        "trcRejection.caseReference": 0.99,
        "trcRejection.decisionDate": 0.97,
        "trcRejection.rejectionGrounds": 0.91,
      },
      overallConfidence: 0.96,
    };
    const score = computeTypeScopedConfidence(typed);
    expect(score).toBeGreaterThanOrEqual(0.95);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("TRC_REJECTION with only 3/5 required fields filled scores ~0.5–0.65 (partial)", () => {
    const typed: TypedIntakeExtraction = {
      ...baseExtraction(),
      classification: "TRC_REJECTION",
      commonFields: { ...EMPTY_COMMON, fullName: "Monica ASTHANA", authority: null },
      trcRejection: {
        caseReference: "WSC-II-S.6151.77212.2025",
        decisionDate: null,
        voivodeship: null,
        rejectionGrounds: "Employer did not sign Annex 1 digitally.",
        citedArticles: [],
        appealDeadlineDays: null,
      },
      perFieldConfidence: {
        "commonFields.fullName": 0.9,
        "trcRejection.caseReference": 0.95,
        "trcRejection.rejectionGrounds": 0.85,
      },
      overallConfidence: 0.85,
    };
    const score = computeTypeScopedConfidence(typed);
    // 3 present (0.9 + 0.95 + 0.85) + 2 missing (0 + 0) = 2.7 / 5 = 0.54
    expect(score).toBeCloseTo(0.54, 2);
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThan(0.65);
  });

  it("WORK_PERMIT with all 5 required fields + high confidence scores ≥0.95", () => {
    const typed: TypedIntakeExtraction = {
      ...baseExtraction(),
      classification: "WORK_PERMIT",
      commonFields: { ...EMPTY_COMMON, fullName: "Mithilesh KUMAR" },
      workPermit: {
        permitType: "Typ A", employerName: "Apatris Sp. z o.o.", employerNip: "5252828706",
        role: "Spawacz TIG", voivodeship: "mazowieckie",
        validFrom: "2026-01-01", validUntil: "2028-12-31", workHoursPerWeek: 40,
      },
      perFieldConfidence: {
        "commonFields.fullName": 0.98,
        "workPermit.employerName": 0.96,
        "workPermit.role": 0.94,
        "workPermit.voivodeship": 0.97,
        "workPermit.validUntil": 0.98,
      },
      overallConfidence: 0.95,
    };
    const score = computeTypeScopedConfidence(typed);
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it("PASSPORT with all 5 required fields + high confidence scores ≥0.95", () => {
    const typed: TypedIntakeExtraction = {
      ...baseExtraction(),
      classification: "PASSPORT",
      commonFields: {
        ...EMPTY_COMMON, fullName: "Ivan PETROV",
        dateOfBirth: "1990-05-15", nationality: "Ukraine",
      },
      passport: {
        passportNumber: "FH1234567", issueDate: "2022-06-01",
        expiryDate: "2032-05-31", issuingCountry: "Ukraine",
      },
      perFieldConfidence: {
        "commonFields.fullName": 0.99,
        "commonFields.dateOfBirth": 0.98,
        "passport.passportNumber": 0.99,
        "passport.expiryDate": 0.99,
        "passport.issuingCountry": 0.97,
      },
      overallConfidence: 0.98,
    };
    const score = computeTypeScopedConfidence(typed);
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it("OTHER classification falls back to overallConfidence (legacy behavior)", () => {
    const typed: TypedIntakeExtraction = {
      ...baseExtraction(),
      classification: "OTHER",
      commonFields: { ...EMPTY_COMMON, fullName: "Some Name" },
      overallConfidence: 0.42,
    };
    expect(computeTypeScopedConfidence(typed)).toBe(0.42);
  });

  it("Missing perFieldConfidence entry for a present field → default 0.8 contribution", () => {
    // Same fixture as the B1 Monica test: 5 fields filled, only 1 confidence scored.
    // Old behavior: would have scored based on overallConfidence bucket.
    // New typed-scope: (4 × 0.8) + (1 × 0.91) = 3.2 + 0.91 = 4.11 / 5 = 0.822.
    const typed: TypedIntakeExtraction = {
      ...baseExtraction(),
      classification: "TRC_REJECTION",
      commonFields: { ...EMPTY_COMMON, fullName: "Monica ASTHANA", authority: "Wojewoda Mazowiecki" },
      trcRejection: {
        caseReference: "WSC-II-S.6151.77212.2025",
        decisionDate: "2026-02-20",
        voivodeship: "mazowieckie",
        rejectionGrounds: "Employer did not sign Annex 1 digitally.",
        citedArticles: ["Art. 108"],
        appealDeadlineDays: 14,
      },
      perFieldConfidence: { "trcRejection.rejectionGrounds": 0.91 },
      overallConfidence: 0.87,
    };
    expect(computeTypeScopedConfidence(typed)).toBeCloseTo(0.822, 2);
  });

  it("All required fields missing → score is 0 (honest low signal)", () => {
    const typed: TypedIntakeExtraction = {
      ...baseExtraction(),
      classification: "WORK_PERMIT",
      workPermit: {
        permitType: null, employerName: null, employerNip: null, role: null, voivodeship: null,
        validFrom: null, validUntil: null, workHoursPerWeek: null,
      },
      overallConfidence: 0.3,
    };
    expect(computeTypeScopedConfidence(typed)).toBe(0);
  });

  it("Empty string and empty array count as missing", () => {
    const typed: TypedIntakeExtraction = {
      ...baseExtraction(),
      classification: "TRC_REJECTION",
      commonFields: { ...EMPTY_COMMON, fullName: "   ", authority: "Wojewoda" },
      trcRejection: {
        caseReference: "WSC-1", decisionDate: "2026-01-01",
        voivodeship: "mazowieckie", rejectionGrounds: "", citedArticles: [], appealDeadlineDays: null,
      },
      perFieldConfidence: {
        "commonFields.authority": 0.9,
        "trcRejection.caseReference": 0.9,
        "trcRejection.decisionDate": 0.9,
      },
      overallConfidence: 0.7,
    };
    // fullName "   " and rejectionGrounds "" treated as missing.
    // Present: authority, caseReference, decisionDate — 3 × 0.9 = 2.7 / 5 = 0.54
    expect(computeTypeScopedConfidence(typed)).toBeCloseTo(0.54, 2);
  });
});

// ── Sanity checks on supporting constants

describe("REQUIRED_FIELDS_BY_TYPE integrity", () => {
  it("has 5 required fields for WORK_PERMIT, TRC_POSITIVE, TRC_REJECTION, PASSPORT", () => {
    expect(REQUIRED_FIELDS_BY_TYPE.WORK_PERMIT).toHaveLength(5);
    expect(REQUIRED_FIELDS_BY_TYPE.TRC_POSITIVE).toHaveLength(5);
    expect(REQUIRED_FIELDS_BY_TYPE.TRC_REJECTION).toHaveLength(5);
    expect(REQUIRED_FIELDS_BY_TYPE.PASSPORT).toHaveLength(5);
  });
  it("has 4 required fields for FILING_PROOF and 0 for OTHER", () => {
    expect(REQUIRED_FIELDS_BY_TYPE.FILING_PROOF).toHaveLength(4);
    expect(REQUIRED_FIELDS_BY_TYPE.OTHER).toHaveLength(0);
  });
  it("all required-field paths use typed-path form (group.key)", () => {
    for (const paths of Object.values(REQUIRED_FIELDS_BY_TYPE)) {
      for (const p of paths) {
        expect(p).toMatch(/^[a-zA-Z]+\.[a-zA-Z]+$/);
      }
    }
  });
});

describe("legacy helpers unchanged by B2", () => {
  it("bucketConfidence thresholds: 0.8 HIGH, 0.5 MEDIUM, <0.5 LOW", () => {
    expect(bucketConfidence(0.9)).toBe("HIGH");
    expect(bucketConfidence(0.8)).toBe("HIGH");
    expect(bucketConfidence(0.79)).toBe("MEDIUM");
    expect(bucketConfidence(0.5)).toBe("MEDIUM");
    expect(bucketConfidence(0.49)).toBe("LOW");
  });
  it("toLegacyClassification maps all 6 enum values to the 14-type legacy set", () => {
    expect(toLegacyClassification("WORK_PERMIT")).toBe("WORK_PERMIT");
    expect(toLegacyClassification("TRC_POSITIVE")).toBe("DECISION_LETTER");
    expect(toLegacyClassification("TRC_REJECTION")).toBe("REJECTION_LETTER");
    expect(toLegacyClassification("FILING_PROOF")).toBe("FILING_PROOF");
    expect(toLegacyClassification("PASSPORT")).toBe("PASSPORT");
    expect(toLegacyClassification("OTHER")).toBe("UNKNOWN");
  });
});
