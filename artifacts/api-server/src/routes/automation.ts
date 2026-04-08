import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { queryOne, execute } from "../lib/db.js";
import { runAutomationCycle, getAutomationRuns, getAutomationLogs, getRecentAutomationForWorker, type AutomationMode } from "../services/automation-engine.service.js";

const router = Router();

const VALID_MODES = ["disabled", "dry_run", "enabled"] as const;

// GET /api/v1/automation/mode — get tenant automation mode
router.get("/v1/automation/mode", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const tenant = await queryOne<any>("SELECT automation_mode FROM tenants WHERE id = $1", [req.tenantId!]);
    res.json({ mode: tenant?.automation_mode ?? "disabled" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/automation/mode — set tenant automation mode
router.post("/v1/automation/mode", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const { mode } = req.body as { mode?: string };
    if (!mode || !VALID_MODES.includes(mode as any)) {
      return res.status(400).json({ error: `mode must be: ${VALID_MODES.join(", ")}` });
    }
    await execute("UPDATE tenants SET automation_mode = $1 WHERE id = $2", [mode, req.tenantId!]);
    res.json({ mode, message: `Automation mode set to ${mode}` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/automation/run — trigger automation cycle
router.post("/v1/automation/run", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const { mode } = req.body as { mode?: string };
    const automationMode: AutomationMode = mode === "live" ? "live" : "dry_run";
    const result = await runAutomationCycle(req.tenantId!, automationMode);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Automation failed" });
  }
});

// GET /api/v1/automation/runs — list recent runs
router.get("/v1/automation/runs", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const runs = await getAutomationRuns(req.tenantId!);
    res.json({ runs, count: runs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/automation/runs/:id/logs — logs for a run
router.get("/v1/automation/runs/:id/logs", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const logs = await getAutomationLogs(req.params.id as string, req.tenantId!);
    res.json({ logs, count: logs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/automation/worker/:id — recent automation for a worker
router.get("/v1/automation/worker/:id", requireAuth, async (req, res) => {
  try {
    const logs = await getRecentAutomationForWorker(req.params.id as string, req.tenantId!);
    res.json({ logs, count: logs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
