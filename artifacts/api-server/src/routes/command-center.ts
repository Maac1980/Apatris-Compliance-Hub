/**
 * Command Center — Obsidian Export, OODA, Readiness Intelligence
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { exportUpdateToObsidian, listExports, getExportContent, getExportById } from "../services/obsidian-export.service.js";
import { getCycle, getActiveCycles } from "../services/ooda-engine.service.js";
import { getExecutiveReadiness } from "../services/readiness-intelligence.service.js";
import { runRegulatoryOoda, runCaseOoda, recordOverride, getOverrides, getFullEntityTimeline } from "../services/ooda-orchestration.service.js";
import { getCommandCenterData } from "../services/command-center.service.js";

const router = Router();
const ADMIN = ["Admin", "Executive", "LegalHead"];
const VIEW = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"];

// Readiness
router.get("/v1/readiness", requireAuth, requireRole(...VIEW), async (req, res) => {
  try { res.json(await getExecutiveReadiness(req.tenantId!)); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Obsidian
router.post("/v1/obsidian/export/:updateId", requireAuth, requireRole(...ADMIN), async (req, res) => {
  try { res.json(await exportUpdateToObsidian(req.params.updateId, req.user?.name ?? "unknown")); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/obsidian/exports", requireAuth, requireRole(...VIEW), async (_req, res) => {
  try { res.json({ exports: await listExports() }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/obsidian/exports/:id/content", requireAuth, requireRole(...VIEW), async (req, res) => {
  try {
    const content = await getExportContent(req.params.id);
    if (!content) return res.status(404).json({ error: "Export not found" });
    res.json({ content });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/obsidian/exports/:id", requireAuth, requireRole(...VIEW), async (req, res) => {
  try {
    const exp = await getExportById(req.params.id);
    if (!exp) return res.status(404).json({ error: "Export not found" });
    res.json(exp);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// OODA
router.get("/v1/ooda/cycles", requireAuth, requireRole(...VIEW), async (_req, res) => {
  try { res.json({ cycles: await getActiveCycles() }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/ooda/cycles/:entityType/:entityId", requireAuth, requireRole(...VIEW), async (req, res) => {
  try {
    const cycle = await getCycle(req.params.entityType, req.params.entityId);
    if (!cycle) return res.status(404).json({ error: "No OODA cycle found" });
    res.json(cycle);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Deep Command Center
router.get("/v1/command-center", requireAuth, requireRole(...VIEW), async (req, res) => {
  try { res.json(await getCommandCenterData(req.tenantId!)); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// OODA Orchestration
router.get("/v1/ooda/regulatory/:updateId", requireAuth, requireRole(...VIEW), async (req, res) => {
  try { res.json(await runRegulatoryOoda(req.params.updateId, req.tenantId!)); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/ooda/case/:workerId", requireAuth, requireRole(...VIEW), async (req, res) => {
  try { res.json(await runCaseOoda(req.params.workerId, req.tenantId!)); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Human Override
router.post("/v1/overrides", requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const { entityType, entityId, fieldChanged, valueBefore, valueAfter, reason, aiRecommendation } = req.body;
    if (!entityType || !entityId || !fieldChanged) return res.status(400).json({ error: "entityType, entityId, fieldChanged required" });
    await recordOverride(entityType, entityId, fieldChanged, valueBefore ?? "", valueAfter ?? "", reason ?? "", req.user?.name ?? "unknown", aiRecommendation);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/overrides/:entityId", requireAuth, requireRole(...VIEW), async (req, res) => {
  try { res.json({ overrides: await getOverrides(req.params.entityId) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Full Entity Timeline (audit + OODA + overrides merged)
router.get("/v1/timeline/:entityId", requireAuth, requireRole(...VIEW), async (req, res) => {
  try { res.json({ events: await getFullEntityTimeline(req.params.entityId) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
