import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

const PLANS: Record<string, { price: number; limit: number; features: string[] }> = {
  starter:      { price: 199, limit: 50,   features: ["50 workers", "Core compliance", "WhatsApp alerts", "Basic reporting"] },
  professional: { price: 499, limit: 200,  features: ["200 workers", "All features", "AI matching", "Revenue forecast", "CRM"] },
  enterprise:   { price: 999, limit: 99999, features: ["Unlimited workers", "White-label", "API access", "Priority support", "Custom integrations"] },
};

// GET /api/billing/subscription
router.get("/billing/subscription", requireAuth, async (req, res) => {
  try {
    let sub = await queryOne<Record<string, any>>(
      "SELECT * FROM subscriptions WHERE tenant_id = $1", [req.tenantId!]
    );
    if (!sub) {
      // Auto-create trial
      sub = await queryOne(
        `INSERT INTO subscriptions (tenant_id, plan, status, worker_limit, trial_ends_at, current_period_start, current_period_end)
         VALUES ($1, 'starter', 'trialing', 50, NOW() + INTERVAL '14 days', NOW(), NOW() + INTERVAL '14 days') RETURNING *`,
        [req.tenantId!]
      );
    }
    const workerCount = await queryOne<Record<string, any>>("SELECT COUNT(*) AS count FROM workers WHERE tenant_id = $1", [req.tenantId!]);
    const plan = PLANS[(sub as any).plan] || PLANS.starter;
    res.json({
      subscription: sub, plan: (sub as any).plan, planDetails: plan,
      workerCount: Number(workerCount?.count ?? 0), workerLimit: (sub as any).worker_limit,
      overLimit: Number(workerCount?.count ?? 0) > (sub as any).worker_limit,
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/billing/plans
router.get("/billing/plans", async (_req, res) => {
  res.json({ plans: Object.entries(PLANS).map(([k, v]) => ({ id: k, ...v })) });
});

// POST /api/billing/subscribe
router.post("/billing/subscribe", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { plan } = req.body as { plan?: string };
    if (!plan || !PLANS[plan]) return res.status(400).json({ error: "Invalid plan. Must be: starter, professional, enterprise" });

    const p = PLANS[plan];
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    let stripeCustomerId = null;
    let stripeSubId = null;

    if (stripeKey) {
      try {
        const stripe = require("stripe")(stripeKey);
        // Create or get customer
        const existing = await queryOne<Record<string, any>>("SELECT stripe_customer_id FROM subscriptions WHERE tenant_id = $1", [req.tenantId!]);
        if (existing?.stripe_customer_id) {
          stripeCustomerId = existing.stripe_customer_id;
        } else {
          const customer = await stripe.customers.create({ email: (req as any).user?.email, metadata: { tenantId: req.tenantId! } });
          stripeCustomerId = customer.id;
        }
      } catch { /* Stripe optional */ }
    }

    // Upsert subscription
    await execute(
      `INSERT INTO subscriptions (tenant_id, plan, status, worker_limit, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end)
       VALUES ($1,$2,'active',$3,$4,$5,NOW(),NOW() + INTERVAL '30 days')
       ON CONFLICT (tenant_id) DO UPDATE SET plan = $2, status = 'active', worker_limit = $3, stripe_customer_id = COALESCE($4, subscriptions.stripe_customer_id), current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days'`,
      [req.tenantId!, plan, p.limit, stripeCustomerId, stripeSubId]
    );

    // Log billing
    await execute(
      "INSERT INTO billing_history (tenant_id, amount, currency, status, description, paid_at) VALUES ($1,$2,'eur','paid',$3,NOW())",
      [req.tenantId!, p.price, `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan — €${p.price}/mo`]
    );

    res.json({ subscribed: true, plan, price: p.price, workerLimit: p.limit });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/billing/cancel
router.post("/billing/cancel", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    await execute("UPDATE subscriptions SET status = 'cancelled' WHERE tenant_id = $1", [req.tenantId!]);
    res.json({ cancelled: true });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/billing/history
router.get("/billing/history", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM billing_history WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 24", [req.tenantId!]);
    res.json({ history: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/billing/portal — Stripe customer portal
router.get("/billing/portal", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const sub = await queryOne<Record<string, any>>("SELECT stripe_customer_id FROM subscriptions WHERE tenant_id = $1", [req.tenantId!]);
    if (!sub?.stripe_customer_id) return res.json({ url: null, message: "No Stripe customer linked" });

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.json({ url: null, message: "Stripe not configured" });

    const stripe = require("stripe")(stripeKey);
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: process.env.APP_URL || "https://apatris-api.fly.dev",
    });
    res.json({ url: session.url });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
