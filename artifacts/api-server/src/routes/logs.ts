import { Router } from "express";
import { query } from "../lib/db.js";
import { getAuditLog } from "../lib/audit-log.js";
import { getSnapshots, saveSnapshot } from "../lib/snapshots-db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";

const router = Router();

router.get("/notifications/history", async (_req, res) => {
  try {
    const entries = await query(
      `SELECT * FROM notification_log ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: "Failed to load notification history" });
  }
});

router.get("/audit-log", (_req, res) => {
  try {
    res.json({ entries: getAuditLog(200) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load audit log" });
  }
});

router.get("/compliance/trend", async (_req, res) => {
  try {
    res.json({ snapshots: await getSnapshots(30) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load trend data" });
  }
});

router.post("/compliance/snapshot", async (_req, res) => {
  try {
    const rows = await fetchAllWorkers();
    const workers = rows.map(mapRowToWorker);
    const total = workers.length;
    const critical = workers.filter((w) => w.complianceStatus === "critical").length;
    const warning = workers.filter((w) => w.complianceStatus === "warning").length;
    const expired = workers.filter((w) => w.complianceStatus === "non-compliant").length;
    const compliant = Math.max(0, total - critical - warning - expired);
    const snap = {
      date: new Date().toISOString().slice(0, 10),
      total,
      compliant,
      warning,
      critical,
      expired,
    };
    await saveSnapshot(snap);
    res.json({ ok: true, snapshot: snap });
  } catch (err) {
    res.status(500).json({ error: "Failed to save snapshot" });
  }
});

export default router;
