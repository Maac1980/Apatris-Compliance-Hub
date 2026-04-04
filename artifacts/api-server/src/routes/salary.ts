import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";

const router = Router();

// Fallback market rates per role/country (EUR/h)
const MARKET_RATES: Record<string, Record<string, { min: number; max: number; avg: number }>> = {
  "TIG Welder":        { PL: { min: 25, max: 38, avg: 31 }, NL: { min: 30, max: 48, avg: 38 }, BE: { min: 28, max: 45, avg: 36 }, LT: { min: 20, max: 32, avg: 26 }, SK: { min: 18, max: 30, avg: 24 }, CZ: { min: 20, max: 33, avg: 27 }, RO: { min: 15, max: 28, avg: 22 } },
  "MIG Welder":        { PL: { min: 23, max: 35, avg: 29 }, NL: { min: 28, max: 44, avg: 35 }, BE: { min: 26, max: 42, avg: 34 }, LT: { min: 18, max: 30, avg: 24 }, SK: { min: 16, max: 28, avg: 22 }, CZ: { min: 18, max: 30, avg: 24 }, RO: { min: 14, max: 26, avg: 20 } },
  "MAG Welder":        { PL: { min: 23, max: 35, avg: 29 }, NL: { min: 28, max: 44, avg: 35 }, BE: { min: 26, max: 42, avg: 34 }, LT: { min: 18, max: 30, avg: 24 }, SK: { min: 16, max: 28, avg: 22 }, CZ: { min: 18, max: 30, avg: 24 }, RO: { min: 14, max: 26, avg: 20 } },
  "MMA Welder":        { PL: { min: 22, max: 34, avg: 28 }, NL: { min: 27, max: 42, avg: 34 }, BE: { min: 25, max: 40, avg: 32 }, LT: { min: 17, max: 28, avg: 23 }, SK: { min: 15, max: 27, avg: 21 }, CZ: { min: 17, max: 29, avg: 23 }, RO: { min: 13, max: 25, avg: 19 } },
  "Electrician":       { PL: { min: 26, max: 40, avg: 33 }, NL: { min: 32, max: 50, avg: 40 }, BE: { min: 30, max: 48, avg: 38 }, LT: { min: 22, max: 35, avg: 28 }, SK: { min: 20, max: 33, avg: 26 }, CZ: { min: 22, max: 36, avg: 29 }, RO: { min: 17, max: 30, avg: 24 } },
  "Scaffolder":        { PL: { min: 20, max: 32, avg: 26 }, NL: { min: 25, max: 40, avg: 32 }, BE: { min: 24, max: 38, avg: 30 }, LT: { min: 16, max: 28, avg: 22 }, SK: { min: 14, max: 26, avg: 20 }, CZ: { min: 16, max: 28, avg: 22 }, RO: { min: 12, max: 24, avg: 18 } },
  "Forklift Operator":  { PL: { min: 18, max: 28, avg: 23 }, NL: { min: 22, max: 35, avg: 28 }, BE: { min: 20, max: 33, avg: 26 }, LT: { min: 14, max: 24, avg: 19 }, SK: { min: 12, max: 22, avg: 17 }, CZ: { min: 14, max: 24, avg: 19 }, RO: { min: 10, max: 20, avg: 15 } },
  "Fabricator":        { PL: { min: 24, max: 37, avg: 30 }, NL: { min: 30, max: 46, avg: 37 }, BE: { min: 28, max: 44, avg: 35 }, LT: { min: 20, max: 32, avg: 25 }, SK: { min: 18, max: 30, avg: 24 }, CZ: { min: 20, max: 33, avg: 26 }, RO: { min: 15, max: 28, avg: 22 } },
};

function getCountryFromSite(site: string): string {
  if (site.includes("NL")) return "NL";
  if (site.includes("BE")) return "BE";
  if (site.includes("LT")) return "LT";
  if (site.includes("SK")) return "SK";
  if (site.includes("CZ")) return "CZ";
  if (site.includes("RO")) return "RO";
  return "PL";
}

// POST /api/salary/predict — AI market rate prediction
router.post("/salary/predict", requireAuth, async (req, res) => {
  try {
    const { roleType, country, experienceLevel, certifications } = req.body as Record<string, string>;
    if (!roleType || !country) return res.status(400).json({ error: "roleType and country required" });

    let minRate: number, maxRate: number, avgRate: number, recommendation: string;

    // Try AI first
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system: `You are a European labor market analyst specializing in construction and welding workforce. Return ONLY valid JSON: { "min_rate": number, "max_rate": number, "avg_rate": number, "currency": "EUR", "recommendation": "string" }. Rates are hourly in EUR.`,
          messages: [{ role: "user", content: `Market rate for ${roleType} in ${country}, experience: ${experienceLevel || "mid-level"}, certifications: ${certifications || "standard"}` }],
        });
        const content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
        const parsed = JSON.parse(content);
        minRate = parsed.min_rate ?? 20; maxRate = parsed.max_rate ?? 40; avgRate = parsed.avg_rate ?? 30;
        recommendation = parsed.recommendation ?? "Rate is within market range";
      } catch {
        // Fallback
        const rates = MARKET_RATES[roleType]?.[country] ?? { min: 20, max: 40, avg: 30 };
        minRate = rates.min; maxRate = rates.max; avgRate = rates.avg;
        recommendation = `Market rate for ${roleType} in ${country}: ${avgRate} EUR/h average`;
      }
    } else {
      const rates = MARKET_RATES[roleType]?.[country] ?? { min: 20, max: 40, avg: 30 };
      minRate = rates.min; maxRate = rates.max; avgRate = rates.avg;
      recommendation = `Market rate for ${roleType} in ${country}: ${avgRate} EUR/h average`;
    }

    // Store benchmark
    await queryOne(
      `INSERT INTO salary_benchmarks (tenant_id, role_type, country, experience_level, min_rate, max_rate, avg_rate, recommendation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId!, roleType, country, experienceLevel || "mid", minRate, maxRate, avgRate, recommendation]
    );

    res.json({ prediction: { roleType, country, minRate, maxRate, avgRate, currency: "EUR", recommendation } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/salary/benchmarks
router.get("/salary/benchmarks", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM salary_benchmarks WHERE tenant_id = $1 ORDER BY calculated_at DESC LIMIT 50",
      [req.tenantId!]
    );
    res.json({ benchmarks: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/salary/compare/:workerId
router.get("/salary/compare/:workerId", requireAuth, async (req, res) => {
  try {
    const worker = await queryOne<Record<string, any>>(
      "SELECT * FROM workers WHERE id = $1 AND tenant_id = $2",
      [req.params.workerId, req.tenantId!]
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const role = worker.specialization || "Welder";
    const country = getCountryFromSite(worker.assigned_site || "PL");
    const currentRate = Number(worker.hourly_rate ?? 0);
    const market = MARKET_RATES[role]?.[country] ?? MARKET_RATES["TIG Welder"]?.[country] ?? { min: 20, max: 40, avg: 30 };

    const diff = currentRate - market.avg;
    const pct = market.avg > 0 ? Math.round((diff / market.avg) * 100) : 0;
    const status = pct > 10 ? "overpaid" : pct < -10 ? "underpaid" : "market_rate";

    res.json({
      worker: { id: worker.id, name: worker.full_name, role, site: worker.assigned_site, currentRate },
      market: { country, minRate: market.min, maxRate: market.max, avgRate: market.avg },
      comparison: { difference: Math.round(diff * 100) / 100, percentDiff: pct, status },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/salary/compare-all — compare all workers
router.get("/salary/compare-all", requireAuth, async (req, res) => {
  try {
    const dbRows = await fetchAllWorkers(req.tenantId!);
    const workers = dbRows.map(mapRowToWorker);

    const comparisons = workers.filter(w => (w.hourlyRate ?? 0) > 0).map(w => {
      const role = w.specialization || "Welder";
      const country = getCountryFromSite(w.assignedSite || "PL");
      const currentRate = w.hourlyRate ?? 0;
      const market = MARKET_RATES[role]?.[country] ?? MARKET_RATES["TIG Welder"]?.[country] ?? { min: 20, max: 40, avg: 30 };
      const diff = currentRate - market.avg;
      const pct = market.avg > 0 ? Math.round((diff / market.avg) * 100) : 0;
      return {
        workerId: w.id, name: w.name, role, site: w.assignedSite, country,
        currentRate, marketAvg: market.avg, difference: Math.round(diff * 100) / 100, percentDiff: pct,
        status: pct > 10 ? "overpaid" : pct < -10 ? "underpaid" : "market_rate",
      };
    });

    comparisons.sort((a, b) => a.percentDiff - b.percentDiff);
    const underpaid = comparisons.filter(c => c.status === "underpaid").length;
    const overpaid = comparisons.filter(c => c.status === "overpaid").length;

    res.json({ comparisons, underpaid, overpaid, atMarket: comparisons.length - underpaid - overpaid });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
