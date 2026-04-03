import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne } from "../lib/db.js";

const router = Router();

// GET /api/immigration — list all immigration permits
router.get("/immigration", requireAuth, async (req, res) => {
  try {
    const { permitType, status, country } = req.query as Record<string, string>;
    let sql = `
      SELECT ip.*, w.full_name AS worker_name_live
      FROM immigration_permits ip
      LEFT JOIN workers w ON w.id = ip.worker_id
      WHERE ip.tenant_id = $1`;
    const params: unknown[] = [req.tenantId!];
    if (permitType) { params.push(permitType); sql += ` AND ip.permit_type = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND ip.status = $${params.length}`; }
    if (country) { params.push(country); sql += ` AND ip.country = $${params.length}`; }
    sql += " ORDER BY ip.expiry_date ASC NULLS LAST";
    const rows = await query(sql, params);
    res.json({ permits: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch permits" });
  }
});

// GET /api/immigration/worker/:workerId — permit history for a worker
router.get("/immigration/worker/:workerId", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM immigration_permits WHERE tenant_id = $1 AND worker_id = $2 ORDER BY expiry_date DESC`,
      [req.tenantId!, req.params.workerId]
    );
    res.json({ permits: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch worker permits" });
  }
});

// POST /api/immigration — create a new permit
router.post("/immigration", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { workerId, workerName, permitType, country, issueDate, expiryDate, status, applicationRef, notes } = req.body as {
      workerId?: string; workerName?: string; permitType?: string; country?: string;
      issueDate?: string; expiryDate?: string; status?: string; applicationRef?: string; notes?: string;
    };
    if (!workerId || !workerName || !permitType) {
      return res.status(400).json({ error: "workerId, workerName, and permitType are required" });
    }
    const row = await queryOne(
      `INSERT INTO immigration_permits (tenant_id, worker_id, worker_name, permit_type, country, issue_date, expiry_date, status, application_ref, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.tenantId!, workerId, workerName, permitType, country || "PL",
       issueDate ?? null, expiryDate ?? null, status || "active", applicationRef ?? null, notes ?? null]
    );
    res.status(201).json({ permit: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create permit" });
  }
});

// GET /api/immigration/:id — get single permit
router.get("/immigration/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      "SELECT * FROM immigration_permits WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Permit not found" });
    res.json({ permit: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch permit" });
  }
});

// PATCH /api/immigration/:id — update permit
router.patch("/immigration/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fieldMap: Record<string, string> = {
      permitType: "permit_type", country: "country", issueDate: "issue_date",
      expiryDate: "expiry_date", status: "status", applicationRef: "application_ref", notes: "notes",
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(body[key]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = NOW()");
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(
      `UPDATE immigration_permits SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Permit not found" });
    res.json({ permit: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

export default router;
