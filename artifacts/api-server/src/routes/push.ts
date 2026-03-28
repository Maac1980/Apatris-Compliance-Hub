import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// POST /api/push/subscribe — save push subscription
router.post("/push/subscribe", requireAuth, async (req, res) => {
  try {
    const { subscription, workerName } = req.body as { subscription?: any; workerName?: string };
    if (!subscription?.endpoint) return res.status(400).json({ error: "subscription with endpoint required" });

    // Upsert subscription
    await execute(
      `INSERT INTO push_subscriptions (tenant_id, worker_name, endpoint, keys_p256dh, keys_auth, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE SET keys_p256dh = $4, keys_auth = $5, updated_at = NOW()`,
      [req.tenantId!, workerName ?? req.user!.name, subscription.endpoint,
       subscription.keys?.p256dh ?? null, subscription.keys?.auth ?? null,
       req.headers["user-agent"] ?? null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Subscribe failed" });
  }
});

// DELETE /api/push/unsubscribe — remove push subscription
router.delete("/push/unsubscribe", requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    await execute("DELETE FROM push_subscriptions WHERE endpoint = $1 AND tenant_id = $2", [endpoint, req.tenantId!]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unsubscribe failed" });
  }
});

export default router;
