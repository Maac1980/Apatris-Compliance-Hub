/**
 * Test Scenario Engine — API routes
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { createScenario, listScenarios, getScenario, runScenario, getScenarioRun, seedDefaultScenarios } from "../services/test-scenario.service.js";

const router = Router();
const ADMIN = ["Admin", "Executive", "LegalHead"];

router.post("/v1/test-scenarios", requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { name, scenarioType, description, inputJson, expectedOutputJson } = req.body;
    if (!name || !scenarioType) return res.status(400).json({ error: "name and scenarioType required" });
    const scenario = await createScenario({ name, scenarioType, description: description ?? "", inputJson: inputJson ?? {}, expectedOutputJson: expectedOutputJson ?? {}, createdBy: req.user?.name ?? "unknown" });
    res.status(201).json(scenario);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/test-scenarios", requireAuth, requireRole(...ADMIN), async (_req, res) => {
  try { res.json({ scenarios: await listScenarios() }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/test-scenarios/:id", requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const s = await getScenario(req.params.id);
    if (!s) return res.status(404).json({ error: "Not found" });
    res.json(s);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/test-scenarios/:id/run", requireAuth, requireRole(...ADMIN), async (req, res) => {
  try { res.json(await runScenario(req.params.id, req.user?.name ?? "unknown")); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/test-scenarios/runs/:id", requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const run = await getScenarioRun(req.params.id);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json(run);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/test-scenarios/seed", requireAuth, requireRole(...ADMIN), async (_req, res) => {
  try { res.json({ seeded: await seedDefaultScenarios() }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
