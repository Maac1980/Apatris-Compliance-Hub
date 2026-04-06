import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import {
  createCase, updateCaseStatus, getCasesByWorker, getActiveCases, getUrgencyQueue,
  type CaseType, type CaseStatus,
} from "../services/legal-case.service.js";

const router = Router();

const VALID_TYPES: CaseType[] = ["TRC", "APPEAL", "PR", "CITIZENSHIP"];
const VALID_STATUSES: CaseStatus[] = ["NEW", "PENDING", "REJECTED", "APPROVED"];

// GET /api/v1/legal/cases — list all active cases for tenant
router.get("/v1/legal/cases", requireAuth, async (req, res) => {
  try {
    const cases = await getActiveCases(req.tenantId!);
    res.json({ cases, count: cases.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch cases" });
  }
});

// GET /api/v1/legal/cases/queue — urgency queue sorted by deadline
router.get("/v1/legal/cases/queue", requireAuth, async (req, res) => {
  try {
    const cases = await getUrgencyQueue(req.tenantId!);
    res.json({ cases, count: cases.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch urgency queue" });
  }
});

// GET /api/v1/legal/cases/:workerId — cases for a specific worker
router.get("/v1/legal/cases/:workerId", requireAuth, async (req, res) => {
  try {
    const cases = await getCasesByWorker(req.params.workerId as string, req.tenantId!);
    res.json({ cases, count: cases.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch worker cases" });
  }
});

// POST /api/v1/legal/cases — create a new legal case
router.post("/v1/legal/cases", requireAuth, async (req, res) => {
  try {
    const { workerId, caseType, notes } = req.body as {
      workerId?: string; caseType?: string; notes?: string;
    };
    if (!workerId) return res.status(400).json({ error: "workerId is required" });
    if (!caseType || !VALID_TYPES.includes(caseType as CaseType)) {
      return res.status(400).json({ error: `caseType must be one of: ${VALID_TYPES.join(", ")}` });
    }

    const legalCase = await createCase(workerId, req.tenantId!, caseType as CaseType, notes);
    res.status(201).json({ case: legalCase });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create case" });
  }
});

// PATCH /api/v1/legal/cases/:id — update case status
router.patch("/v1/legal/cases/:id", requireAuth, async (req, res) => {
  try {
    const { status } = req.body as { status?: string };
    if (!status || !VALID_STATUSES.includes(status as CaseStatus)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    const updated = await updateCaseStatus(req.params.id as string, req.tenantId!, status as CaseStatus);
    res.json({ case: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update case" });
  }
});

export default router;
