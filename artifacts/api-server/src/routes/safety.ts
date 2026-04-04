import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";

const router = Router();

// POST /api/safety/incidents — report incident
router.post("/safety/incidents", requireAuth, async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.site || !b.incidentType) return res.status(400).json({ error: "site and incidentType required" });

    const row = await queryOne(
      `INSERT INTO safety_incidents (tenant_id, worker_id, worker_name, site, incident_type, severity, description, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId!, b.workerId ?? null, b.workerName ?? null, b.site, b.incidentType,
       b.severity || "medium", b.description ?? null, b.photoUrl ?? null]
    );

    // CRITICAL — WhatsApp alert coordinator
    if (b.severity === "critical") {
      try {
        const coords = await query<Record<string, any>>(
          "SELECT phone, name FROM site_coordinators WHERE tenant_id = $1 AND site_name = $2 LIMIT 3",
          [req.tenantId!, b.site]
        );
        if (coords.length === 0) {
          const allCoords = await query<Record<string, any>>(
            "SELECT phone, name FROM site_coordinators WHERE tenant_id = $1 LIMIT 3", [req.tenantId!]
          );
          coords.push(...allCoords);
        }
        for (const c of coords) {
          if (c.phone) {
            await sendWhatsAppAlert({
              to: c.phone, workerName: c.name, workerI: b.workerId || "system",
              permitType: `SAFETY ALERT: CRITICAL ${b.incidentType} at ${b.site}. ${b.description || "Immediate action required."}`,
              daysRemaining: 0, tenantId: req.tenantId!,
            });
          }
        }
      } catch { /* non-blocking */ }
    }

    res.status(201).json({ incident: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/safety/incidents
router.get("/safety/incidents", requireAuth, async (req, res) => {
  try {
    const { site, severity, status } = req.query as Record<string, string>;
    let sql = "SELECT * FROM safety_incidents WHERE tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (site) { params.push(site); sql += ` AND site = $${params.length}`; }
    if (severity) { params.push(severity); sql += ` AND severity = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    sql += " ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, reported_at DESC";
    res.json({ incidents: await query(sql, params) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/safety/incidents/:id/analyse — AI vision analysis
router.post("/safety/incidents/:id/analyse", requireAuth, async (req, res) => {
  try {
    const incident = await queryOne<Record<string, any>>(
      "SELECT * FROM safety_incidents WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!incident) return res.status(404).json({ error: "Not found" });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "AI not configured" });

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey });

    const prompt = `Analyze this construction site safety incident report:
- Site: ${incident.site}
- Type: ${incident.incident_type}
- Description: ${incident.description || "No description provided"}
${incident.photo_url ? "- Photo was uploaded (analyse based on description)" : ""}

Return ONLY valid JSON: {
  "violations_found": ["string array"],
  "ppe_compliance": { "helmet": boolean, "gloves": boolean, "safety_glasses": boolean, "high_vis": boolean, "steel_toe": boolean },
  "severity_assessment": "low"|"medium"|"high"|"critical",
  "recommended_actions": ["string array"],
  "root_cause": "string",
  "preventive_measures": ["string array"]
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "You are a construction site safety inspector. Analyze incident reports and provide structured safety assessments.",
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const analysis = JSON.parse(content);

    await execute(
      "UPDATE safety_incidents SET ai_analysis = $1, severity = $2 WHERE id = $3",
      [JSON.stringify(analysis), analysis.severity_assessment || incident.severity, req.params.id]
    );

    res.json({ analysis });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Analysis failed" });
  }
});

// PATCH /api/safety/incidents/:id/resolve
router.patch("/safety/incidents/:id/resolve", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      "UPDATE safety_incidents SET status = 'resolved', resolved_at = NOW(), resolved_by = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *",
      [(req as any).user?.email || "admin", req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ incident: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/safety/scores — per site
router.get("/safety/scores", requireAuth, async (req, res) => {
  try {
    // Calculate live scores from incidents
    const sites = await query<Record<string, any>>(
      `SELECT site,
        COUNT(*) AS total_incidents,
        COUNT(*) FILTER (WHERE status = 'open') AS open_incidents,
        COUNT(*) FILTER (WHERE severity = 'critical') AS critical,
        COUNT(*) FILTER (WHERE severity = 'high') AS high,
        COUNT(*) FILTER (WHERE reported_at >= NOW() - INTERVAL '30 days') AS recent
       FROM safety_incidents WHERE tenant_id = $1
       GROUP BY site ORDER BY site`, [req.tenantId!]
    );

    const scores = sites.map(s => {
      let score = 100;
      score -= Number(s.critical) * 15;
      score -= Number(s.high) * 8;
      score -= Number(s.open_incidents) * 5;
      score -= Number(s.recent) * 2;
      score = Math.max(0, Math.min(100, score));
      return {
        site: s.site, score,
        totalIncidents: Number(s.total_incidents),
        openIncidents: Number(s.open_incidents),
        critical: Number(s.critical),
        zone: score >= 80 ? "green" : score >= 50 ? "amber" : "red",
      };
    });

    res.json({ scores });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
