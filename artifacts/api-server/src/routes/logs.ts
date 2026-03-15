import { Router } from "express";
import { getNotifLog } from "../lib/notif-log.js";
import { getAuditLog } from "../lib/audit-log.js";
import { getSnapshots, saveSnapshot } from "../lib/snapshot.js";
import { fetchAllRecords } from "../lib/airtable.js";
import { mapRecordToWorker } from "../lib/compliance.js";

const router = Router();

router.get("/notifications/history", (_req, res) => {
  try {
    res.json({ entries: getNotifLog(200) });
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

router.get("/compliance/trend", (_req, res) => {
  try {
    res.json({ snapshots: getSnapshots(30) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load trend data" });
  }
});

router.post("/compliance/snapshot", async (_req, res) => {
  try {
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker);
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
    saveSnapshot(snap);
    res.json({ ok: true, snapshot: snap });
  } catch (err) {
    res.status(500).json({ error: "Failed to save snapshot" });
  }
});

export default router;
