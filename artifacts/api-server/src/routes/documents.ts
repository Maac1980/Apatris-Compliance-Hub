import { Router } from "express";
import {
  fetchDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
} from "../lib/documents-db.js";
import { triggerScanNow, alertLog, fireAlertForDocument } from "../lib/scheduler.js";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { validateBody, CreateDocumentSchema } from "../lib/validate.js";
import { appendAuditLog } from "../lib/audit-log.js";

const router = Router();

// GET /api/documents
// Returns all documents with compliance status. Auto-creates table on first call.
router.get("/documents", requireAuth, async (req, res) => {
  try {
    const documents = await fetchDocuments(req.tenantId!);
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
router.get("/documents/alerts", requireAuth, async (req, res) => {
  try {
    const all = await fetchDocuments(req.tenantId!);
    const alerts = all.filter((d) => d.status !== "GREEN");
    return res.json({ alerts, count: alerts.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch alerts";
    return res.status(500).json({ error: message });
  }
});

// GET /api/documents/scan
// Manually triggers the daily compliance scan and returns the recent alert log.
router.get("/documents/scan", requireAuth, async (_req, res) => {
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
router.get("/documents/log", requireAuth, (_req, res) => {
  return res.json({ log: alertLog });
});

// POST /api/documents
// Creates a new document record and immediately fires an alert if it is in warning/critical zone.
router.post("/documents", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"), validateBody(CreateDocumentSchema), async (req, res) => {
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

    const doc = await createDocument({ workerName, workerId, documentType, issueDate, expiryDate }, req.tenantId!);

    // Fire alert immediately — don't wait for the daily scan
    const needsAlert = doc.status === "RED" || doc.status === "YELLOW" || doc.status === "EXPIRED";
    if (needsAlert) {
      fireAlertForDocument(doc).catch((e) =>
        console.error("[Alert] Immediate alert failed:", e)
      );
    }

    appendAuditLog({ timestamp: new Date().toISOString(), actor: req.user?.name ?? "unknown", actorEmail: req.user?.email ?? "", action: "DOCUMENT_CREATE", workerId: workerId ?? "", workerName: workerName!, note: `${documentType} created, expires ${expiryDate}` });
    return res.status(201).json({ document: doc, alertFired: needsAlert });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create document";
    return res.status(500).json({ error: message });
  }
});

// PATCH /api/documents/:id
router.patch("/documents/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"), async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body as {
      workerName?: string;
      workerId?: string;
      documentType?: string;
      issueDate?: string;
      expiryDate?: string;
    };
    const doc = await updateDocument(id, fields, req.tenantId!);

    // Fire alert immediately if updated document is now in warning/critical zone
    const needsAlert = doc.status === "RED" || doc.status === "YELLOW" || doc.status === "EXPIRED";
    if (needsAlert) {
      fireAlertForDocument(doc).catch((e) =>
        console.error("[Alert] Immediate alert failed:", e)
      );
    }

    appendAuditLog({ timestamp: new Date().toISOString(), actor: req.user?.name ?? "unknown", actorEmail: req.user?.email ?? "", action: "DOCUMENT_UPDATE", workerId: id, workerName: doc.workerName ?? "", note: `Document updated: ${Object.keys(fields).join(", ")}` });
    return res.json({ document: doc, alertFired: needsAlert });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update document";
    return res.status(500).json({ error: message });
  }
});

// DELETE /api/documents/:id
router.delete("/documents/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    await deleteDocument(req.params.id, req.tenantId!);
    appendAuditLog({ timestamp: new Date().toISOString(), actor: req.user?.name ?? "unknown", actorEmail: req.user?.email ?? "", action: "DOCUMENT_DELETE", workerId: req.params.id, workerName: "—", note: "Document deleted" });
    return res.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete document";
    return res.status(500).json({ error: message });
  }
});

export default router;
