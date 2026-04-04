import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";
import { getDefaultTenantId } from "../lib/tenant.js";

const router = Router();

const SIGNAL_TOPICS = [
  { query: "Construction welding demand surge Europe 2026", type: "demand_surge", role: "TIG Welder" },
  { query: "Electrician shortage Netherlands Belgium 2026", type: "shortage", role: "Electrician" },
  { query: "Scaffolding rate increase EU construction 2026", type: "rate_increase", role: "Scaffolder" },
  { query: "EU Posted Workers Directive changes 2026", type: "regulation_change", role: null },
  { query: "Summer construction peak demand Poland 2026", type: "seasonal_peak", role: null },
  { query: "Offshore wind farm welder demand North Sea 2026", type: "demand_surge", role: "TIG Welder" },
  { query: "Forklift operator shortage logistics Europe 2026", type: "shortage", role: "Forklift Operator" },
  { query: "Polish work permit processing delays 2026", type: "regulation_change", role: null },
];

const COUNTRIES = ["PL", "NL", "BE", "LT"];

// POST /api/signals/scan
router.post("/signals/scan", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try { res.json(await runSignalScan(req.tenantId!)); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Scan failed" }); }
});

async function runSignalScan(tenantId: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { scanned: 0, found: 0, error: "ANTHROPIC_API_KEY not set" };

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic({ apiKey });
  let found = 0, criticalCount = 0;

  for (const topic of SIGNAL_TOPICS) {
    for (const country of COUNTRIES.slice(0, 2)) { // Scan top 2 countries per topic
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 512,
          system: `You are a European labour market intelligence analyst. Return ONLY JSON: { "signal_detected": boolean, "description": "string", "signal_strength": "critical"|"high"|"medium"|"low", "recommended_action": "string", "expires_in_days": number }`,
          messages: [{ role: "user", content: `Market signal for ${topic.query} in ${country}. Is there an active signal worth acting on?` }],
        });
        const content = response.content[0]?.type === "text" ? response.content[0].text : "{}";
        const parsed = JSON.parse(content);

        if (parsed.signal_detected) {
          const existing = await queryOne("SELECT id FROM market_signals WHERE tenant_id = $1 AND signal_type = $2 AND country = $3 AND status = 'active'",
            [tenantId, topic.type, country]);
          if (existing) continue;

          const expiresAt = parsed.expires_in_days ? new Date(Date.now() + parsed.expires_in_days * 86_400_000).toISOString() : null;
          await execute(
            `INSERT INTO market_signals (tenant_id, signal_type, country, role_type, signal_strength, description, recommended_action, expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [tenantId, topic.type, country, topic.role, parsed.signal_strength || "medium", parsed.description, parsed.recommended_action, expiresAt]
          );
          found++;
          if (parsed.signal_strength === "critical") criticalCount++;
        }
      } catch { /* skip individual failures */ }
    }
  }

  // WhatsApp for critical
  if (criticalCount > 0) {
    try {
      const admins = await query<Record<string, any>>("SELECT phone, full_name AS name FROM admins WHERE tenant_id = $1 AND phone IS NOT NULL LIMIT 2", [tenantId]);
      for (const a of admins) {
        if (a.phone) await sendWhatsAppAlert({ to: a.phone, workerName: a.name, workerI: "system",
          permitType: `MARKET SIGNAL: ${criticalCount} CRITICAL labour market signals detected. Check dashboard for opportunities.`,
          daysRemaining: 0, tenantId });
      }
    } catch { /* non-blocking */ }
  }

  console.log(`[Signals] Scan: ${found} signals, ${criticalCount} critical.`);
  return { scanned: SIGNAL_TOPICS.length * 2, found, critical: criticalCount };
}

// GET /api/signals
router.get("/signals", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM market_signals WHERE tenant_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY CASE signal_strength WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, detected_at DESC`,
      [req.tenantId!]
    );
    res.json({ signals: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// PATCH /api/signals/:id/acknowledge
router.patch("/signals/:id/acknowledge", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("UPDATE market_signals SET status = 'acknowledged' WHERE id = $1 AND tenant_id = $2 RETURNING *",
      [req.params.id, req.tenantId!]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ signal: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/signals/summary
router.get("/signals/summary", requireAuth, async (req, res) => {
  try {
    const byType = await query<Record<string, any>>(
      "SELECT signal_type, COUNT(*) AS count FROM market_signals WHERE tenant_id = $1 AND status = 'active' GROUP BY signal_type", [req.tenantId!]
    );
    const byCountry = await query<Record<string, any>>(
      "SELECT country, COUNT(*) AS count FROM market_signals WHERE tenant_id = $1 AND status = 'active' GROUP BY country", [req.tenantId!]
    );
    const total = byType.reduce((s, r) => s + Number(r.count), 0);
    const critical = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS count FROM market_signals WHERE tenant_id = $1 AND status = 'active' AND signal_strength = 'critical'", [req.tenantId!]
    );
    res.json({ byType, byCountry, total, critical: Number(critical?.count ?? 0) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export { runSignalScan };
export default router;
