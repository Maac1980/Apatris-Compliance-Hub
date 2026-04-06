/**
 * Payroll calculation — delegates to the canonical ZUS service.
 * This file is kept for backward compatibility with existing imports.
 */
import { calculateFromGross, type ZUSBreakdown } from "../services/zus.service.js";

export interface PayrollOptions {
  includeSickness?: boolean;
  applyPit2?: boolean;
}

export function calculatePayroll(
  inputAmount: number,
  isHours = true,
  options: PayrollOptions = {}
) {
  const HOURLY_RATE = 31.40;
  const gross = isHours ? Math.round(inputAmount * HOURLY_RATE * 100) / 100 : inputAmount;
  const r = calculateFromGross(gross, {
    includeSickness: options.includeSickness,
    applyPit2: options.applyPit2,
  });
  return {
    input: inputAmount, isHours, gross: r.gross, net: r.net,
    totalEmployerCost: r.totalEmployerCost, employerZus: r.employerZus,
    details: { social: r.totalEmployeeSocial, health: r.health, kup: r.kup,
      taxBase: r.taxBase, pit: r.pit,
      sicknessApplied: options.includeSickness ?? false, pit2Applied: options.applyPit2 ?? true }
  };
}

export function calculateNet(gross: number) {
  const r = calculateFromGross(gross);
  return { gross: r.gross, net: r.net, details: { social: r.totalEmployeeSocial, health: r.health, pit: r.pit } };
}
