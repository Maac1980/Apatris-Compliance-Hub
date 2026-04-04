import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";
import { getDefaultTenantId } from "../lib/tenant.js";
import { fetchAllWorkers } from "../lib/workers-db.js";

const router = Router();

const SCAN_TOPICS = [
  { query: "Poland work permit regulation changes 2026", area: "Work Permits" },
  { query: "Poland ZUS contribution rate changes 2026", area: "ZUS" },
  { query: "Polish TRC temporary residence card regulation 2026", area: "TRC" },
  { query: "EU Posted Workers Directive Poland implementation 2026", area: "Posted Workers" },
  { query: "Polish Labour Code amendments Kodeks Pracy 2026", area: "Labour Code" },
  { query: "Poland tax changes PIT CIT 2026 foreigners", area: "Tax" },
  { query: "Poland GDPR RODO enforcement changes 2026", area: "GDPR" },
];

// POST /api/legal/scan — scan for new legal changes
router.post("/legal/scan", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const result = await runLegalScan(req.tenantId!);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Scan failed" });
  }
});

async function runLegalScan(tenantId: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { scanned: 0, found: 0, error: "ANTHROPIC_API_KEY not set" };

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic({ apiKey });

  // Count workers for impact estimation
  const dbRows = await fetchAllWorkers(tenantId);
  const workerCount = dbRows.length;

  let found = 0;
  let criticalCount = 0;

  for (const topic of SCAN_TOPICS) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: `You are a Polish legal compliance analyst monitoring regulatory changes affecting foreign workers and staffing agencies. Analyze the topic and return ONLY valid JSON: { "title": "string", "summary": "2-3 sentence summary", "impact_level": "critical"|"high"|"medium"|"low", "affected_areas": ["string array"], "affected_workers_estimate_percent": number (0-100), "url": "string or null", "published_date": "YYYY-MM-DD or null" }. Focus on changes that affect work permits, ZUS, posted workers, or employer obligations.`,
        messages: [{ role: "user", content: `Analyze recent or upcoming Polish legal changes related to: ${topic.query}. Respond with the most significant recent change or upcoming regulation.` }],
      });

      const content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
      const parsed = JSON.parse(content);

      if (parsed.title) {
        // Check if already exists (by title similarity)
        const existing = await queryOne(
          "SELECT id FROM legal_updates WHERE tenant_id = $1 AND title = $2",
          [tenantId, parsed.title]
        );
        if (existing) continue;

        const affectedWorkers = Math.round(workerCount * (parsed.affected_workers_estimate_percent || 50) / 100);

        await execute(
          `INSERT INTO legal_updates (tenant_id, source, title, summary, impact_level, affected_areas, affected_workers_estimate, published_date, url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [tenantId, topic.area, parsed.title, parsed.summary, parsed.impact_level || "medium",
           JSON.stringify(parsed.affected_areas || [topic.area]), affectedWorkers,
           parsed.published_date || null, parsed.url || null]
        );
        found++;

        if (parsed.impact_level === "critical") criticalCount++;
      }
    } catch {
      // Skip failed individual scans
    }
  }

  // WhatsApp alert for critical updates
  if (criticalCount > 0) {
    try {
      const admins = await query<Record<string, any>>(
        "SELECT phone, full_name AS name FROM admins WHERE tenant_id = $1 AND phone IS NOT NULL LIMIT 3",
        [tenantId]
      );
      // Also try site coordinators
      const coords = await query<Record<string, any>>(
        "SELECT phone, name FROM site_coordinators WHERE tenant_id = $1 AND phone IS NOT NULL LIMIT 3",
        [tenantId]
      );
      for (const contact of [...admins, ...coords]) {
        if (contact.phone) {
          await sendWhatsAppAlert({
            to: contact.phone, workerName: contact.name || "Admin", workerI: "system",
            permitType: `LEGAL ALERT: ${criticalCount} CRITICAL legal change(s) detected affecting your workforce. Check the Legal Updates dashboard immediately.`,
            daysRemaining: 0, tenantId,
          });
        }
      }
    } catch { /* non-blocking */ }
  }

  console.log(`[Legal] Scan complete: ${found} new updates, ${criticalCount} critical.`);
  return { scanned: SCAN_TOPICS.length, found, critical: criticalCount };
}

// GET /api/legal/updates
router.get("/legal/updates", requireAuth, async (req, res) => {
  try {
    const { status, impactLevel } = req.query as Record<string, string>;
    let sql = "SELECT * FROM legal_updates WHERE tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (impactLevel) { params.push(impactLevel); sql += ` AND impact_level = $${params.length}`; }
    sql += " ORDER BY CASE impact_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at DESC";
    const rows = await query(sql, params);
    res.json({ updates: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/legal/updates/:id/acknowledge
router.patch("/legal/updates/:id/acknowledge", requireAuth, async (req, res) => {
  try {
    const userEmail = (req as any).user?.email || "admin";
    const row = await queryOne(
      "UPDATE legal_updates SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *",
      [userEmail, req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ update: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/legal/summary
router.get("/legal/summary", requireAuth, async (req, res) => {
  try {
    const unread = await query<Record<string, any>>(
      `SELECT impact_level, COUNT(*) AS count FROM legal_updates WHERE tenant_id = $1 AND status = 'unread' GROUP BY impact_level`,
      [req.tenantId!]
    );
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const r of unread) counts[r.impact_level] = Number(r.count);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    res.json({ unread: counts, totalUnread: total });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export { runLegalScan };
export default router;
