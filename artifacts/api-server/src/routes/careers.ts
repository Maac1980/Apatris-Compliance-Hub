import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// Career ladder templates per role
const LADDERS: Record<string, Array<{ step: number; title: string; cert: string; rateIncrease: number; timeMonths: number }>> = {
  "TIG Welder": [
    { step: 1, title: "TIG Welder (Standard)", cert: "EN ISO 9606-1 TIG (141)", rateIncrease: 0, timeMonths: 0 },
    { step: 2, title: "TIG Pipe Welder", cert: "EN ISO 9606-1 Pipe (H-L045)", rateIncrease: 6, timeMonths: 6 },
    { step: 3, title: "Senior TIG + NDT Inspector", cert: "EN ISO 9712 NDT Level 2", rateIncrease: 12, timeMonths: 18 },
  ],
  "MIG Welder": [
    { step: 1, title: "MIG Welder (Standard)", cert: "EN ISO 9606-1 MIG (131)", rateIncrease: 0, timeMonths: 0 },
    { step: 2, title: "MIG + TIG Dual Certified", cert: "EN ISO 9606-1 TIG (141)", rateIncrease: 4, timeMonths: 4 },
    { step: 3, title: "Senior Multi-Process Welder", cert: "EN ISO 9606-1 Pipe (H-L045)", rateIncrease: 10, timeMonths: 12 },
  ],
  "Electrician": [
    { step: 1, title: "Electrician (SEP Group 1)", cert: "SEP Group 1 (up to 1kV)", rateIncrease: 0, timeMonths: 0 },
    { step: 2, title: "Senior Electrician (SEP Group 2)", cert: "SEP Group 2 (above 1kV)", rateIncrease: 5, timeMonths: 6 },
    { step: 3, title: "Electrical Supervisor + Safety", cert: "BHP Supervisor Certificate", rateIncrease: 10, timeMonths: 12 },
  ],
  "Scaffolder": [
    { step: 1, title: "Scaffolder (Basic)", cert: "CISRS Basic Scaffolding", rateIncrease: 0, timeMonths: 0 },
    { step: 2, title: "Advanced Scaffolder", cert: "CISRS Advanced Scaffolding", rateIncrease: 3, timeMonths: 6 },
    { step: 3, title: "Scaffolding Supervisor", cert: "CISRS Scaffold Inspector (SSPTS)", rateIncrease: 8, timeMonths: 12 },
  ],
  "Forklift Operator": [
    { step: 1, title: "Forklift Operator", cert: "UDT Forklift License", rateIncrease: 0, timeMonths: 0 },
    { step: 2, title: "Crane + Forklift Operator", cert: "UDT Crane Operator", rateIncrease: 5, timeMonths: 4 },
    { step: 3, title: "Heavy Equipment Supervisor", cert: "UDT Supervisor License", rateIncrease: 10, timeMonths: 12 },
  ],
};

const DEFAULT_LADDER = [
  { step: 1, title: "Worker (Current)", cert: "Current role", rateIncrease: 0, timeMonths: 0 },
  { step: 2, title: "Specialist", cert: "Role-specific certification", rateIncrease: 4, timeMonths: 6 },
  { step: 3, title: "Senior / Supervisor", cert: "Leadership + Safety cert", rateIncrease: 10, timeMonths: 18 },
];

// POST /api/careers/generate/:workerId
router.post("/careers/generate/:workerId", requireAuth, async (req, res) => {
  try {
    const worker = await queryOne<Record<string, any>>(
      "SELECT * FROM workers WHERE id = $1 AND tenant_id = $2", [req.params.workerId, req.tenantId!]
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const role = worker.specialization || "General";
    const currentRate = Number(worker.hourly_rate || 0);

    // Find matching ladder
    const ladderKey = Object.keys(LADDERS).find(k => role.toLowerCase().includes(k.toLowerCase().split(" ")[0]));
    let ladder = ladderKey ? LADDERS[ladderKey] : DEFAULT_LADDER;

    // AI enhancement
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 512,
          system: `You are a construction career advisor. Return ONLY JSON: { "steps": [{ "step": number, "title": "string", "cert": "string", "rateIncrease": number, "timeMonths": number, "description": "string" }] }. Max 3 steps.`,
          messages: [{ role: "user", content: `Career path for ${role} worker, current rate €${currentRate}/h. Current qualifications: ${worker.qualification || "standard"}. Generate 3-step career ladder.` }],
        });
        const content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
        const parsed = JSON.parse(content);
        if (parsed.steps?.length) ladder = parsed.steps;
      } catch { /* use template */ }
    }

    const steps = ladder.map(s => ({
      ...s,
      estimatedRate: currentRate + s.rateIncrease,
      estimatedMonthly: (currentRate + s.rateIncrease) * 160,
    }));

    const totalIncrease = steps[steps.length - 1]?.rateIncrease || 0;
    const nextCert = steps.length > 1 ? steps[1].cert : "No next step";
    const timeToAchieve = steps.length > 1 ? `${steps[1].timeMonths} months` : "N/A";

    // Upsert
    await execute("DELETE FROM career_paths WHERE worker_id = $1 AND tenant_id = $2", [req.params.workerId, req.tenantId!]);
    const row = await queryOne(
      `INSERT INTO career_paths (tenant_id, worker_id, worker_name, current_role, current_certifications, recommended_next_cert, estimated_salary_increase, time_to_achieve, steps)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.tenantId!, worker.id, worker.full_name, role, worker.qualification || "", nextCert, totalIncrease, timeToAchieve, JSON.stringify(steps)]
    );

    res.json({ careerPath: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/careers/paths
router.get("/careers/paths", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM career_paths WHERE tenant_id = $1 ORDER BY worker_name", [req.tenantId!]);
    res.json({ paths: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/careers/paths/:workerId
router.get("/careers/paths/:workerId", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("SELECT * FROM career_paths WHERE worker_id = $1 AND tenant_id = $2", [req.params.workerId, req.tenantId!]);
    if (!row) return res.status(404).json({ error: "No career path generated — use POST to generate" });
    res.json({ careerPath: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// PATCH /api/careers/paths/:workerId/progress
router.patch("/careers/paths/:workerId/progress", requireAuth, async (req, res) => {
  try {
    const { progress } = req.body as { progress?: number };
    if (progress === undefined) return res.status(400).json({ error: "progress required (0-100)" });
    const row = await queryOne(
      "UPDATE career_paths SET progress = $1 WHERE worker_id = $2 AND tenant_id = $3 RETURNING *",
      [Math.min(100, Math.max(0, progress)), req.params.workerId, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ careerPath: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
