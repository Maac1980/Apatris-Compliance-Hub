import { fetchDocuments, ensureDocumentsTable } from "./airtable-documents.js";
import { fetchAdmins } from "./airtable-admins.js";

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

async function runDailyScan(): Promise<void> {
  const now = new Date().toISOString();
  console.log(`[Scheduler] Daily compliance scan started at ${now}`);

  try {
    await ensureDocumentsTable();
    const documents = await fetchDocuments();
    const alertDocs = documents.filter((d) => d.status === "RED" || d.status === "YELLOW" || d.status === "EXPIRED");

    if (alertDocs.length === 0) {
      console.log("[Scheduler] All documents are compliant. No alerts.");
      return;
    }

    // Fetch admin contacts for notification
    let admins: Array<{ fullName: string; email: string; phone: string }> = [];
    try {
      admins = await fetchAdmins();
    } catch (err) {
      console.warn("[Scheduler] Could not fetch admin contacts:", err);
    }

    const notifyTargets = admins
      .filter((a) => a.email || a.phone)
      .map((a) => `${a.fullName}${a.email ? ` <${a.email}>` : ""}${a.phone ? ` / ${a.phone}` : ""}`);

    console.log(
      `[Scheduler] ${alertDocs.length} document(s) require attention. ` +
        `Administrators to notify: ${notifyTargets.length > 0 ? notifyTargets.join(", ") : "none configured"}`
    );

    for (const doc of alertDocs) {
      const level = doc.status === "GREEN" ? "YELLOW" : (doc.status as "YELLOW" | "RED");
      const realLevel = doc.status === "EXPIRED" ? "RED" : doc.status as "YELLOW" | "RED";

      const entry = {
        timestamp: now,
        level: realLevel,
        workerName: doc.workerName,
        documentType: doc.documentType,
        expiryDate: doc.expiryDate,
        daysUntilExpiry: doc.daysUntilExpiry,
        notified: notifyTargets,
      };

      // Keep alert log trimmed to last 100 entries
      if (alertLog.length >= 100) alertLog.shift();
      alertLog.push(entry);

      const urgency = doc.status === "EXPIRED"
        ? "⛔ EXPIRED"
        : doc.status === "RED"
        ? "🔴 CRITICAL (≤30 days)"
        : "🟡 WARNING (≤60 days)";

      console.log(
        `[Scheduler] ${urgency} — ${doc.workerName} · ${doc.documentType} · expires ${doc.expiryDate} (${doc.daysUntilExpiry} days)`
      );

      // RED zone: log full alert with admin contact details
      if (doc.status === "RED" || doc.status === "EXPIRED") {
        console.log(`[ALERT] Document entering critical zone.`);
        console.log(`  Worker:    ${doc.workerName}`);
        console.log(`  Document:  ${doc.documentType}`);
        console.log(`  Expires:   ${doc.expiryDate} (${doc.daysUntilExpiry} days remaining)`);
        if (notifyTargets.length > 0) {
          console.log(`  Notify:    ${notifyTargets.join(" | ")}`);
        } else {
          console.log(`  Notify:    No admin contacts configured — add emails/phones in Admin Settings`);
        }
      }
    }

    console.log(`[Scheduler] Scan complete. ${alertDocs.filter(d => d.status === "RED" || d.status === "EXPIRED").length} critical, ${alertDocs.filter(d => d.status === "YELLOW").length} warnings.`);
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
