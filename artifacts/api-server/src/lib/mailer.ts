import nodemailer from "nodemailer";
import { execute } from "./db.js";

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

export function isMailConfigured(): boolean {
  return Boolean(SMTP_USER && SMTP_PASS);
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp-relay.brevo.com",
    port,
    secure: port === 465,   // true only for port 465 (SSL), false for 587 (STARTTLS)
    requireTLS: port !== 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

export interface AlertEmailPayload {
  workerName: string;
  documentType: string;
  expiryDate: string;
  daysUntilExpiry: number;
  status: "RED" | "EXPIRED";
  recipients: Array<{ name: string; email: string }>;
}

export async function sendAlertEmail(payload: AlertEmailPayload): Promise<void> {
  if (!isMailConfigured()) {
    console.warn("[Mailer] SMTP_USER or SMTP_PASS not set — skipping email send.");
    return;
  }

  const { workerName, documentType, expiryDate, daysUntilExpiry, status, recipients } = payload;

  const isExpired = status === "EXPIRED";
  const subject = isExpired
    ? `⛔ EXPIRED — ${workerName} · ${documentType}`
    : `🔴 CRITICAL ALERT — ${workerName} · ${documentType} expires in ${daysUntilExpiry} day(s)`;

  const statusLabel = isExpired ? "EXPIRED" : `CRITICAL — ${daysUntilExpiry} day(s) remaining`;
  const statusColor = "#C41E18";
  const toAddresses = recipients.map((r) => `"${r.name}" <${r.email}>`).join(", ");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Apatris Compliance Alert</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
          <tr>
            <td style="background:${statusColor};padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;opacity:0.8;">Apatris Portal</p>
                    <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1px;">
                      ${isExpired ? "⛔ Document Expired" : "🔴 Compliance Alert"}
                    </h1>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;background:rgba(0,0,0,0.25);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 14px;border-radius:20px;">${statusLabel}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.6;">
                The following worker document requires immediate attention:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;border:1px solid #334155;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr><td style="padding:8px 0;border-bottom:1px solid #1e293b;"><span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Worker Name</span><br/><span style="color:#f1f5f9;font-size:16px;font-weight:700;margin-top:4px;display:block;">${workerName}</span></td></tr>
                      <tr><td style="padding:8px 0;border-bottom:1px solid #1e293b;"><span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Document Type</span><br/><span style="color:#f1f5f9;font-size:16px;font-weight:700;margin-top:4px;display:block;">${documentType}</span></td></tr>
                      <tr><td style="padding:8px 0;border-bottom:1px solid #1e293b;"><span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Expiry Date</span><br/><span style="color:${statusColor};font-size:16px;font-weight:700;margin-top:4px;display:block;">${expiryDate}</span></td></tr>
                      <tr><td style="padding:8px 0;"><span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Status</span><br/><span style="color:${statusColor};font-size:16px;font-weight:700;margin-top:4px;display:block;">${isExpired ? "EXPIRED — Immediate renewal required" : `${daysUntilExpiry} day(s) until expiry — Action required`}</span></td></tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;line-height:1.6;">Please take immediate action to renew this document and update the Apatris Portal accordingly.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#0f172a;padding:16px 32px;border-top:1px solid #1e293b;">
              <p style="margin:0;color:#475569;font-size:11px;text-align:center;">This is an automated alert from the <strong style="color:#64748b;">Apatris Compliance Portal</strong>. Do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const transport = createTransport();

  try {
    const info = await transport.sendMail({
      from: `"Apatris Portal" <${SMTP_USER}>`,
      to: toAddresses,
      subject,
      html,
    });
    console.log(`[Mailer] Alert email sent → ${toAddresses} (messageId: ${info.messageId})`);
    execute(
      `INSERT INTO notification_log (channel, worker_name, message_preview, recipient, status)
       VALUES ('email', $1, $2, $3, 'sent')`,
      [workerName, `${documentType} expires ${expiryDate} (${daysUntilExpiry}d)`, toAddresses]
    ).catch(() => {});
  } catch (err) {
    execute(
      `INSERT INTO notification_log (channel, worker_name, message_preview, recipient, status)
       VALUES ('email', $1, $2, $3, 'failed')`,
      [workerName, `${documentType} expires ${expiryDate} — ERROR: ${err instanceof Error ? err.message : String(err)}`, toAddresses]
    ).catch(() => {});
    console.error("[Mailer] Failed to send alert email:", err);
    throw err;
  }
}

// ─── OTP Email ────────────────────────────────────────────────────────────────
export async function sendOtpEmail(to: string, name: string, otp: string): Promise<void> {
  if (!isMailConfigured()) {
    console.warn(`[Mailer] OTP email skipped for ${to} because SMTP is not configured.`);
    return;
  }
  const transport = createTransport();
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
        <tr><td style="background:#C41E18;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;opacity:0.8;">Apatris Portal</p>
          <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:800;">Two-Factor Login Code</h1>
        </td></tr>
        <tr><td style="padding:36px 32px;text-align:center;">
          <p style="color:#94a3b8;font-size:14px;margin:0 0 28px;">Hi ${name}, use the code below to complete your login. It expires in <strong style="color:#f1f5f9;">5 minutes</strong>.</p>
          <div style="display:inline-block;background:#0f172a;border:2px solid #C41E18;border-radius:12px;padding:20px 40px;margin-bottom:28px;">
            <span style="font-size:40px;font-weight:900;letter-spacing:14px;color:#ffffff;font-family:monospace;">${otp}</span>
          </div>
          <p style="color:#64748b;font-size:12px;margin:0;">If you did not attempt to log in, ignore this email and your account remains secure.</p>
        </td></tr>
        <tr><td style="background:#0f172a;padding:16px 32px;border-top:1px solid #1e293b;">
          <p style="margin:0;color:#475569;font-size:11px;text-align:center;">Apatris Compliance Portal — Do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
  await transport.sendMail({
    from: `"Apatris Portal" <manishshetty79@gmail.com>`,
    to,
    subject: `Your Apatris Login Code: ${otp}`,
    html,
  });
  console.log(`[Mailer] OTP sent → ${to}`);
}

// ─── Payslip Email ────────────────────────────────────────────────────────────
export interface PayslipEmailPayload {
  workerName: string;
  workerEmail: string;
  monthYear: string;
  site: string;
  totalHours: number;
  hourlyRate: number;
  grossPayout: number;
  advancesDeducted: number;
  penaltiesDeducted: number;
  finalNettoPayout: number;
}

function fmtPLN(n: number) {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " PLN";
}

export async function sendPayslipEmail(payload: PayslipEmailPayload): Promise<void> {
  if (!isMailConfigured()) return;
  const { workerName, workerEmail, monthYear, site, totalHours, hourlyRate, grossPayout, advancesDeducted, penaltiesDeducted, finalNettoPayout } = payload;
  const transport = createTransport();
  const [year, month] = monthYear.split("-");
  const monthNames: Record<string, string> = { "01": "January", "02": "February", "03": "March", "04": "April", "05": "May", "06": "June", "07": "July", "08": "August", "09": "September", "10": "October", "11": "November", "12": "December" };
  const periodLabel = `${monthNames[month] ?? month} ${year}`;

  const row = (label: string, value: string, color = "#f1f5f9", bold = false) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">${label}</td><td style="padding:10px 0;border-bottom:1px solid #1e293b;text-align:right;color:${color};font-size:13px;font-weight:${bold ? "700" : "400"};font-family:monospace;">${value}</td></tr>`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
        <tr><td style="background:#C41E18;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><p style="margin:0;color:#fff;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;opacity:0.8;">APATRIS SP. Z O.O. · NIP: 5252828706</p>
            <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:800;">Pay Slip — ${periodLabel}</h1></td>
            <td align="right"><span style="display:inline-block;background:rgba(0,0,0,0.25);color:#fff;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 14px;border-radius:20px;">ROZLICZENIE</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 4px;color:#94a3b8;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Worker</p>
          <p style="margin:0 0 6px;color:#f1f5f9;font-size:18px;font-weight:700;">${workerName}</p>
          <p style="margin:0 0 24px;color:#64748b;font-size:13px;">${site ? `Site: ${site}` : ""}</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${row("Period", periodLabel)}
            ${row("Hours Worked", `${totalHours} h`)}
            ${row("Hourly Rate", fmtPLN(hourlyRate))}
            ${row("Gross Pay", fmtPLN(grossPayout), "#93c5fd")}
            ${advancesDeducted > 0 ? row("Advances Deducted", `− ${fmtPLN(advancesDeducted)}`, "#fb923c") : ""}
            ${penaltiesDeducted > 0 ? row("Penalties Deducted", `− ${fmtPLN(penaltiesDeducted)}`, "#f87171") : ""}
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;margin-top:16px;border:1px solid #C41E18;">
            <tr><td style="padding:16px 20px;"><span style="color:#94a3b8;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Net Pay (Netto)</span></td>
            <td style="padding:16px 20px;text-align:right;"><span style="color:#4ade80;font-size:22px;font-weight:900;font-family:monospace;">${fmtPLN(finalNettoPayout)}</span></td></tr>
          </table>
          <p style="margin:20px 0 0;color:#475569;font-size:11px;line-height:1.6;">This is your official pay slip for the period above. Please retain it for your records. For any queries, contact your site coordinator or Apatris administration.</p>
        </td></tr>
        <tr><td style="background:#0f172a;padding:16px 32px;border-top:1px solid #1e293b;">
          <p style="margin:0;color:#475569;font-size:11px;text-align:center;">APATRIS SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ · ul. Chłodna 51, 00-867 Warszawa · NIP: 5252828706 · KRS: 0000849614 · REGON: 386546470</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  await transport.sendMail({
    from: `"Apatris Payroll" <${SMTP_USER}>`,
    to: `"${workerName}" <${workerEmail}>`,
    subject: `Pay Slip — ${periodLabel} | Apatris`,
    html,
  });
  console.log(`[Mailer] Payslip sent → ${workerEmail}`);
}
