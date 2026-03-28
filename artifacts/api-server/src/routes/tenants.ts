import { Router } from "express";
import { query, queryOne, execute } from "../lib/db.js";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";

const router = Router();

// GET /api/tenants - list all tenants (admin only in future)
router.get("/tenants", requireAuth, requireRole("Admin", "Executive"), async (_req, res) => {
  try {
    const tenants = await query(
      "SELECT id, name, slug, logo_url, primary_color, domain, is_active, created_at FROM tenants ORDER BY name"
    );
    res.json({ tenants });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch tenants" });
  }
});

// POST /api/tenants - create a new tenant
router.post("/tenants", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const { name, slug, logoUrl, primaryColor, domain } = req.body as {
      name?: string; slug?: string; logoUrl?: string; primaryColor?: string; domain?: string;
    };
    if (!name?.trim() || !slug?.trim()) {
      return res.status(400).json({ error: "name and slug are required" });
    }
    // Validate slug format (lowercase alphanumeric + hyphens)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: "slug must be lowercase alphanumeric with hyphens only" });
    }
    const existing = await queryOne("SELECT id FROM tenants WHERE slug = $1", [slug]);
    if (existing) {
      return res.status(409).json({ error: "Tenant with this slug already exists" });
    }
    const tenant = await queryOne(
      `INSERT INTO tenants (name, slug, logo_url, primary_color, domain)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name.trim(), slug.trim(), logoUrl ?? null, primaryColor ?? '#C41E1E', domain ?? null]
    );
    res.status(201).json({ tenant });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create tenant" });
  }
});

// PATCH /api/tenants/:id - update tenant
router.patch("/tenants/:id", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const { name, logoUrl, primaryColor, domain, isActive } = req.body as {
      name?: string; logoUrl?: string; primaryColor?: string; domain?: string; isActive?: boolean;
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }
    if (logoUrl !== undefined) { sets.push(`logo_url = $${idx++}`); vals.push(logoUrl); }
    if (primaryColor !== undefined) { sets.push(`primary_color = $${idx++}`); vals.push(primaryColor); }
    if (domain !== undefined) { sets.push(`domain = $${idx++}`); vals.push(domain); }
    if (isActive !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(isActive); }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push(`updated_at = NOW()`);
    vals.push(req.params.id);
    const tenant = await queryOne(
      `UPDATE tenants SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json({ tenant });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update tenant" });
  }
});

export default router;
