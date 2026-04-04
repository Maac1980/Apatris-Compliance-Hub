import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";

const router = Router();

const CERTS = [
  { skill: "TIG Welding", cert: "EN ISO 9606-1 TIG (141)", premium: 4 },
  { skill: "MIG Welding", cert: "EN ISO 9606-1 MIG (131)", premium: 3 },
  { skill: "MAG Welding", cert: "EN ISO 9606-1 MAG (135)", premium: 3 },
  { skill: "MMA Welding", cert: "EN ISO 9606-1 MMA (111)", premium: 2.5 },
  { skill: "Pipe Welding", cert: "EN ISO 9606-1 Pipe (H-L045)", premium: 6 },
  { skill: "Electrical", cert: "SEP Group 1 (up to 1kV)", premium: 5 },
  { skill: "Scaffolding", cert: "CISRS Scaffolding", premium: 3 },
  { skill: "Forklift", cert: "UDT Forklift License", premium: 2 },
  { skill: "Crane Operation", cert: "UDT Crane Operator", premium: 5 },
  { skill: "NDT Testing", cert: "EN ISO 9712 NDT Level 2", premium: 8 },
  { skill: "Safety", cert: "BHP (OHS) Certificate", premium: 1 },
  { skill: "First Aid", cert: "First Aid (EU Certified)", premium: 1 },
];

// POST /api/skills/analyse — AI analyses pool vs demand
router.post("/skills/analyse", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    await execute("DELETE FROM skill_demands WHERE tenant_id = $1", [tenantId]);

    const dbRows = await fetchAllWorkers(tenantId);
    const workers = dbRows.map(mapRowToWorker);

    // Count workers per specialization
    const pool: Record<string, number> = {};
    for (const w of workers) {
      const spec = w.specialization || "General";
      pool[spec] = (pool[spec] || 0) + 1;
    }

    // Get active job demands
    const jobs = await query<Record<string, any>>(
      "SELECT role_type, COALESCE(SUM(workers_needed), 0) AS needed FROM job_requests WHERE tenant_id = $1 AND status IN ('open', 'matched') GROUP BY role_type",
      [tenantId]
    );

    const demands: Record<string, number> = {};
    for (const j of jobs) demands[j.role_type] = Number(j.needed);

    // Active deal demands
    const deals = await query<Record<string, any>>(
      "SELECT role_type, COALESCE(SUM(workers_needed), 0) AS needed FROM crm_deals WHERE tenant_id = $1 AND stage = 'Active' GROUP BY role_type",
      [tenantId]
    );
    for (const d of deals) demands[d.role_type] = (demands[d.role_type] || 0) + Number(d.needed);

    let found = 0;
    for (const cert of CERTS) {
      // Match cert to pool
      const poolCount = Object.entries(pool)
        .filter(([k]) => k.toLowerCase().includes(cert.skill.toLowerCase().split(" ")[0]))
        .reduce((s, [, v]) => s + v, 0);

      const demandCount = Object.entries(demands)
        .filter(([k]) => k.toLowerCase().includes(cert.skill.toLowerCase().split(" ")[0]))
        .reduce((s, [, v]) => s + v, 0);

      const shortage = Math.max(0, demandCount - poolCount);
      const demandLevel = shortage > 5 ? "critical" : shortage > 2 ? "high" : shortage > 0 ? "medium" : "low";
      const recommendation = shortage > 0
        ? `Train ${shortage} more workers in ${cert.cert}. Premium: +€${cert.premium}/h per worker.`
        : `Pool sufficient. ${poolCount} workers available.`;

      await execute(
        `INSERT INTO skill_demands (tenant_id, role_type, skill_name, certification_name, demand_level, current_pool_count, shortage_count, avg_premium_rate, recommendation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [tenantId, cert.skill, cert.skill, cert.cert, demandLevel, poolCount, shortage, cert.premium, recommendation]
      );
      found++;
    }

    // AI enhancement
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 512,
          system: "You are a construction workforce skills analyst. Return ONLY JSON: { \"top_recommendations\": [{ \"cert\": \"string\", \"reason\": \"string\", \"estimated_revenue_increase\": number }] }",
          messages: [{ role: "user", content: `Pool: ${JSON.stringify(pool)}. Demand: ${JSON.stringify(demands)}. Top 3 certifications to invest in?` }],
        });
        // Store AI recommendations in first record
        const content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
        const parsed = JSON.parse(content);
        if (parsed.top_recommendations) {
          await execute("UPDATE skill_demands SET recommendation = $1 WHERE tenant_id = $2 AND id = (SELECT id FROM skill_demands WHERE tenant_id = $2 ORDER BY shortage_count DESC LIMIT 1)",
            [JSON.stringify(parsed.top_recommendations), tenantId]);
        }
      } catch { /* non-blocking */ }
    }

    res.json({ analysed: found, totalWorkers: workers.length, totalDemand: Object.values(demands).reduce((s, n) => s + n, 0) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/skills/gaps
router.get("/skills/gaps", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM skill_demands WHERE tenant_id = $1 ORDER BY CASE demand_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, shortage_count DESC",
      [req.tenantId!]
    );
    res.json({ gaps: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/skills/recommendations
router.get("/skills/recommendations", requireAuth, async (req, res) => {
  try {
    const rows = await query<Record<string, any>>(
      "SELECT * FROM skill_demands WHERE tenant_id = $1 AND shortage_count > 0 ORDER BY avg_premium_rate * shortage_count DESC LIMIT 5",
      [req.tenantId!]
    );
    const recs = rows.map(r => ({
      certification: r.certification_name, skill: r.skill_name,
      shortage: r.shortage_count, premiumPerHour: Number(r.avg_premium_rate),
      estimatedMonthlyRevenue: Number(r.avg_premium_rate) * 160 * r.shortage_count,
      demandLevel: r.demand_level,
    }));
    res.json({ recommendations: recs });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/skills/worker/:workerId
router.get("/skills/worker/:workerId", requireAuth, async (req, res) => {
  try {
    const worker = await queryOne<Record<string, any>>(
      "SELECT specialization, qualification FROM workers WHERE id = $1", [req.params.workerId]
    );
    if (!worker) return res.status(404).json({ error: "Not found" });

    const currentSkills = (worker.specialization || "").toLowerCase();
    const suggested = CERTS
      .filter(c => !currentSkills.includes(c.skill.toLowerCase().split(" ")[0]))
      .sort((a, b) => b.premium - a.premium)
      .slice(0, 5)
      .map(c => ({ certification: c.cert, skill: c.skill, premiumIncrease: c.premium, reason: `+€${c.premium}/h rate increase` }));

    res.json({ currentSpecialization: worker.specialization, suggestedCertifications: suggested });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
