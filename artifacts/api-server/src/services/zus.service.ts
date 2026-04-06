/**
 * ZUS Service — Single source of truth for Polish social security calculations.
 *
 * All ZUS/PIT rate constants and calculation functions live here.
 * No other file should define its own rates — import from this service.
 */

// ═══ CANONICAL RATES (2026) ═════════════════════════════════════════════════
export const ZUS_RATES = {
  // Employee contributions
  pension:    0.0976,   // Emerytalna
  disability: 0.015,    // Rentowa
  sickness:   0.0245,   // Chorobowa (optional for Zlecenie)
  health:     0.09,     // Zdrowotna (base = gross - social)

  // Employer contributions
  employerPension:    0.0976,
  employerDisability: 0.065,
  employerAccident:   0.0167,  // Average rate
  employerFP:         0.0245,  // Fundusz Pracy
  employerFGSP:       0.001,   // FGŚP
  employerTotal:      0.1881,  // Sum of employer contributions

  // PIT
  pit12Rate:    0.12,
  pit32Rate:    0.32,
  pit32Threshold: 120_000,  // Annual
  kupRate:      0.20,       // Koszty uzyskania przychodu
  pit2Allowance: 300,       // Monthly PIT-2 relief (PLN)

  // Minimum wage
  minimumWageMonthly: 4666,  // PLN
  minimumWageHourly:  30.50, // PLN
} as const;

// ═══ CALCULATION TYPES ══════════════════════════════════════════════════════
export interface ZUSBreakdown {
  gross: number;
  pension: number;
  disability: number;
  sickness: number;
  totalEmployeeSocial: number;
  healthBase: number;
  health: number;
  kup: number;
  taxBase: number;
  pit: number;
  net: number;
  employerZus: number;
  totalEmployerCost: number;
}

export interface ZUSOptions {
  includeSickness?: boolean;  // Default false for Zlecenie, true for Umowa o Pracę
  applyPit2?: boolean;        // Default true (monthly 300 PLN relief)
}

// ═══ CORE CALCULATION ═══════════════════════════════════════════════════════

/**
 * Calculate full Polish ZUS/PIT breakdown from gross salary.
 * This is the SINGLE function that all payroll code should use.
 */
export function calculateFromGross(gross: number, options: ZUSOptions = {}): ZUSBreakdown {
  const R = ZUS_RATES;
  const includeSickness = options.includeSickness ?? false;
  const applyPit2 = options.applyPit2 ?? true;

  const pension    = round(gross * R.pension);
  const disability = round(gross * R.disability);
  const sickness   = includeSickness ? round(gross * R.sickness) : 0;
  const totalEmployeeSocial = pension + disability + sickness;

  const healthBase = round(gross - totalEmployeeSocial);
  const health     = round(healthBase * R.health);

  const kup      = Math.floor(healthBase * R.kupRate);  // KUP floored to full PLN per Polish tax practice
  const taxBase  = Math.round(healthBase - kup);
  const basePit  = Math.round(taxBase * R.pit12Rate);
  const pit      = Math.max(0, basePit - (applyPit2 ? R.pit2Allowance : 0));

  const net = round(gross - totalEmployeeSocial - health - pit);
  const employerZus = round(gross * R.employerTotal);
  const totalEmployerCost = round(gross + employerZus);

  return {
    gross, pension, disability, sickness, totalEmployeeSocial,
    healthBase, health, kup, taxBase, pit, net,
    employerZus, totalEmployerCost,
  };
}

/**
 * Calculate netto from brutto — simple wrapper.
 */
export function calculateNettoFromBrutto(gross: number, options?: ZUSOptions): number {
  return calculateFromGross(gross, options).net;
}

/**
 * Calculate brutto from target netto — exact reverse solver.
 *
 * Uses two-phase approach to handle PIT rounding discontinuities:
 * Phase A: Binary search to find approximate brutto
 * Phase B: Precision scan ±2 PLN at 0.01 step to find exact match
 *
 * ALWAYS calls the forward engine — never invents its own formula.
 */
export function calculateBruttoFromNetto(targetNet: number, options?: ZUSOptions): number {
  // Phase A — Binary search for approximate brutto
  let lo = targetNet;
  let hi = targetNet * 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const net = calculateFromGross(mid, options).net;
    if (Math.abs(net - targetNet) < 0.50) break;
    if (net < targetNet) lo = mid;
    else hi = mid;
  }
  const approx = round((lo + hi) / 2);

  // Phase B — Precision scan ±3 PLN at 0.01 step
  // PIT rounding creates discontinuities — multiple brutto values can produce the same netto.
  // Collect all exact matches, then pick the one closest to the binary search approximation.
  const exactMatches: number[] = [];
  let bestBrutto = approx;
  let bestDiff = Infinity;

  const scanLo = round(approx - 3);
  const scanHi = round(approx + 3);

  for (let brutto = scanLo; brutto <= scanHi; brutto = round(brutto + 0.01)) {
    const net = calculateFromGross(brutto, options).net;
    const diff = Math.abs(net - targetNet);

    if (diff < 0.005) exactMatches.push(brutto);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestBrutto = brutto;
    }
  }

  // If exact matches found, pick closest to binary search result.
  // On tie (within 0.01), prefer higher brutto (conservative — matches Polish payroll calculators).
  if (exactMatches.length > 0) {
    let closest = exactMatches[0];
    let closestDist = Math.abs(closest - approx);
    for (const m of exactMatches) {
      const dist = Math.abs(m - approx);
      if (dist < closestDist - 0.01) { closest = m; closestDist = dist; }
      else if (Math.abs(dist - closestDist) < 0.02 && m > closest) { closest = m; closestDist = dist; }
    }
    return closest;
  }

  return bestBrutto;
}

/**
 * Full reverse solver with detailed output.
 *
 * Input: hours + target netto per hour
 * Output: brutto total/hourly, netto total/hourly, difference
 */
export interface ReverseSolverResult {
  bruttoTotal: number;
  bruttoHour: number;
  nettoTotal: number;
  nettoHour: number;
  difference: number;
  hours: number;
  exact: boolean;
}

export function solveReverse(hours: number, targetNetHour: number, options?: ZUSOptions): ReverseSolverResult {
  const targetNetTotal = round(hours * targetNetHour);
  const bruttoTotal = calculateBruttoFromNetto(targetNetTotal, options);
  const result = calculateFromGross(bruttoTotal, options);
  const difference = round(result.net - targetNetTotal);

  return {
    bruttoTotal,
    bruttoHour: round(bruttoTotal / hours),
    nettoTotal: result.net,
    nettoHour: round(result.net / hours),
    difference,
    hours,
    exact: Math.abs(difference) < 0.01,
  };
}

/**
 * Calculate ZUS for a worker with hourly rate × hours.
 */
export function calculateWorkerPayroll(hourlyRate: number, hours: number, options?: ZUSOptions): ZUSBreakdown {
  const gross = round(hourlyRate * hours);
  return calculateFromGross(gross, options);
}

// ═══ DRA FILING ═════════════════════════════════════════════════════════════

export interface DRAWorker {
  name: string;
  pesel: string;
  gross: number;
  breakdown: ZUSBreakdown;
}

export function generateDraXml(month: string, workers: DRAWorker[]): string {
  const totalGross = workers.reduce((s, w) => s + w.gross, 0);
  const totalPension = workers.reduce((s, w) => s + w.breakdown.pension + round(w.gross * ZUS_RATES.employerPension), 0);
  const totalDisability = workers.reduce((s, w) => s + w.breakdown.disability + round(w.gross * ZUS_RATES.employerDisability), 0);
  const totalHealth = workers.reduce((s, w) => s + w.breakdown.health, 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<ZUS_DRA month="${month}" workerCount="${workers.length}">
  <Summary>
    <TotalGross>${totalGross.toFixed(2)}</TotalGross>
    <TotalPension>${totalPension.toFixed(2)}</TotalPension>
    <TotalDisability>${totalDisability.toFixed(2)}</TotalDisability>
    <TotalHealth>${totalHealth.toFixed(2)}</TotalHealth>
  </Summary>
  <Workers>
${workers.map(w => `    <Worker pesel="${w.pesel}" name="${w.name}" gross="${w.gross.toFixed(2)}" pension="${w.breakdown.pension.toFixed(2)}" disability="${w.breakdown.disability.toFixed(2)}" health="${w.breakdown.health.toFixed(2)}" />`).join("\n")}
  </Workers>
</ZUS_DRA>`;
}

// ═══ HELPERS ════════════════════════════════════════════════════════════════
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
