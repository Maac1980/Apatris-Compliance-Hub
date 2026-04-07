import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { runDailyLegalScan, getAlerts, getAlertsByWorker, markAlertRead } from "../services/daily-legal-scan.service.js";

const router = Router();

// GET /api/v1/legal/alerts — list recent alerts
router.get("/v1/legal/alerts", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const alerts = await getAlerts(req.tenantId!);
    res.json({ alerts, count: alerts.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch alerts" });
  }
});

// GET /api/v1/legal/alerts/:workerId — alerts for a specific worker
router.get("/v1/legal/alerts/:workerId", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const alerts = await getAlertsByWorker(req.params.workerId as string, req.tenantId!);
    res.json({ alerts, count: alerts.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch worker alerts" });
  }
});

// POST /api/v1/legal/alerts/:id/read — mark alert as read
router.post("/v1/legal/alerts/:id/read", requireAuth, async (req, res) => {
  try {
    await markAlertRead(req.params.id as string, req.tenantId!);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/legal/scan/run — manual trigger for testing
router.post("/v1/legal/scan/run", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const result = await runDailyLegalScan(req.tenantId!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Scan failed" });
  }
});

export default router;
