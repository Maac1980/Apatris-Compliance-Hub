import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { listCountries, getCountryConfig, calculateNetPay, checkDocumentCompliance, getSupportedCountryCodes } from "../lib/country-compliance.js";

const router = Router();

// GET /api/compliance/countries — list supported countries
router.get("/compliance/countries", requireAuth, (_req, res) => {
  res.json({ countries: listCountries(), supported: getSupportedCountryCodes() });
});

// GET /api/compliance/country/:code — get country config
router.get("/compliance/country/:code", requireAuth, (req, res) => {
  const config = getCountryConfig(req.params.code);
  if (!config) return res.status(404).json({ error: "Country not supported" });
  res.json({ country: config });
});

// POST /api/compliance/calculate — calculate net pay for any country
router.post("/compliance/calculate", requireAuth, (req, res) => {
  try {
    const { countryCode, grossMonthly } = req.body as { countryCode?: string; grossMonthly?: number };
    if (!countryCode || !grossMonthly) return res.status(400).json({ error: "countryCode and grossMonthly required" });
    const result = calculateNetPay(countryCode, grossMonthly);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Calculation failed" });
  }
});

// POST /api/compliance/documents/check — check document compliance for a country
router.post("/compliance/documents/check", requireAuth, (req, res) => {
  try {
    const { countryCode, presentDocuments } = req.body as { countryCode?: string; presentDocuments?: string[] };
    if (!countryCode || !presentDocuments) return res.status(400).json({ error: "countryCode and presentDocuments required" });
    const result = checkDocumentCompliance(countryCode, presentDocuments);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Check failed" });
  }
});

export default router;
