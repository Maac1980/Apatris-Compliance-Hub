/**
 * Regulatory Intelligence Stage 1 — Routes
 *
 * GET    /api/v1/regulatory/sources
 * POST   /api/v1/regulatory/sources
 * PATCH  /api/v1/regulatory/sources/:id
 * POST   /api/v1/regulatory/scan
 * GET    /api/v1/regulatory/updates
 * GET    /api/v1/regulatory/updates/:id
 * POST   /api/v1/regulatory/seed-sources  (dev only)
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { listSources, createSource, updateSource, seedDefaultSources } from "../services/regulatory-source-registry.service.js";
import { runFullScan, listUpdates, getUpdate } from "../services/regulatory-ingestion.service.js";
import { classifyAndPersist } from "../services/regulatory-classification.service.js";
import { extractAndPersist } from "../services/regulatory-extraction.service.js";
import { mapImpact, simulateImpact, getImpacts, getSimulation } from "../services/regulatory-impact.service.js";
import { getReviewTasks, getReviewQueue, assignReviewer, approveTask, rejectTask, requestEdit, getApprovals } from "../services/regulatory-review.service.js";
import { prepareDeployment, getDeploymentPlan, executeDeployment, rollbackDeployment, listDeployments, getAuditLog, getFullAuditLog } from "../services/regulatory-deployment.service.js";

const router = Router();
const ADMIN_ROLES = ["Admin", "Executive", "LegalHead"];
const VIEW_ROLES = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"];

// Sources
router.get("/v1/regulatory/sources", requireAuth, requireRole(...VIEW_ROLES), async (_req, res) => {
  try { res.json({ sources: await listSources(), count: (await listSources()).length }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/regulatory/sources", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, sourceType, baseUrl, jurisdiction, trustLevel, pollingFrequency, parserConfig, language } = req.body;
    if (!name || !baseUrl) return res.status(400).json({ error: "name and baseUrl required" });
    const source = await createSource({ name, source_type: sourceType, base_url: baseUrl, jurisdiction, trust_level: trustLevel, polling_frequency: pollingFrequency, parser_config_json: parserConfig, language });
    res.status(201).json(source);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.patch("/v1/regulatory/sources/:id", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const source = await updateSource(req.params.id, req.body);
    if (!source) return res.status(404).json({ error: "Source not found" });
    res.json(source);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Scan
router.post("/v1/regulatory/scan", requireAuth, requireRole(...ADMIN_ROLES), async (_req, res) => {
  try { res.json(await runFullScan()); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Scan failed" }); }
});

// Seed (dev utility)
router.post("/v1/regulatory/seed-sources", requireAuth, requireRole(...ADMIN_ROLES), async (_req, res) => {
  try { res.json({ seeded: await seedDefaultSources() }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Updates
router.get("/v1/regulatory/updates", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  try {
    const { status, sourceId, limit } = req.query as Record<string, string>;
    const updates = await listUpdates({ status, sourceId, limit: limit ? parseInt(limit) : undefined });
    res.json({ updates, count: updates.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/regulatory/updates/:id", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  try {
    const update = await getUpdate(req.params.id);
    if (!update) return res.status(404).json({ error: "Update not found" });
    res.json(update);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Stage 2: Manual classify + extract
router.post("/v1/regulatory/updates/:id/classify", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const classification = await classifyAndPersist(req.params.id);
    const extraction = await extractAndPersist(req.params.id);
    res.json({ classification, extraction });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Stage 3: Impact + Simulation
router.get("/v1/regulatory/updates/:id/impacts", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  try { res.json({ impacts: await getImpacts(req.params.id) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/regulatory/updates/:id/simulation", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  try {
    const sim = await getSimulation(req.params.id);
    res.json(sim ?? { error: "No simulation found" });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/regulatory/updates/:id/simulate", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const impacts = await mapImpact(req.params.id, req.tenantId!);
    const simulation = await simulateImpact(req.params.id, req.tenantId!);
    res.json({ impacts, simulation });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Stage 4: Review + Approval
router.get("/v1/regulatory/review-tasks", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  try {
    const { status, role } = req.query as Record<string, string>;
    const tasks = await getReviewQueue({ status, role });
    res.json({ tasks, count: tasks.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/regulatory/review-tasks/:updateId", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  try { res.json({ tasks: await getReviewTasks(req.params.updateId) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/regulatory/review-tasks/:id/assign", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const task = await assignReviewer(req.params.id, userId);
    res.json(task);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/regulatory/review-tasks/:id/approve", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const result = await approveTask(req.params.id, req.user?.name ?? "unknown", req.body.notes);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/regulatory/review-tasks/:id/reject", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const result = await rejectTask(req.params.id, req.user?.name ?? "unknown", req.body.notes);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/regulatory/review-tasks/:id/request-edit", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const task = await requestEdit(req.params.id, req.user?.name ?? "unknown", req.body.notes);
    res.json(task);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/regulatory/approvals/:updateId", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  try { res.json({ approvals: await getApprovals(req.params.updateId) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Stage 5: Deployment + Audit
router.get("/v1/regulatory/deployments", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  try {
    const { status, updateId } = req.query as Record<string, string>;
    res.json({ deployments: await listDeployments({ status, updateId }) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/regulatory/updates/:id/deployment-plan", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  try { res.json({ plan: await getDeploymentPlan(req.params.id) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/regulatory/updates/:id/prepare-deployment", requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  try { res.json({ plan: await prepareDeployment(req.params.id) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/regulatory/updates/:id/execute-deployment", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try { res.json(await executeDeployment(req.params.id, req.user?.name ?? "unknown")); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/regulatory/deployments/:id/rollback", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try { res.json(await rollbackDeployment(req.params.id, req.user?.name ?? "unknown")); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/regulatory/updates/:id/audit", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  try { res.json({ events: await getAuditLog(req.params.id) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/regulatory/audit", requireAuth, requireRole(...ADMIN_ROLES), async (_req, res) => {
  try { res.json({ events: await getFullAuditLog() }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
