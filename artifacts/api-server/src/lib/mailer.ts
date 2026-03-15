import nodemailer from "nodemailer";

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

export function isMailConfigured(): boolean {
  return Boolean(SMTP_USER && SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
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

          <!-- Header -->
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

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.6;">
                The following worker document requires immediate attention:
              </p>

              <!-- Document Detail Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;border:1px solid #334155;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #1e293b;">
                          <span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Worker Name</span><br/>
                          <span style="color:#f1f5f9;font-size:16px;font-weight:700;margin-top:4px;display:block;">${workerName}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #1e293b;">
                          <span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Document Type</span><br/>
                          <span style="color:#f1f5f9;font-size:16px;font-weight:700;margin-top:4px;display:block;">${documentType}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #1e293b;">
                          <span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Expiry Date</span><br/>
                          <span style="color:${statusColor};font-size:16px;font-weight:700;margin-top:4px;display:block;">${expiryDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Status</span><br/>
                          <span style="color:${statusColor};font-size:16px;font-weight:700;margin-top:4px;display:block;">
                            ${isExpired ? "EXPIRED — Immediate renewal required" : `${daysUntilExpiry} day(s) until expiry — Action required`}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;line-height:1.6;">
                Please take immediate action to renew this document and update the Apatris Portal accordingly.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0f172a;padding:16px 32px;border-top:1px solid #1e293b;">
              <p style="margin:0;color:#475569;font-size:11px;text-align:center;">
                This is an automated alert from the <strong style="color:#64748b;">Apatris Compliance Portal</strong>.
                Do not reply to this email.
              </p>
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
  } catch (err) {
    console.error("[Mailer] Failed to send alert email:", err);
    throw err;
  }
}
