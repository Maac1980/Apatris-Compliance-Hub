import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// TASK 19: CLIENT PORTAL — Read-only access for site managers/end-clients
// ═══════════════════════════════════════════════════════════════════════════

// Client portal tokens — separate from main auth, simpler access
// Clients get a token that gives read-only access to their site's workers

// POST /api/portal/create-access — generate a client portal access token
router.post(
  "/portal/create-access",
  requireAuth,
  requireRole("Admin", "Executive"),
  async (req, res) => {
    try {
      const { clientName, clientEmail, siteName, expiresInDays } = req.body as {
        clientName?: string; clientEmail?: string; siteName?: string; expiresInDays?: number;
      };
      if (!clientName || !siteName) {
        return res.status(400).json({ error: "clientName and siteName are required" });
      }

      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + (expiresInDays ?? 90) * 24 * 60 * 60 * 1000);

      await execute(
        `INSERT INTO client_portal_tokens (tenant_id, client_name, client_email, site_name, token_hash, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.tenantId!, clientName, clientEmail ?? null, siteName, tokenHash, expiresAt]
      );

      res.status(201).json({
        token, // Only returned once — client must save it
        clientName,
        siteName,
        expiresAt: expiresAt.toISOString(),
        portalUrl: `/portal?token=${token}`,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create portal access" });
    }
  }
);

// GET /api/portal/view — client portal data (authenticated via portal token)
router.get("/portal/view", async (req, res) => {
  try {
    const token = (req.query.token as string) || req.headers["x-portal-token"] as string;
    if (!token) return res.status(401).json({ error: "Portal token required" });

    const crypto = await import("crypto");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const access = await queryOne<{
      tenant_id: string; client_name: string; site_name: string; expires_at: string;
    }>(
      "SELECT * FROM client_portal_tokens WHERE token_hash = $1 AND expires_at > NOW()",
      [tokenHash]
    );
    if (!access) return res.status(401).json({ error: "Invalid or expired portal token" });

    // Fetch workers for this site
    const rows = await fetchAllWorkers(access.tenant_id);
    const workers = rows.map(mapRowToWorker)
      .filter(w => w.assignedSite?.toLowerCase() === access.site_name.toLowerCase())
      .map(w => ({
        name: w.name,
        specialization: w.specialization,
        complianceStatus: w.complianceStatus,
        daysUntilNextExpiry: w.daysUntilNextExpiry,
        // No PII: no email, phone, PESEL, IBAN exposed
      }));

    const total = workers.length;
    const compliant = workers.filter(w => w.complianceStatus === "compliant").length;

    res.json({
      clientName: access.client_name,
      siteName: access.site_name,
      workers,
      summary: {
        total,
        compliant,
        complianceRate: total > 0 ? Math.round((compliant / total) * 100) : 0,
        critical: workers.filter(w => w.complianceStatus === "critical").length,
        nonCompliant: workers.filter(w => w.complianceStatus === "non-compliant").length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Portal view failed" });
  }
});

// GET /api/portal/tokens — list active portal tokens (admin)
router.get("/portal/tokens", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const rows = await query(
      "SELECT id, client_name, client_email, site_name, expires_at, created_at FROM client_portal_tokens WHERE tenant_id = $1 AND expires_at > NOW() ORDER BY created_at DESC",
      [req.tenantId!]
    );
    res.json({ tokens: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch tokens" });
  }
});

// DELETE /api/portal/tokens/:id — revoke a portal token
router.delete("/portal/tokens/:id", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    await execute("DELETE FROM client_portal_tokens WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to revoke token" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TASK 20: WHITE-LABEL — Tenant branding and configuration
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/branding — get tenant branding (public, resolved by domain or slug)
router.get("/branding", async (req, res) => {
  try {
    const slug = req.query.slug as string;
    const domain = req.query.domain as string || req.hostname;

    let tenant;
    if (slug) {
      tenant = await queryOne(
        "SELECT id, name, slug, logo_url, primary_color, domain FROM tenants WHERE slug = $1 AND is_active = TRUE",
        [slug]
      );
    } else {
      tenant = await queryOne(
        "SELECT id, name, slug, logo_url, primary_color, domain FROM tenants WHERE domain = $1 AND is_active = TRUE",
        [domain]
      );
    }

    if (!tenant) {
      // Default Apatris branding
      return res.json({
        name: "Apatris Sp. z o.o.",
        slug: "apatris",
        logoUrl: null,
        primaryColor: "#C41E1E",
        domain: null,
      });
    }

    res.json({
      name: (tenant as any).name,
      slug: (tenant as any).slug,
      logoUrl: (tenant as any).logo_url,
      primaryColor: (tenant as any).primary_color,
      domain: (tenant as any).domain,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Branding fetch failed" });
  }
});

// PATCH /api/branding — update tenant branding (admin)
router.patch("/branding", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { name, logoUrl, primaryColor, domain } = req.body as {
      name?: string; logoUrl?: string; primaryColor?: string; domain?: string;
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }
    if (logoUrl !== undefined) { sets.push(`logo_url = $${idx++}`); vals.push(logoUrl); }
    if (primaryColor !== undefined) { sets.push(`primary_color = $${idx++}`); vals.push(primaryColor); }
    if (domain !== undefined) { sets.push(`domain = $${idx++}`); vals.push(domain); }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = NOW()");
    vals.push(req.tenantId!);
    const row = await queryOne(
      `UPDATE tenants SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id, name, slug, logo_url, primary_color, domain`,
      vals
    );
    res.json({ branding: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Branding update failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TASK 21: MULTI-CURRENCY PAYROLL
// ═══════════════════════════════════════════════════════════════════════════

// Live FX rates cache (refreshes every 4 hours)
let cachedRates: Record<string, number> = {};
let cacheTimestamp = 0;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

async function fetchLiveRates(): Promise<Record<string, number>> {
  // Return cache if fresh
  if (Date.now() - cacheTimestamp < CACHE_TTL_MS && Object.keys(cachedRates).length > 0) {
    return cachedRates;
  }

  try {
    // Free API — no key needed
    const res = await fetch("https://api.frankfurter.app/latest?from=PLN&to=EUR,CZK,RON,USD,GBP");
    if (!res.ok) throw new Error(`FX API ${res.status}`);
    const data = await res.json() as { rates: Record<string, number> };

    // Build bidirectional rate map
    const rates: Record<string, number> = {};
    for (const [currency, rate] of Object.entries(data.rates)) {
      rates[`PLN_${currency}`] = Math.round(rate * 10000) / 10000;
      rates[`${currency}_PLN`] = Math.round((1 / rate) * 10000) / 10000;
    }

    // Cross rates
    const currencies = Object.keys(data.rates);
    for (const a of currencies) {
      for (const b of currencies) {
        if (a !== b) {
          rates[`${a}_${b}`] = Math.round((data.rates[b] / data.rates[a]) * 10000) / 10000;
        }
      }
    }

    cachedRates = rates;
    cacheTimestamp = Date.now();
    console.log(`[FX] Live rates updated: ${Object.keys(rates).length} pairs`);
    return rates;
  } catch (err) {
    console.warn("[FX] Failed to fetch live rates, using fallback:", err instanceof Error ? err.message : err);
    return FX_RATES; // fallback to hardcoded
  }
}

// Exchange rates (hardcoded fallback)
const FX_RATES: Record<string, number> = {
  PLN_EUR: 0.23,   PLN_CZK: 5.40,  PLN_RON: 1.08,  PLN_USD: 0.25,  PLN_GBP: 0.20,
  EUR_PLN: 4.35,   EUR_CZK: 23.50, EUR_RON: 4.70,  EUR_USD: 1.08,  EUR_GBP: 0.86,
  CZK_PLN: 0.185,  CZK_EUR: 0.043, CZK_RON: 0.20,  CZK_USD: 0.046, CZK_GBP: 0.037,
  RON_PLN: 0.925,  RON_EUR: 0.213, RON_CZK: 5.00,  RON_USD: 0.23,  RON_GBP: 0.184,
};

async function convert(amount: number, from: string, to: string): Promise<number> {
  if (from === to) return amount;
  const rates = await fetchLiveRates();
  const key = `${from}_${to}`;
  const rate = rates[key] ?? FX_RATES[key];
  if (!rate) throw new Error(`No exchange rate for ${from} → ${to}`);
  return Math.round(amount * rate * 100) / 100;
}

// GET /api/payroll/fx-rates — current exchange rates
router.get("/payroll/fx-rates", requireAuth, async (_req, res) => {
  try {
    const rates = await fetchLiveRates();
    res.json({ rates, baseCurrency: "PLN", updatedAt: new Date().toISOString(), live: cacheTimestamp > 0 });
  } catch {
    res.json({ rates: FX_RATES, baseCurrency: "PLN", updatedAt: new Date().toISOString(), live: false });
  }
});

// POST /api/payroll/convert — convert amount between currencies
router.post("/payroll/convert", requireAuth, async (req, res) => {
  try {
    const { amount, from, to } = req.body as { amount?: number; from?: string; to?: string };
    if (!amount || !from || !to) return res.status(400).json({ error: "amount, from, to are required" });
    const converted = await convert(amount, from.toUpperCase(), to.toUpperCase());
    const rates = await fetchLiveRates();
    const rate = rates[`${from.toUpperCase()}_${to.toUpperCase()}`] ?? FX_RATES[`${from.toUpperCase()}_${to.toUpperCase()}`] ?? null;
    res.json({ original: { amount, currency: from.toUpperCase() }, converted: { amount: converted, currency: to.toUpperCase() }, rate });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Conversion failed" });
  }
});

// POST /api/payroll/multi-currency — calculate payroll in multiple currencies
router.post("/payroll/multi-currency", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { targetCurrency } = req.body as { targetCurrency?: string };
    if (!targetCurrency) return res.status(400).json({ error: "targetCurrency required (EUR, CZK, RON, etc.)" });
    const target = targetCurrency.toUpperCase();

    const rows = await fetchAllWorkers(req.tenantId!);
    const workers = await Promise.all(rows.map(mapRowToWorker).map(async w => {
      const grossPLN = (w.hourlyRate ?? 0) * (w.monthlyHours ?? 0);
      const nettoPLN = grossPLN - (w.advance ?? 0) - (w.penalties ?? 0);
      return {
        id: w.id,
        name: w.name,
        site: w.assignedSite,
        grossPLN,
        nettoPLN,
        grossConverted: await convert(grossPLN, "PLN", target),
        nettoConverted: await convert(nettoPLN, "PLN", target),
        targetCurrency: target,
      };
    }));

    const totalGrossPLN = workers.reduce((s, w) => s + w.grossPLN, 0);
    const totalNettoPLN = workers.reduce((s, w) => s + w.nettoPLN, 0);

    const liveRates = await fetchLiveRates();
    res.json({
      workers,
      totals: {
        grossPLN: totalGrossPLN,
        nettoPLN: totalNettoPLN,
        grossConverted: await convert(totalGrossPLN, "PLN", target),
        nettoConverted: await convert(totalNettoPLN, "PLN", target),
        targetCurrency: target,
        fxRate: liveRates[`PLN_${target}`] ?? FX_RATES[`PLN_${target}`] ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Multi-currency calculation failed" });
  }
});

export default router;
