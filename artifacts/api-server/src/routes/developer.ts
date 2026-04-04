import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { createHash, randomBytes } from "crypto";

const router = Router();

const PERMISSIONS = ["read_workers", "write_workers", "read_compliance", "read_payroll", "read_analytics", "full_access"];
const EVENTS = ["worker.created", "worker.updated", "permit.expiring", "permit.expired", "compliance.alert", "invoice.paid", "invoice.overdue", "worker.matched", "worker.deployed"];

function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `ak_${randomBytes(32).toString("hex")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  return { key, hash, prefix: key.slice(0, 12) + "..." };
}

// ═══════ API KEYS ═══════

router.get("/developer/keys", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const rows = await query("SELECT id, name, key_prefix, permissions, last_used, created_at, status FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC", [req.tenantId!]);
    res.json({ keys: rows, availablePermissions: PERMISSIONS });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/developer/keys", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { name, permissions } = req.body as { name?: string; permissions?: string[] };
    if (!name) return res.status(400).json({ error: "name required" });
    const { key, hash, prefix } = generateApiKey();
    await execute(
      "INSERT INTO api_keys (tenant_id, name, key_hash, key_prefix, permissions) VALUES ($1,$2,$3,$4,$5)",
      [req.tenantId!, name, hash, prefix, JSON.stringify(permissions || ["read_workers"])]);
    res.status(201).json({ name, key, prefix, permissions: permissions || ["read_workers"], message: "Save this key — it will not be shown again" });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.delete("/developer/keys/:id", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    await execute("UPDATE api_keys SET status = 'revoked' WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══════ WEBHOOKS ═══════

router.get("/developer/webhooks", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const rows = await query("SELECT * FROM webhooks WHERE tenant_id = $1 ORDER BY created_at DESC", [req.tenantId!]);
    res.json({ webhooks: rows, availableEvents: EVENTS });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/developer/webhooks", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { name, url, events } = req.body as { name?: string; url?: string; events?: string[] };
    if (!name || !url) return res.status(400).json({ error: "name and url required" });
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    const row = await queryOne(
      "INSERT INTO webhooks (tenant_id, name, url, events, secret) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [req.tenantId!, name, url, JSON.stringify(events || []), secret]);
    res.status(201).json({ webhook: row, secret, message: "Save this secret for signature verification" });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/developer/webhooks/test", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { webhookId } = req.body as { webhookId?: string };
    if (!webhookId) return res.status(400).json({ error: "webhookId required" });
    const wh = await queryOne<Record<string, any>>("SELECT * FROM webhooks WHERE id = $1 AND tenant_id = $2", [webhookId, req.tenantId!]);
    if (!wh) return res.status(404).json({ error: "Not found" });

    const payload = { event: "test.ping", timestamp: new Date().toISOString(), data: { message: "Apatris webhook test" } };
    let status = 0;
    try {
      const r = await fetch(wh.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Apatris-Signature": createHash("sha256").update(JSON.stringify(payload) + wh.secret).digest("hex") }, body: JSON.stringify(payload) });
      status = r.status;
    } catch { status = 0; }

    await execute("INSERT INTO webhook_logs (webhook_id, event, payload, response_status) VALUES ($1,$2,$3,$4)", [webhookId, "test.ping", JSON.stringify(payload), status]);
    await execute("UPDATE webhooks SET last_triggered = NOW() WHERE id = $1", [webhookId]);

    res.json({ delivered: status >= 200 && status < 300, status });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/developer/webhook-logs", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT wl.*, w.name AS webhook_name, w.url FROM webhook_logs wl
       JOIN webhooks w ON w.id = wl.webhook_id WHERE w.tenant_id = $1 ORDER BY wl.delivered_at DESC LIMIT 100`, [req.tenantId!]);
    res.json({ logs: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/developer/docs — API documentation
router.get("/developer/docs", async (_req, res) => {
  res.json({
    version: "1.0", baseUrl: "https://apatris-api.fly.dev/api",
    authentication: "Bearer token via API key in Authorization header",
    endpoints: [
      { method: "GET", path: "/workers", description: "List all workers", permission: "read_workers" },
      { method: "GET", path: "/immigration", description: "Immigration permits", permission: "read_compliance" },
      { method: "GET", path: "/payroll", description: "Payroll data", permission: "read_payroll" },
      { method: "GET", path: "/analytics", description: "Analytics dashboard", permission: "read_analytics" },
      { method: "GET", path: "/compliance-alerts", description: "Active compliance alerts", permission: "read_compliance" },
    ],
    webhookEvents: EVENTS,
    permissions: PERMISSIONS,
  });
});

export default router;
