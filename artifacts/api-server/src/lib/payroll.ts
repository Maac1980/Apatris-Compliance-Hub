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
  const includeSickness = options.includeSickness ?? false;
  const applyPit2 = options.applyPit2 ?? true;
  const gross = isHours ? Math.round(inputAmount * HOURLY_RATE * 100) / 100 : inputAmount;
  const pension = Math.round((gross * 0.0976) * 100) / 100;
  const disability = Math.round((gross * 0.015) * 100) / 100;
  const sickness = includeSickness ? Math.round((gross * 0.0245) * 100) / 100 : 0;
  const employeeSocial = pension + disability + sickness;
  const healthBase = Math.round((gross - employeeSocial) * 100) / 100;
  const health = Math.round((gross * 0.079866) * 100) / 100;
  const kup = Math.round((healthBase * 0.20) * 100) / 100;
  const taxBase = Math.round(healthBase - kup);
  const basePit = Math.round(taxBase * 0.12);
  const allowance = applyPit2 ? 300 : 0;
  const pit = Math.max(0, basePit - allowance);
  const net = Math.round((gross - employeeSocial - health - pit) * 100) / 100;
  const employerZus = Math.round((gross * 0.1881) * 100) / 100;
  const totalEmployerCost = Math.round((gross + employerZus) * 100) / 100;
  return {
    input: inputAmount, isHours, gross, net, totalEmployerCost, employerZus,
    details: { social: employeeSocial, health, kup, taxBase, pit,
      sicknessApplied: includeSickness, pit2Applied: applyPit2 }
  };
}

export function calculateNet(gross: number) {
  const r = calculatePayroll(gross, false);
  return { gross: r.gross, net: r.net, details: { social: r.details.social, health: r.details.health, pit: r.details.pit } };
}
