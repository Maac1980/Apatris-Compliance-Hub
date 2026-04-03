import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";

const router = Router();

// POST /api/advances — worker submits request
router.post("/advances", requireAuth, async (req, res) => {
  try {
    const { workerId, workerName, amountRequested, reason } = req.body as {
      workerId?: string; workerName?: string; amountRequested?: number; reason?: string;
    };
    if (!workerId || !workerName || !amountRequested || amountRequested <= 0) {
      return res.status(400).json({ error: "workerId, workerName, and amountRequested (>0) required" });
    }

    // Check max 50% of earned (rough estimate: hourly_rate × monthly_hours × 0.5)
    const worker = await queryOne<Record<string, any>>(
      "SELECT hourly_rate, monthly_hours FROM workers WHERE id = $1",
      [workerId]
    );
    if (worker) {
      const maxAdvance = (Number(worker.hourly_rate) || 0) * (Number(worker.monthly_hours) || 0) * 0.5;
      if (maxAdvance > 0 && amountRequested > maxAdvance) {
        return res.status(400).json({ error: `Max advance is 50% of earned: ${maxAdvance.toFixed(2)} PLN` });
      }
    }

    // Check no pending request exists
    const pending = await queryOne(
      "SELECT id FROM salary_advances WHERE worker_id = $1 AND status = 'pending' AND tenant_id = $2",
      [workerId, req.tenantId!]
    );
    if (pending) return res.status(409).json({ error: "A pending request already exists" });

    const row = await queryOne(
      `INSERT INTO salary_advances (tenant_id, worker_id, worker_name, amount_requested, reason)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.tenantId!, workerId, workerName, amountRequested, reason ?? null]
    );
    res.status(201).json({ advance: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/advances — all requests
router.get("/advances", requireAuth, async (req, res) => {
  try {
    const { status } = req.query as Record<string, string>;
    let sql = "SELECT * FROM salary_advances WHERE tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    sql += " ORDER BY requested_at DESC";
    const rows = await query(sql, params);
    res.json({ advances: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/advances/worker/:workerId — individual history
router.get("/advances/worker/:workerId", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM salary_advances WHERE worker_id = $1 AND tenant_id = $2 ORDER BY requested_at DESC",
      [req.params.workerId, req.tenantId!]
    );
    res.json({ advances: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/advances/:id — approve or reject
router.patch("/advances/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps"), async (req, res) => {
  try {
    const { status, notes } = req.body as { status?: string; notes?: string };
    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }

    const reviewerEmail = (req as any).user?.email ?? "admin";

    // Calculate next payroll month for deduction
    const now = new Date();
    let dedMonth = now.getMonth() + 2; // next month (1-indexed)
    let dedYear = now.getFullYear();
    if (dedMonth > 12) { dedMonth = 1; dedYear++; }

    const sets = [
      "status = $1", "reviewed_by = $2", "reviewed_at = NOW()", "notes = $3",
    ];
    const vals: unknown[] = [status, reviewerEmail, notes ?? null];

    if (status === "approved") {
      sets.push(`deduction_month = $${vals.length + 1}`, `deduction_year = $${vals.length + 2}`);
      vals.push(dedMonth, dedYear);
    }

    vals.push(req.params.id, req.tenantId!);
    const idx = vals.length;
    const row = await queryOne<Record<string, any>>(
      `UPDATE salary_advances SET ${sets.join(", ")} WHERE id = $${idx - 1} AND tenant_id = $${idx} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Advance not found" });

    // If approved — update worker's advance field for next payroll
    if (status === "approved") {
      try {
        await execute(
          "UPDATE workers SET advance = COALESCE(advance, 0) + $1 WHERE id = $2",
          [row.amount_requested, row.worker_id]
        );
      } catch { /* non-blocking */ }
    }

    // WhatsApp notify worker
    try {
      const worker = await queryOne<Record<string, any>>(
        "SELECT phone, full_name FROM workers WHERE id = $1", [row.worker_id]
      );
      if (worker?.phone) {
        const msg = status === "approved"
          ? `Your salary advance of ${Number(row.amount_requested).toFixed(2)} PLN has been APPROVED. It will be deducted from your ${dedMonth}/${dedYear} payroll.`
          : `Your salary advance request of ${Number(row.amount_requested).toFixed(2)} PLN has been REJECTED.${notes ? " Reason: " + notes : ""}`;
        await sendWhatsAppAlert({
          to: worker.phone,
          workerName: worker.full_name,
          workerI: row.worker_id,
          permitType: msg,
          daysRemaining: 0,
          tenantId: req.tenantId!,
        });
      }
    } catch { /* non-blocking */ }

    res.json({ advance: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
