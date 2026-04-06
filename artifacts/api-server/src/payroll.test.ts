import { describe, it, expect } from "vitest";
import { calculatePayroll, calculateNet } from "./lib/payroll.js";
import { calculateNetPay } from "./lib/country-compliance.js";

// ═══════════════════════════════════════════════════════════════════════════
// Polish Payroll Calculations — Umowa Zlecenie (2026)
// ═══════════════════════════════════════════════════════════════════════════
describe("Payroll — Umowa Zlecenie (calculatePayroll)", () => {
  it("calculates net for 168 hours at default rate", () => {
    const r = calculatePayroll(168, true);
    expect(r.gross).toBeGreaterThan(0);
    expect(r.net).toBeLessThan(r.gross);
    expect(r.net).toBeGreaterThan(0);
  });

  it("gross equals hourly_rate * hours", () => {
    const r = calculatePayroll(100, true);
    expect(r.gross).toBe(3140); // 100 * 31.40
  });

  it("net for 8000 PLN gross is within reasonable range", () => {
    const r = calculatePayroll(8000, false);
    expect(r.gross).toBe(8000);
    // Net should be ~60-75% of gross for Umowa Zlecenie
    expect(r.net).toBeGreaterThan(8000 * 0.55);
    expect(r.net).toBeLessThan(8000 * 0.80);
  });

  it("ZUS employee contribution is ~11.26% (pension 9.76% + disability 1.5%)", () => {
    const r = calculatePayroll(10000, false);
    const social = r.details.social;
    // Without sickness: 9.76% + 1.5% = 11.26%
    expect(social).toBeCloseTo(10000 * 0.1126, 0);
  });

  it("sickness contribution is optional (2.45%)", () => {
    const without = calculatePayroll(10000, false, { includeSickness: false });
    const withSick = calculatePayroll(10000, false, { includeSickness: true });
    expect(withSick.details.social).toBeGreaterThan(without.details.social);
    const diff = withSick.details.social - without.details.social;
    expect(diff).toBeCloseTo(10000 * 0.0245, 0);
  });

  it("PIT-2 reduces tax by 300 PLN", () => {
    const withPit2 = calculatePayroll(8000, false, { applyPit2: true });
    const withoutPit2 = calculatePayroll(8000, false, { applyPit2: false });
    expect(withPit2.net).toBeGreaterThan(withoutPit2.net);
    // Difference should be up to 300 PLN
    const diff = withPit2.net - withoutPit2.net;
    expect(diff).toBeLessThanOrEqual(300);
    expect(diff).toBeGreaterThan(0);
  });

  it("KUP is 20% of health base (floored to full PLN)", () => {
    const r = calculatePayroll(10000, false);
    const healthBase = 10000 - r.details.social;
    expect(r.details.kup).toBe(Math.floor(healthBase * 0.20));
  });

  it("employer ZUS is ~18.81%", () => {
    const r = calculatePayroll(10000, false);
    expect(r.employerZus).toBeCloseTo(10000 * 0.1881, 0);
  });

  it("total employer cost is gross + employer ZUS", () => {
    const r = calculatePayroll(10000, false);
    expect(r.totalEmployerCost).toBe(r.gross + r.employerZus);
  });

  it("net is never negative for any positive gross", () => {
    for (const gross of [100, 500, 1000, 3000, 5000, 10000, 20000, 50000]) {
      const r = calculatePayroll(gross, false);
      expect(r.net).toBeGreaterThan(0);
    }
  });

  it("handles zero input", () => {
    const r = calculatePayroll(0, false);
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateNet convenience function
// ═══════════════════════════════════════════════════════════════════════════
describe("Payroll — calculateNet", () => {
  it("returns correct structure", () => {
    const r = calculateNet(8000);
    expect(r).toHaveProperty("gross", 8000);
    expect(r).toHaveProperty("net");
    expect(r).toHaveProperty("details");
    expect(r.details).toHaveProperty("social");
    expect(r.details).toHaveProperty("health");
    expect(r.details).toHaveProperty("pit");
  });

  it("net matches calculatePayroll", () => {
    const direct = calculateNet(8000);
    const full = calculatePayroll(8000, false);
    expect(direct.net).toBe(full.net);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Multi-Country Payroll (PL, CZ, RO)
// ═══════════════════════════════════════════════════════════════════════════
describe("Payroll — Multi-Country (calculateNetPay)", () => {
  describe("Poland", () => {
    it("8000 PLN gross produces reasonable net", () => {
      const r = calculateNetPay("PL", 8000);
      expect(r.country).toBe("PL");
      expect(r.currency).toBe("PLN");
      expect(r.netMonthly).toBeGreaterThan(4500);
      expect(r.netMonthly).toBeLessThan(7000);
    });

    it("employer cost exceeds gross", () => {
      const r = calculateNetPay("PL", 8000);
      expect(r.totalEmployerCost).toBeGreaterThan(8000);
    });

    it("flags below minimum wage", () => {
      const r = calculateNetPay("PL", 2000);
      expect(r.meetsMinimumWage).toBe(false);
    });
  });

  describe("Czech Republic", () => {
    it("40000 CZK gross produces reasonable net", () => {
      const r = calculateNetPay("CZ", 40000);
      expect(r.country).toBe("CZ");
      expect(r.currency).toBe("CZK");
      expect(r.netMonthly).toBeGreaterThan(25000);
      expect(r.netMonthly).toBeLessThan(38000);
    });

    it("employee SS is 7.1%", () => {
      const r = calculateNetPay("CZ", 40000);
      expect(r.socialSecurity.employee).toBeCloseTo(40000 * 0.071, 0);
    });
  });

  describe("Romania", () => {
    it("5000 RON gross produces reasonable net", () => {
      const r = calculateNetPay("RO", 5000);
      expect(r.country).toBe("RO");
      expect(r.currency).toBe("RON");
      // RO: 25% CAS + 10% CASS + 10% tax = ~55% deduction → net ~45% of gross
      expect(r.netMonthly).toBeGreaterThan(2000);
      expect(r.netMonthly).toBeLessThan(4000);
    });

    it("pension (CAS) is 25%", () => {
      const r = calculateNetPay("RO", 5000);
      expect(r.socialSecurity.employee).toBeCloseTo(5000 * 0.25, 0);
    });
  });

  describe("Edge cases", () => {
    it("throws for unsupported country", () => {
      expect(() => calculateNetPay("XX", 5000)).toThrow("Unsupported country");
    });

    it("all countries produce positive net for positive gross", () => {
      for (const code of ["PL", "CZ", "RO"]) {
        const r = calculateNetPay(code, 10000);
        expect(r.netMonthly).toBeGreaterThan(0);
      }
    });
  });
});
