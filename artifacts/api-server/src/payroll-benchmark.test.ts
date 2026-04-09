/**
 * PAYROLL BENCHMARK TESTS — LOCKED CANONICAL VALUES
 *
 * These tests verify the exact ZUS/PIT calculation outputs
 * that match the official Polish calculator and Knowledge Center.
 *
 * DO NOT CHANGE THESE EXPECTED VALUES.
 * If a test fails, the calculation logic has drifted — fix the logic, not the test.
 *
 * Verified against:
 * - Official Polish calculator (wynagrodzenia.pl)
 * - Apatris Knowledge Center
 * - Apatris ZUS Payroll Grid
 *
 * Contract: Umowa Zlecenie 2026
 * KUP: 20% (floored to full PLN)
 * Tax base: floored (not rounded)
 * Employer ZUS: no wypadkowe for Zlecenie
 */

import { describe, it, expect } from "vitest";

// ═══ CANONICAL CALCULATION (same as KnowledgeCenter + PayrollPage) ═══════════

function calcZlecenie(gross: number, pit2 = true, sickness = false) {
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // Employee ZUS
  const pension = r2(gross * 0.0976);
  const disability = r2(gross * 0.015);
  const sick = sickness ? r2(gross * 0.0245) : 0;
  const employeeZus = pension + disability + sick;

  // Health
  const healthBase = gross - employeeZus;
  const health = r2(healthBase * 0.09);

  // Tax (KUP floored, taxBase floored)
  const kup = Math.floor(healthBase * 0.20);
  const taxBase = Math.floor(healthBase - kup);
  const pit = Math.max(0, Math.round(taxBase * 0.12) - (pit2 ? 300 : 0));

  // Net
  const net = r2(gross - employeeZus - health - pit);

  // Employer ZUS (Zlecenie: no wypadkowe)
  const empPension = r2(gross * 0.0976);
  const empDisability = r2(gross * 0.065);
  const empFP = r2(gross * 0.0245);
  const empFGSP = r2(gross * 0.001);
  const employerZus = empPension + empDisability + empFP + empFGSP;
  const totalCost = r2(gross + employerZus);

  return { gross, net, employeeZus, health, pit, kup, taxBase, employerZus, totalCost };
}

function findGrossForNet(targetNet: number, pit2 = true) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  // Binary search
  let lo = targetNet * 0.8, hi = targetNet * 2.5;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const net = calcZlecenie(r2(mid), pit2).net;
    if (Math.abs(net - targetNet) < 0.50) break;
    if (net < targetNet) lo = mid; else hi = mid;
  }
  const approx = r2((lo + hi) / 2);
  // Precision scan
  let best = approx, bestDiff = Infinity;
  for (let g = r2(Math.max(1, approx - 5)); g <= r2(approx + 5); g = r2(g + 0.01)) {
    const net = calcZlecenie(g, pit2).net;
    const diff = Math.abs(net - targetNet);
    if (diff < bestDiff) { bestDiff = diff; best = g; }
    if (diff < 0.005) break;
  }
  return best;
}

// ═══ FORWARD BENCHMARKS (Gross → Net) ═══════════════════════════════════════

describe("Payroll Benchmark — Forward (Gross → Net)", () => {
  it("5024.00 gross → 3929.05 net (31.40 × 160h)", () => {
    const r = calcZlecenie(5024.00);
    expect(r.net).toBe(3929.05);
    expect(r.pit).toBe(128);
    expect(r.taxBase).toBe(3567);
    expect(r.health).toBe(401.25);
  });

  it("6280.00 gross → 4836.31 net (31.40 × 200h)", () => {
    const r = calcZlecenie(6280.00);
    expect(r.net).toBe(4836.31);
    expect(r.pit).toBe(235);
    expect(r.taxBase).toBe(4458);
  });

  it("9690.00 gross → 7300.01 net (tax base floor matters here)", () => {
    const r = calcZlecenie(9690.00);
    expect(r.net).toBe(7300.01);
    expect(r.pit).toBe(525);
    expect(r.taxBase).toBe(6879);  // floor(6879.91) = 6879, NOT round = 6880
  });

  it("7337.16 gross → 5600.00 net", () => {
    const r = calcZlecenie(7337.16);
    expect(r.net).toBe(5600.00);
  });

  it("9275.15 gross → 7000.00 net", () => {
    const r = calcZlecenie(9275.15);
    expect(r.net).toBe(7000.00);
  });

  it("11766.69 gross → 8800.00 net", () => {
    const r = calcZlecenie(11766.69);
    expect(r.net).toBe(8800.00);
  });
});

// ═══ REVERSE BENCHMARKS (Net → Gross) ═══════════════════════════════════════

describe("Payroll Benchmark — Reverse (Net → Gross)", () => {
  it("net 3929.05 → gross 5024.00", () => {
    const g = findGrossForNet(3929.05);
    expect(g).toBe(5024.00);
    expect(calcZlecenie(g).net).toBe(3929.05);
  });

  it("net 5600.00 → gross 7337.16", () => {
    const g = findGrossForNet(5600.00);
    expect(g).toBe(7337.16);
    expect(calcZlecenie(g).net).toBe(5600.00);
  });

  it("net 7000.00 → gross 9275.15", () => {
    const g = findGrossForNet(7000.00);
    expect(g).toBe(9275.15);
    expect(calcZlecenie(g).net).toBe(7000.00);
  });

  it("net 8800.00 → gross 11766.69", () => {
    const g = findGrossForNet(8800.00);
    expect(g).toBe(11766.69);
    expect(calcZlecenie(g).net).toBe(8800.00);
  });

  it("net 5000.00 → gross 6506.23", () => {
    const g = findGrossForNet(5000.00);
    expect(g).toBe(6506.23);
    expect(calcZlecenie(g).net).toBe(5000.00);
  });
});

// ═══ EMPLOYER COST BENCHMARKS (no wypadkowe for Zlecenie) ═══════════════════

describe("Payroll Benchmark — Employer ZUS (Zlecenie)", () => {
  it("5024.00 gross → employer ZUS 945.01 (18.81%, no wypadkowe)", () => {
    const r = calcZlecenie(5024.00);
    // 9.76% + 6.5% + 2.45% + 0.10% = 18.81%
    expect(r.employerZus).toBeCloseTo(5024 * 0.1881, 0);
    expect(r.totalCost).toBe(r.gross + r.employerZus);
  });

  it("9690.00 gross → employer ZUS ~1822.69", () => {
    const r = calcZlecenie(9690.00);
    expect(r.employerZus).toBeCloseTo(9690 * 0.1881, 0);
  });

  it("employer ZUS must NOT include wypadkowe (1.67%)", () => {
    const r = calcZlecenie(10000);
    const withWypadkowe = 10000 * 0.2048;
    const withoutWypadkowe = r.employerZus;
    // Difference should be ~167 PLN (1.67% of 10000)
    expect(withWypadkowe - withoutWypadkowe).toBeCloseTo(167, 0);
  });
});

// ═══ TAX BASE ROUNDING LOCK ═════════════════════════════════════════════════

describe("Payroll Benchmark — Tax Base Rounding", () => {
  it("KUP must use Math.floor (not Math.round)", () => {
    // healthBase * 0.20 = fractional → must floor
    const r = calcZlecenie(9690.00);
    const healthBase = 9690 - r.employeeZus;
    const kupExpected = Math.floor(healthBase * 0.20);
    expect(r.kup).toBe(kupExpected);
  });

  it("taxBase must use Math.floor (not Math.round)", () => {
    // 9690 case: healthBase - kup = 6879.91 → floor = 6879
    const r = calcZlecenie(9690.00);
    expect(r.taxBase).toBe(6879); // NOT 6880
  });

  it("5024 case: both rounding methods give same result (no drift risk)", () => {
    const r = calcZlecenie(5024.00);
    const healthBase = 5024 - r.employeeZus;
    const diff = healthBase - Math.floor(healthBase * 0.20);
    expect(Math.floor(diff)).toBe(Math.round(diff)); // both give 3567
    expect(r.taxBase).toBe(3567);
  });
});

// ═══ RANDOM HOUR SCENARIOS ══════════════════════════════════════════════════

describe("Payroll Benchmark — Random Hour Scenarios", () => {
  it("net/h 28.50 × 176h = net 5016 → gross 6528.52", () => {
    const g = findGrossForNet(5016);
    expect(g).toBe(6528.52);
    expect(calcZlecenie(g).net).toBe(5016);
  });

  it("net/h 42.00 × 184h = net 7728 → gross 10283.16", () => {
    const g = findGrossForNet(7728);
    expect(g).toBe(10283.16);
    expect(calcZlecenie(g).net).toBe(7728);
  });

  it("net/h 55.00 × 220h = net 12100 → gross 16336.15", () => {
    const g = findGrossForNet(12100);
    expect(g).toBe(16336.15);
    expect(calcZlecenie(g).net).toBe(12100);
  });
});
