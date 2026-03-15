import { fetchDocuments, ensureDocumentsTable, type DocumentRecord } from "./airtable-documents.js";
import { fetchAdmins } from "./airtable-admins.js";
import { sendAlertEmail, isMailConfigured } from "./mailer.js";

const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory log of recent alerts (last 100)
export const alertLog: Array<{
  timestamp: string;
  level: "YELLOW" | "RED";
  workerName: string;
  documentType: string;
  expiryDate: string;
  daysUntilExpiry: number;
  notified: string[];
}> = [];

interface AdminContact {
  name: string;
  email: string;
  phone: string;
}

async function getAdminContacts(): Promise<AdminContact[]> {
  try {
    const admins = await fetchAdmins();
    return admins
      .filter((a) => a.email || a.phone)
      .map((a) => ({ name: a.fullName, email: a.email, phone: a.phone }));
  } catch {
    return [];
  }
}

function formatNotifyTargets(contacts: AdminContact[]): string[] {
  return contacts.map(
    (a) => `${a.name}${a.email ? ` <${a.email}>` : ""}${a.phone ? ` / ${a.phone}` : ""}`
  );
}

function pushAlertLog(
  doc: DocumentRecord,
  notifyTargets: string[]
): void {
  const level: "YELLOW" | "RED" =
    doc.status === "YELLOW" ? "YELLOW" : "RED";

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    workerName: doc.workerName,
    documentType: doc.documentType,
    expiryDate: doc.expiryDate,
    daysUntilExpiry: doc.daysUntilExpiry,
    notified: notifyTargets,
  };
  if (alertLog.length >= 100) alertLog.shift();
  alertLog.push(entry);
}

// Immediately fire an alert for a single document (used when docs are added/updated manually)
export async function fireAlertForDocument(doc: DocumentRecord): Promise<void> {
  if (doc.status !== "RED" && doc.status !== "YELLOW" && doc.status !== "EXPIRED") return;

  const contacts = await getAdminContacts();
  const notifyTargets = formatNotifyTargets(contacts);
  pushAlertLog(doc, notifyTargets);

  const urgency =
    doc.status === "EXPIRED" ? "⛔ EXPIRED" :
    doc.status === "RED"     ? "🔴 CRITICAL (≤30 days)" :
                               "🟡 WARNING (≤60 days)";

  console.log(`[Alert] ${urgency} — ${doc.workerName} · ${doc.documentType} · expires ${doc.expiryDate} (${doc.daysUntilExpiry} days)`);
  console.log(`  Worker:    ${doc.workerName}`);
  console.log(`  Document:  ${doc.documentType}`);
  console.log(`  Expires:   ${doc.expiryDate} (${doc.daysUntilExpiry} days remaining)`);
  if (notifyTargets.length > 0) {
    console.log(`  Notify:    ${notifyTargets.join(" | ")}`);
  } else {
    console.log(`  Notify:    No admin contacts configured — add emails/phones in Admin Settings`);
  }

  // Send real email for RED / EXPIRED documents
  if (doc.status === "RED" || doc.status === "EXPIRED") {
    const emailRecipients = contacts.filter((c) => c.email);
    if (emailRecipients.length > 0) {
      if (isMailConfigured()) {
        sendAlertEmail({
          workerName: doc.workerName,
          documentType: doc.documentType,
          expiryDate: doc.expiryDate,
          daysUntilExpiry: doc.daysUntilExpiry,
          status: doc.status as "RED" | "EXPIRED",
          recipients: emailRecipients.map((c) => ({ name: c.name, email: c.email })),
        }).catch((e) => console.error("[Mailer] Email send error:", e));
      } else {
        console.warn("[Mailer] Email not configured — set SMTP_USER and SMTP_PASS secrets to enable.");
      }
    }
  }
}

async function runDailyScan(): Promise<void> {
  const now = new Date().toISOString();
  console.log(`[Scheduler] Daily compliance scan started at ${now}`);

  try {
    await ensureDocumentsTable();
    const documents = await fetchDocuments();
    const alertDocs = documents.filter(
      (d) => d.status === "RED" || d.status === "YELLOW" || d.status === "EXPIRED"
    );

    if (alertDocs.length === 0) {
      console.log("[Scheduler] All documents are compliant. No alerts.");
      return;
    }

    const contacts = await getAdminContacts();
    const notifyTargets = formatNotifyTargets(contacts);
    const emailRecipients = contacts.filter((c) => c.email).map((c) => ({ name: c.name, email: c.email }));

    console.log(
      `[Scheduler] ${alertDocs.length} document(s) require attention. ` +
        `Administrators to notify: ${notifyTargets.length > 0 ? notifyTargets.join(", ") : "none configured"}`
    );

    for (const doc of alertDocs) {
      pushAlertLog(doc, notifyTargets);

      const urgency =
        doc.status === "EXPIRED" ? "⛔ EXPIRED" :
        doc.status === "RED"     ? "🔴 CRITICAL (≤30 days)" :
                                   "🟡 WARNING (≤60 days)";

      console.log(
        `[Scheduler] ${urgency} — ${doc.workerName} · ${doc.documentType} · expires ${doc.expiryDate} (${doc.daysUntilExpiry} days)`
      );

      // Send email for each RED / EXPIRED document
      if ((doc.status === "RED" || doc.status === "EXPIRED") && emailRecipients.length > 0) {
        if (isMailConfigured()) {
          sendAlertEmail({
            workerName: doc.workerName,
            documentType: doc.documentType,
            expiryDate: doc.expiryDate,
            daysUntilExpiry: doc.daysUntilExpiry,
            status: doc.status as "RED" | "EXPIRED",
            recipients: emailRecipients,
          }).catch((e) => console.error("[Mailer] Email send error:", e));
        } else {
          console.warn("[Mailer] Email not configured — set SMTP_USER and SMTP_PASS secrets to enable.");
        }
      }
    }

    const critical = alertDocs.filter((d) => d.status === "RED" || d.status === "EXPIRED").length;
    const warnings = alertDocs.filter((d) => d.status === "YELLOW").length;
    console.log(`[Scheduler] Scan complete. ${critical} critical, ${warnings} warnings.`);
  } catch (err) {
    console.error("[Scheduler] Scan failed:", err);
  }
}

function msUntilNextScan(): number {
  // Run at 08:00 server time each day
  const now = new Date();
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function startScheduler(): void {
  // Run immediately on startup (after a short delay for server to initialise)
  setTimeout(async () => {
    await runDailyScan();

    // Then schedule daily at 08:00
    const msToFirst = msUntilNextScan();
    console.log(
      `[Scheduler] Next daily scan scheduled in ${Math.round(msToFirst / 1000 / 60)} minutes (08:00 server time).`
    );
    setTimeout(function daily() {
      runDailyScan().finally(() => {
        setTimeout(daily, SCAN_INTERVAL_MS);
      });
    }, msToFirst);
  }, 5000);
}

// Manual trigger for API route
export async function triggerScanNow() {
  await runDailyScan();
  return alertLog.slice(-20);
}
