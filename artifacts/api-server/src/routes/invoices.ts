import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { isMailConfigured } from "../lib/mailer.js";
import { getDefaultTenantId } from "../lib/tenant.js";
import { appendAuditLog } from "../lib/audit-log.js";

const router = Router();

// Invoice schema upgrades (tenant_id, sent_at, etc.) are applied by init-db.ts at startup

// Auto-increment invoice number: INV-YYYY-NNN
async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const rows = await query<{ invoice_number: string }>(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY invoice_number DESC LIMIT 1`,
    [`${prefix}%`]
  );
  if (rows.length === 0) return `${prefix}001`;
  const last = rows[0].invoice_number;
  const num = parseInt(last.replace(prefix, "")) + 1;
  return `${prefix}${String(num).padStart(3, "0")}`;
}

// GET /invoices
router.get("/invoices", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT i.*, c.company_name AS company_name_live
       FROM invoices i
       LEFT JOIN crm_companies c ON c.id = i.client_id
       WHERE i.tenant_id = $1
       ORDER BY i.created_at DESC`,
      [req.tenantId!]
    );
    // Calculate overdue
    const now = new Date();
    const invoices = (rows as any[]).map(r => ({
      ...r,
      computed_status: r.status === "paid" ? "paid" :
        r.status === "sent" && r.due_date && new Date(r.due_date) < now ? "overdue" :
        r.status,
    }));
    const outstanding = invoices
      .filter(i => i.computed_status !== "paid")
      .reduce((s: number, i: any) => s + Number(i.total || i.amount_gross || 0), 0);
    res.json({ invoices, outstanding });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /invoices — create with auto number
router.post("/invoices", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const body = req.body as Record<string, any>;
    const invoiceNumber = await nextInvoiceNumber();
    const vatRate = body.vatRate ?? 23;
    const amountNet = Number(body.amountNet || body.subtotal || 0);
    const amountVat = Math.round(amountNet * vatRate) / 100;
    const amountGross = amountNet + amountVat;
    const issueDate = body.issueDate || new Date().toISOString().slice(0, 10);
    const dueDate = body.dueDate || new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

    const row = await queryOne(
      `INSERT INTO invoices (invoice_number, client_id, client_name, month_year, items, subtotal, vat_rate, vat_amount, total,
         amount_net, amount_gross, issue_date, due_date, status, notes, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [invoiceNumber, body.clientId ?? null, body.clientName ?? null, body.monthYear ?? null,
       body.items ? JSON.stringify(body.items) : "[]", amountNet, vatRate, amountVat, amountGross,
       amountNet, amountGross, issueDate, dueDate, "draft", body.notes ?? null, req.tenantId!]
    );
    appendAuditLog({ timestamp: new Date().toISOString(), actor: req.user?.name ?? "unknown", actorEmail: req.user?.email ?? "", action: "INVOICE_CREATE", workerId: (row as any)?.id ?? "", workerName: "—", note: `Invoice ${invoiceNumber} created, gross ${amountGross}` });
    res.status(201).json({ invoice: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create" });
  }
});

// GET /invoices/:id
router.get("/invoices/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne("SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ invoice: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /invoices/:id
router.patch("/invoices/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fieldMap: Record<string, string> = {
      status: "status", notes: "notes", clientId: "client_id", clientName: "client_name",
      amountNet: "amount_net", vatRate: "vat_rate", dueDate: "due_date",
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(body[key]); }
    }
    if (body.status === "paid") sets.push("paid_at = NOW()");
    if (body.status === "sent") sets.push("sent_at = NOW()");
    if (sets.length === 0) return res.status(400).json({ error: "No fields" });
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(`UPDATE invoices SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, vals);
    if (!row) return res.status(404).json({ error: "Not found" });
    appendAuditLog({ timestamp: new Date().toISOString(), actor: req.user?.name ?? "unknown", actorEmail: req.user?.email ?? "", action: "INVOICE_UPDATE", workerId: req.params.id, workerName: "—", note: `Invoice updated: ${Object.keys(body).join(", ")}` });
    res.json({ invoice: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /invoices/:id/send — generate HTML invoice and email to client
router.post("/invoices/:id/send", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const inv = await queryOne<Record<string, any>>("SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    if (!inv) return res.status(404).json({ error: "Not found" });

    // Get client email from CRM
    let clientEmail = (req.body as any)?.email;
    if (!clientEmail && inv.client_id) {
      const company = await queryOne<Record<string, any>>("SELECT contact_email FROM crm_companies WHERE id = $1 AND tenant_id = $2", [inv.client_id, req.tenantId!]);
      clientEmail = company?.contact_email;
    }
    if (!clientEmail) return res.status(400).json({ error: "No client email — set contact_email on the CRM company" });

    if (!isMailConfigured()) return res.status(503).json({ error: "SMTP not configured" });

    const nodemailer = await import("nodemailer");
    const transport = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const items = typeof inv.items === "string" ? JSON.parse(inv.items) : (inv.items || []);
    const net = Number(inv.amount_net || inv.subtotal || 0);
    const vat = Number(inv.vat_amount || 0);
    const gross = Number(inv.amount_gross || inv.total || 0);
    const fmtEur = (n: number) => n.toLocaleString("en", { style: "currency", currency: "EUR" });

    const itemRows = items.map((it: any) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px;">${it.description || it.name || "Service"}</td>
       <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px;text-align:right;font-family:monospace;">${it.quantity || it.workers || ""}</td>
       <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px;text-align:right;font-family:monospace;">${it.rate ? fmtEur(Number(it.rate)) : ""}</td>
       <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px;text-align:right;font-family:monospace;font-weight:bold;">${it.amount ? fmtEur(Number(it.amount)) : ""}</td></tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" style="background:#0f172a;padding:40px 20px;"><tr><td align="center">
<table width="640" style="background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
  <tr><td style="background:#C41E18;padding:28px 32px;">
    <p style="margin:0;color:#fff;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;opacity:0.8;">FAKTURA VAT</p>
    <h1 style="margin:8px 0 0;color:#fff;font-size:24px;font-weight:800;">${inv.invoice_number}</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:12px;">Apatris Sp. z o.o. · NIP: 5252828706</p>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <table width="100%" style="margin-bottom:20px;"><tr>
      <td style="vertical-align:top;width:50%;">
        <p style="color:#64748b;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px;">Bill To</p>
        <p style="color:#f1f5f9;font-size:15px;font-weight:700;margin:0;">${inv.client_name || "Client"}</p>
      </td>
      <td style="vertical-align:top;text-align:right;">
        <p style="color:#64748b;font-size:10px;margin:0;">Issue: <span style="color:#e2e8f0;">${inv.issue_date || new Date().toISOString().slice(0, 10)}</span></p>
        <p style="color:#64748b;font-size:10px;margin:4px 0 0;">Due: <span style="color:#fbbf24;font-weight:700;">${inv.due_date || "—"}</span></p>
      </td>
    </tr></table>
    ${items.length > 0 ? `<table width="100%" style="border-collapse:collapse;margin-bottom:20px;">
      <tr style="background:#0f172a;"><th style="padding:8px 12px;text-align:left;color:#64748b;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Description</th>
      <th style="padding:8px 12px;text-align:right;color:#64748b;font-size:10px;">Qty</th>
      <th style="padding:8px 12px;text-align:right;color:#64748b;font-size:10px;">Rate</th>
      <th style="padding:8px 12px;text-align:right;color:#64748b;font-size:10px;">Amount</th></tr>
      ${itemRows}</table>` : ""}
    <table width="100%" style="background:#0f172a;border-radius:8px;border:1px solid #334155;">
      <tr><td style="padding:12px 16px;color:#94a3b8;font-size:13px;">Net (Netto)</td><td style="padding:12px 16px;text-align:right;color:#f1f5f9;font-family:monospace;font-size:14px;">${fmtEur(net)}</td></tr>
      <tr><td style="padding:12px 16px;color:#94a3b8;font-size:13px;">VAT ${inv.vat_rate || 23}%</td><td style="padding:12px 16px;text-align:right;color:#fbbf24;font-family:monospace;font-size:14px;">${fmtEur(vat)}</td></tr>
      <tr style="border-top:2px solid #334155;"><td style="padding:14px 16px;color:#f1f5f9;font-size:15px;font-weight:800;">TOTAL (Brutto)</td><td style="padding:14px 16px;text-align:right;color:#4ade80;font-family:monospace;font-size:20px;font-weight:900;">${fmtEur(gross)}</td></tr>
    </table>
    <div style="margin-top:20px;padding:16px;background:#0f172a;border-radius:8px;border:1px solid #334155;">
      <p style="color:#64748b;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Bank Details</p>
      <p style="color:#e2e8f0;font-size:12px;margin:0;font-family:monospace;">Apatris Sp. z o.o.<br/>IBAN: PL XX XXXX XXXX XXXX XXXX XXXX XXXX<br/>SWIFT: BREXPLPW<br/>mBank S.A.</p>
    </div>
  </td></tr>
  <tr><td style="background:#0f172a;padding:16px 32px;border-top:1px solid #1e293b;">
    <p style="margin:0;color:#475569;font-size:10px;text-align:center;">Apatris Sp. z o.o. · ul. Chłodna 51, 00-867 Warszawa · NIP: 5252828706</p>
  </td></tr>
</table></td></tr></table></body></html>`;

    await transport.sendMail({
      from: `"Apatris Billing" <${process.env.SMTP_USER}>`,
      to: clientEmail,
      subject: `Invoice ${inv.invoice_number} — Apatris Sp. z o.o.`,
      html,
    });

    await execute("UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = $1", [req.params.id]);
    await execute(
      `INSERT INTO notification_log (channel, worker_name, message_preview, recipient, status, tenant_id)
       VALUES ('email', $1, $2, $3, 'sent', $4)`,
      [inv.client_name, `Invoice ${inv.invoice_number} sent`, clientEmail, inv.tenant_id]
    );

    res.json({ sent: true, to: clientEmail });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Send failed" });
  }
});

// POST /invoices/auto-send — cron endpoint: generate invoices for all active CRM companies
router.post("/invoices/auto-send", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const activeCompanies = await query<Record<string, any>>(
      `SELECT c.id, c.company_name, c.contact_email,
              (SELECT COUNT(*) FROM crm_deals d WHERE d.company_id = c.id AND d.stage = 'Active') AS active_deal_count,
              (SELECT COALESCE(SUM(d.value_eur), 0) FROM crm_deals d WHERE d.company_id = c.id AND d.stage = 'Active') AS total_value
       FROM crm_companies c WHERE c.tenant_id = $1 AND c.status = 'active'`,
      [tenantId]
    );

    let created = 0;
    for (const co of activeCompanies) {
      if (Number(co.active_deal_count) === 0) continue;
      const invoiceNumber = await nextInvoiceNumber();
      const net = Number(co.total_value);
      const vat = Math.round(net * 23) / 100;
      const gross = net + vat;
      const monthYear = new Date().toISOString().slice(0, 7);

      await execute(
        `INSERT INTO invoices (invoice_number, client_id, client_name, month_year, subtotal, vat_rate, vat_amount, total, amount_net, amount_gross, issue_date, due_date, status, tenant_id)
         VALUES ($1,$2,$3,$4,$5,23,$6,$7,$8,$9,CURRENT_DATE,CURRENT_DATE + 14,'draft',$10)`,
        [invoiceNumber, co.id, co.company_name, monthYear, net, vat, gross, net, gross, tenantId]
      );
      created++;
    }

    res.json({ created, companies: activeCompanies.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Auto-send failed" });
  }
});

// DELETE /invoices/:id
router.delete("/invoices/:id", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const row = await queryOne("DELETE FROM invoices WHERE id = $1 AND tenant_id = $2 RETURNING id", [req.params.id, req.tenantId!]);
    if (!row) return res.status(404).json({ error: "Not found" });
    appendAuditLog({ timestamp: new Date().toISOString(), actor: req.user?.name ?? "unknown", actorEmail: req.user?.email ?? "", action: "INVOICE_DELETE", workerId: req.params.id, workerName: "—", note: "Invoice deleted" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ── Monthly auto-send via scheduler ──────────────────────────────────────
export async function runMonthlyInvoiceGeneration(): Promise<void> {
  try {
    const tenantId = getDefaultTenantId();
    if (!tenantId) return;
    const activeCompanies = await query<Record<string, any>>(
      `SELECT c.id, c.company_name,
              (SELECT COALESCE(SUM(d.value_eur), 0) FROM crm_deals d WHERE d.company_id = c.id AND d.stage = 'Active') AS total_value
       FROM crm_companies c WHERE c.tenant_id = $1 AND c.status = 'active'`,
      [tenantId]
    );
    let created = 0;
    for (const co of activeCompanies) {
      if (Number(co.total_value) === 0) continue;
      const invoiceNumber = await nextInvoiceNumber();
      const net = Number(co.total_value);
      const vat = Math.round(net * 23) / 100;
      const gross = net + vat;
      await execute(
        `INSERT INTO invoices (invoice_number, client_id, client_name, month_year, subtotal, vat_rate, vat_amount, total, amount_net, amount_gross, issue_date, due_date, status, tenant_id)
         VALUES ($1,$2,$3,$4,$5,23,$6,$7,$8,$9,CURRENT_DATE,CURRENT_DATE + 14,'draft',$10)`,
        [invoiceNumber, co.id, co.company_name, new Date().toISOString().slice(0, 7), net, vat, gross, net, gross, tenantId]
      );
      created++;
    }
    console.log(`[Invoices] Monthly auto-generation: ${created} invoices created.`);
  } catch (err) {
    console.error("[Invoices] Monthly generation failed:", err);
  }
}

export default router;
