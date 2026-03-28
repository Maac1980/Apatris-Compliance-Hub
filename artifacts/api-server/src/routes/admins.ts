import { Router } from "express";
import {
  fetchAdmins,
  updateAdmin,
} from "../lib/admins-db.js";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { queryOne, execute } from "../lib/db.js";

const router = Router();

// GET /api/admins
// Returns all admin profiles. Auto-creates and seeds the table on first call.
router.get("/admins", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const admins = await fetchAdmins(req.tenantId!);
    return res.json({ admins });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch admins";
    return res.status(500).json({ error: message });
  }
});

// PATCH /api/admins/:id
// Updates email and/or phone for a specific admin record.
router.patch("/admins/:id", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { id } = req.params;
    const { email, phone } = req.body as { email?: string; phone?: string };

    if (email === undefined && phone === undefined) {
      return res.status(400).json({ error: "Provide at least one field to update" });
    }

    const updated = await updateAdmin(id, { email, phone }, req.tenantId!);
    return res.json({ admin: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update admin";
    return res.status(500).json({ error: message });
  }
});

// POST /api/admins — create a new admin user
router.post("/admins", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const { fullName, email, phone, role } = req.body as {
      fullName?: string; email?: string; phone?: string; role?: string;
    };
    if (!fullName?.trim()) {
      return res.status(400).json({ error: "fullName is required" });
    }
    const row = await queryOne(
      `INSERT INTO admins (tenant_id, full_name, email, phone, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.tenantId!, fullName.trim(), email ?? "", phone ?? "", role ?? "Admin"]
    );
    return res.status(201).json({ admin: row });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create admin" });
  }
});

// DELETE /api/admins/:id — remove an admin user
router.delete("/admins/:id", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    await execute(
      "DELETE FROM admins WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    return res.json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete admin" });
  }
});

export default router;
