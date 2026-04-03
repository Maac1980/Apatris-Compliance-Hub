import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// Helper: resolve worker from JWT user (by email or name)
async function resolveWorker(req: any): Promise<Record<string, any> | null> {
  const email = req.user?.email;
  const name = req.user?.name;
  const tenantId = req.tenantId;
  if (email) {
    const w = await queryOne("SELECT * FROM workers WHERE email = $1 AND tenant_id = $2 LIMIT 1", [email, tenantId]);
    if (w) return w as Record<string, any>;
  }
  if (name) {
    const w = await queryOne("SELECT * FROM workers WHERE full_name = $1 AND tenant_id = $2 LIMIT 1", [name, tenantId]);
    if (w) return w as Record<string, any>;
  }
  return null;
}

// GET /api/self-service/profile
router.get("/self-service/profile", requireAuth, async (req, res) => {
  try {
    const worker = await resolveWorker(req);
    if (!worker) return res.status(404).json({ error: "Worker profile not found" });
    // Return safe fields only
    const { id, full_name, email, phone, specialization, assigned_site, pesel, iban, hourly_rate, monthly_hours, trc_expiry, passport_expiry, bhp_expiry, work_permit_expiry, contract_end_date, medical_exam_expiry } = worker;
    res.json({ profile: { id, full_name, email, phone, specialization, assigned_site, pesel, iban, hourly_rate, monthly_hours, trc_expiry, passport_expiry, bhp_expiry, work_permit_expiry, contract_end_date, medical_exam_expiry } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/self-service/profile — update own phone, address, bank
router.patch("/self-service/profile", requireAuth, async (req, res) => {
  try {
    const worker = await resolveWorker(req);
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    const body = req.body as Record<string, unknown>;
    const allowed: Record<string, string> = { phone: "phone", email: "email", iban: "iban" };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(allowed)) {
      if (body[key] !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(body[key]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update (allowed: phone, email, iban)" });
    sets.push("updated_at = NOW()");
    vals.push(worker.id);
    const row = await queryOne(`UPDATE workers SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id, full_name, email, phone, iban`, vals);
    res.json({ profile: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/self-service/payslips
router.get("/self-service/payslips", requireAuth, async (req, res) => {
  try {
    const worker = await resolveWorker(req);
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    const rows = await query(
      "SELECT * FROM payroll_snapshots WHERE worker_id = $1 ORDER BY month_year DESC LIMIT 24",
      [worker.id]
    );
    res.json({ payslips: rows });
  } catch (err) {
    // Table may not have data yet
    res.json({ payslips: [] });
  }
});

// GET /api/self-service/documents
router.get("/self-service/documents", requireAuth, async (req, res) => {
  try {
    const worker = await resolveWorker(req);
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const [contracts, permits, workflows, signatures] = await Promise.all([
      query("SELECT id, title, contract_type, status, created_at FROM contracts WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC", [worker.id, req.tenantId!]).catch(() => []),
      query("SELECT id, permit_type, country, expiry_date, status FROM immigration_permits WHERE worker_id = $1 AND tenant_id = $2 ORDER BY expiry_date DESC", [worker.id, req.tenantId!]).catch(() => []),
      query("SELECT id, document_type, status, uploaded_at FROM document_workflows WHERE worker_id = $1 AND tenant_id = $2 ORDER BY uploaded_at DESC", [worker.id, req.tenantId!]).catch(() => []),
      query("SELECT id, contract_id, status, signed_at FROM certified_signatures WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC", [worker.id, req.tenantId!]).catch(() => []),
    ]);
    res.json({ contracts, permits, workflows, signatures });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/self-service/shifts
router.get("/self-service/shifts", requireAuth, async (req, res) => {
  try {
    const worker = await resolveWorker(req);
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    const rows = await query(
      "SELECT * FROM shift_assignments WHERE worker_id = $1 AND shift_date >= CURRENT_DATE ORDER BY shift_date ASC LIMIT 30",
      [worker.id]
    ).catch(() => []);
    res.json({ shifts: rows });
  } catch (err) {
    res.json({ shifts: [] });
  }
});

// POST /api/self-service/leave — submit leave request
router.post("/self-service/leave", requireAuth, async (req, res) => {
  try {
    const worker = await resolveWorker(req);
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    const { leaveType, startDate, endDate, reason } = req.body as {
      leaveType?: string; startDate?: string; endDate?: string; reason?: string;
    };
    if (!startDate || !endDate) return res.status(400).json({ error: "startDate and endDate required" });

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1);

    const row = await queryOne(
      `INSERT INTO leave_requests (tenant_id, worker_id, worker_name, leave_type, start_date, end_date, days, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId!, worker.id, worker.full_name, leaveType || "annual", startDate, endDate, days, reason ?? null]
    );
    res.status(201).json({ leave: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/self-service/leave — own leave history
router.get("/self-service/leave", requireAuth, async (req, res) => {
  try {
    const worker = await resolveWorker(req);
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    const rows = await query(
      "SELECT * FROM leave_requests WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [worker.id, req.tenantId!]
    );
    res.json({ leaves: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/self-service/advances — own advance history
router.get("/self-service/advances", requireAuth, async (req, res) => {
  try {
    const worker = await resolveWorker(req);
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    const rows = await query(
      "SELECT * FROM salary_advances WHERE worker_id = $1 AND tenant_id = $2 ORDER BY requested_at DESC",
      [worker.id, req.tenantId!]
    );
    res.json({ advances: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/leave — all leave requests (managers)
router.get("/leave", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM leave_requests WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId!]
    );
    res.json({ leaves: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/leave/:id — approve/reject
router.patch("/leave/:id", requireAuth, async (req, res) => {
  try {
    const { status } = req.body as { status?: string };
    if (!status || !["approved", "rejected"].includes(status)) return res.status(400).json({ error: "status: approved/rejected" });
    const row = await queryOne(
      "UPDATE leave_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3 AND tenant_id = $4 RETURNING *",
      [status, (req as any).user?.email || "admin", req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ leave: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
