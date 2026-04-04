import { Router } from "express";
import { execute, query } from "../lib/db.js";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";

const router = Router();

// Table hours_log is created by init-db.ts at startup

// POST /hours — T5 submits their hours for a month
router.post("/hours", requireAuth, async (req, res) => {
  const { month, hours, note } = req.body as { month?: string; hours?: unknown; note?: string };

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: "month must be YYYY-MM format." });
  }
  const hoursNum = typeof hours === "number" ? hours : parseFloat(String(hours ?? ""));
  if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 744) {
    return res.status(400).json({ error: "hours must be a positive number up to 744." });
  }

  // Check if already submitted for that month
  const existing = await query<{ id: number }>(
    "SELECT id FROM hours_log WHERE worker_name = $1 AND month = $2",
    [req.user!.name, month]
  );
  if (existing.length > 0) {
    // Update instead of duplicate
    await execute(
      "UPDATE hours_log SET hours = $1, note = $2, status = 'submitted', updated_at = NOW() WHERE worker_name = $3 AND month = $4",
      [hoursNum, note ?? null, req.user!.name, month]
    );
    return res.json({ success: true, updated: true, message: "Hours updated." });
  }

  await execute(
    "INSERT INTO hours_log (worker_name, month, hours, note, status) VALUES ($1, $2, $3, $4, 'submitted')",
    [req.user!.name, month, hoursNum, note ?? null]
  );
  return res.json({ success: true, updated: false, message: "Hours submitted successfully." });
});

// GET /hours/my — T5 gets their own hours history
router.get("/hours/my", requireAuth, async (req, res) => {
  const rows = await query<{
    id: number; month: string; hours: string; note: string | null; status: string; submitted_at: string;
  }>(
    "SELECT id, month, hours, note, status, submitted_at FROM hours_log WHERE worker_name = $1 ORDER BY month DESC LIMIT 12",
    [req.user!.name]
  );
  return res.json({ entries: rows.map(r => ({ ...r, hours: parseFloat(r.hours) })) });
});

// GET /hours — T1–T4 view all hours
router.get("/hours", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"), async (req, res) => {
  const { month, worker } = req.query as { month?: string; worker?: string };
  let sql = "SELECT id, worker_name, month, hours, note, status, submitted_at FROM hours_log WHERE 1=1";
  const params: unknown[] = [];
  if (month) { params.push(month); sql += ` AND month = $${params.length}`; }
  if (worker) { params.push(`%${worker}%`); sql += ` AND worker_name ILIKE $${params.length}`; }
  sql += " ORDER BY month DESC, worker_name ASC LIMIT 200";

  const rows = await query<{
    id: number; worker_name: string; month: string; hours: string; note: string | null; status: string; submitted_at: string;
  }>(sql, params);
  return res.json({ entries: rows.map(r => ({ ...r, hours: parseFloat(r.hours) })) });
});

// PATCH /hours/:id/status — T1–T4 approve/reject
router.patch("/hours/:id/status", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"), async (req, res) => {
  const { status } = req.body as { status?: string };
  if (status !== "approved" && status !== "rejected") {
    return res.status(400).json({ error: "status must be 'approved' or 'rejected'." });
  }

  await execute(
    "UPDATE hours_log SET status = $1, updated_at = NOW() WHERE id = $2",
    [status, req.params.id]
  );
  return res.json({ success: true });
});

export default router;
