import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne } from "../lib/db.js";

const router = Router();

// GET /api/countries
router.get("/countries", requireAuth, async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM country_configs ORDER BY country_name");
    res.json({ countries: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/countries/:code
router.get("/countries/:code", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("SELECT * FROM country_configs WHERE country_code = $1", [req.params.code.toUpperCase()]);
    if (!row) return res.status(404).json({ error: "Country not found" });
    res.json({ country: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/countries/:code/calculate — net pay calculation
router.get("/countries/:code/calculate", requireAuth, async (req, res) => {
  try {
    const country = await queryOne<Record<string, any>>(
      "SELECT * FROM country_configs WHERE country_code = $1", [req.params.code.toUpperCase()]
    );
    if (!country) return res.status(404).json({ error: "Country not found" });

    const hourlyRate = Number(req.query.rate || country.min_wage_hourly);
    const hours = Number(req.query.hours || 160);
    const gross = hourlyRate * hours;

    const ssEmployee = gross * Number(country.social_security_employee) / 100;
    const ssEmployer = gross * Number(country.social_security_employer) / 100;
    const taxBase = gross - ssEmployee;
    const incomeTax = taxBase * Number(country.income_tax_rate) / 100;
    const netPay = gross - ssEmployee - incomeTax;
    const totalEmployerCost = gross + ssEmployer;

    res.json({
      country: country.country_name,
      countryCode: country.country_code,
      currency: country.currency,
      input: { hourlyRate, hours },
      calculation: {
        gross: r2(gross),
        socialSecurityEmployee: r2(ssEmployee),
        socialSecurityEmployer: r2(ssEmployer),
        incomeTax: r2(incomeTax),
        netPay: r2(netPay),
        totalEmployerCost: r2(totalEmployerCost),
      },
      rates: {
        ssEmployeeRate: Number(country.social_security_employee),
        ssEmployerRate: Number(country.social_security_employer),
        taxRate: Number(country.income_tax_rate),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/countries/compare — compare same worker across countries
router.post("/countries/compare", requireAuth, async (req, res) => {
  try {
    const { hourlyRateEur, hours } = req.body as { hourlyRateEur?: number; hours?: number };
    const rate = hourlyRateEur || 31.40;
    const h = hours || 160;

    const countries = await query<Record<string, any>>("SELECT * FROM country_configs ORDER BY country_name");

    // EUR conversion rates (approximate)
    const eurRates: Record<string, number> = { EUR: 1, PLN: 0.23, CZK: 0.04, RON: 0.20 };

    const comparison = countries.map(c => {
      const eurRate = eurRates[c.currency] || 1;
      const localRate = rate / eurRate;
      const gross = localRate * h;
      const ssEmp = gross * Number(c.social_security_employee) / 100;
      const ssEmpl = gross * Number(c.social_security_employer) / 100;
      const tax = (gross - ssEmp) * Number(c.income_tax_rate) / 100;
      const net = gross - ssEmp - tax;
      const totalCost = gross + ssEmpl;

      return {
        country: c.country_name,
        code: c.country_code,
        currency: c.currency,
        grossLocal: r2(gross),
        netLocal: r2(net),
        totalCostLocal: r2(totalCost),
        grossEur: r2(gross * eurRate),
        netEur: r2(net * eurRate),
        totalCostEur: r2(totalCost * eurRate),
        ssEmployeePercent: Number(c.social_security_employee),
        ssEmployerPercent: Number(c.social_security_employer),
        taxPercent: Number(c.income_tax_rate),
      };
    });

    comparison.sort((a, b) => a.totalCostEur - b.totalCostEur);

    res.json({ comparison, inputRate: rate, inputHours: h });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

function r2(n: number): number { return Math.round(n * 100) / 100; }

export default router;
