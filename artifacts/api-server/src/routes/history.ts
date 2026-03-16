import { Router } from "express";
import { query, queryOne, execute } from "../lib/db.js";
import { getAuditLog } from "../lib/audit-log.js";

const router = Router();

// ─── GET /history/audit ───────────────────────────────────────────────────────
router.get("/history/audit", async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query["limit"] || 200), 500);
    const action = req.query["action"] as string | undefined;
    const actor  = req.query["actor"]  as string | undefined;
    const entries = await getAuditLog(limit, action, actor);
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /history/commits ─────────────────────────────────────────────────────
router.get("/history/commits", async (_req, res) => {
  try {
    const commits = await query<{
      id: number; month: string; committed_at: string;
      committed_by: string; worker_count: number;
      total_gross: string; total_netto: string; payslips_sent: number;
    }>(
      `SELECT id, month, committed_at, committed_by, worker_count,
              total_gross, total_netto, payslips_sent
       FROM payroll_commits ORDER BY committed_at DESC`
    );
    res.json({ commits });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /history/commits/:id ─────────────────────────────────────────────────
router.get("/history/commits/:id", async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    const commit = await queryOne(
      `SELECT id, month, committed_at, committed_by, worker_count,
              total_gross, total_netto, payslips_sent
       FROM payroll_commits WHERE id = $1`,
      [id]
    );
    if (!commit) { res.status(404).json({ error: "Commit not found" }); return; }

    const snapshots = await query(
      `SELECT worker_id, worker_name, site, hours, hourly_rate, gross,
              employee_zus, health_ins, est_pit, advance, penalties, netto
       FROM payroll_snapshots WHERE commit_id = $1 ORDER BY worker_name`,
      [id]
    );
    res.json({ commit, snapshots });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /history/analytics ───────────────────────────────────────────────────
// Monthly totals for the last 12 months
router.get("/history/analytics", async (_req, res) => {
  try {
    const monthly = await query<{
      month: string; total_gross: string; total_netto: string;
      worker_count: number; commit_count: number;
    }>(
      `SELECT month,
              SUM(total_gross)   AS total_gross,
              SUM(total_netto)   AS total_netto,
              SUM(worker_count)  AS worker_count,
              COUNT(*)           AS commit_count
       FROM payroll_commits
       GROUP BY month ORDER BY month DESC LIMIT 12`
    );

    const topWorkers = await query<{
      worker_name: string; site: string; total_gross: string; months: number;
    }>(
      `SELECT worker_name, site,
              SUM(gross)  AS total_gross,
              COUNT(*)    AS months
       FROM payroll_snapshots
       GROUP BY worker_name, site
       ORDER BY total_gross DESC LIMIT 10`
    );

    const actionBreakdown = await query<{ action: string; count: string }>(
      `SELECT action, COUNT(*) AS count FROM audit_logs
       GROUP BY action ORDER BY count DESC`
    );

    res.json({ monthly: monthly.reverse(), topWorkers, actionBreakdown });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /history/notifications ───────────────────────────────────────────────
router.get("/history/notifications", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query["limit"] || 100), 300);
    const rows = await query(
      `SELECT id, sent_at, channel, worker_id, worker_name, sent_by,
              recipient, message_preview, status
       FROM notification_log ORDER BY sent_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ notifications: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /history/notifications ─────────────────────────────────────────────
// Frontend calls this when a WhatsApp/email notification is sent
router.post("/history/notifications", async (req, res) => {
  try {
    const b = req.body as {
      channel: string; workerId?: string; workerName?: string;
      sentBy?: string; recipient?: string; messagePreview?: string; status?: string;
    };
    await execute(
      `INSERT INTO notification_log (channel, worker_id, worker_name, sent_by, recipient, message_preview, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [b.channel, b.workerId ?? null, b.workerName ?? null,
       b.sentBy ?? null, b.recipient ?? null,
       b.messagePreview ? b.messagePreview.slice(0, 300) : null,
       b.status ?? "sent"]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
