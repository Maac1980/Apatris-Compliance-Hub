import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne } from "../lib/db.js";

const router = Router();

// GET /api/immigration — list all immigration permits
router.get("/immigration", requireAuth, async (req, res) => {
  try {
    const { permitType, status, country } = req.query as Record<string, string>;
    let sql = `
      SELECT ip.*, w.full_name AS worker_name_live
      FROM immigration_permits ip
      LEFT JOIN workers w ON w.id = ip.worker_id
      WHERE ip.tenant_id = $1`;
    const params: unknown[] = [req.tenantId!];
    if (permitType) { params.push(permitType); sql += ` AND ip.permit_type = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND ip.status = $${params.length}`; }
    if (country) { params.push(country); sql += ` AND ip.country = $${params.length}`; }
    sql += " ORDER BY ip.expiry_date ASC NULLS LAST";
    const rows = await query(sql, params);
    res.json({ permits: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch permits" });
  }
});

// GET /api/immigration/worker/:workerId — permit history for a worker
router.get("/immigration/worker/:workerId", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM immigration_permits WHERE tenant_id = $1 AND worker_id = $2 ORDER BY expiry_date DESC`,
      [req.tenantId!, req.params.workerId]
    );
    res.json({ permits: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch worker permits" });
  }
});

// POST /api/immigration — create a new permit
router.post("/immigration", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { workerId, workerName, permitType, country, issueDate, expiryDate, status, applicationRef, notes } = req.body as {
      workerId?: string; workerName?: string; permitType?: string; country?: string;
      issueDate?: string; expiryDate?: string; status?: string; applicationRef?: string; notes?: string;
    };
    if (!workerId || !workerName || !permitType) {
      return res.status(400).json({ error: "workerId, workerName, and permitType are required" });
    }
    const row = await queryOne(
      `INSERT INTO immigration_permits (tenant_id, worker_id, worker_name, permit_type, country, issue_date, expiry_date, status, application_ref, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.tenantId!, workerId, workerName, permitType, country || "PL",
       issueDate ?? null, expiryDate ?? null, status || "active", applicationRef ?? null, notes ?? null]
    );
    res.status(201).json({ permit: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create permit" });
  }
});

// GET /api/immigration/:id — get single permit
router.get("/immigration/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      "SELECT * FROM immigration_permits WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Permit not found" });
    res.json({ permit: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch permit" });
  }
});

// PATCH /api/immigration/:id — update permit
router.patch("/immigration/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fieldMap: Record<string, string> = {
      permitType: "permit_type", country: "country", issueDate: "issue_date",
      expiryDate: "expiry_date", status: "status", applicationRef: "application_ref", notes: "notes",
      trcApplicationSubmitted: "trc_application_submitted",
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(body[key]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = NOW()");
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(
      `UPDATE immigration_permits SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Permit not found" });
    res.json({ permit: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

// POST /api/immigration/:id/predict — AI renewal prediction
router.post("/immigration/:id/predict", requireAuth, async (req, res) => {
  try {
    const permit = await queryOne<Record<string, any>>(
      `SELECT ip.*, w.full_name AS worker_name_live, w.specialization
       FROM immigration_permits ip
       LEFT JOIN workers w ON w.id = ip.worker_id
       WHERE ip.id = $1 AND ip.tenant_id = $2`,
      [req.params.id, req.tenantId!]
    );
    if (!permit) return res.status(404).json({ error: "Permit not found" });

    const trcSubmitted = permit.trc_application_submitted === true;

    // If TRC application is already submitted, worker is protected under Polish law
    if (trcSubmitted) {
      return res.json({
        prediction: {
          recommended_start_date: null,
          processing_days_estimate: 0,
          risk_level: "low",
          action_items: [
            "TRC application is pending — worker is legally protected to stay and work",
            "Monitor application status at Urząd Wojewódzki",
            "Keep proof of application (stamp in passport) accessible",
          ],
          trc_protection_status: "protected_trc_pending",
          summary: "Worker has a pending TRC application. Under Polish law (Art. 108 Act on Foreigners), the worker is legally protected to continue working until a decision is made.",
        },
      });
    }

    // Use AI for renewal prediction
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback without AI
      const daysLeft = permit.expiry_date
        ? Math.ceil((new Date(permit.expiry_date).getTime() - Date.now()) / 86_400_000)
        : null;
      const riskLevel = daysLeft === null ? "high" : daysLeft < 30 ? "high" : daysLeft < 60 ? "medium" : "low";
      const processingDays = permit.permit_type === "TRC" ? 90 : permit.permit_type === "Work Permit" ? 30 : 60;
      const recommended = permit.expiry_date
        ? new Date(new Date(permit.expiry_date).getTime() - processingDays * 86_400_000).toISOString().slice(0, 10)
        : null;
      return res.json({
        prediction: {
          recommended_start_date: recommended,
          processing_days_estimate: processingDays,
          risk_level: riskLevel,
          action_items: [`Begin ${permit.permit_type} renewal process`, "Gather required documents", "Schedule appointment at Urząd Wojewódzki"],
          trc_protection_status: "not_submitted",
          summary: `Estimated ${processingDays} days processing. Start renewal ${recommended ? "by " + recommended : "immediately"}.`,
        },
      });
    }

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are a Polish immigration law expert specializing in work permits, TRC (Temporary Residence Card), visas, and A1 certificates. Given permit details, predict the renewal timeline and risk. Respond ONLY in valid JSON format:
{
  "recommended_start_date": "YYYY-MM-DD or null",
  "processing_days_estimate": number,
  "risk_level": "low"|"medium"|"high",
  "action_items": ["string array of specific steps"],
  "summary": "1-2 sentence summary of the situation and recommendation"
}
Consider Polish Urząd Wojewódzki processing times, seasonal backlogs, and document requirements for each permit type.`,
      messages: [{
        role: "user",
        content: `Predict renewal timeline for this immigration permit:
- Permit type: ${permit.permit_type}
- Country: ${permit.country}
- Worker nationality: ${permit.specialization ? "worker specialization: " + permit.specialization : "unknown"}
- Expiry date: ${permit.expiry_date || "not set"}
- Current status: ${permit.status}
- TRC application submitted: No
- Today's date: ${new Date().toISOString().slice(0, 10)}`,
      }],
    });

    const content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(content);

    res.json({
      prediction: {
        recommended_start_date: parsed.recommended_start_date ?? null,
        processing_days_estimate: parsed.processing_days_estimate ?? 60,
        risk_level: parsed.risk_level ?? "medium",
        action_items: parsed.action_items ?? ["Begin renewal process"],
        trc_protection_status: "not_submitted",
        summary: parsed.summary ?? "AI prediction unavailable",
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Prediction failed" });
  }
});

// POST /api/immigration/:id/start-renewal — create a document workflow for renewal
router.post("/immigration/:id/start-renewal", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const permit = await queryOne<Record<string, any>>(
      "SELECT * FROM immigration_permits WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!permit) return res.status(404).json({ error: "Permit not found" });

    const userEmail = (req as any).user?.email ?? "system";
    const row = await queryOne(
      `INSERT INTO document_workflows (tenant_id, worker_id, worker_name, document_type, status, expiry_date, uploaded_by)
       VALUES ($1, $2, $3, $4, 'uploaded', $5, $6) RETURNING *`,
      [req.tenantId!, permit.worker_id, permit.worker_name, `${permit.permit_type} Renewal`, permit.expiry_date, userEmail]
    );
    res.status(201).json({ workflow: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to start renewal" });
  }
});

export default router;
