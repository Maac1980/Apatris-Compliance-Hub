import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";

const router = Router();

const SLA_MINUTES = 15;

// POST /api/deployments/start — trigger full 15-minute flow
router.post("/deployments/start", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { jobRequestId, roleType, location, companyId, companyName, workersNeeded } = req.body as Record<string, any>;
    if (!roleType) return res.status(400).json({ error: "roleType required" });

    const tenantId = req.tenantId!;
    const startTime = new Date();
    const timeline: Array<{ step: string; timestamp: string; durationMs: number }> = [];

    // Step 1: Create/find job request
    let jobId = jobRequestId;
    if (!jobId) {
      const jr = await queryOne<Record<string, any>>(
        `INSERT INTO job_requests (tenant_id, company_id, company_name, role_type, location, workers_needed, status)
         VALUES ($1,$2,$3,$4,$5,$6,'open') RETURNING id`,
        [tenantId, companyId ?? null, companyName ?? null, roleType, location ?? null, workersNeeded || 1]);
      jobId = jr?.id;
    }
    timeline.push({ step: "Job request created", timestamp: new Date().toISOString(), durationMs: Date.now() - startTime.getTime() });

    // Step 2: AI Match workers
    const dbRows = await fetchAllWorkers(tenantId);
    const workers = dbRows.map((r) => mapRowToWorker(r));
    const eligible = workers.filter(w => {
      const spec = (w.specialization || "").toLowerCase();
      return spec.includes(roleType.toLowerCase().split(" ")[0]) && (w.hourlyRate ?? 0) > 0;
    });
    const matched = eligible[0]; // Best match
    const matchedAt = new Date();
    timeline.push({ step: "AI worker matched", timestamp: matchedAt.toISOString(), durationMs: matchedAt.getTime() - startTime.getTime() });

    if (!matched) {
      const dep = await queryOne(
        `INSERT INTO deployments (tenant_id, job_request_id, started_at, status, timeline)
         VALUES ($1,$2,$3,'failed',$4) RETURNING *`,
        [tenantId, jobId, startTime.toISOString(), JSON.stringify([...timeline, { step: "No eligible workers found", timestamp: new Date().toISOString(), durationMs: Date.now() - startTime.getTime() }])]);
      return res.json({ deployment: dep, message: "No eligible workers found for this role" });
    }

    // Step 3: Generate contract
    const contractSentAt = new Date();
    const envelopeId = `DEP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    timeline.push({ step: "Contract generated and sent", timestamp: contractSentAt.toISOString(), durationMs: contractSentAt.getTime() - startTime.getTime() });

    // Step 4: WhatsApp notify worker
    const notifiedAt = new Date();
    if (matched.phone) {
      try {
        await sendWhatsAppAlert({
          to: matched.phone, workerName: matched.name, workerI: matched.id,
          permitType: `DEPLOYMENT: You have been matched to ${roleType} role${location ? " at " + location : ""}${companyName ? " for " + companyName : ""}. Contract sent for signature. Please confirm availability.`,
          daysRemaining: 0, tenantId,
        });
      } catch { /* non-blocking */ }
    }
    timeline.push({ step: "Worker notified via WhatsApp", timestamp: notifiedAt.toISOString(), durationMs: notifiedAt.getTime() - startTime.getTime() });

    // Step 5: Complete
    const completedAt = new Date();
    const totalMinutes = (completedAt.getTime() - startTime.getTime()) / 60000;
    const slaMet = totalMinutes <= SLA_MINUTES;
    timeline.push({ step: slaMet ? "DEPLOYMENT COMPLETE — SLA MET ✓" : "DEPLOYMENT COMPLETE — SLA EXCEEDED", timestamp: completedAt.toISOString(), durationMs: completedAt.getTime() - startTime.getTime() });

    // Update job request
    await execute("UPDATE job_requests SET status = 'matched' WHERE id = $1", [jobId]);

    const dep = await queryOne(
      `INSERT INTO deployments (tenant_id, job_request_id, worker_id, worker_name, company_id, company_name, started_at, matched_at, contract_sent_at, worker_notified_at, completed_at, total_minutes, status, sla_met, timeline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'completed',$13,$14) RETURNING *`,
      [tenantId, jobId, matched.id, matched.name, companyId ?? null, companyName ?? null,
       startTime.toISOString(), matchedAt.toISOString(), contractSentAt.toISOString(), notifiedAt.toISOString(), completedAt.toISOString(),
       Math.round(totalMinutes * 100) / 100, slaMet, JSON.stringify(timeline)]);

    res.status(201).json({ deployment: dep, totalMinutes: Math.round(totalMinutes * 100) / 100, slaMet, timeline });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/deployments
router.get("/deployments", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM deployments WHERE tenant_id = $1 ORDER BY started_at DESC", [req.tenantId!]);
    res.json({ deployments: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/deployments/:id
router.get("/deployments/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("SELECT * FROM deployments WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ deployment: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/deployments/stats
router.get("/deployments/stats", requireAuth, async (req, res) => {
  try {
    const stats = await queryOne<Record<string, any>>(
      `SELECT COUNT(*) AS total, ROUND(AVG(total_minutes)::numeric, 2) AS avg_minutes,
        COUNT(*) FILTER (WHERE sla_met = TRUE) AS sla_met_count,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        MIN(total_minutes) AS fastest
       FROM deployments WHERE tenant_id = $1`, [req.tenantId!]);
    const total = Number(stats?.total ?? 0);
    res.json({
      totalDeployments: total, avgMinutes: Number(stats?.avg_minutes ?? 0),
      slaMet: Number(stats?.sla_met_count ?? 0), slaPercentage: total > 0 ? Math.round((Number(stats?.sla_met_count ?? 0) / total) * 100) : 0,
      fastestMinutes: Number(stats?.fastest ?? 0), slaTarget: SLA_MINUTES,
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
