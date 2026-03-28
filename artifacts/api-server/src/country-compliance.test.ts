import { describe, it, expect } from "vitest";
import { calculateNetPay, getCountryConfig, checkDocumentCompliance, listCountries, getSupportedCountryCodes } from "./lib/country-compliance.js";

describe("Country Compliance Engine", () => {
  describe("listCountries", () => {
    it("returns PL, CZ, RO", () => {
      const codes = getSupportedCountryCodes();
      expect(codes).toContain("PL");
      expect(codes).toContain("CZ");
      expect(codes).toContain("RO");
      expect(codes.length).toBe(3);
    });
  });

  describe("getCountryConfig", () => {
    it("returns config for PL", () => {
      const config = getCountryConfig("PL");
      expect(config).toBeTruthy();
      expect(config!.currency).toBe("PLN");
      expect(config!.minimumWageMonthly).toBeGreaterThan(0);
    });

    it("returns null for unsupported country", () => {
      expect(getCountryConfig("XX")).toBeNull();
    });

    it("is case-insensitive", () => {
      expect(getCountryConfig("pl")).toBeTruthy();
      expect(getCountryConfig("cz")).toBeTruthy();
    });
  });

  describe("calculateNetPay - Poland", () => {
    it("calculates correct net for 8000 PLN gross", () => {
      const result = calculateNetPay("PL", 8000);
      expect(result.country).toBe("PL");
      expect(result.currency).toBe("PLN");
      expect(result.grossMonthly).toBe(8000);
      expect(result.socialSecurity.employee).toBeCloseTo(8000 * 0.1126, 0);
      expect(result.netMonthly).toBeLessThan(8000);
      expect(result.netMonthly).toBeGreaterThan(4000);
      expect(result.totalEmployerCost).toBeGreaterThan(8000);
    });

    it("flags below minimum wage", () => {
      const result = calculateNetPay("PL", 2000);
      expect(result.meetsMinimumWage).toBe(false);
    });

    it("passes minimum wage check for adequate salary", () => {
      const result = calculateNetPay("PL", 5000);
      expect(result.meetsMinimumWage).toBe(true);
    });
  });

  describe("calculateNetPay - Czech Republic", () => {
    it("calculates for CZ", () => {
      const result = calculateNetPay("CZ", 40000);
      expect(result.country).toBe("CZ");
      expect(result.currency).toBe("CZK");
      expect(result.socialSecurity.employee).toBeCloseTo(40000 * 0.071, 0);
      expect(result.netMonthly).toBeGreaterThan(0);
    });
  });

  describe("calculateNetPay - Romania", () => {
    it("calculates for RO", () => {
      const result = calculateNetPay("RO", 5000);
      expect(result.country).toBe("RO");
      expect(result.currency).toBe("RON");
      expect(result.socialSecurity.employee).toBeCloseTo(5000 * 0.25, 0);
      expect(result.netMonthly).toBeGreaterThan(0);
    });
  });

  describe("checkDocumentCompliance", () => {
    it("returns 100% when all docs present for PL", () => {
      const config = getCountryConfig("PL")!;
      const result = checkDocumentCompliance("PL", config.requiredDocuments);
      expect(result.isCompliant).toBe(true);
      expect(result.complianceRate).toBe(100);
      expect(result.missingDocuments).toHaveLength(0);
    });

    it("identifies missing documents", () => {
      const result = checkDocumentCompliance("PL", ["Passport"]);
      expect(result.isCompliant).toBe(false);
      expect(result.missingDocuments.length).toBeGreaterThan(0);
      expect(result.complianceRate).toBeLessThan(100);
    });

    it("throws for unsupported country", () => {
      expect(() => checkDocumentCompliance("XX", [])).toThrow("Unsupported country");
    });
  });
});
