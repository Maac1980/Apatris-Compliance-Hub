import { describe, it, expect } from "vitest";
import { anonymizeForEmbedding } from "./pii-anonymize.js";
import { sanitizePiiFromAuditText } from "./audit-log.js";

describe("anonymizeForEmbedding", () => {
  it("replaces PESEL (11 digits, word-bounded) with [PESEL]", () => {
    const r = anonymizeForEmbedding("The applicant PESEL 85010112345 was denied.");
    expect(r.anonymized).toBe("The applicant PESEL [PESEL] was denied.");
    expect(r.replacements.PESEL).toBe(1);
  });

  it("replaces Polish IBAN with [IBAN]", () => {
    const r = anonymizeForEmbedding(
      "Deposit to PL61 1090 1014 0000 0712 1981 2874 required within 30 days.",
    );
    expect(r.anonymized).toContain("[IBAN]");
    expect(r.anonymized).not.toMatch(/\bPL61/);
    expect(r.replacements.IBAN).toBe(1);
  });

  it("replaces passport-format codes with [PASSPORT]", () => {
    const r = anonymizeForEmbedding("Passport AB1234567 expired in 2025.");
    expect(r.anonymized).toContain("[PASSPORT]");
    expect(r.anonymized).not.toContain("AB1234567");
    expect(r.replacements.PASSPORT).toBe(1);
  });

  it("replaces Polish names with a Polish diacritic with [WORKER_NAME]", () => {
    const r = anonymizeForEmbedding("Paweł Nowak filed a timely appeal.");
    expect(r.anonymized).toContain("[WORKER_NAME]");
    expect(r.anonymized).not.toContain("Paweł Nowak");
    expect(r.replacements.WORKER_NAME).toBe(1);
  });

  it("replaces honorific + full name (Pan/Pani <name>) with a single [WORKER_NAME]", () => {
    const r = anonymizeForEmbedding("Pan Jan Kowalski submitted the application.");
    expect(r.anonymized).toContain("[WORKER_NAME]");
    expect(r.anonymized).not.toContain("Pan Jan Kowalski");
    expect(r.replacements.WORKER_NAME).toBe(1);
  });

  it("handles a combined case with every PII class at once", () => {
    const input = "Pan Jan Kowalski (PESEL 85010112345, passport AB1234567) wired PL61 1090 1014 0000 0712 1981 2874.";
    const r = anonymizeForEmbedding(input);

    expect(r.anonymized).toContain("[WORKER_NAME]");
    expect(r.anonymized).toContain("[PESEL]");
    expect(r.anonymized).toContain("[PASSPORT]");
    expect(r.anonymized).toContain("[IBAN]");

    expect(r.anonymized).not.toContain("Jan Kowalski");
    expect(r.anonymized).not.toContain("85010112345");
    expect(r.anonymized).not.toContain("AB1234567");
    expect(r.anonymized).not.toMatch(/\bPL61/);

    expect(r.replacements.PESEL).toBe(1);
    expect(r.replacements.IBAN).toBe(1);
    expect(r.replacements.PASSPORT).toBe(1);
    expect(r.replacements.WORKER_NAME).toBe(1);
  });

  // Regression: anonymizeForEmbedding must NOT weaken audit-log's own
  // sanitizer. We verify that audit-log's output on the same input still
  // contains "[encrypted]" for PESEL+IBAN (unchanged contract).
  it("does not regress audit-log.ts::sanitizePiiFromAuditText behavior", () => {
    const input = "Worker with PESEL 85010112345 and PL61 1090 1014 0000 0712 1981 2874.";
    const audited = sanitizePiiFromAuditText(input) ?? "";
    expect(audited).toContain("[encrypted]");
    expect(audited).not.toContain("85010112345");
    expect(audited).not.toMatch(/\bPL61/);
  });

  // ── Known-gap documentation tests ────────────────────────────────────
  // These tests ASSERT the gap (regex miss) so future developers see both
  // the limitation and the intentional acceptance for Phase 1. When any
  // of these flip to "caught", update the test to a positive assertion.

  it("does NOT anonymize diacritic-free Polish names like 'Lukasz Nowak' (known gap, accept for Phase 1)", () => {
    const r = anonymizeForEmbedding("Lukasz Nowak received the rejection notice.");
    // Known gap: no Polish diacritic → regex doesn't fire.
    expect(r.anonymized).toContain("Lukasz Nowak");
    expect(r.replacements.WORKER_NAME).toBe(0);
  });

  it("does NOT anonymize compound names like 'van der Berg' (known gap, accept for Phase 1)", () => {
    const r = anonymizeForEmbedding("The consultant van der Berg filed on behalf.");
    // Known gap: lowercase middle particles break the Capitalized-word pattern.
    expect(r.anonymized).toContain("van der Berg");
    expect(r.replacements.WORKER_NAME).toBe(0);
  });

  it("does NOT anonymize informal patterns like 'Pan Jan' without surname (known gap, accept for Phase 1)", () => {
    const r = anonymizeForEmbedding("Pan Jan arrived without paperwork.");
    // Known gap: honorific regex requires at least 2 capitalized words after
    // the honorific ("Pan Jan Kowalski" is caught, "Pan Jan" alone is not).
    expect(r.anonymized).toContain("Pan Jan");
    expect(r.replacements.WORKER_NAME).toBe(0);
  });
});
