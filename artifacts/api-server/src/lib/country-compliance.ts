// ═══════════════════════════════════════════════════════════════════════════
// Multi-Country Compliance Engine
// Supports: PL (Poland), CZ (Czech Republic), RO (Romania)
// ═══════════════════════════════════════════════════════════════════════════

export interface CountryConfig {
  code: string;
  name: string;
  currency: string;
  minimumWageMonthly: number;    // gross, in local currency
  minimumWageHourly: number;     // gross, in local currency
  requiredDocuments: string[];
  socialSecurity: {
    employeeRate: number;        // total employee contribution %
    employerRate: number;        // total employer contribution %
    breakdown: Record<string, number>;  // individual components
  };
  incomeTax: {
    rate: number;               // flat rate or first bracket
    allowance: number;          // monthly tax-free allowance
    method: "flat" | "progressive";
  };
  healthInsurance: {
    employeeRate: number;
    employerRate: number;
  };
  postingRules: {
    maxDurationMonths: number;   // PWD standard limit
    extendedDurationMonths: number;  // PWD extended limit
    requiresA1: boolean;
    requiresWorkPermit: boolean;  // for non-EU workers
    minimumWageApplies: boolean; // host country min wage
  };
}

// ─── Poland ────────────────────────────────────────────────────────────────
const PL: CountryConfig = {
  code: "PL",
  name: "Poland",
  currency: "PLN",
  minimumWageMonthly: 4666,     // 2026 projected
  minimumWageHourly: 30.50,     // 2026 projected
  requiredDocuments: [
    "TRC Certificate",
    "Passport",
    "BHP Certificate",
    "Medical Exam (Badania Lekarskie)",
    "Work Permit (if non-EU)",
    "PESEL Registration",
    "ZUS Registration",
  ],
  socialSecurity: {
    employeeRate: 0.1126,       // 9.76% pension + 1.5% disability (no sickness for zlecenie)
    employerRate: 0.2048,       // 9.76 + 6.5 + 1.67 + 2.45 + 0.10
    breakdown: {
      pension_employee: 0.0976,
      disability_employee: 0.015,
      pension_employer: 0.0976,
      disability_employer: 0.065,
      accident_employer: 0.0167,
      labor_fund: 0.0245,
      fgsp: 0.001,
    },
  },
  incomeTax: {
    rate: 0.12,
    allowance: 300,             // PIT-2 monthly reduction
    method: "flat",
  },
  healthInsurance: {
    employeeRate: 0.09,
    employerRate: 0,
  },
  postingRules: {
    maxDurationMonths: 12,
    extendedDurationMonths: 18,
    requiresA1: true,
    requiresWorkPermit: true,
    minimumWageApplies: true,
  },
};

// ─── Czech Republic ────────────────────────────────────────────────────────
const CZ: CountryConfig = {
  code: "CZ",
  name: "Czech Republic",
  currency: "CZK",
  minimumWageMonthly: 20800,    // 2026 CZK
  minimumWageHourly: 124.40,    // 2026 CZK
  requiredDocuments: [
    "Passport / ID Card",
    "Work Permit (if non-EU)",
    "A1 Certificate (if posted)",
    "Employment Contract",
    "Health Insurance Card",
    "Trade License (if self-employed)",
    "Registration with Labour Office",
  ],
  socialSecurity: {
    employeeRate: 0.071,        // 7.1% (pension 6.5% + unemployment 0.6%)
    employerRate: 0.248,        // 24.8% (pension 21.5% + sickness 2.1% + unemployment 1.2%)
    breakdown: {
      pension_employee: 0.065,
      unemployment_employee: 0.006,
      pension_employer: 0.215,
      sickness_employer: 0.021,
      unemployment_employer: 0.012,
    },
  },
  incomeTax: {
    rate: 0.15,                 // 15% flat rate (up to 48x average wage)
    allowance: 2570,            // Monthly tax credit (CZK)
    method: "progressive",
  },
  healthInsurance: {
    employeeRate: 0.045,        // 4.5%
    employerRate: 0.09,         // 9%
  },
  postingRules: {
    maxDurationMonths: 12,
    extendedDurationMonths: 18,
    requiresA1: true,
    requiresWorkPermit: true,
    minimumWageApplies: true,
  },
};

// ─── Romania ───────────────────────────────────────────────────────────────
const RO: CountryConfig = {
  code: "RO",
  name: "Romania",
  currency: "RON",
  minimumWageMonthly: 3700,     // 2026 RON (gross)
  minimumWageHourly: 22.02,     // 2026 RON
  requiredDocuments: [
    "Passport / ID Card",
    "Work Permit (if non-EU)",
    "A1 Certificate (if posted)",
    "Employment Contract (registered with REVISAL)",
    "Medical Fitness Certificate",
    "SSM Training Certificate (Health & Safety)",
    "Criminal Record Certificate",
  ],
  socialSecurity: {
    employeeRate: 0.25,         // CAS 25% (pension)
    employerRate: 0.0225,       // CAM 2.25% (labor insurance)
    breakdown: {
      pension_employee: 0.25,
      labor_insurance_employer: 0.0225,
    },
  },
  incomeTax: {
    rate: 0.10,                 // 10% flat rate
    allowance: 200,             // Personal deduction (RON)
    method: "flat",
  },
  healthInsurance: {
    employeeRate: 0.10,         // CASS 10%
    employerRate: 0,
  },
  postingRules: {
    maxDurationMonths: 12,
    extendedDurationMonths: 18,
    requiresA1: true,
    requiresWorkPermit: true,
    minimumWageApplies: true,
  },
};

// ─── Registry ──────────────────────────────────────────────────────────────

const COUNTRIES: Record<string, CountryConfig> = { PL, CZ, RO };

export function getCountryConfig(code: string): CountryConfig | null {
  return COUNTRIES[code.toUpperCase()] ?? null;
}

export function listCountries(): CountryConfig[] {
  return Object.values(COUNTRIES);
}

export function getSupportedCountryCodes(): string[] {
  return Object.keys(COUNTRIES);
}

// ─── Net Pay Calculator ────────────────────────────────────────────────────

export interface PayCalculation {
  country: string;
  currency: string;
  grossMonthly: number;
  socialSecurity: { employee: number; employer: number };
  healthInsurance: { employee: number; employer: number };
  incomeTax: number;
  netMonthly: number;
  totalEmployerCost: number;
  meetsMinimumWage: boolean;
  minimumWage: number;
}

export function calculateNetPay(countryCode: string, grossMonthly: number): PayCalculation {
  const config = getCountryConfig(countryCode);
  if (!config) throw new Error(`Unsupported country: ${countryCode}`);

  const ssEmployee = grossMonthly * config.socialSecurity.employeeRate;
  const ssEmployer = grossMonthly * config.socialSecurity.employerRate;
  const hiEmployee = grossMonthly * config.healthInsurance.employeeRate;
  const hiEmployer = grossMonthly * config.healthInsurance.employerRate;

  // Tax base varies by country
  let taxBase = grossMonthly - ssEmployee;
  if (countryCode === "PL") {
    // Polish KUP: 20% of (gross - ZUS)
    taxBase = Math.round(taxBase * 0.80);
  }

  let incomeTax = Math.max(0, Math.round(taxBase * config.incomeTax.rate - config.incomeTax.allowance));

  const netMonthly = grossMonthly - ssEmployee - hiEmployee - incomeTax;
  const totalEmployerCost = grossMonthly + ssEmployer + hiEmployer;

  return {
    country: config.code,
    currency: config.currency,
    grossMonthly: Math.round(grossMonthly * 100) / 100,
    socialSecurity: {
      employee: Math.round(ssEmployee * 100) / 100,
      employer: Math.round(ssEmployer * 100) / 100,
    },
    healthInsurance: {
      employee: Math.round(hiEmployee * 100) / 100,
      employer: Math.round(hiEmployer * 100) / 100,
    },
    incomeTax: Math.round(incomeTax * 100) / 100,
    netMonthly: Math.round(netMonthly * 100) / 100,
    totalEmployerCost: Math.round(totalEmployerCost * 100) / 100,
    meetsMinimumWage: grossMonthly >= config.minimumWageMonthly,
    minimumWage: config.minimumWageMonthly,
  };
}

// ─── Document Compliance Check ─────────────────────────────────────────────

export interface DocumentComplianceResult {
  country: string;
  requiredDocuments: string[];
  presentDocuments: string[];
  missingDocuments: string[];
  complianceRate: number;       // 0-100%
  isCompliant: boolean;
}

export function checkDocumentCompliance(
  countryCode: string,
  presentDocumentTypes: string[]
): DocumentComplianceResult {
  const config = getCountryConfig(countryCode);
  if (!config) throw new Error(`Unsupported country: ${countryCode}`);

  const required = config.requiredDocuments;
  const presentLower = new Set(presentDocumentTypes.map(d => d.toLowerCase()));
  const missing = required.filter(d => !presentLower.has(d.toLowerCase()));
  const complianceRate = required.length > 0
    ? Math.round(((required.length - missing.length) / required.length) * 100)
    : 100;

  return {
    country: config.code,
    requiredDocuments: required,
    presentDocuments: presentDocumentTypes,
    missingDocuments: missing,
    complianceRate,
    isCompliant: missing.length === 0,
  };
}
