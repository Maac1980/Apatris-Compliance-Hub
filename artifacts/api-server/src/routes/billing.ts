import { Router, type Response } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// Returns true if response was already sent (caller must `return` immediately).
// Structured 503 when required Stripe keys are missing.
function billingDisabled(res: Response, needs: { secret?: boolean; webhook?: boolean }): boolean {
  const missing: string[] = [];
  if (needs.secret && !process.env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
  if (needs.webhook && !process.env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");
  if (missing.length === 0) return false;
  res.status(503).json({
    error: "billing_disabled",
    reason: `Stripe not configured — missing: ${missing.join(", ")}`,
  });
  return true;
}

// ═══ PLANS ═══════════════════════════════════════════════════════════════════

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 199,
    currency: "EUR",
    interval: "month",
    features: [
      "Up to 50 workers",
      "Basic compliance tracking",
      "Document management",
      "Email support",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 499,
    currency: "EUR",
    interval: "month",
    features: [
      "Up to 200 workers",
      "Full compliance suite",
      "AI-powered document review",
      "TRC case management",
      "GPS tracking",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 999,
    currency: "EUR",
    interval: "month",
    features: [
      "Unlimited workers",
      "Full compliance suite",
      "AI-powered everything",
      "Custom integrations",
      "Multi-tenant support",
      "Dedicated account manager",
      "SLA guarantee",
    ],
  },
];

// ═══ ENDPOINTS ═══════════════════════════════════════════════════════════════

// GET /api/billing/plans — public, returns available plans
router.get("/billing/plans", (_req, res) => {
  res.json({ plans: PLANS });
});

// POST /api/billing/checkout — create Stripe checkout session
router.post("/billing/checkout", async (req, res) => {
  try {
    const { planId, agencyName, email } = req.body as {
      planId?: string; agencyName?: string; email?: string;
    };
    if (!planId || !email) return res.status(400).json({ error: "planId and email are required" });

    const plan = PLANS.find(p => p.id === planId);
    if (!plan) return res.status(400).json({ error: "Invalid planId" });

    if (billingDisabled(res, { secret: true })) return;
    const stripeKey = process.env.STRIPE_SECRET_KEY!;

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      metadata: { planId, agencyName: agencyName ?? "" },
      line_items: [
        {
          price_data: {
            currency: plan.currency.toLowerCase(),
            product_data: {
              name: `Apatris ${plan.name} Plan`,
              description: plan.features.join(", "),
            },
            unit_amount: plan.price * 100, // cents
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL ?? "https://apatris.app"}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL ?? "https://apatris.app"}/billing/cancel`,
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create checkout session" });
  }
});

// POST /api/billing/webhook — Stripe webhook handler (no auth)
router.post("/billing/webhook", async (req, res) => {
  try {
    if (billingDisabled(res, { secret: true, webhook: true })) return;
    const stripeKey = process.env.STRIPE_SECRET_KEY!;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(stripeKey);

    let event: { type: string; data: { object: Record<string, unknown> } };

    if (webhookSecret) {
      const sig = req.headers["stripe-signature"] as string;
      try {
        event = stripe.webhooks.constructEvent(
          (req as unknown as { rawBody?: string | Buffer }).rawBody ?? JSON.stringify(req.body),
          sig,
          webhookSecret
        ) as unknown as typeof event;
      } catch (webhookErr) {
        return res.status(400).json({ error: "Webhook signature verification failed" });
      }
    } else {
      // No webhook secret — accept raw body (dev mode)
      event = req.body as typeof event;
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log("[Billing] Checkout completed:", session.customer_email, session.metadata);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        console.log("[Billing] Subscription updated:", sub.id, sub.status);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        console.log("[Billing] Subscription cancelled:", sub.id);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.log("[Billing] Payment failed:", invoice.customer_email);
        break;
      }
      default:
        console.log("[Billing] Unhandled event type:", event.type);
    }

    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Webhook handling failed" });
  }
});

// GET /api/billing/subscription — get current subscription status
router.get("/billing/subscription", requireAuth, async (req, res) => {
  try {
    if (billingDisabled(res, { secret: true })) return;
    const stripeKey = process.env.STRIPE_SECRET_KEY!;

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(stripeKey);

    // Look up customer by tenant email or ID
    const email = (req as unknown as { userEmail?: string }).userEmail;
    if (!email) {
      return res.json({ subscription: null, message: "No email associated with account" });
    }

    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      return res.json({ subscription: null, message: "No subscription found" });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return res.json({ subscription: null, message: "No active subscription" });
    }

    const sub = subscriptions.data[0];
    res.json({
      subscription: {
        id: sub.id,
        status: sub.status,
        planId: sub.metadata?.planId ?? null,
        currentPeriodStart: sub.current_period_start,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch subscription" });
  }
});

// POST /api/billing/webhook — Stripe webhook handler (signature-verified)
router.post("/billing/webhook", async (req, res) => {
  if (billingDisabled(res, { secret: true, webhook: true })) return;
  const stripeKey = process.env.STRIPE_SECRET_KEY!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" as any });

    let event: any;
    // Verify signature if webhook secret is configured
    if (webhookSecret && req.headers["stripe-signature"]) {
      try {
        event = stripe.webhooks.constructEvent(
          JSON.stringify(req.body),
          req.headers["stripe-signature"] as string,
          webhookSecret
        );
      } catch (err) {
        console.error("[Stripe] Webhook signature verification failed:", err instanceof Error ? err.message : err);
        return res.status(400).json({ error: "Invalid signature" });
      }
    } else {
      event = req.body;
    }

    const type = event?.type;

    switch (type) {
      case "checkout.session.completed": {
        const session = event.data?.object;
        const email = session?.customer_email ?? session?.metadata?.email;
        const planId = session?.metadata?.planId;
        if (email && planId) {
          await execute(
            "UPDATE tenants SET subscription_plan = $1, subscription_status = 'active', updated_at = NOW() WHERE id = (SELECT tenant_id FROM users WHERE LOWER(email) = LOWER($2) LIMIT 1)",
            [planId, email]
          ).catch(() => {});
          console.log(`[Stripe] Subscription activated: ${email} → ${planId}`);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data?.object;
        const status = sub?.status;
        const customerId = sub?.customer;
        if (customerId && status) {
          console.log(`[Stripe] Subscription ${status}: ${customerId}`);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data?.object;
        const customerId = sub?.customer;
        console.log(`[Stripe] Subscription cancelled: ${customerId}`);
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("[Stripe] Webhook error:", err instanceof Error ? err.message : err);
    res.status(200).json({ received: true });
  }
});

// POST /api/billing/cancel — cancel subscription
router.post("/billing/cancel", requireAuth, requireRole("Admin"), async (req, res) => {
  if (billingDisabled(res, { secret: true })) return;
  const stripeKey = process.env.STRIPE_SECRET_KEY!;

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" as any });
    const email = (req as any).user?.email;
    if (!email) return res.status(400).json({ error: "User email required" });

    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) return res.json({ cancelled: false, message: "No customer found" });

    const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, status: "active", limit: 1 });
    if (subs.data.length === 0) return res.json({ cancelled: false, message: "No active subscription" });

    await stripe.subscriptions.update(subs.data[0].id, { cancel_at_period_end: true });
    res.json({ cancelled: true, cancelAt: subs.data[0].current_period_end });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
