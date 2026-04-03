import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { sendWhatsAppAlert, isWhatsAppConfigured } from "../lib/whatsapp.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";
import { getDefaultTenantId } from "../lib/tenant.js";

const router = Router();

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  return Math.ceil((diff / 86_400_000 + start.getDay() + 1) / 7);
}

// POST /api/mood — worker submits mood score
router.post("/mood", requireAuth, async (req, res) => {
  try {
    const { workerId, workerName, score, comment, site } = req.body as {
      workerId?: string; workerName?: string; score?: number; comment?: string; site?: string;
    };
    if (!workerId || !workerName || !score || score < 1 || score > 5) {
      return res.status(400).json({ error: "workerId, workerName, and score (1-5) required" });
    }

    const now = new Date();
    const week = getWeekNumber(now);
    const year = now.getFullYear();

    // Check if already submitted this week
    const existing = await queryOne(
      "SELECT id FROM mood_entries WHERE worker_id = $1 AND week_number = $2 AND year = $3 AND tenant_id = $4",
      [workerId, week, year, req.tenantId!]
    );
    if (existing) {
      return res.status(409).json({ error: "Mood already submitted this week" });
    }

    const row = await queryOne(
      `INSERT INTO mood_entries (tenant_id, worker_id, worker_name, score, comment, site, week_number, year)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId!, workerId, workerName, score, comment ?? null, site ?? null, week, year]
    );

    // If score 1 or 2, alert coordinator via WhatsApp
    if (score <= 2) {
      try {
        // Find site coordinator
        const coord = await queryOne<Record<string, any>>(
          "SELECT * FROM site_coordinators WHERE site_name = $1 AND tenant_id = $2 LIMIT 1",
          [site, req.tenantId!]
        );
        if (coord?.phone) {
          await sendWhatsAppAlert({
            to: coord.phone,
            workerName: coord.name || "Coordinator",
            workerI: workerId,
            permitType: `LOW MOOD ALERT: ${workerName} scored ${score}/5 at ${site || "unknown site"}. ${comment || "No comment."}`,
            daysRemaining: 0,
            tenantId: req.tenantId!,
          });
        }
      } catch { /* non-blocking */ }
    }

    res.status(201).json({ entry: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/mood/dashboard — site averages, trends, alerts
router.get("/mood/dashboard", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId!;

    // Site averages (last 4 weeks)
    const siteAvgs = await query(
      `SELECT site, ROUND(AVG(score)::numeric, 1) AS avg_score, COUNT(*) AS entries
       FROM mood_entries WHERE tenant_id = $1 AND submitted_at >= NOW() - INTERVAL '28 days' AND site IS NOT NULL
       GROUP BY site ORDER BY avg_score ASC`,
      [tenantId]
    );

    // Weekly trend (last 12 weeks)
    const weeklyTrend = await query(
      `SELECT week_number, year, ROUND(AVG(score)::numeric, 1) AS avg_score, COUNT(*) AS entries
       FROM mood_entries WHERE tenant_id = $1 AND submitted_at >= NOW() - INTERVAL '84 days'
       GROUP BY week_number, year ORDER BY year, week_number`,
      [tenantId]
    );

    // Workers with consistently low scores (avg < 3 over last 4 weeks)
    const lowScoreWorkers = await query(
      `SELECT worker_id, worker_name, site, ROUND(AVG(score)::numeric, 1) AS avg_score, COUNT(*) AS weeks
       FROM mood_entries WHERE tenant_id = $1 AND submitted_at >= NOW() - INTERVAL '28 days'
       GROUP BY worker_id, worker_name, site
       HAVING AVG(score) < 3
       ORDER BY AVG(score) ASC`,
      [tenantId]
    );

    // Overall stats
    const overall = await queryOne<Record<string, any>>(
      `SELECT ROUND(AVG(score)::numeric, 1) AS avg_score, COUNT(DISTINCT worker_id) AS respondents, COUNT(*) AS total_entries
       FROM mood_entries WHERE tenant_id = $1 AND submitted_at >= NOW() - INTERVAL '7 days'`,
      [tenantId]
    );

    res.json({
      siteAverages: siteAvgs,
      weeklyTrend,
      lowScoreWorkers,
      thisWeek: {
        avgScore: Number(overall?.avg_score ?? 0),
        respondents: Number(overall?.respondents ?? 0),
        totalEntries: Number(overall?.total_entries ?? 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/mood/worker/:workerId — individual history
router.get("/mood/worker/:workerId", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM mood_entries WHERE worker_id = $1 AND tenant_id = $2 ORDER BY submitted_at DESC LIMIT 52",
      [req.params.workerId, req.tenantId!]
    );
    res.json({ entries: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// Weekly mood prompt — send WhatsApp to all workers asking for score
export async function sendWeeklyMoodPrompts(): Promise<void> {
  try {
    const tenantId = getDefaultTenantId();
    if (!tenantId || !isWhatsAppConfigured()) return;

    const dbRows = await fetchAllWorkers(tenantId);
    const workers = dbRows.map(mapRowToWorker);
    let sent = 0;

    for (const w of workers) {
      if (!w.phone) continue;
      try {
        await sendWhatsAppAlert({
          to: w.phone,
          workerName: w.name,
          workerI: w.id,
          permitType: "Weekly Mood Check: How are you feeling at work? Reply with a number 1-5 (1=very unhappy, 5=very happy)",
          daysRemaining: 0,
          tenantId,
        });
        sent++;
      } catch { /* continue */ }
    }
    console.log(`[Mood] Weekly prompts sent to ${sent} workers.`);
  } catch (err) {
    console.error("[Mood] Weekly prompt failed:", err);
  }
}

export default router;
