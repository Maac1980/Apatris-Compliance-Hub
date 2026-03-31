import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

(async () => {
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number TEXT NOT NULL,
        client_id UUID,
        client_name TEXT,
        month_year TEXT,
        items JSONB DEFAULT '[]',
        subtotal NUMERIC(10,2) DEFAULT 0,
        vat_rate NUMERIC(5,2) DEFAULT 23,
        vat_amount NUMERIC(10,2) DEFAULT 0,
        total NUMERIC(10,2) DEFAULT 0,
        due_date DATE,
        status TEXT DEFAULT 'draft',
        paid_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } catch (err) { console.error("[invoices] Table creation error:", err); }
})();

// GET /invoices — list all
router.get("/invoices", requireAuth, async (_req, res) => {
  try {
    const rows = await query("SELECT * FROM invoices ORDER BY created_at DESC");
    res.json({ invoices: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /invoices — create
router.post("/invoices", requireAuth, async (req, res) => {
  try {
    const { invoice_number, client_id, client_name, month_year, items, subtotal, vat_rate, vat_amount, total, due_date, status, notes } = req.body;
    if (!invoice_number?.trim()) {
      res.status(400).json({ error: "Invoice number is required" });
      return;
    }
    const row = await queryOne(
      `INSERT INTO invoices (invoice_number, client_id, client_name, month_year, items, subtotal, vat_rate, vat_amount, total, due_date, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        invoice_number,
        client_id ?? null,
        client_name ?? null,
        month_year ?? null,
        items ? JSON.stringify(items) : "[]",
        subtotal ?? 0,
        vat_rate ?? 23,
        vat_amount ?? 0,
        total ?? 0,
        due_date ?? null,
        status ?? "draft",
        notes ?? null,
      ]
    );
    res.status(201).json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// PATCH /invoices/:id/status — update status
router.patch("/invoices/:id/status", requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: "Status is required" });
      return;
    }
    const paidAt = status === "paid" ? "NOW()" : "NULL";
    const row = await queryOne(
      `UPDATE invoices SET status = $1, paid_at = ${paidAt} WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
    res.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// DELETE /invoices/:id — delete
router.delete("/invoices/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("DELETE FROM invoices WHERE id = $1 RETURNING id", [req.params.id]);
    if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
