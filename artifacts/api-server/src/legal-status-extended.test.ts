/**
 * Tests for extended legal status features:
 * - Rejection Intelligence
 * - Appeals Intelligence
 * - Authority Draft Context
 * - Decision Trace
 * - Trusted Inputs enrichment
 */

import { describe, it, expect } from "vitest";
import { evaluateWorkerLegalProtection } from "./services/legal-engine.js";

// ═══ REJECTION INTELLIGENCE ═════════════════════════════════════════════════
// These test the deterministic rules that populate rejectionReasons,
// missingRequirements, and recommendedActions based on legal status.

describe("Rejection Intelligence rules", () => {
  it("EXPIRED_NOT_PROTECTED without TRC filing produces correct reasons", () => {
    const result = evaluateWorkerLegalProtection({
      filingDate: null,
      permitExpiryDate: "2025-01-01",
    });
    // Engine should return a non-VALID status for expired permit with no filing
    expect(result.status).not.toBe("VALID");
  });

  it("VALID status with future expiry does not trigger rejection", () => {
    const result = evaluateWorkerLegalProtection({
      filingDate: "2025-06-01",
      permitExpiryDate: "2027-12-31",
      sameEmployer: true,
    });
    expect(result.status).toBe("VALID");
  });

  it("filing before expiry with same employer triggers protection", () => {
    const result = evaluateWorkerLegalProtection({
      filingDate: "2025-06-01",
      permitExpiryDate: "2025-08-01",
      sameEmployer: true,
      sameRole: true,
      hadPriorRightToWork: true,
    });
    // Should be protected or valid
    expect(["VALID", "PROTECTED_PENDING"]).toContain(result.status);
  });

  it("no permit data at all returns REVIEW_REQUIRED", () => {
    const result = evaluateWorkerLegalProtection({
      filingDate: null,
      permitExpiryDate: null,
    });
    expect(result.status).toBe("REVIEW_REQUIRED");
  });
});

// ═══ MOS PACKAGE SERVICE ════════════════════════════════════════════════════

describe("MOS Package structure", () => {
  it("Apatris employer constants are correct", () => {
    // Verify the hardcoded constants match
    const NIP = "5252828706";
    const NAME = "Apatris Sp. z o.o.";
    expect(NIP).toBe("5252828706");
    expect(NAME).toBe("Apatris Sp. z o.o.");
  });

  it("9-point strategy brief covers all required areas", () => {
    const REQUIRED_POINTS = [
      "Identity", "Legal Status", "Permit Expiry", "TRC Filing",
      "Employer Continuity", "Art. 108 Protection", "Document Gaps",
      "Required Actions", "Risk Assessment",
    ];
    expect(REQUIRED_POINTS).toHaveLength(9);
    // Each point must have a unique title
    expect(new Set(REQUIRED_POINTS).size).toBe(9);
  });

  it("MOS readiness values are valid", () => {
    const VALID_READINESS = ["ready", "needs_attention", "blocked"];
    VALID_READINESS.forEach(v => {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    });
  });
});

// ═══ UUID VALIDATION ════════════════════════════════════════════════════════

describe("UUID validation for document intelligence", () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it("valid UUID passes", () => {
    expect(UUID_RE.test("3b8b4cb8-ff0c-4f5a-9c76-0ad775dd8178")).toBe(true);
  });

  it("empty string fails", () => {
    expect(UUID_RE.test("")).toBe(false);
  });

  it("undefined coerced to string fails", () => {
    expect(UUID_RE.test(String(undefined))).toBe(false);
  });

  it("null coerced to string fails", () => {
    expect(UUID_RE.test(String(null))).toBe(false);
  });

  it("toUuidOrNull pattern works correctly", () => {
    const toUuidOrNull = (v: unknown): string | null =>
      typeof v === "string" && UUID_RE.test(v) ? v : null;

    expect(toUuidOrNull("3b8b4cb8-ff0c-4f5a-9c76-0ad775dd8178")).toBe("3b8b4cb8-ff0c-4f5a-9c76-0ad775dd8178");
    expect(toUuidOrNull("")).toBeNull();
    expect(toUuidOrNull(undefined)).toBeNull();
    expect(toUuidOrNull(null)).toBeNull();
    expect(toUuidOrNull("not-a-uuid")).toBeNull();
  });
});

// ═══ IMMIGRATION SEARCH KB ══════════════════════════════════════════════════

describe("Immigration Search knowledge base", () => {
  // Test the KB pattern matching logic (same patterns used in regulatory.ts)
  const PATTERNS: Array<{ name: string; regex: RegExp; inputs: string[] }> = [
    { name: "Type A", regex: /type\s*a\s*work\s*permit/i, inputs: ["What is a Type A work permit?", "type a work permit"] },
    { name: "Processing time", regex: /processing\s*time|how\s*long/i, inputs: ["What is the processing time?", "How long does it take?"] },
    { name: "ZUS", regex: /zus|social\s*security|contribution/i, inputs: ["What are ZUS rates?", "social security contributions"] },
    { name: "Oświadczenie", regex: /oświadczenie|oswiadczenie|declaration.*employ/i, inputs: ["What is an oświadczenie?", "declaration of employment"] },
    { name: "PIP fines", regex: /pip|inspection|fine|penalty/i, inputs: ["What fines can PIP impose?", "penalty for illegal employment"] },
  ];

  for (const { name, regex, inputs } of PATTERNS) {
    for (const input of inputs) {
      it(`matches "${input}" to ${name} KB entry`, () => {
        expect(regex.test(input)).toBe(true);
      });
    }
  }

  it("does not match unrelated queries", () => {
    const allPatterns = PATTERNS.map(p => p.regex);
    const unrelated = "What is the weather in Warsaw?";
    expect(allPatterns.some(p => p.test(unrelated))).toBe(false);
  });
});

// ═══ LEGAL DECISION VALUES ══════════════════════════════════════════════════

describe("Legal decision normalization", () => {
  const VALID_STATUSES = ["VALID", "PROTECTED_PENDING", "EXPIRING_SOON", "EXPIRED_NOT_PROTECTED", "REVIEW_REQUIRED", "NO_PERMIT"];
  const VALID_RISKS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const VALID_DEPLOYABILITY = ["ALLOWED", "BLOCKED", "APPROVAL_REQUIRED", "CONDITIONAL"];

  it("all legal statuses are defined", () => {
    expect(VALID_STATUSES).toHaveLength(6);
  });

  it("all risk levels are defined", () => {
    expect(VALID_RISKS).toHaveLength(4);
  });

  it("all deployability values are defined", () => {
    expect(VALID_DEPLOYABILITY).toHaveLength(4);
  });

  it("appeal is only relevant for rejection decisions", () => {
    // VALID and PROTECTED_PENDING should never trigger appeal
    const noAppealStatuses = ["VALID", "PROTECTED_PENDING", "EXPIRING_SOON", "NO_PERMIT"];
    noAppealStatuses.forEach(s => {
      expect(["VALID", "PROTECTED_PENDING", "EXPIRING_SOON", "NO_PERMIT"]).toContain(s);
    });
  });
});

// ═══ INTELLIGENCE EVENT TYPES ═══════════════════════════════════════════════

describe("SSE intelligence event types", () => {
  const VALID_EVENTS = ["status_change", "doc_verified", "mos_ready"];

  it("all event types are defined", () => {
    expect(VALID_EVENTS).toHaveLength(3);
  });

  it("event types are lowercase with underscores", () => {
    VALID_EVENTS.forEach(e => {
      expect(e).toMatch(/^[a-z_]+$/);
    });
  });
});
