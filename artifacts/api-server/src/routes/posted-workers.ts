import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// PWD posting duration limits (EU Directive 2018/957)
const STANDARD_POSTING_MONTHS = 12;
const EXTENDED_POSTING_MONTHS = 18;

// ═══════════════════════════════════════════════════════════════════════════
// A1 CERTIFICATES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/a1-certificates — list all A1 certificates
router.get("/a1-certificates", requireAuth, async (req, res) => {
  try {
    const { workerId, status, hostCountry } = req.query as Record<string, string>;
    let sql = "SELECT * FROM a1_certificates WHERE tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (workerId) { params.push(workerId); sql += ` AND worker_id = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (hostCountry) { params.push(hostCountry); sql += ` AND host_country = $${params.length}`; }
    sql += " ORDER BY valid_to ASC";
    const rows = await query(sql, params);
    res.json({ certificates: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch certificates" });
  }
});

// POST /api/a1-certificates — create a new A1 certificate
router.post("/a1-certificates", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { workerId, workerName, homeCountry, hostCountry, certificateNumber, issuedBy, validFrom, validTo } = req.body as {
      workerId?: string; workerName?: string; homeCountry?: string; hostCountry?: string;
      certificateNumber?: string; issuedBy?: string; validFrom?: string; validTo?: string;
    };
    if (!workerId || !workerName || !hostCountry || !validFrom || !validTo) {
      return res.status(400).json({ error: "workerId, workerName, hostCountry, validFrom, validTo are required" });
    }
    const row = await queryOne(
      `INSERT INTO a1_certificates (tenant_id, worker_id, worker_name, home_country, host_country, certificate_number, issued_by, valid_from, valid_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.tenantId!, workerId, workerName, homeCountry || "PL", hostCountry, certificateNumber ?? null, issuedBy ?? null, validFrom, validTo]
    );
    res.status(201).json({ certificate: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create certificate" });
  }
});

// PATCH /api/a1-certificates/:id — update certificate status
router.patch("/a1-certificates/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { status, certificateNumber, validTo } = req.body as { status?: string; certificateNumber?: string; validTo?: string };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    if (status) { sets.push(`status = $${idx++}`); vals.push(status); }
    if (certificateNumber) { sets.push(`certificate_number = $${idx++}`); vals.push(certificateNumber); }
    if (validTo) { sets.push(`valid_to = $${idx++}`); vals.push(validTo); }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = NOW()");
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(
      `UPDATE a1_certificates SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Certificate not found" });
    res.json({ certificate: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

// GET /api/a1-certificates/expiring — certificates expiring within N days
router.get("/a1-certificates/expiring", requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 60, 365);
    const rows = await query(
      `SELECT * FROM a1_certificates WHERE tenant_id = $1 AND status = 'active' AND valid_to <= CURRENT_DATE + $2 * INTERVAL '1 day' ORDER BY valid_to ASC`,
      [req.tenantId!, days]
    );
    res.json({ certificates: rows, count: rows.length, daysAhead: days });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch expiring certificates" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POSTING ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/postings — list all posting assignments
router.get("/postings", requireAuth, async (req, res) => {
  try {
    const { workerId, status, hostCountry } = req.query as Record<string, string>;
    let sql = "SELECT * FROM posting_assignments WHERE tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (workerId) { params.push(workerId); sql += ` AND worker_id = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (hostCountry) { params.push(hostCountry); sql += ` AND host_country = $${params.length}`; }
    sql += " ORDER BY start_date DESC";
    const rows = await query(sql, params);
    res.json({ postings: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch postings" });
  }
});

// POST /api/postings — create a posting assignment
router.post("/postings", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps"), async (req, res) => {
  try {
    const body = req.body as {
      workerId?: string; workerName?: string; homeCountry?: string; hostCountry?: string;
      hostCity?: string; clientCompany?: string; siteName?: string;
      startDate?: string; endDate?: string; a1CertificateId?: string; notes?: string;
    };
    if (!body.workerId || !body.workerName || !body.hostCountry || !body.startDate) {
      return res.status(400).json({ error: "workerId, workerName, hostCountry, startDate are required" });
    }
    const row = await queryOne(
      `INSERT INTO posting_assignments (tenant_id, worker_id, worker_name, home_country, host_country, host_city, client_company, site_name, start_date, end_date, a1_certificate_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.tenantId!, body.workerId, body.workerName, body.homeCountry || "PL", body.hostCountry,
       body.hostCity ?? null, body.clientCompany ?? null, body.siteName ?? null,
       body.startDate, body.endDate ?? null, body.a1CertificateId ?? null, body.notes ?? null]
    );
    res.status(201).json({ posting: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create posting" });
  }
});

// PATCH /api/postings/:id — update posting
router.patch("/postings/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps"), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fieldMap: Record<string, string> = {
      status: "status", hostCity: "host_city", clientCompany: "client_company",
      siteName: "site_name", endDate: "end_date", a1CertificateId: "a1_certificate_id", notes: "notes",
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
      `UPDATE posting_assignments SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Posting not found" });
    res.json({ posting: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

// GET /api/postings/compliance — PWD compliance check (duration limits)
router.get("/postings/compliance", requireAuth, async (req, res) => {
  try {
    // Find active postings and calculate duration
    const rows = await query<{
      id: string; worker_id: string; worker_name: string; host_country: string;
      start_date: string; end_date: string | null; a1_certificate_id: string | null;
    }>(
      "SELECT * FROM posting_assignments WHERE tenant_id = $1 AND status = 'active' ORDER BY start_date",
      [req.tenantId!]
    );

    const now = new Date();
    const alerts: Array<{
      postingId: string; workerId: string; workerName: string; hostCountry: string;
      daysPosted: number; monthsPosted: number;
      level: "ok" | "warning" | "critical" | "exceeded";
      message: string; hasA1: boolean;
    }> = [];

    for (const r of rows) {
      const start = new Date(r.start_date);
      const daysPosted = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const monthsPosted = Math.round(daysPosted / 30.44);
      const hasA1 = !!r.a1_certificate_id;

      let level: "ok" | "warning" | "critical" | "exceeded" = "ok";
      let message = `Posted for ${monthsPosted} months. Compliant.`;

      if (monthsPosted > EXTENDED_POSTING_MONTHS) {
        level = "exceeded";
        message = `EXCEEDED: Posted for ${monthsPosted} months (limit: ${EXTENDED_POSTING_MONTHS}). Worker must be employed under host-country terms.`;
      } else if (monthsPosted > STANDARD_POSTING_MONTHS) {
        level = "critical";
        message = `Extended posting: ${monthsPosted} months (standard limit: ${STANDARD_POSTING_MONTHS}). Extended terms must apply.`;
      } else if (monthsPosted > STANDARD_POSTING_MONTHS - 2) {
        level = "warning";
        message = `Approaching limit: ${monthsPosted} months. Standard posting limit is ${STANDARD_POSTING_MONTHS} months.`;
      }

      if (!hasA1) {
        level = level === "ok" ? "warning" : level;
        message += " WARNING: No A1 certificate linked.";
      }

      alerts.push({
        postingId: r.id, workerId: r.worker_id, workerName: r.worker_name,
        hostCountry: r.host_country, daysPosted, monthsPosted, level, message, hasA1,
      });
    }

    const summary = {
      total: alerts.length,
      ok: alerts.filter(a => a.level === "ok").length,
      warning: alerts.filter(a => a.level === "warning").length,
      critical: alerts.filter(a => a.level === "critical").length,
      exceeded: alerts.filter(a => a.level === "exceeded").length,
      withoutA1: alerts.filter(a => !a.hasA1).length,
    };

    res.json({ alerts, summary });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Compliance check failed" });
  }
});

export default router;
