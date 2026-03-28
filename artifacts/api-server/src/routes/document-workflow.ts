import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import {
  uploadDocument,
  submitForReview,
  approveDocument,
  rejectDocument,
  requestResubmission,
  getWorkflowsByWorker,
  getWorkflowById,
  getPendingReviews,
  getWorkflowStats,
  getExpiringDocuments,
} from "../lib/document-workflow.js";
import { fetchWorkerById } from "../lib/workers-db.js";
import { logGdprAction } from "../lib/gdpr.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();

// ── Upload a document ──────────────────────────────────────────────────────
// POST /api/workflows/upload
router.post(
  "/workflows/upload",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const { workerId, documentType, expiryDate } = req.body as {
        workerId?: string; documentType?: string; expiryDate?: string;
      };

      if (!workerId || !documentType) {
        return res.status(400).json({ error: "workerId and documentType are required" });
      }

      const worker = await fetchWorkerById(workerId, req.tenantId!);
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      const doc = await uploadDocument({
        tenantId: req.tenantId!,
        workerId,
        workerName: worker.full_name,
        documentType,
        expiryDate,
        uploadedBy: req.user!.name,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
      });

      await logGdprAction({
        tenantId: req.tenantId!,
        action: "DOCUMENT_UPLOAD",
        targetType: "document_workflow",
        targetId: doc.id,
        targetName: `${worker.full_name} - ${documentType}`,
        performedBy: req.user!.name,
        details: { fileName: req.file.originalname, fileSize: req.file.size, version: doc.version },
      });

      res.status(201).json({ document: doc });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
    }
  }
);

// ── Submit for review ──────────────────────────────────────────────────────
// POST /api/workflows/:id/submit
router.post("/workflows/:id/submit", requireAuth, async (req, res) => {
  try {
    const doc = await submitForReview(req.params.id, req.tenantId!);
    res.json({ document: doc });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Submit failed" });
  }
});

// ── Approve ────────────────────────────────────────────────────────────────
// POST /api/workflows/:id/approve
router.post(
  "/workflows/:id/approve",
  requireAuth,
  requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"),
  async (req, res) => {
    try {
      const { comment } = req.body as { comment?: string };
      const doc = await approveDocument({
        docId: req.params.id,
        tenantId: req.tenantId!,
        reviewerName: req.user!.name,
        comment,
      });
      res.json({ document: doc });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Approval failed" });
    }
  }
);

// ── Reject ─────────────────────────────────────────────────────────────────
// POST /api/workflows/:id/reject
router.post(
  "/workflows/:id/reject",
  requireAuth,
  requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"),
  async (req, res) => {
    try {
      const { reason } = req.body as { reason?: string };
      if (!reason) {
        return res.status(400).json({ error: "Rejection reason is required" });
      }
      const doc = await rejectDocument({
        docId: req.params.id,
        tenantId: req.tenantId!,
        reviewerName: req.user!.name,
        reason,
      });
      res.json({ document: doc });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Rejection failed" });
    }
  }
);

// ── Request resubmission ───────────────────────────────────────────────────
// POST /api/workflows/:id/resubmit
router.post(
  "/workflows/:id/resubmit",
  requireAuth,
  requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"),
  async (req, res) => {
    try {
      const { reason } = req.body as { reason?: string };
      if (!reason) {
        return res.status(400).json({ error: "Reason for resubmission is required" });
      }
      const doc = await requestResubmission({
        docId: req.params.id,
        tenantId: req.tenantId!,
        reviewerName: req.user!.name,
        reason,
      });
      res.json({ document: doc });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Request failed" });
    }
  }
);

// ── Get document by ID ─────────────────────────────────────────────────────
// GET /api/workflows/:id
router.get("/workflows/:id", requireAuth, async (req, res) => {
  try {
    const doc = await getWorkflowById(req.params.id, req.tenantId!);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.json({ document: doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Fetch failed" });
  }
});

// ── Get all documents for a worker ─────────────────────────────────────────
// GET /api/workflows/worker/:workerId
router.get("/workflows/worker/:workerId", requireAuth, async (req, res) => {
  try {
    const docs = await getWorkflowsByWorker(req.params.workerId, req.tenantId!);
    res.json({ documents: docs, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Fetch failed" });
  }
});

// ── Pending review queue ───────────────────────────────────────────────────
// GET /api/workflows/queue/pending
router.get(
  "/workflows/queue/pending",
  requireAuth,
  requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"),
  async (req, res) => {
    try {
      const docs = await getPendingReviews(req.tenantId!);
      res.json({ documents: docs, count: docs.length });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Fetch failed" });
    }
  }
);

// ── Workflow statistics ────────────────────────────────────────────────────
// GET /api/workflows/stats
router.get("/workflows/stats", requireAuth, async (req, res) => {
  try {
    const stats = await getWorkflowStats(req.tenantId!);
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Fetch failed" });
  }
});

// ── Expiring approved documents ────────────────────────────────────────────
// GET /api/workflows/expiring
router.get("/workflows/expiring", requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 60, 365);
    const docs = await getExpiringDocuments(req.tenantId!, days);
    res.json({ documents: docs, count: docs.length, daysAhead: days });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Fetch failed" });
  }
});

export default router;
