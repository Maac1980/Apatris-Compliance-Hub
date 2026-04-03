import { query, execute } from "./db.js";

let twilioClient: any = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  try {
    const Twilio = require("twilio");
    twilioClient = new Twilio(sid, token);
    return twilioClient;
  } catch {
    console.warn("[WhatsApp] twilio package not available");
    return null;
  }
}

export function isWhatsAppConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER);
}

export async function sendWhatsAppAlert(opts: {
  to: string;
  workerName: string;
  workerI: string;
  permitType: string;
  daysRemaining: number;
  tenantId: string;
}): Promise<{ success: boolean; sid?: string; error?: string }> {
  const client = getTwilioClient();
  const from = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!client || !from) {
    // Log as pending when Twilio is not configured
    await logNotification({
      channel: "whatsapp",
      workerId: opts.workerI,
      workerName: opts.workerName,
      recipient: opts.to,
      message: buildMessage(opts.workerName, opts.permitType, opts.daysRemaining),
      status: "pending",
      tenantId: opts.tenantId,
    });
    return { success: false, error: "Twilio not configured" };
  }

  const message = buildMessage(opts.workerName, opts.permitType, opts.daysRemaining);

  try {
    const result = await client.messages.create({
      from: `whatsapp:${from}`,
      to: `whatsapp:${opts.to}`,
      body: message,
    });

    await logNotification({
      channel: "whatsapp",
      workerId: opts.workerI,
      workerName: opts.workerName,
      recipient: opts.to,
      message,
      status: "sent",
      tenantId: opts.tenantId,
      twilioSid: result.sid,
    });

    return { success: true, sid: result.sid };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    await logNotification({
      channel: "whatsapp",
      workerId: opts.workerI,
      workerName: opts.workerName,
      recipient: opts.to,
      message,
      status: "failed",
      tenantId: opts.tenantId,
    });

    return { success: false, error: errorMsg };
  }
}

function buildMessage(workerName: string, permitType: string, days: number): string {
  return `Hi ${workerName}, your ${permitType} expires in ${days} days. Please contact your coordinator immediately. Reply DONE when renewed.`;
}

async function logNotification(opts: {
  channel: string;
  workerId: string;
  workerName: string;
  recipient: string;
  message: string;
  status: string;
  tenantId: string;
  twilioSid?: string;
}): Promise<void> {
  try {
    await execute(
      `INSERT INTO notification_log (channel, worker_id, worker_name, sent_by, recipient, message_preview, status, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [opts.channel, opts.workerId, opts.workerName, "system-immigration-alert", opts.recipient, opts.message.slice(0, 200), opts.status, opts.tenantId]
    );
  } catch (err) {
    console.error("[WhatsApp] Failed to log notification:", err);
  }
}

// Alert thresholds
export const ALERT_THRESHOLDS = [60, 30, 14, 7, 1];

// Scan all immigration permits and send alerts at thresholds
export async function runImmigrationAlertScan(tenantId: string): Promise<{ sent: number; skipped: number; errors: number }> {
  const permits = await query<Record<string, any>>(
    `SELECT ip.*, w.phone AS worker_phone
     FROM immigration_permits ip
     LEFT JOIN workers w ON w.id = ip.worker_id
     WHERE ip.tenant_id = $1 AND ip.status = 'active' AND ip.expiry_date IS NOT NULL`,
    [tenantId]
  );

  let sent = 0, skipped = 0, errors = 0;

  for (const p of permits) {
    // Skip if TRC application submitted — worker is legally protected
    if (p.trc_application_submitted === true) {
      skipped++;
      continue;
    }

    const days = Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / 86_400_000);

    // Only alert at exact thresholds
    if (!ALERT_THRESHOLDS.includes(days)) continue;

    const phone = p.worker_phone;
    if (!phone) {
      skipped++;
      continue;
    }

    // Check if we already sent this alert today
    const existing = await query(
      `SELECT id FROM notification_log
       WHERE worker_id = $1 AND channel = 'whatsapp' AND message_preview LIKE $2
       AND created_at >= CURRENT_DATE AND tenant_id = $3`,
      [p.worker_id, `%expires in ${days} days%`, tenantId]
    );
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const result = await sendWhatsAppAlert({
      to: phone,
      workerName: p.worker_name,
      workerI: p.worker_id,
      permitType: p.permit_type,
      daysRemaining: days,
      tenantId,
    });

    if (result.success) sent++;
    else errors++;
  }

  console.log(`[Immigration Alerts] Sent: ${sent}, Skipped: ${skipped}, Errors: ${errors}`);
  return { sent, skipped, errors };
}
