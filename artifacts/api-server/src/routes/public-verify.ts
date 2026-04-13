/**
 * Public Verification Routes — NO AUTH REQUIRED.
 * QR code on worker's compliance card links to /api/public/verify/:token
 * Border police, PIP, clients can scan and see worker status instantly.
 *
 * Also: public recruitment form + client portal link.
 */

import { Router } from "express";
import { query, queryOne, execute } from "../lib/db.js";
import crypto from "crypto";

const router = Router();

// ═══ WORKER VERIFICATION (QR scan) ═════════════════════════════════════

// POST /api/v1/verify/generate — generate verification token for a worker (requires auth)
router.post("/v1/verify/generate", async (req, res) => {
  try {
    const { workerId, tenantId } = req.body as { workerId?: string; tenantId?: string };
    if (!workerId || !tenantId) return res.status(400).json({ error: "workerId and tenantId required" });

    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 90 * 86_400_000).toISOString(); // 90 days

    // Upsert — one active token per worker
    await execute("DELETE FROM verification_tokens WHERE worker_id = $1", [workerId]);
    await execute(
      "INSERT INTO verification_tokens (worker_id, tenant_id, token, expires_at) VALUES ($1, $2, $3, $4)",
      [workerId, tenantId, token, expiresAt]
    );

    res.json({ token, url: `/verify/${token}`, expiresAt });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/public/verify/:token — PUBLIC, no auth
router.get("/public/verify/:token", async (req, res) => {
  try {
    const vt = await queryOne<any>(
      "SELECT * FROM verification_tokens WHERE token = $1 AND expires_at > NOW()",
      [req.params.token]
    );
    if (!vt) return res.status(404).json({ error: "Invalid or expired verification link" });

    // Fetch worker data
    const worker = await queryOne<any>(
      `SELECT w.first_name, w.last_name, w.nationality, w.specialization,
              w.trc_expiry, w.work_permit_expiry, w.passport_expiry,
              w.bhp_expiry, w.medical_exam_expiry, w.contract_end_date,
              w.pesel, w.passport_number
       FROM workers w WHERE w.id = $1`,
      [vt.worker_id]
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    // Fetch legal snapshot
    let legalStatus: any = null;
    try {
      legalStatus = await queryOne<any>(
        `SELECT legal_status, risk_level, legal_basis, summary, conditions, warnings
         FROM worker_legal_snapshots WHERE worker_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [vt.worker_id]
      );
    } catch { /* table may not exist */ }

    // Fetch tenant name
    const tenant = await queryOne<any>("SELECT name FROM tenants WHERE id = $1", [vt.tenant_id]);

    const now = new Date();
    const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86_400_000) : null;

    res.json({
      verified: true,
      timestamp: now.toISOString(),
      employer: tenant?.name ?? "Apatris Sp. z o.o.",
      worker: {
        name: `${worker.first_name} ${worker.last_name}`,
        nationality: worker.nationality,
        specialization: worker.specialization,
        passportNumber: worker.passport_number ? `***${worker.passport_number.slice(-4)}` : null,
      },
      legalStatus: {
        status: legalStatus?.legal_status ?? "UNKNOWN",
        riskLevel: legalStatus?.risk_level ?? "UNKNOWN",
        basis: legalStatus?.legal_basis ?? null,
        summary: legalStatus?.summary ?? "No legal assessment available",
      },
      documents: {
        trc: { expiry: worker.trc_expiry, daysLeft: daysUntil(worker.trc_expiry) },
        workPermit: { expiry: worker.work_permit_expiry, daysLeft: daysUntil(worker.work_permit_expiry) },
        passport: { expiry: worker.passport_expiry, daysLeft: daysUntil(worker.passport_expiry) },
        bhp: { expiry: worker.bhp_expiry, daysLeft: daysUntil(worker.bhp_expiry) },
        medical: { expiry: worker.medical_exam_expiry, daysLeft: daysUntil(worker.medical_exam_expiry) },
        contract: { expiry: worker.contract_end_date, daysLeft: daysUntil(worker.contract_end_date) },
      },
      expiresAt: vt.expires_at,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Verification failed" });
  }
});

// ═══ PUBLIC RECRUITMENT FORM ════════════════════════════════════════════

// POST /api/public/apply — submit job application (PUBLIC, no auth)
router.post("/public/apply", async (req, res) => {
  try {
    const {
      firstName, lastName, email, phone, nationality, specialization,
      experience, message, tenantSlug,
    } = req.body as Record<string, string>;

    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ error: "firstName, lastName, and phone are required" });
    }

    // Find tenant by slug or use default
    let tenantId: string | null = null;
    if (tenantSlug) {
      const t = await queryOne<any>(
        "SELECT id FROM tenants WHERE LOWER(name) = LOWER($1) OR id::text = $1 LIMIT 1",
        [tenantSlug]
      );
      tenantId = t?.id ?? null;
    }
    if (!tenantId) {
      const dt = await queryOne<any>("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1");
      tenantId = dt?.id ?? null;
    }
    if (!tenantId) return res.status(500).json({ error: "No tenant configured" });

    const app = await queryOne<any>(
      `INSERT INTO job_applications (tenant_id, first_name, last_name, email, phone, nationality, specialization, experience, notes, source, status, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'public_form', 'new', NOW())
       RETURNING id`,
      [tenantId, firstName, lastName, email ?? null, phone, nationality ?? null,
       specialization ?? null, experience ?? null, message ?? null]
    );

    res.status(201).json({ success: true, applicationId: app?.id, message: "Application submitted successfully" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to submit application" });
  }
});

// GET /api/public/apply/config — get basic tenant config for form display
router.get("/public/apply/config", async (_req, res) => {
  try {
    const tenant = await queryOne<any>("SELECT id, name FROM tenants ORDER BY created_at ASC LIMIT 1");
    res.json({
      tenantName: tenant?.name ?? "Apatris",
      specializations: ["TIG Welder", "MIG/MAG Welder", "Pipe Welder", "Structural Welder", "Plumber", "Electrician", "Carpenter", "General Construction", "Forklift Operator", "CNC Operator", "Other"],
      nationalities: ["Ukrainian", "Belarusian", "Georgian", "Moldovan", "Armenian", "Indian", "Nepali", "Filipino", "Vietnamese", "Polish", "Other"],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ═══ CLIENT PORTAL LINK ═════════════════════════════════════════════════

// POST /api/v1/client-portal/generate — generate read-only link for client
router.post("/v1/client-portal/generate", async (req, res) => {
  try {
    const { clientName, workerIds, tenantId } = req.body as { clientName?: string; workerIds?: string[]; tenantId?: string };
    if (!clientName || !tenantId) return res.status(400).json({ error: "clientName and tenantId required" });

    const token = crypto.randomBytes(20).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString(); // 30 days

    await execute(
      "INSERT INTO client_portal_links (tenant_id, client_name, token, worker_ids, expires_at) VALUES ($1, $2, $3, $4, $5)",
      [tenantId, clientName, token, workerIds ?? [], expiresAt]
    );

    res.json({ token, url: `/client/${token}`, expiresAt });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/public/client/:token — PUBLIC client portal
router.get("/public/client/:token", async (req, res) => {
  try {
    const link = await queryOne<any>(
      "SELECT * FROM client_portal_links WHERE token = $1 AND expires_at > NOW()",
      [req.params.token]
    );
    if (!link) return res.status(404).json({ error: "Invalid or expired portal link" });

    // Fetch workers for this client
    let workers: any[];
    if (link.worker_ids?.length > 0) {
      workers = await query<any>(
        `SELECT id, first_name, last_name, nationality, specialization,
                trc_expiry, work_permit_expiry, bhp_expiry, medical_exam_expiry, contract_end_date
         FROM workers WHERE id = ANY($1) AND tenant_id = $2`,
        [link.worker_ids, link.tenant_id]
      );
    } else {
      workers = await query<any>(
        `SELECT id, first_name, last_name, nationality, specialization,
                trc_expiry, work_permit_expiry, bhp_expiry, medical_exam_expiry, contract_end_date
         FROM workers WHERE tenant_id = $1 LIMIT 50`,
        [link.tenant_id]
      );
    }

    const now = new Date();
    const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86_400_000) : null;
    const zone = (days: number | null) => days === null ? "unknown" : days < 0 ? "expired" : days < 30 ? "red" : days <= 60 ? "yellow" : "green";

    const workerList = workers.map(w => ({
      name: `${w.first_name} ${w.last_name}`,
      nationality: w.nationality,
      specialization: w.specialization,
      documents: {
        trc: { daysLeft: daysUntil(w.trc_expiry), zone: zone(daysUntil(w.trc_expiry)) },
        workPermit: { daysLeft: daysUntil(w.work_permit_expiry), zone: zone(daysUntil(w.work_permit_expiry)) },
        bhp: { daysLeft: daysUntil(w.bhp_expiry), zone: zone(daysUntil(w.bhp_expiry)) },
        medical: { daysLeft: daysUntil(w.medical_exam_expiry), zone: zone(daysUntil(w.medical_exam_expiry)) },
        contract: { daysLeft: daysUntil(w.contract_end_date), zone: zone(daysUntil(w.contract_end_date)) },
      },
    }));

    const compliant = workerList.filter(w => Object.values(w.documents).every((d: any) => d.zone === "green" || d.zone === "unknown")).length;

    res.json({
      clientName: link.client_name,
      generated: link.created_at,
      expiresAt: link.expires_at,
      timestamp: now.toISOString(),
      summary: {
        totalWorkers: workerList.length,
        compliant,
        complianceRate: workerList.length > 0 ? Math.round((compliant / workerList.length) * 100) : 0,
      },
      workers: workerList,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
