export interface PayrollOptions {
  includeSickness?: boolean;
  applyPit2?: boolean;
}

export function calculatePayroll(
  inputAmount: number,
  isHours = true,
  options: PayrollOptions = { includeSickness: false, applyPit2: true }
) {
  const HOURLY_RATE = 31.40;
  const gross = isHours ? Math.round(inputAmount * HOURLY_RATE * 100) / 100 : inputAmount;
  const pension = Math.round((gross * 0.0976) * 100) / 100;
  const disability = Math.round((gross * 0.015) * 100) / 100;
  const sickness = options.includeSickness ? Math.round((gross * 0.0245) * 100) / 100 : 0;
  const employeeSocial = pension + disability + sickness;
  const healthBase = Math.round((gross - employeeSocial) * 100) / 100;
  const health = Math.round((healthBase * 0.09) * 100) / 100;
  const kup = Math.round((healthBase * 0.20) * 100) / 100;
  const taxBase = Math.round(healthBase - kup);
  const basePit = Math.round(taxBase * 0.12);
  const allowance = options.applyPit2 ? 300 : 0;
  const pit = Math.max(0, basePit - allowance);
  const net = Math.round((gross - employeeSocial - health - pit) * 100) / 100;
  const employerZus = Math.round((gross * 0.2048) * 100) / 100;
  const totalEmployerCost = Math.round((gross + employerZus) * 100) / 100;
  return {
    input: inputAmount, isHours, gross, net, totalEmployerCost, employerZus,
    details: { social: employeeSocial, health, kup, taxBase, pit,
      sicknessApplied: !!options.includeSickness, pit2Applied: !!options.applyPit2 }
  };
}

export function calculateNet(gross: number): { gross: number; net: number; details: { social: number; health: number; pit: number } } {
  const result = calculatePayroll(gross, false, { includeSickness: false, applyPit2: true });
  return { gross: result.gross, net: result.net, details: { social: result.details.social, health: result.details.health, pit: result.details.pit } };
}
