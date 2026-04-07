import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// ═══ TABLE SETUP ═════════════════════════════════════════════════════════════

// Tables trc_cases, trc_documents, trc_case_notes are created by init-db.ts at startup

// ═══ CASES ═══════════════════════════════════════════════════════════════════

// GET /api/trc/cases — list all TRC cases
router.get("/trc/cases", requireAuth, async (req, res) => {
  try {
    const { status, workerId } = req.query as Record<string, string>;
    let sql = "SELECT * FROM trc_cases WHERE tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (workerId) { params.push(workerId); sql += ` AND worker_id = $${params.length}`; }
    sql += " ORDER BY created_at DESC";
    const rows = await query(sql, params);
    res.json({ cases: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch TRC cases" });
  }
});

// POST /api/trc/cases — create a new TRC case
router.post("/trc/cases", requireAuth, async (req, res) => {
  try {
    const {
      workerId, workerName, nationality, passportNumber, caseType,
      voivodeship, employerName, employerNip, startDate, expiryDate, notes, assignedTo,
    } = req.body as Record<string, string | undefined>;
    if (!workerName) return res.status(400).json({ error: "workerName is required" });
    const row = await queryOne(
      `INSERT INTO trc_cases (tenant_id, worker_id, worker_name, nationality, passport_number, case_type,
        voivodeship, employer_name, employer_nip, start_date, expiry_date, notes, assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        req.tenantId!, workerId ?? null, workerName, nationality ?? null, passportNumber ?? null,
        caseType ?? "Type A", voivodeship ?? null, employerName ?? null, employerNip ?? null,
        startDate ?? null, expiryDate ?? null, notes ?? null, assignedTo ?? null,
      ]
    );
    // Auto-create linked legal case
    if (row && workerId) {
      try {
        const { syncTrcCaseToLegalCase } = await import("../services/case-sync.service.js");
        await syncTrcCaseToLegalCase((row as any).id, req.tenantId!);
      } catch { /* non-blocking */ }
    }

    res.status(201).json({ case: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create TRC case" });
  }
});

// PATCH /api/trc/cases/:id — update a TRC case
router.patch("/trc/cases/:id", requireAuth, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fieldMap: Record<string, string> = {
      workerName: "worker_name", nationality: "nationality", passportNumber: "passport_number",
      caseType: "case_type", status: "status", voivodeship: "voivodeship",
      employerName: "employer_name", employerNip: "employer_nip",
      startDate: "start_date", expiryDate: "expiry_date", notes: "notes", assignedTo: "assigned_to",
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
      `UPDATE trc_cases SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "TRC case not found" });

    // Auto-sync to linked legal case if status changed
    if (body.status !== undefined) {
      try {
        const { syncTrcCaseToLegalCase } = await import("../services/case-sync.service.js");
        await syncTrcCaseToLegalCase(req.params.id as string, req.tenantId!);
      } catch { /* non-blocking — sync is best-effort */ }
    }

    res.json({ case: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update TRC case" });
  }
});

// DELETE /api/trc/cases/:id — delete a TRC case
router.delete("/trc/cases/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      "DELETE FROM trc_cases WHERE id = $1 AND tenant_id = $2 RETURNING id",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "TRC case not found" });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete TRC case" });
  }
});

// ═══ DOCUMENTS ═══════════════════════════════════════════════════════════════

// GET /api/trc/cases/:id/documents
router.get("/trc/cases/:id/documents", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM trc_documents WHERE case_id = $1 ORDER BY uploaded_at DESC",
      [req.params.id]
    );
    res.json({ documents: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch documents" });
  }
});

// POST /api/trc/cases/:id/documents
router.post("/trc/cases/:id/documents", requireAuth, async (req, res) => {
  try {
    const { docType, fileName, fileUrl, notes } = req.body as Record<string, string | undefined>;
    if (!docType) return res.status(400).json({ error: "docType is required" });
    const row = await queryOne(
      `INSERT INTO trc_documents (case_id, doc_type, file_name, file_url, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, docType, fileName ?? null, fileUrl ?? null, notes ?? null]
    );
    res.status(201).json({ document: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to add document" });
  }
});

// PATCH /api/trc/documents/:docId
router.patch("/trc/documents/:docId", requireAuth, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fieldMap: Record<string, string> = {
      status: "status", notes: "notes", fileUrl: "file_url", fileName: "file_name",
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(body[key]); }
    }
    if (body.status === "approved" || body.status === "rejected") {
      sets.push("reviewed_at = NOW()");
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    vals.push(req.params.docId);
    const row = await queryOne(
      `UPDATE trc_documents SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Document not found" });
    res.json({ document: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update document" });
  }
});

// ═══ CASE NOTES ══════════════════════════════════════════════════════════════

// GET /api/trc/cases/:id/notes
router.get("/trc/cases/:id/notes", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM trc_case_notes WHERE case_id = $1 ORDER BY created_at DESC",
      [req.params.id]
    );
    res.json({ notes: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch notes" });
  }
});

// POST /api/trc/cases/:id/notes
router.post("/trc/cases/:id/notes", requireAuth, async (req, res) => {
  try {
    const { author, content } = req.body as { author?: string; content?: string };
    if (!author || !content) return res.status(400).json({ error: "author and content are required" });
    const row = await queryOne(
      `INSERT INTO trc_case_notes (case_id, author, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, author, content]
    );
    res.status(201).json({ note: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to add note" });
  }
});

// ═══ AI CHECKLIST GENERATION ═════════════════════════════════════════════════

// POST /api/trc/cases/:id/generate-checklist
router.post("/trc/cases/:id/generate-checklist", requireAuth, async (req, res) => {
  try {
    const trcCase = await queryOne(
      "SELECT * FROM trc_cases WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!trcCase) return res.status(404).json({ error: "TRC case not found" });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey });

    const c = trcCase as Record<string, unknown>;
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: "You are a Polish immigration law expert specializing in Temporary Residence Cards (Karta Pobytu). Generate a detailed document checklist for TRC applications based on the case details provided. Return a JSON array of objects with fields: docType, description, required (boolean), deadline (optional).",
      messages: [{
        role: "user",
        content: `Generate a TRC document checklist for this case:\n- Worker: ${c.worker_name}\n- Nationality: ${c.nationality ?? "Unknown"}\n- Case Type: ${c.case_type}\n- Voivodeship: ${c.voivodeship ?? "Unknown"}\n- Employer: ${c.employer_name ?? "Unknown"}\n- Purpose: Work permit / Temporary Residence Card application`,
      }],
    });

    const textBlock = response.content.find((b: { type: string }) => b.type === "text") as { text: string } | undefined;
    const raw = textBlock?.text ?? "[]";

    // Try to parse JSON from response
    let checklist: unknown[];
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      checklist = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      checklist = [{ docType: "raw_response", description: raw, required: true }];
    }

    res.json({ checklist, caseId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate checklist" });
  }
});

// POST /api/trc/cases/:id/send-checklist — email checklist to worker
router.post("/trc/cases/:id/send-checklist", requireAuth, async (req, res) => {
  try {
    const { email, checklist, workerName } = req.body as {
      email?: string; checklist?: unknown[]; workerName?: string;
    };
    if (!email || !checklist) return res.status(400).json({ error: "email and checklist are required" });

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST ?? "smtp-relay.brevo.com",
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const items = (checklist as Array<{ docType?: string; description?: string; required?: boolean }>)
      .map((c, i) => `${i + 1}. ${c.docType ?? "Document"}: ${c.description ?? ""} ${c.required ? "(REQUIRED)" : "(optional)"}`)
      .join("\n");

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@apatris.app",
      to: email,
      subject: `TRC Document Checklist — ${workerName ?? "Worker"}`,
      text: `Dear ${workerName ?? "Worker"},\n\nPlease prepare the following documents for your TRC application:\n\n${items}\n\nBest regards,\nApatris Compliance Team`,
    });

    res.json({ sent: true, to: email });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send checklist email" });
  }
});

// POST /api/trc/cases/:id/notify — status change notification
router.post("/trc/cases/:id/notify", requireAuth, async (req, res) => {
  try {
    const { email, status, workerName, message } = req.body as {
      email?: string; status?: string; workerName?: string; message?: string;
    };
    if (!email || !status) return res.status(400).json({ error: "email and status are required" });

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST ?? "smtp-relay.brevo.com",
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@apatris.app",
      to: email,
      subject: `TRC Case Update — Status: ${status}`,
      text: `Dear ${workerName ?? "Worker"},\n\nYour TRC case status has been updated to: ${status}\n\n${message ?? ""}\n\nBest regards,\nApatris Compliance Team`,
    });

    res.json({ notified: true, to: email, status });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send notification" });
  }
});

// POST /api/trc/cases/:id/invoice — generate invoice for TRC services
router.post("/trc/cases/:id/invoice", requireAuth, async (req, res) => {
  try {
    const trcCase = await queryOne(
      "SELECT * FROM trc_cases WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!trcCase) return res.status(404).json({ error: "TRC case not found" });

    const { amount, currency, description, lineItems } = req.body as {
      amount?: number; currency?: string; description?: string;
      lineItems?: Array<{ description: string; amount: number }>;
    };

    const c = trcCase as Record<string, unknown>;
    const invoice = {
      invoiceNumber: `TRC-${Date.now()}`,
      caseId: req.params.id,
      workerName: c.worker_name,
      employerName: c.employer_name,
      caseType: c.case_type,
      amount: amount ?? 0,
      currency: currency ?? "PLN",
      description: description ?? `TRC application services — ${c.case_type}`,
      lineItems: lineItems ?? [],
      issuedAt: new Date().toISOString(),
      status: "issued",
    };

    res.json({ invoice });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to generate invoice" });
  }
});

// GET /api/trc/summary — dashboard summary
router.get("/trc/summary", requireAuth, async (req, res) => {
  try {
    const total = await queryOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM trc_cases WHERE tenant_id = $1",
      [req.tenantId!]
    );
    const byStatus = await query(
      "SELECT status, COUNT(*) as count FROM trc_cases WHERE tenant_id = $1 GROUP BY status",
      [req.tenantId!]
    );
    const byType = await query(
      "SELECT case_type, COUNT(*) as count FROM trc_cases WHERE tenant_id = $1 GROUP BY case_type",
      [req.tenantId!]
    );
    const expiringSoon = await query(
      `SELECT id, worker_name, expiry_date, status FROM trc_cases
       WHERE tenant_id = $1 AND expiry_date IS NOT NULL AND expiry_date <= NOW() + INTERVAL '30 days' AND expiry_date > NOW()
       ORDER BY expiry_date ASC`,
      [req.tenantId!]
    );
    res.json({
      total: Number(total?.count ?? 0),
      byStatus,
      byType,
      expiringSoon,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch TRC summary" });
  }
});

export default router;
