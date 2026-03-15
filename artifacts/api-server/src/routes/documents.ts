import { Router } from "express";
import {
  ensureDocumentsTable,
  fetchDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
} from "../lib/airtable-documents.js";
import { triggerScanNow, alertLog } from "../lib/scheduler.js";

const router = Router();

// GET /api/documents
// Returns all documents with compliance status. Auto-creates table on first call.
router.get("/documents", async (_req, res) => {
  try {
    await ensureDocumentsTable();
    const documents = await fetchDocuments();
    const summary = {
      total: documents.length,
      green: documents.filter((d) => d.status === "GREEN").length,
      yellow: documents.filter((d) => d.status === "YELLOW").length,
      red: documents.filter((d) => d.status === "RED").length,
      expired: documents.filter((d) => d.status === "EXPIRED").length,
    };
    return res.json({ documents, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch documents";
    return res.status(500).json({ error: message });
  }
});

// GET /api/documents/alerts
// Returns only documents in YELLOW, RED, or EXPIRED zones.
router.get("/documents/alerts", async (_req, res) => {
  try {
    await ensureDocumentsTable();
    const all = await fetchDocuments();
    const alerts = all.filter((d) => d.status !== "GREEN");
    return res.json({ alerts, count: alerts.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch alerts";
    return res.status(500).json({ error: message });
  }
});

// GET /api/documents/scan
// Manually triggers the daily compliance scan and returns the recent alert log.
router.get("/documents/scan", async (_req, res) => {
  try {
    const log = await triggerScanNow();
    return res.json({ triggered: true, recentAlerts: log });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return res.status(500).json({ error: message });
  }
});

// GET /api/documents/log
// Returns the in-memory alert log from all scans this session.
router.get("/documents/log", (_req, res) => {
  return res.json({ log: alertLog });
});

// POST /api/documents
// Creates a new document record.
router.post("/documents", async (req, res) => {
  try {
    const { workerName, workerId, documentType, issueDate, expiryDate } = req.body as {
      workerName?: string;
      workerId?: string;
      documentType?: string;
      issueDate?: string;
      expiryDate?: string;
    };

    if (!workerName || !documentType || !expiryDate) {
      return res.status(400).json({ error: "workerName, documentType, and expiryDate are required" });
    }

    const doc = await createDocument({ workerName, workerId, documentType, issueDate, expiryDate });
    return res.status(201).json({ document: doc });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create document";
    return res.status(500).json({ error: message });
  }
});

// PATCH /api/documents/:id
router.patch("/documents/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body as {
      workerName?: string;
      workerId?: string;
      documentType?: string;
      issueDate?: string;
      expiryDate?: string;
    };
    const doc = await updateDocument(id, fields);
    return res.json({ document: doc });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update document";
    return res.status(500).json({ error: message });
  }
});

// DELETE /api/documents/:id
router.delete("/documents/:id", async (req, res) => {
  try {
    await deleteDocument(req.params.id);
    return res.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete document";
    return res.status(500).json({ error: message });
  }
});

export default router;
