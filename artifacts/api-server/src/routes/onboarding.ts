import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

const DEFAULT_STEPS = [
  { step_order: 1,  step_name: "Personal details verified",         required_document: null },
  { step_order: 2,  step_name: "Passport copy collected",           required_document: "Passport" },
  { step_order: 3,  step_name: "Work permit / visa copy collected", required_document: "Work Permit" },
  { step_order: 4,  step_name: "ZUS registration triggered",        required_document: null },
  { step_order: 5,  step_name: "Contract signed",                   required_document: "Contract" },
  { step_order: 6,  step_name: "Bank details collected",            required_document: null },
  { step_order: 7,  step_name: "Site safety induction completed",   required_document: "BHP Certificate" },
  { step_order: 8,  step_name: "WhatsApp number verified",          required_document: null },
  { step_order: 9,  step_name: "Face ID enrolled",                  required_document: null },
  { step_order: 10, step_name: "First shift assigned",              required_document: null },
];

// GET /api/onboarding — all workers with progress summary
router.get("/onboarding", requireAuth, async (req, res) => {
  try {
    const rows = await query<Record<string, any>>(
      `SELECT oc.worker_id, oc.worker_name,
              COUNT(*) AS total_steps,
              COUNT(*) FILTER (WHERE oc.status = 'completed') AS completed_steps
       FROM onboarding_checklists oc
       WHERE oc.tenant_id = $1
       GROUP BY oc.worker_id, oc.worker_name
       ORDER BY oc.worker_name ASC`,
      [req.tenantId!]
    );
    const workers = rows.map(r => ({
      worker_id: r.worker_id,
      worker_name: r.worker_name,
      total_steps: Number(r.total_steps),
      completed_steps: Number(r.completed_steps),
      progress: r.total_steps > 0 ? Math.round((Number(r.completed_steps) / Number(r.total_steps)) * 100) : 0,
    }));
    res.json({ workers, count: workers.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch onboarding" });
  }
});

// POST /api/onboarding — initialize checklist for a worker
router.post("/onboarding", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps"), async (req, res) => {
  try {
    const { workerId, workerName } = req.body as { workerId?: string; workerName?: string };
    if (!workerId || !workerName) {
      return res.status(400).json({ error: "workerId and workerName are required" });
    }

    // Check if already initialized
    const existing = await query(
      "SELECT id FROM onboarding_checklists WHERE worker_id = $1 AND tenant_id = $2 LIMIT 1",
      [workerId, req.tenantId!]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Onboarding already initialized for this worker" });
    }

    for (const step of DEFAULT_STEPS) {
      await execute(
        `INSERT INTO onboarding_checklists (tenant_id, worker_id, worker_name, step_name, step_order, status, required_document)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [req.tenantId!, workerId, workerName, step.step_name, step.step_order, step.required_document]
      );
    }

    const steps = await query(
      "SELECT * FROM onboarding_checklists WHERE worker_id = $1 AND tenant_id = $2 ORDER BY step_order",
      [workerId, req.tenantId!]
    );
    res.status(201).json({ steps, count: steps.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to initialize onboarding" });
  }
});

// GET /api/onboarding/:workerId — get all steps for a worker
router.get("/onboarding/:workerId", requireAuth, async (req, res) => {
  try {
    const steps = await query(
      "SELECT * FROM onboarding_checklists WHERE worker_id = $1 AND tenant_id = $2 ORDER BY step_order",
      [req.params.workerId, req.tenantId!]
    );
    if (steps.length === 0) {
      return res.status(404).json({ error: "No onboarding found for this worker" });
    }
    const completed = steps.filter((s: any) => s.status === "completed").length;
    const progress = Math.round((completed / steps.length) * 100);
    res.json({ steps, total: steps.length, completed, progress });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch steps" });
  }
});

// PATCH /api/onboarding/:workerId — update step(s)
router.patch("/onboarding/:workerId", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"), async (req, res) => {
  try {
    const { stepId, status, notes } = req.body as { stepId?: string; status?: string; notes?: string };
    if (!stepId) return res.status(400).json({ error: "stepId is required" });

    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (status) {
      sets.push(`status = $${idx++}`);
      vals.push(status);
      if (status === "completed") {
        sets.push(`completed_at = NOW()`);
      } else {
        sets.push(`completed_at = NULL`);
      }
    }
    if (notes !== undefined) { sets.push(`notes = $${idx++}`); vals.push(notes); }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });

    sets.push("updated_at = NOW()");
    vals.push(stepId, req.params.workerId, req.tenantId!);

    const row = await queryOne(
      `UPDATE onboarding_checklists SET ${sets.join(", ")} WHERE id = $${idx} AND worker_id = $${idx + 1} AND tenant_id = $${idx + 2} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Step not found" });

    // Check if 100% complete — trigger ZUS notification
    const allSteps = await query<Record<string, any>>(
      "SELECT status FROM onboarding_checklists WHERE worker_id = $1 AND tenant_id = $2",
      [req.params.workerId, req.tenantId!]
    );
    const allCompleted = allSteps.every((s) => s.status === "completed");

    if (allCompleted) {
      // Log ZUS registration notification
      try {
        await execute(
          `INSERT INTO notification_log (channel, worker_id, worker_name, sent_by, recipient, message_preview, status, tenant_id)
           VALUES ('system', $1, $2, 'onboarding-complete', 'admin', 'Onboarding 100% complete — ZUS registration required', 'sent', $3)`,
          [req.params.workerId, (row as any).worker_name, req.tenantId!]
        );
      } catch { /* non-blocking */ }
    }

    res.json({ step: row, allCompleted });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

export default router;
