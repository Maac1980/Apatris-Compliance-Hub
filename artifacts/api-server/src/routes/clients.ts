import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

(async () => {
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        nip TEXT,
        address TEXT,
        billing_rate NUMERIC(10,2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } catch (err) { console.error("[clients] Table creation error:", err); }
})();

// GET /clients — list all
router.get("/clients", async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM clients ORDER BY created_at DESC");
    res.json({ clients: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /clients — create
router.post("/clients", requireAuth, async (req, res) => {
  try {
    const { name, contact_person, email, phone, nip, address, billing_rate } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const row = await queryOne(
      `INSERT INTO clients (name, contact_person, email, phone, nip, address, billing_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, contact_person ?? null, email ?? null, phone ?? null, nip ?? null, address ?? null, billing_rate ?? null]
    );
    res.status(201).json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// PATCH /clients/:id — update
router.patch("/clients/:id", requireAuth, async (req, res) => {
  try {
    const allowedFields = ["name", "contact_person", "email", "phone", "nip", "address", "billing_rate"];
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        vals.push(req.body[field]);
      }
    }
    if (sets.length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }
    sets.push(`updated_at = NOW()`);
    vals.push(req.params.id);
    const row = await queryOne(
      `UPDATE clients SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!row) { res.status(404).json({ error: "Client not found" }); return; }
    res.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// DELETE /clients/:id — delete (Admin only)
router.delete("/clients/:id", requireAuth, requireRole("Admin"), async (req, res) => {
  try {
    const row = await queryOne("DELETE FROM clients WHERE id = $1 RETURNING id", [req.params.id]);
    if (!row) { res.status(404).json({ error: "Client not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
