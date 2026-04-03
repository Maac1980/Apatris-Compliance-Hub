import { getDefaultTenantId } from "./tenant.js";
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
    const admins = await fetchAdmins(getDefaultTenantId());
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
      const coord = await getCoordinatorForSite(workerSite, getDefaultTenantId());
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
    const documents = await fetchDocuments(getDefaultTenantId());

    // ── Worker document expiry checks from WELDERS table ──────────────────
    try {
      const workerRows = await fetchAllWorkers(getDefaultTenantId());
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
      const allWorkerRows = await fetchAllWorkers(getDefaultTenantId());
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
      }, getDefaultTenantId());
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
      const allRecs = await fetchAllWorkers(getDefaultTenantId());
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
          const coord = await getCoordinatorForSite(workerSite, getDefaultTenantId());
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
    runDailyScan()
      .then(() => runImmigrationAlerts())
      .then(() => runBenchAlerts())
      .then(() => runFinesScan())
      .then(() => runTrustScores())
      .finally(() => {
        setTimeout(daily, SCAN_INTERVAL_MS);
      });
  }, msToFirst);
}

// Trust score calculation — runs after fines scan
async function runTrustScores(): Promise<void> {
  try {
    const { runTrustScoreCalculation } = await import("../routes/trust.js");
    const tenantId = getDefaultTenantId();
    if (!tenantId) return;
    await runTrustScoreCalculation(tenantId);
  } catch (err) {
    console.error("[Scheduler] Trust score calc failed:", err instanceof Error ? err.message : err);
  }
}

// Fines prediction scan — runs after bench alerts
async function runFinesScan(): Promise<void> {
  try {
    const { runFineScan } = await import("../routes/fines.js");
    const tenantId = getDefaultTenantId();
    if (!tenantId) return;
    await runFineScan(tenantId);
  } catch (err) {
    console.error("[Scheduler] Fines scan failed:", err instanceof Error ? err.message : err);
  }
}

// Bench alerts — runs after immigration alerts
async function runBenchAlerts(): Promise<void> {
  try {
    const { runBenchAlertScan } = await import("../routes/bench.js");
    await runBenchAlertScan();
  } catch (err) {
    console.error("[Scheduler] Bench alert scan failed:", err instanceof Error ? err.message : err);
  }
}

// Immigration permit WhatsApp alerts — runs after daily compliance scan
async function runImmigrationAlerts(): Promise<void> {
  try {
    const { runImmigrationAlertScan } = await import("./whatsapp.js");
    const tenantId = getDefaultTenantId();
    if (!tenantId) return;
    await runImmigrationAlertScan(tenantId);
  } catch (err) {
    console.error("[Scheduler] Immigration alert scan failed:", err instanceof Error ? err.message : err);
  }
}

// Manual trigger for API route
export async function triggerScanNow() {
  await runDailyScan();
  return alertLog.slice(-20);
}

// ── Weekly compliance report email ─────────────────────────────────────────
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function sendWeeklyReport(): Promise<void> {
  if (!isMailConfigured()) return;
  const tenantId = getDefaultTenantId();

  try {
    const rows = await fetchAllWorkers(tenantId);
    const workers = rows.map(mapRowToWorker);
    const admins = await fetchAdmins(tenantId);

    const total = workers.length;
    const compliant = workers.filter(w => w.complianceStatus === "compliant").length;
    const warning = workers.filter(w => w.complianceStatus === "warning").length;
    const critical = workers.filter(w => w.complianceStatus === "critical").length;
    const nonCompliant = workers.filter(w => w.complianceStatus === "non-compliant").length;
    const rate = total > 0 ? Math.round((compliant / total) * 100) : 0;

    const urgentList = workers
      .filter(w => w.complianceStatus !== "compliant")
      .slice(0, 10)
      .map(w => `• ${w.name} — ${w.assignedSite || "No site"} — ${w.complianceStatus} (${w.daysUntilNextExpiry ?? "?"}d)`)
      .join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#1e293b;padding:20px;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:18px;">APATRIS — Weekly Compliance Report</h1>
          <p style="color:#94a3b8;margin:4px 0 0;font-size:12px;">${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;">
          <h2 style="margin:0 0 12px;font-size:14px;color:#334155;">Compliance Summary</h2>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td style="padding:6px 0;color:#64748b;">Total Workers</td><td style="text-align:right;font-weight:bold;">${total}</td></tr>
            <tr><td style="padding:6px 0;color:#22c55e;">✓ Compliant</td><td style="text-align:right;font-weight:bold;color:#22c55e;">${compliant}</td></tr>
            <tr><td style="padding:6px 0;color:#f59e0b;">⚠ Warning</td><td style="text-align:right;font-weight:bold;color:#f59e0b;">${warning}</td></tr>
            <tr><td style="padding:6px 0;color:#ef4444;">✗ Critical</td><td style="text-align:right;font-weight:bold;color:#ef4444;">${critical}</td></tr>
            <tr><td style="padding:6px 0;color:#dc2626;">✗ Non-Compliant</td><td style="text-align:right;font-weight:bold;color:#dc2626;">${nonCompliant}</td></tr>
            <tr style="border-top:2px solid #e2e8f0;"><td style="padding:10px 0;font-weight:bold;font-size:15px;">Compliance Rate</td><td style="text-align:right;font-weight:bold;font-size:20px;color:${rate >= 80 ? "#22c55e" : rate >= 60 ? "#f59e0b" : "#ef4444"};">${rate}%</td></tr>
          </table>
          ${urgentList ? `<h3 style="margin:16px 0 8px;font-size:13px;color:#334155;">Workers Requiring Attention</h3><pre style="background:#fff;padding:12px;border-radius:8px;border:1px solid #e2e8f0;font-size:11px;color:#475569;white-space:pre-wrap;">${urgentList}</pre>` : ""}
        </div>
        <div style="padding:12px 20px;background:#f1f5f9;border-radius:0 0 12px 12px;text-align:center;">
          <p style="margin:0;font-size:10px;color:#94a3b8;">Apatris Sp. z o.o. · ul. Chłodna 51, 00-867 Warszawa · NIP: 5252828706</p>
        </div>
      </div>`;

    // Send to all admin emails
    const recipients = admins.filter(a => a.email).map(a => a.email);
    if (recipients.length === 0) return;

    const nodemailer = await import("nodemailer");
    const transport = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transport.sendMail({
      from: `"Apatris Compliance" <${process.env.SMTP_USER || "noreply@apatris.pl"}>`,
      to: recipients.join(", "),
      subject: `Weekly Compliance Report — ${rate}% · ${total} workers · ${new Date().toLocaleDateString("en-GB")}`,
      html,
    });

    console.log(`[Scheduler] Weekly report sent to ${recipients.length} admins (${rate}% compliance).`);
  } catch (err) {
    console.error("[Scheduler] Weekly report failed:", err instanceof Error ? err.message : err);
  }
}

// Monthly invoice generation — 1st of every month at 06:00
export function startMonthlyInvoices(): void {
  function msUntilFirst6am(): number {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 6, 0, 0, 0);
    return next.getTime() - now.getTime();
  }
  const ms = msUntilFirst6am();
  const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  console.log(`[Scheduler] Monthly invoice generation scheduled in ${Math.round(ms / 1000 / 60 / 60)} hours (1st of month 06:00).`);
  setTimeout(function monthly() {
    import("../routes/invoices.js").then(m => m.runMonthlyInvoiceGeneration()).catch(err =>
      console.error("[Scheduler] Monthly invoice error:", err)
    ).finally(() => setTimeout(monthly, MONTH_MS));
  }, ms);
}

// Weekly mood prompts — every Monday at 09:00
export function startWeeklyMoodPrompts(): void {
  function msUntilNextMonday9am(): number {
    const now = new Date();
    const next = new Date(now);
    next.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
    next.setHours(9, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 7);
    return next.getTime() - now.getTime();
  }
  const ms = msUntilNextMonday9am();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  console.log(`[Scheduler] Weekly mood prompts scheduled in ${Math.round(ms / 1000 / 60 / 60)} hours (Monday 09:00).`);
  setTimeout(function moodWeekly() {
    import("../routes/mood.js").then(m => m.sendWeeklyMoodPrompts()).catch(err =>
      console.error("[Scheduler] Mood prompt error:", err)
    ).finally(() => setTimeout(moodWeekly, WEEK_MS));
  }, ms);
}

// Schedule weekly report — every Monday at 07:00
export function startWeeklyReport(): void {
  if (!isMailConfigured()) {
    console.log("[Scheduler] Weekly report disabled — SMTP not configured.");
    return;
  }
  function msUntilNextMonday7am(): number {
    const now = new Date();
    const next = new Date(now);
    next.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
    next.setHours(7, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 7);
    return next.getTime() - now.getTime();
  }
  const ms = msUntilNextMonday7am();
  console.log(`[Scheduler] Weekly report scheduled in ${Math.round(ms / 1000 / 60 / 60)} hours (Monday 07:00).`);
  setTimeout(function weekly() {
    sendWeeklyReport().finally(() => setTimeout(weekly, WEEK_MS));
  }, ms);
}
