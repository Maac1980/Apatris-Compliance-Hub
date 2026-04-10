import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// Ensure job_applications table exists (must complete before requests)
// Table job_applications is created by init-db.ts at startup

// GET /applications — list all, optional ?stage= filter
router.get("/applications", requireAuth, async (req, res) => {
  try {
    const { stage } = req.query as Record<string, string>;
    let sql = `SELECT ja.*, jp.title AS job_title
               FROM job_applications ja
               LEFT JOIN job_postings jp ON jp.id = ja.job_id`;
    const params: unknown[] = [];
    if (stage) {
      sql += ` WHERE ja.stage = $1`;
      params.push(stage);
    }
    sql += ` ORDER BY ja.applied_at DESC`;
    const rows = await query(sql, params);
    res.json({ applications: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// PATCH /applications/:id/stage — update stage
router.patch("/applications/:id/stage", requireAuth, async (req, res) => {
  try {
    const { stage } = req.body;
    if (!stage) {
      res.status(400).json({ error: "Stage is required" });
      return;
    }
    const row = await queryOne(
      `UPDATE job_applications SET stage = $1 WHERE id = $2 RETURNING *`,
      [stage, req.params.id]
    );
    if (!row) { res.status(404).json({ error: "Application not found" }); return; }
    res.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /applications/:id — single application with job details
router.get("/applications/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT ja.*, jp.title AS job_title, jp.location AS job_location, jp.description AS job_description
       FROM job_applications ja
       LEFT JOIN job_postings jp ON jp.id = ja.job_id
       WHERE ja.id = $1`,
      [req.params.id]
    );
    if (!row) { res.status(404).json({ error: "Application not found" }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /applications/:id/notes — update notes
router.patch("/applications/:id/notes", requireAuth, async (req, res) => {
  try {
    const { notes } = req.body;
    if (notes === undefined) { res.status(400).json({ error: "notes field required" }); return; }
    const row = await queryOne(
      "UPDATE job_applications SET notes = $1 WHERE id = $2 RETURNING *",
      [notes, req.params.id]
    );
    if (!row) { res.status(404).json({ error: "Application not found" }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ═══ INTERVIEW STAGE ════════════════════════════════════════════════════════

// PATCH /applications/:id/interview — save interview notes + skills score
router.patch("/applications/:id/interview", requireAuth, requireRole("Admin", "Executive", "TechOps", "Coordinator"), async (req, res) => {
  try {
    const { interviewNotes, skillsScore, interviewDate, interviewResult } = req.body as {
      interviewNotes?: string; skillsScore?: number; interviewDate?: string; interviewResult?: string;
    };
    const updates: string[] = ["stage = 'Interview'"];
    const values: unknown[] = [];
    let idx = 1;

    if (interviewNotes !== undefined) { updates.push(`interview_notes = $${idx++}`); values.push(interviewNotes); }
    if (skillsScore !== undefined) { updates.push(`skills_score = $${idx++}`); values.push(Math.min(5, Math.max(1, skillsScore))); }
    if (interviewDate) { updates.push(`interview_date = $${idx++}`); values.push(interviewDate); }
    if (interviewResult) { updates.push(`interview_result = $${idx++}`); values.push(interviewResult); }

    values.push(req.params.id);
    const row = await queryOne(
      `UPDATE job_applications SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!row) { res.status(404).json({ error: "Application not found" }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ═══ OFFER STAGE ════════════════════════════════════════════════════════════

// POST /applications/:id/offer — create offer for candidate
router.post("/applications/:id/offer", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { offeredRate, startDate } = req.body as { offeredRate?: number; startDate?: string };
    if (!offeredRate) { res.status(400).json({ error: "offeredRate is required" }); return; }

    const row = await queryOne(
      `UPDATE job_applications SET stage = 'Offered', offered_rate = $1, offer_status = 'Pending',
       offer_date = NOW(), start_date = $2 WHERE id = $3 RETURNING *`,
      [offeredRate, startDate ?? null, req.params.id]
    );
    if (!row) { res.status(404).json({ error: "Application not found" }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /applications/:id/offer-response — accept or decline offer
router.patch("/applications/:id/offer-response", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { response } = req.body as { response?: string };
    if (!response || !["Accepted", "Declined"].includes(response)) {
      res.status(400).json({ error: "response must be 'Accepted' or 'Declined'" }); return;
    }
    const newStage = response === "Accepted" ? "Accepted" : "Declined";
    const row = await queryOne(
      `UPDATE job_applications SET offer_status = $1, stage = $2 WHERE id = $3 RETURNING *`,
      [response, newStage, req.params.id]
    );
    if (!row) { res.status(404).json({ error: "Application not found" }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ═══ CONVERT TO WORKER ══════════════════════════════════════════════════════

// POST /applications/:id/convert — create worker from accepted candidate
router.post("/applications/:id/convert", requireAuth, requireRole("Admin", "Executive", "TechOps", "Coordinator"), async (req, res) => {
  try {
    const app = await queryOne<any>(
      "SELECT * FROM job_applications WHERE id = $1", [req.params.id]
    );
    if (!app) { res.status(404).json({ error: "Application not found" }); return; }
    if (app.offer_status !== "Accepted" && app.stage !== "Accepted") {
      res.status(400).json({ error: "Can only convert accepted candidates" }); return;
    }
    if (app.converted_worker_id) {
      res.status(400).json({ error: "Already converted", workerId: app.converted_worker_id }); return;
    }

    const name = app.worker_name;
    if (!name) { res.status(400).json({ error: "Candidate has no name — cannot create worker" }); return; }

    // Duplicate check — look for existing worker with same name or email
    const duplicates = await query<any>(
      `SELECT id, full_name, email FROM workers WHERE tenant_id = $1 AND (
        LOWER(full_name) = LOWER($2)
        ${app.worker_email ? "OR LOWER(email) = LOWER($3)" : ""}
      )`,
      app.worker_email ? [req.tenantId, name, app.worker_email] : [req.tenantId, name]
    );

    if (duplicates.length > 0) {
      res.status(409).json({
        error: "Possible duplicate worker found",
        duplicates: duplicates.map((d: any) => ({ id: d.id, name: d.full_name, email: d.email })),
        message: "Review existing workers before creating a new one. Use forceCreate=true to override.",
      });
      // Allow force create
      if (req.body.forceCreate !== true) return;
    }

    // Create worker
    const worker = await queryOne<any>(
      `INSERT INTO workers (full_name, email, phone, nationality, hourly_rate, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, full_name`,
      [name, app.worker_email ?? null, app.phone ?? null, app.nationality ?? null, app.offered_rate ?? null, req.tenantId]
    );

    // Mark application as converted
    await execute(
      "UPDATE job_applications SET stage = 'Hired', converted_worker_id = $1, converted_at = NOW() WHERE id = $2",
      [worker!.id, req.params.id]
    );

    // Auto-create onboarding checklist if table exists
    try {
      const steps = [
        "Personal details verified", "Passport copy collected", "Work permit / visa copy collected",
        "ZUS registration triggered", "Contract signed", "Bank details collected",
        "Site safety induction (BHP)", "WhatsApp number verified", "Face ID enrolled", "First shift assigned",
      ];
      for (const step of steps) {
        await execute(
          "INSERT INTO onboarding_checklists (worker_id, step_name, status) VALUES ($1, $2, 'pending')",
          [worker!.id, step]
        );
      }
    } catch { /* onboarding table may not exist */ }

    res.status(201).json({
      success: true,
      workerId: worker!.id,
      workerName: worker!.full_name,
      message: "Worker created and onboarding started",
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to convert" });
  }
});

// ═══ PIPELINE ANALYTICS ═════════════════════════════════════════════════════

// GET /applications/analytics/funnel — recruitment funnel stats
router.get("/applications/analytics/funnel", requireAuth, async (req, res) => {
  try {
    const rows = await query<any>(
      `SELECT stage, COUNT(*)::int as count FROM job_applications GROUP BY stage ORDER BY count DESC`
    );
    const stageMap: Record<string, number> = {};
    for (const r of rows) stageMap[r.stage] = r.count;

    const applied = (stageMap["New"] ?? 0) + (stageMap["Reviewed"] ?? 0) + (stageMap["Contacted"] ?? 0) +
                    (stageMap["screening"] ?? 0) + (stageMap["Interview"] ?? 0) + (stageMap["Offered"] ?? 0) +
                    (stageMap["Accepted"] ?? 0) + (stageMap["Hired"] ?? 0) + (stageMap["Declined"] ?? 0) +
                    (stageMap["approved"] ?? 0) + (stageMap["rejected"] ?? 0);
    const screened = (stageMap["screening"] ?? 0) + (stageMap["approved"] ?? 0) + (stageMap["Interview"] ?? 0) +
                     (stageMap["Offered"] ?? 0) + (stageMap["Accepted"] ?? 0) + (stageMap["Hired"] ?? 0);
    const interviewed = (stageMap["Interview"] ?? 0) + (stageMap["Offered"] ?? 0) + (stageMap["Accepted"] ?? 0) + (stageMap["Hired"] ?? 0);
    const offered = (stageMap["Offered"] ?? 0) + (stageMap["Accepted"] ?? 0) + (stageMap["Hired"] ?? 0);
    const hired = stageMap["Hired"] ?? 0;
    const declined = stageMap["Declined"] ?? 0;
    const rejected = stageMap["rejected"] ?? 0;

    // Time-to-hire (average days from applied_at to converted_at for hired candidates)
    const tthRow = await queryOne<any>(
      `SELECT AVG(EXTRACT(EPOCH FROM (converted_at - applied_at)) / 86400)::numeric(6,1) as avg_days
       FROM job_applications WHERE stage = 'Hired' AND converted_at IS NOT NULL`
    );

    res.json({
      funnel: { applied, screened, interviewed, offered, hired, declined, rejected },
      conversionRate: applied > 0 ? Math.round((hired / applied) * 100) : 0,
      avgTimeToHire: tthRow?.avg_days ? Number(tthRow.avg_days) : null,
      stageBreakdown: stageMap,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
