/**
 * Legal Notifications — surface critical/attention events for workforce compliance.
 */

import { Router } from "express";
import { query, queryOne, execute } from "../lib/db.js";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";

const router = Router();
const ROLES = ["Admin", "Executive", "LegalHead", "TechOps", "Coordinator"] as const;

// GET /api/legal-notifications — latest notifications
router.get("/legal-notifications", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    const rows = await query<any>(
      `SELECT id, worker_id, worker_name, type, message, read, created_at
       FROM legal_notifications WHERE tenant_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.tenantId!]
    );
    const unread = rows.filter(r => !r.read).length;
    res.json({ notifications: rows, unread });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/legal-notifications/read — mark notifications as read
router.post("/legal-notifications/read", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    const { ids } = req.body as { ids?: string[] };
    if (ids && ids.length > 0) {
      await execute(
        `UPDATE legal_notifications SET read = TRUE WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [req.tenantId!, ids]
      );
    } else {
      await execute(
        `UPDATE legal_notifications SET read = TRUE WHERE tenant_id = $1 AND read = FALSE`,
        [req.tenantId!]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ── Notification scanner — called periodically from scheduler ───────────────

export async function scanAndCreateNotifications(tenantId: string): Promise<{ created: number }> {
  const now = Date.now();
  let created = 0;

  try {
    // Get workers with expiry data
    const workers = await query<any>(
      `SELECT id, full_name, trc_expiry, work_permit_expiry FROM workers WHERE tenant_id = $1`,
      [tenantId]
    );

    // Get recent notifications to avoid duplicates (last 7 days)
    const recent = await query<any>(
      `SELECT worker_id, type, message FROM legal_notifications WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
      [tenantId]
    );
    const recentSet = new Set(recent.map(r => `${r.worker_id}:${r.type}:${r.message?.slice(0, 40)}`));

    for (const w of workers) {
      const trcExp = w.trc_expiry ? new Date(w.trc_expiry).getTime() : null;
      const wpExp = w.work_permit_expiry ? new Date(w.work_permit_expiry).getTime() : null;
      const nearest = [trcExp, wpExp].filter(Boolean).sort()[0] as number | undefined;
      if (!nearest) continue;

      const name = w.full_name ?? "Unknown";

      // Critical: expired
      if (nearest < now) {
        const days = Math.ceil((now - nearest) / 86_400_000);
        const msg = `Permit expired ${days} day(s) ago.`;
        const key = `${w.id}:critical:${msg.slice(0, 40)}`;
        if (!recentSet.has(key)) {
          await execute(
            `INSERT INTO legal_notifications (tenant_id, worker_id, worker_name, type, message) VALUES ($1,$2,$3,$4,$5)`,
            [tenantId, w.id, name, "critical", msg]
          );
          recentSet.add(key);
          created++;
        }
      }
      // Attention: expiring within 30 days
      else if (nearest < now + 30 * 86_400_000) {
        const days = Math.ceil((nearest - now) / 86_400_000);
        const msg = `Permit expires in ${days} day(s).`;
        const key = `${w.id}:attention:${msg.slice(0, 40)}`;
        if (!recentSet.has(key)) {
          await execute(
            `INSERT INTO legal_notifications (tenant_id, worker_id, worker_name, type, message) VALUES ($1,$2,$3,$4,$5)`,
            [tenantId, w.id, name, "attention", msg]
          );
          recentSet.add(key);
          created++;
        }
      }
    }

    // Check for rejection decisions in document_intake
    const rejections = await query<any>(
      `SELECT di.confirmed_worker_id AS worker_id, w.full_name AS worker_name
       FROM document_intake di
       LEFT JOIN workers w ON w.id = di.confirmed_worker_id
       WHERE di.tenant_id = $1
         AND di.status = 'CONFIRMED'
         AND di.confirmed_fields_json::text ILIKE '%rejected%'
         AND di.confirmed_at > NOW() - INTERVAL '7 days'`,
      [tenantId]
    );

    for (const r of rejections) {
      if (!r.worker_id) continue;
      const msg = "Application rejected — action required.";
      const key = `${r.worker_id}:critical:${msg.slice(0, 40)}`;
      if (!recentSet.has(key)) {
        await execute(
          `INSERT INTO legal_notifications (tenant_id, worker_id, worker_name, type, message) VALUES ($1,$2,$3,$4,$5)`,
          [tenantId, r.worker_id, r.worker_name ?? "Unknown", "critical", msg]
        );
        recentSet.add(key);
        created++;
      }
    }
    // Check MOS signature deadlines — escalate at 7 days remaining
    const sigWorkers = await query<any>(
      `SELECT id, full_name, mos_signature_deadline FROM workers
       WHERE tenant_id = $1 AND mos_signature_deadline IS NOT NULL`,
      [tenantId]
    );

    for (const sw of sigWorkers) {
      const deadline = new Date(sw.mos_signature_deadline).getTime();
      const daysLeft = Math.ceil((deadline - now) / 86_400_000);
      if (daysLeft <= 7 && daysLeft >= 0) {
        const msg = `MOS signature deadline in ${daysLeft} day(s) — sign before ${new Date(deadline).toISOString().slice(0, 10)} to avoid digital paralysis.`;
        const key = `${sw.id}:critical:MOS signature deadline`;
        if (!recentSet.has(key)) {
          await execute(
            `INSERT INTO legal_notifications (tenant_id, worker_id, worker_name, type, message) VALUES ($1,$2,$3,$4,$5)`,
            [tenantId, sw.id, sw.full_name ?? "Unknown", "critical", msg]
          );
          recentSet.add(key);
          created++;
        }
      } else if (daysLeft > 7 && daysLeft <= 14) {
        const msg = `MOS signature deadline approaching — ${daysLeft} days remaining (${new Date(deadline).toISOString().slice(0, 10)}).`;
        const key = `${sw.id}:attention:MOS signature approaching`;
        if (!recentSet.has(key)) {
          await execute(
            `INSERT INTO legal_notifications (tenant_id, worker_id, worker_name, type, message) VALUES ($1,$2,$3,$4,$5)`,
            [tenantId, sw.id, sw.full_name ?? "Unknown", "attention", msg]
          );
          recentSet.add(key);
          created++;
        }
      }
    }
  } catch (err) {
    console.error("[Notifications] Scan failed:", err instanceof Error ? err.message : err);
  }

  if (created > 0) console.log(`[Notifications] Created ${created} new notification(s).`);
  return { created };
}

export default router;
