import { fetchDocuments, type DocumentRecord } from "./documents-db.js";
import { fetchAdmins } from "./admins-db.js";
import { sendAlertEmail, isMailConfigured } from "./mailer.js";
import { fetchAllWorkers } from "./workers-db.js";
import { mapRowToWorker, type Worker } from "./compliance.js";
import { saveSnapshot } from "./snapshots-db.js";
import { getCoordinatorForSite } from "./coordinators-db.js";

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
export async function fireAlertForDocument(doc: DocumentRecord, workerSite?: string | null): Promise<void> {
  if (doc.status !== "RED" && doc.status !== "YELLOW" && doc.status !== "EXPIRED") return;

  const contacts = await getAdminContacts();

  // CC site coordinator if known
  const coordRecipients: Array<{ name: string; email: string }> = [];
  if (workerSite) {
    try {
      const coord = await getCoordinatorForSite(workerSite);
      if (coord?.alertEmail) coordRecipients.push({ name: coord.name, email: coord.alertEmail });
    } catch { /* non-blocking */ }
  }

  const allRecipients = [
    ...contacts.filter((c) => c.email).map((c) => ({ name: c.name, email: c.email })),
    ...coordRecipients,
  ];

  const notifyTargets = [
    ...formatNotifyTargets(contacts),
    ...coordRecipients.map((r) => `${r.name} <${r.email}> (Site Coordinator)`),
  ];
  pushAlertLog(doc, notifyTargets);

  const urgency =
    doc.status === "EXPIRED" ? "⛔ EXPIRED" :
    doc.status === "RED"     ? "🔴 CRITICAL (≤30 days)" :
                               "🟡 WARNING (≤60 days)";

  console.log(`[Alert] ${urgency} — ${doc.workerName} · ${doc.documentType} · expires ${doc.expiryDate} (${doc.daysUntilExpiry} days)`);
  if (notifyTargets.length > 0) {
    console.log(`  Notify:    ${notifyTargets.join(" | ")}`);
  } else {
    console.log(`  Notify:    No admin contacts configured — add emails/phones in Admin Settings`);
  }

  if (doc.status === "RED" || doc.status === "EXPIRED" || doc.status === "YELLOW") {
    if (allRecipients.length > 0 && isMailConfigured()) {
      sendAlertEmail({
        workerName: doc.workerName,
        documentType: doc.documentType,
        expiryDate: doc.expiryDate,
        daysUntilExpiry: doc.daysUntilExpiry,
        status: (doc.status === "YELLOW" ? "RED" : doc.status) as "RED" | "EXPIRED",
        recipients: allRecipients,
      }).catch((e) => console.error("[Mailer] Email send error:", e));
    } else if (!isMailConfigured()) {
      console.warn("[Mailer] Email not configured — set SMTP_USER and SMTP_PASS secrets to enable.");
    }
  }
}

async function runDailyScan(): Promise<void> {
  const now = new Date().toISOString();
  console.log(`[Scheduler] Daily compliance scan started at ${now}`);

  try {
    const documents = await fetchDocuments();

    // ── Worker document expiry checks from WELDERS table ──────────────────
    try {
      const workerRows = await fetchAllWorkers();
      const workers = workerRows.map(mapRowToWorker);
      const today = Date.now();

      const workerDocFields: Array<{ key: keyof Worker; label: string }> = [
        { key: "contractEndDate",    label: "Contract" },
        { key: "trcExpiry",          label: "TRC" },
        { key: "passportExpiry",     label: "Passport" },
        { key: "bhpExpiry",          label: "BHP Certificate" },
        { key: "workPermitExpiry",   label: "Work Permit" },
        { key: "medicalExamExpiry",  label: "Medical Exam" },
        { key: "oswiadczenieExpiry", label: "Oświadczenie" },
        { key: "udtCertExpiry",      label: "UDT Certificate" },
      ];

      for (const w of workers) {
        for (const { key, label } of workerDocFields) {
          const expDate = w[key] as string | null;
          if (!expDate) continue;
          const expMs = new Date(expDate).getTime();
          const daysLeft = Math.ceil((expMs - today) / 86400000);
          if (daysLeft > 60) continue; // Compliant — no alert needed
          const status: DocumentRecord["status"] =
            daysLeft <= 0  ? "EXPIRED" :
            daysLeft <= 30 ? "RED" : "YELLOW";
          const existingId = `${key}-${w.id}`;
          // Avoid duplicates if the document table already has an entry
          if (documents.some((d) => d.id === existingId)) continue;
          documents.push({
            id: existingId,
            workerName: w.name,
            workerId: w.id,
            documentType: label,
            issueDate: "",
            expiryDate: expDate,
            daysUntilExpiry: daysLeft,
            status,
          });
        }
      }
    } catch (e) {
      console.warn("[Scheduler] Worker expiry check failed:", e);
    }

    const alertDocs = documents.filter(
      (d) => d.status === "RED" || d.status === "YELLOW" || d.status === "EXPIRED"
    );

    // ── Save daily compliance snapshot ────────────────────────────────────
    try {
      const allWorkerRows = await fetchAllWorkers();
      const allWorkers = allWorkerRows.map(mapRowToWorker);
      const total = allWorkers.length;
      const critical = allWorkers.filter((w) => w.complianceStatus === "critical").length;
      const warning = allWorkers.filter((w) => w.complianceStatus === "warning").length;
      const expired = allWorkers.filter((w) => w.complianceStatus === "non-compliant").length;
      const compliant = total - critical - warning - expired;
      await saveSnapshot({
        date: new Date().toISOString().slice(0, 10),
        total,
        compliant: compliant < 0 ? 0 : compliant,
        warning,
        critical,
        expired,
      });
      console.log(`[Scheduler] Snapshot saved: ${total} workers (${compliant} OK, ${warning} warn, ${critical} critical, ${expired} expired).`);
    } catch (e) {
      console.warn("[Scheduler] Snapshot save failed:", e);
    }

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

    // Build workerId → assignedSite map for coordinator lookup
    const workerSiteMap = new Map<string, string>();
    try {
      const allRecs = await fetchAllWorkers();
      for (const r of allRecs) {
        const w = mapRowToWorker(r);
        if (w.assignedSite) workerSiteMap.set(w.id, w.assignedSite);
      }
    } catch { /* non-blocking */ }

    for (const doc of alertDocs) {
      // Resolve site coordinator recipients for this document's worker
      const workerSite = workerSiteMap.get(doc.workerId) ?? null;
      const coordRecips: Array<{ name: string; email: string }> = [];
      if (workerSite) {
        try {
          const coord = await getCoordinatorForSite(workerSite);
          if (coord?.alertEmail) coordRecips.push({ name: coord.name, email: coord.alertEmail });
        } catch { /* non-blocking */ }
      }
      const docRecipients = [...emailRecipients, ...coordRecips];
      const docTargets = [
        ...notifyTargets,
        ...coordRecips.map((r) => `${r.name} <${r.email}> (Site Coordinator)`),
      ];

      pushAlertLog(doc, docTargets);

      const urgency =
        doc.status === "EXPIRED" ? "⛔ EXPIRED" :
        doc.status === "RED"     ? "🔴 CRITICAL (≤30 days)" :
                                   "🟡 WARNING (≤60 days)";

      console.log(
        `[Scheduler] ${urgency} — ${doc.workerName} · ${doc.documentType} · expires ${doc.expiryDate} (${doc.daysUntilExpiry} days)`
      );

      if (docRecipients.length > 0) {
        if (isMailConfigured()) {
          sendAlertEmail({
            workerName: doc.workerName,
            documentType: doc.documentType,
            expiryDate: doc.expiryDate,
            daysUntilExpiry: doc.daysUntilExpiry,
            status: (doc.status === "YELLOW" || doc.status === "RED") ? "RED" : "EXPIRED",
            recipients: docRecipients,
          }).catch((e) => console.error("[Mailer] Email send error:", e));
        } else {
          console.warn("[Mailer] Email not configured — set SMTP_USER and SMTP_PASS secrets to enable.");
        }
      }
    }

    const critical2 = alertDocs.filter((d) => d.status === "RED" || d.status === "EXPIRED").length;
    const warnings = alertDocs.filter((d) => d.status === "YELLOW").length;
    console.log(`[Scheduler] Scan complete. ${critical2} critical, ${warnings} warnings.`);
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
  // Schedule daily scan at 08:00 server time only — does NOT fire on startup
  // to avoid repeated alert emails each time the server restarts.
  const msToFirst = msUntilNextScan();
  console.log(
    `[Scheduler] Daily compliance scan scheduled in ${Math.round(msToFirst / 1000 / 60)} minutes (08:00 server time).`
  );
  setTimeout(function daily() {
    runDailyScan().finally(() => {
      setTimeout(daily, SCAN_INTERVAL_MS);
    });
  }, msToFirst);
}

// Manual trigger for API route
export async function triggerScanNow() {
  await runDailyScan();
  return alertLog.slice(-20);
}
