import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

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

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(500).json({ error: "Stripe not configured" });

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
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeKey) return res.status(500).json({ error: "Stripe not configured" });

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
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return res.json({
        subscription: null,
        message: "Stripe not configured — using free tier",
      });
    }

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

export default router;
