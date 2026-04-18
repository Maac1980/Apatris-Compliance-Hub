import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";
import { randomBytes } from "crypto";

const router = Router();

const REPORT_TYPES = ["demand_trends", "rate_movements", "certification_gaps", "seasonal_patterns", "compliance_rates"];
const COUNTRIES = ["PL", "NL", "BE", "LT", "SK", "CZ", "RO"];

// POST /api/intelligence/generate
router.post("/intelligence/generate", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { reportType, country } = req.body as { reportType?: string; country?: string };
    if (!reportType || !REPORT_TYPES.includes(reportType)) return res.status(400).json({ error: `reportType must be: ${REPORT_TYPES.join(", ")}` });

    const tenantId = req.tenantId!;
    const dbRows = await fetchAllWorkers(tenantId);
    const workers = dbRows.map((r) => mapRowToWorker(r));

    // Aggregate anonymised data
    const roleDistribution: Record<string, number> = {};
    const countryDistribution: Record<string, number> = {};
    let avgRate = 0; let totalRates = 0;
    for (const w of workers) {
      const role = w.specialization || "General";
      roleDistribution[role] = (roleDistribution[role] || 0) + 1;
      const site = w.assignedSite || "";
      for (const c of COUNTRIES) { if (site.includes(c)) { countryDistribution[c] = (countryDistribution[c] || 0) + 1; break; } }
      if (w.hourlyRate) { avgRate += w.hourlyRate; totalRates++; }
    }
    if (totalRates > 0) avgRate /= totalRates;

    const dataPoints: Record<string, any> = { totalWorkers: workers.length, roleDistribution, countryDistribution, avgHourlyRate: Math.round(avgRate * 100) / 100, period: new Date().toISOString().slice(0, 7) };

    let insights = `Anonymised market intelligence for ${reportType.replace("_", " ")}. ${workers.length} workers across ${Object.keys(countryDistribution).length} countries.`;

    // AI-generated insights
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 512,
          system: "You are a labour market analyst. Generate a concise market intelligence insight from anonymised workforce data. No PII. Focus on trends, predictions, and actionable intelligence for construction staffing.",
          messages: [{ role: "user", content: `Report: ${reportType}. Country: ${country || "All EU"}. Data: ${JSON.stringify(dataPoints)}` }],
        });
        insights = response.content[0]?.type === "text" ? response.content[0].text : insights;
      } catch { /* use default */ }
    }

    const row = await queryOne(
      `INSERT INTO market_intelligence (tenant_id, report_type, country, role_type, data_points, insights, period_start, period_end, is_anonymised)
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE - 30,CURRENT_DATE,TRUE) RETURNING *`,
      [tenantId, reportType, country || "EU", null, JSON.stringify(dataPoints), insights]);

    res.status(201).json({ report: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/intelligence/reports
router.get("/intelligence/reports", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM market_intelligence WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50", [req.tenantId!]);
    res.json({ reports: rows, reportTypes: REPORT_TYPES });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/intelligence/reports/:id
router.get("/intelligence/reports/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("SELECT * FROM market_intelligence WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ report: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/intelligence/feed — live data for subscribers (public with API key)
router.get("/intelligence/feed", async (req, res) => {
  try {
    const rows = await query("SELECT id, report_type, country, data_points, insights, period_start, period_end, created_at FROM market_intelligence WHERE is_anonymised = TRUE ORDER BY created_at DESC LIMIT 10");
    res.json({ feed: rows, updated: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/intelligence/subscribers
router.get("/intelligence/subscribers", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const rows = await query("SELECT * FROM intelligence_subscribers ORDER BY created_at DESC");
    res.json({ subscribers: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/intelligence/subscribers
router.post("/intelligence/subscribers", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { name, email, company, subscriptionType } = req.body as Record<string, string>;
    if (!name || !email) return res.status(400).json({ error: "name and email required" });
    const apiKey = `mi_${randomBytes(24).toString("hex")}`;
    const row = await queryOne(
      "INSERT INTO intelligence_subscribers (name, email, company, subscription_type, api_key) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [name, email, company ?? null, subscriptionType || "basic", apiKey]);
    res.status(201).json({ subscriber: row, apiKey, message: "Share this API key with subscriber" });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
