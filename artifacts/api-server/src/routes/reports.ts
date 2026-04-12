/**
 * Reports Routes — send and schedule workforce reports via email.
 */

import { Router } from "express";
import nodemailer from "nodemailer";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { isMailConfigured } from "../lib/mailer.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();
const ROLES = ["Admin", "Executive", "LegalHead"] as const;

// ── Shared helpers ──────────────────────────────────────────────────────────

function createSmtpTransport() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp-relay.brevo.com",
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function buildReportEmail(email: string, summary?: { ok: number; attention: number; critical: number; total: number }, message?: string) {
  const now = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const summaryLine = summary ? `OK: ${summary.ok} · Attention: ${summary.attention} · Critical: ${summary.critical} (${summary.total} workers)` : "";
  const subject = "Workforce Legal Status Report";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e293b; margin-bottom: 4px;">${subject}</h2>
      <p style="color: #64748b; font-size: 13px; margin-top: 0;">Generated ${now}</p>
      ${summaryLine ? `<p style="background: #f1f5f9; padding: 10px 14px; border-radius: 6px; font-size: 13px; color: #334155; font-weight: 600;">${summaryLine}</p>` : ""}
      ${message ? `<p style="color: #475569; font-size: 13px; line-height: 1.5;">${message.replace(/\n/g, "<br>")}</p>` : ""}
      <p style="color: #94a3b8; font-size: 11px; margin-top: 24px;">The full report is attached as a PDF.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;">
      <p style="color: #94a3b8; font-size: 10px;">Sent from Apatris Compliance Hub</p>
    </div>
  `;
  return { subject, html };
}

/** Generate a simple PDF report server-side using PDFKit. */
async function generateReportPdf(tenantId: string): Promise<{ buffer: Buffer; summary: { ok: number; attention: number; critical: number; total: number } }> {
  const workers = await query<any>(
    `SELECT id, full_name, specialization, assigned_site, trc_expiry, work_permit_expiry FROM workers WHERE tenant_id = $1 ORDER BY trc_expiry ASC NULLS LAST`,
    [tenantId]
  );

  const now = Date.now();
  const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0142/g, "l").replace(/\u0141/g, "L");

  type Group = "critical" | "attention" | "ok";
  const classified = workers.map(w => {
    const trcExp = w.trc_expiry ? new Date(w.trc_expiry).getTime() : null;
    const wpExp = w.work_permit_expiry ? new Date(w.work_permit_expiry).getTime() : null;
    const nearest = [trcExp, wpExp].filter(Boolean).sort()[0] as number | undefined;
    let group: Group = "ok";
    let message = "No action required.";
    let nextStep = "";
    if (nearest && nearest < now) {
      group = "critical";
      message = `Permit expired ${Math.ceil((now - nearest) / 86_400_000)} day(s) ago.`;
      nextStep = "Begin renewal or new application process.";
    } else if (nearest && nearest < now + 60 * 86_400_000) {
      group = "attention";
      message = `Permit expires in ${Math.ceil((nearest - now) / 86_400_000)} day(s).`;
      nextStep = "Start renewal process before expiry.";
    }
    return { ...w, group, message, nextStep };
  });

  const groups: Group[] = ["critical", "attention", "ok"];
  const summary = {
    ok: classified.filter(w => w.group === "ok").length,
    attention: classified.filter(w => w.group === "attention").length,
    critical: classified.filter(w => w.group === "critical").length,
    total: workers.length,
  };

  // Build a simple text-based PDF using raw PDF commands (no external dependency)
  // We use a minimal approach: plain text lines
  const lines: string[] = [];
  lines.push("Workforce Legal Status Report");
  lines.push(`Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} - ${summary.total} workers`);
  lines.push(`OK: ${summary.ok}  Attention: ${summary.attention}  Critical: ${summary.critical}`);
  lines.push("");

  const STATUS_LABEL = { critical: "ACTION NEEDED", attention: "MONITOR", ok: "CLEAR" } as const;
  for (const g of groups) {
    const gw = classified.filter(w => w.group === g);
    if (gw.length === 0) continue;
    lines.push(`--- ${g.toUpperCase()} (${gw.length}) ---`);
    for (const w of gw) {
      lines.push(`  ${norm(w.full_name)} | ${STATUS_LABEL[g]} | ${norm(w.message)}${w.nextStep ? ` | ${norm(w.nextStep)}` : ""}`);
    }
    lines.push("");
  }

  lines.push("This report is for informational purposes only and does not constitute legal advice.");

  // Minimal valid PDF with text content
  const text = lines.join("\n");
  const textBytes = Buffer.from(text, "utf-8");
  const pdfParts: string[] = [];
  const offsets: number[] = [];
  let pos = 0;

  const add = (s: string) => { offsets.push(pos); pdfParts.push(s); pos += Buffer.byteLength(s, "binary"); };

  add("%PDF-1.4\n");
  // obj 1: catalog
  add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  // obj 2: pages
  add("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  // obj 4: font
  add("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n");
  // obj 5: stream content
  const contentLines = lines.map((l, i) => `BT /F1 9 Tf 36 ${780 - i * 14} Td (${l.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")}) Tj ET`).join("\n");
  const streamBuf = Buffer.from(contentLines, "binary");
  add(`5 0 obj\n<< /Length ${streamBuf.length} >>\nstream\n`);
  add(contentLines);
  add("\nendstream\nendobj\n");
  // obj 3: page
  add("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>\nendobj\n");

  const xrefOffset = pos;
  add("xref\n0 6\n");
  add("0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++) {
    add(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
  }
  add("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n");
  add(`${xrefOffset}\n%%EOF\n`);

  const buffer = Buffer.from(pdfParts.join(""), "binary");
  return { buffer, summary };
}

// ── POST /api/reports/send ──────────────────────────────────────────────────

router.post("/reports/send", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    const { email, pdfBase64, subject, message, summary } = req.body as {
      email?: string; pdfBase64?: string; subject?: string; message?: string;
      summary?: { ok: number; attention: number; critical: number; total: number };
    };
    if (!email || !pdfBase64) return res.status(400).json({ error: "email and pdfBase64 are required" });
    if (!isMailConfigured()) return res.status(503).json({ error: "Email not configured. Set SMTP_USER and SMTP_PASS." });

    const { subject: subj, html } = buildReportEmail(email, summary, message);
    const filename = `workforce-status-${new Date().toISOString().slice(0, 10)}.pdf`;

    await createSmtpTransport().sendMail({
      from: process.env.SMTP_FROM ?? `Apatris Reports <${process.env.SMTP_USER}>`,
      to: email,
      subject: subject ?? subj,
      html,
      attachments: [{ filename, content: Buffer.from(pdfBase64, "base64"), contentType: "application/pdf" }],
    });

    console.log(`[Reports] Sent report to ${email} (${filename}, ${Math.round(pdfBase64.length * 0.75 / 1024)}KB)`);
    res.json({ success: true, sentTo: email, filename });
  } catch (err) {
    console.error("[Reports] Send failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send report" });
  }
});

// ── POST /api/reports/schedule ──────────────────────────────────────────────

router.post("/reports/schedule", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    const { email, frequency } = req.body as { email?: string; frequency?: string };
    if (!email) return res.status(400).json({ error: "email is required" });
    if (!frequency || !["daily", "weekly"].includes(frequency)) {
      return res.status(400).json({ error: "frequency must be 'daily' or 'weekly'" });
    }

    // Upsert — one schedule per email per tenant
    const existing = await queryOne<any>(
      "SELECT id FROM report_schedules WHERE tenant_id = $1 AND email = $2",
      [req.tenantId!, email]
    );

    if (existing) {
      await execute(
        "UPDATE report_schedules SET frequency = $1, created_by = $2 WHERE id = $3",
        [frequency, req.user?.email ?? req.user?.name ?? "unknown", existing.id]
      );
      res.json({ success: true, action: "updated", email, frequency });
    } else {
      const row = await queryOne<any>(
        `INSERT INTO report_schedules (tenant_id, email, frequency, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
        [req.tenantId!, email, frequency, req.user?.email ?? req.user?.name ?? "unknown"]
      );
      res.json({ success: true, action: "created", id: row.id, email, frequency });
    }
  } catch (err) {
    console.error("[Reports] Schedule failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create schedule" });
  }
});

// ── GET /api/reports/schedules ──────────────────────────────────────────────

router.get("/reports/schedules", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    const rows = await query<any>(
      "SELECT id, email, frequency, created_by, last_sent_at, created_at FROM report_schedules WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId!]
    );
    res.json({ schedules: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ── DELETE /api/reports/schedule/:id ─────────────────────────────────────────

router.delete("/reports/schedule/:id", requireAuth, requireRole(...ROLES), async (req, res) => {
  try {
    await execute("DELETE FROM report_schedules WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ── Scheduled report runner (called from scheduler) ─────────────────────────

export async function runScheduledReports(tenantId: string): Promise<{ sent: number; errors: number }> {
  if (!isMailConfigured()) {
    console.log("[Reports] Scheduler skipped — SMTP not configured.");
    return { sent: 0, errors: 0 };
  }

  const now = new Date();
  const schedules = await query<any>(
    "SELECT * FROM report_schedules WHERE tenant_id = $1",
    [tenantId]
  );

  let sent = 0, errors = 0;

  for (const sched of schedules) {
    const lastSent = sched.last_sent_at ? new Date(sched.last_sent_at) : null;
    const hoursSinceLast = lastSent ? (now.getTime() - lastSent.getTime()) / 3_600_000 : Infinity;

    // Check if due: daily = 24h, weekly = 168h
    const intervalHours = sched.frequency === "daily" ? 24 : 168;
    if (hoursSinceLast < intervalHours) continue;

    try {
      const { buffer, summary } = await generateReportPdf(tenantId);
      const { subject, html } = buildReportEmail(sched.email, summary, `Scheduled ${sched.frequency} workforce status report.`);
      const filename = `workforce-status-${now.toISOString().slice(0, 10)}.pdf`;

      await createSmtpTransport().sendMail({
        from: process.env.SMTP_FROM ?? `Apatris Reports <${process.env.SMTP_USER}>`,
        to: sched.email,
        subject,
        html,
        attachments: [{ filename, content: buffer, contentType: "application/pdf" }],
      });

      await execute("UPDATE report_schedules SET last_sent_at = NOW() WHERE id = $1", [sched.id]);
      console.log(`[Reports] Scheduled report sent to ${sched.email} (${sched.frequency})`);
      sent++;
    } catch (err) {
      console.error(`[Reports] Scheduled send to ${sched.email} failed:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return { sent, errors };
}

export default router;
