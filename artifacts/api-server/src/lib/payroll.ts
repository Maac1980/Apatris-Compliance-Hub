export interface PayrollResult {
  gross: number;
  net: number;
  details: {
    social: number;
    health: number;
    kup: number;
    taxBase: number;
    pit: number;
  };
}

export function calculateNet(gross: number): PayrollResult {
  const pension = Math.round((gross * 0.0976) * 100) / 100;
  const disability = Math.round((gross * 0.015) * 100) / 100;
  const social = pension + disability;
  const healthBase = Math.round((gross - social) * 100) / 100;
  const health = Math.round((healthBase * 0.09) * 100) / 100;
  const kup = Math.round((healthBase * 0.20) * 100) / 100;
  const taxBase = Math.round(healthBase - kup);
  const pit = Math.max(0, Math.round(taxBase * 0.12) - 300);
  const net = Math.round((gross - social - health - pit) * 100) / 100;
  return { gross, net, details: { social, health, kup, taxBase, pit } };
}
