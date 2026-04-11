/**
 * Notifications + Snapshots + Health — Stages 7-9
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { getNotifications, getUnreadCount, markRead } from "../services/notification.service.js";
import { getSnapshots, getLatestSnapshot, createDailySnapshot } from "../services/regulatory-snapshot.service.js";
import { getSystemHealth } from "../services/system-hardening.service.js";

const router = Router();

// Notifications
router.get("/v1/notifications", requireAuth, async (req, res) => {
  try {
    const role = (req as any).user?.role ?? "Admin";
    res.json({ notifications: await getNotifications(undefined, role) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/notifications/unread-count", requireAuth, async (req, res) => {
  try {
    const role = (req as any).user?.role ?? "Admin";
    res.json({ count: await getUnreadCount(role) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/notifications/:id/read", requireAuth, async (req, res) => {
  try { await markRead(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Regulatory Snapshots
router.get("/v1/regulatory/snapshots", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"), async (req, res) => {
  try {
    const days = parseInt(String(req.query.days ?? "30"));
    res.json({ snapshots: await getSnapshots(days) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/v1/regulatory/snapshots/latest", requireAuth, async (_req, res) => {
  try { res.json(await getLatestSnapshot() ?? {}); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/regulatory/snapshots/create", requireAuth, requireRole("Admin"), async (_req, res) => {
  try { res.json(await createDailySnapshot()); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// System Health (Stage 9)
router.get("/v1/system/health", requireAuth, async (_req, res) => {
  try { res.json(await getSystemHealth()); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
