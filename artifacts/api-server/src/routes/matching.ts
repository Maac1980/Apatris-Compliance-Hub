import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";

const router = Router();

// GET /api/matching/requests
router.get("/matching/requests", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT jr.*, (SELECT COUNT(*) FROM worker_matches wm WHERE wm.job_request_id = jr.id) AS match_count
       FROM job_requests jr WHERE jr.tenant_id = $1 ORDER BY jr.created_at DESC`,
      [req.tenantId!]
    );
    res.json({ requests: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/matching/requests — create job request
router.post("/matching/requests", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.roleType) return res.status(400).json({ error: "roleType required" });
    const row = await queryOne(
      `INSERT INTO job_requests (tenant_id, company_id, company_name, role_type, skills_required, certifications_required, location, start_date, workers_needed, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.tenantId!, b.companyId ?? null, b.companyName ?? null, b.roleType,
       b.skillsRequired ?? null, b.certificationsRequired ?? null, b.location ?? null,
       b.startDate ?? null, b.workersNeeded || 1, b.notes ?? null]
    );
    res.status(201).json({ request: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create" });
  }
});

// POST /api/matching/requests/:id/match — AI match workers to job
router.post("/matching/requests/:id/match", requireAuth, async (req, res) => {
  try {
    const jobReq = await queryOne<Record<string, any>>(
      "SELECT * FROM job_requests WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!jobReq) return res.status(404).json({ error: "Job request not found" });

    // Clear old matches
    await execute("DELETE FROM worker_matches WHERE job_request_id = $1", [req.params.id]);

    // Get all workers
    const dbRows = await fetchAllWorkers(req.tenantId!);
    const allWorkers = dbRows.map(mapRowToWorker);

    // Filter: exclude expired permits, only GREEN/compliant workers
    const eligible = allWorkers.filter(w => {
      if (w.complianceStatus === "non-compliant") return false;
      const now = new Date();
      const checks = [w.trcExpiry, w.passportExpiry, w.bhpExpiry, w.workPermitExpiry, w.medicalExamExpiry].filter(Boolean);
      for (const d of checks) {
        if (new Date(d!) < now) return false;
      }
      return true;
    });

    // Basic scoring
    const scored = eligible.map(w => {
      let score = 50;
      const reasons: string[] = [];

      // Specialization match
      const roleType = (jobReq.role_type || "").toLowerCase();
      const spec = (w.specialization || "").toLowerCase();
      if (spec && roleType && spec.includes(roleType.split(" ")[0])) {
        score += 20;
        reasons.push(`Specialization matches: ${w.specialization}`);
      }

      // Location match
      const location = (jobReq.location || "").toLowerCase();
      const site = (w.assignedSite || "").toLowerCase();
      if (location && site && (site.includes(location) || location.includes(site))) {
        score += 15;
        reasons.push(`Location match: ${w.assignedSite}`);
      }

      // Compliance bonus
      if (w.complianceStatus === "compliant") {
        score += 10;
        reasons.push("Full GREEN compliance status");
      } else if (w.complianceStatus === "warning") {
        score += 5;
        reasons.push("AMBER compliance — some docs expiring soon");
      }

      // Has phone (reachable)
      if (w.phone) {
        score += 5;
        reasons.push("Contact number available");
      }

      // Skills/certs match (text search)
      const reqSkills = (jobReq.skills_required || "").toLowerCase();
      const reqCerts = (jobReq.certifications_required || "").toLowerCase();
      if (reqSkills && spec && reqSkills.split(",").some((s: string) => spec.includes(s.trim()))) {
        score += 10;
        reasons.push("Skills match requested requirements");
      }
      if (reqCerts && w.qualification && reqCerts.includes(w.qualification.toLowerCase())) {
        score += 10;
        reasons.push(`Certification: ${w.qualification}`);
      }

      return { worker: w, score: Math.min(100, score), reasons };
    });

    // AI enhancement if available
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && scored.length > 0) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });

        const top10 = scored.sort((a, b) => b.score - a.score).slice(0, 10);
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: `You are a workforce staffing expert. Given a job request and candidate workers, adjust match scores and add detailed reasons. Respond ONLY in JSON: { "matches": [{ "name": string, "score_adjustment": number (-20 to +20), "reason": string }] }`,
          messages: [{
            role: "user",
            content: `Job: ${jobReq.role_type}, Location: ${jobReq.location || "any"}, Skills: ${jobReq.skills_required || "any"}, Certs: ${jobReq.certifications_required || "any"}, Workers needed: ${jobReq.workers_needed}

Workers:
${top10.map(m => `- ${m.worker.name}: spec=${m.worker.specialization}, site=${m.worker.assignedSite}, compliance=${m.worker.complianceStatus}, score=${m.score}`).join("\n")}`,
          }],
        });

        const content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
        const parsed = JSON.parse(content);
        if (parsed.matches) {
          for (const aiMatch of parsed.matches) {
            const found = scored.find(s => s.worker.name === aiMatch.name);
            if (found) {
              found.score = Math.min(100, Math.max(0, found.score + (aiMatch.score_adjustment || 0)));
              if (aiMatch.reason) found.reasons.push(`AI: ${aiMatch.reason}`);
            }
          }
        }
      } catch (err) {
        console.warn("[Matching] AI scoring failed, using basic scores:", err instanceof Error ? err.message : err);
      }
    }

    // Sort and take top 5
    scored.sort((a, b) => b.score - a.score);
    const top5 = scored.slice(0, 5);

    // Save matches
    for (const m of top5) {
      await execute(
        `INSERT INTO worker_matches (job_request_id, worker_id, worker_name, match_score, match_reasons, status)
         VALUES ($1, $2, $3, $4, $5, 'suggested')`,
        [req.params.id, m.worker.id, m.worker.name, m.score, JSON.stringify(m.reasons)]
      );
    }

    await execute("UPDATE job_requests SET status = 'matched', updated_at = NOW() WHERE id = $1", [req.params.id]);

    res.json({
      matches: top5.map(m => ({
        worker_id: m.worker.id,
        worker_name: m.worker.name,
        specialization: m.worker.specialization,
        assigned_site: m.worker.assignedSite,
        compliance_status: m.worker.complianceStatus,
        match_score: m.score,
        match_reasons: m.reasons,
        phone: m.worker.phone,
      })),
      total_eligible: eligible.length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Matching failed" });
  }
});

// GET /api/matching/requests/:id — get job with matches
router.get("/matching/requests/:id", requireAuth, async (req, res) => {
  try {
    const jobReq = await queryOne(
      "SELECT * FROM job_requests WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!jobReq) return res.status(404).json({ error: "Not found" });
    const matches = await query(
      "SELECT * FROM worker_matches WHERE job_request_id = $1 ORDER BY match_score DESC",
      [req.params.id]
    );
    res.json({ request: jobReq, matches });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/matching/requests/:id/assign — assign a worker
router.patch("/matching/requests/:id/assign", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { workerId, workerName } = req.body as { workerId?: string; workerName?: string };
    if (!workerId) return res.status(400).json({ error: "workerId required" });

    // Update match status
    await execute(
      "UPDATE worker_matches SET status = 'assigned' WHERE job_request_id = $1 AND worker_id = $2",
      [req.params.id, workerId]
    );

    // Get job request for notification
    const jobReq = await queryOne<Record<string, any>>(
      "SELECT * FROM job_requests WHERE id = $1", [req.params.id]
    );

    // Get worker phone for WhatsApp
    const worker = await queryOne<Record<string, any>>(
      "SELECT phone, full_name FROM workers WHERE id = $1", [workerId]
    );

    if (worker?.phone && jobReq) {
      try {
        await sendWhatsAppAlert({
          to: worker.phone,
          workerName: worker.full_name || workerName || "Worker",
          workerI: workerId,
          permitType: `Job Assignment: ${jobReq.role_type}${jobReq.location ? " in " + jobReq.location : ""}`,
          daysRemaining: 0,
          tenantId: req.tenantId!,
        });
      } catch { /* non-blocking */ }
    }

    // Check if enough workers assigned
    const assigned = await query(
      "SELECT id FROM worker_matches WHERE job_request_id = $1 AND status = 'assigned'",
      [req.params.id]
    );
    if (jobReq && assigned.length >= (jobReq.workers_needed || 1)) {
      await execute("UPDATE job_requests SET status = 'filled', updated_at = NOW() WHERE id = $1", [req.params.id]);
    }

    res.json({ assigned: true, workerName: workerName || worker?.full_name });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Assignment failed" });
  }
});

export default router;
