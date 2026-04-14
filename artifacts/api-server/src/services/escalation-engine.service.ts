/**
 * Auto-Escalation Engine — proactive case management.
 *
 * Runs on scheduler. Checks all active cases for SLA breaches.
 * Escalation chain:
 *   1 day overdue → push notification to all
 *   3 days overdue → WhatsApp to coordinator
 *   7 days overdue → email to T1 executive + push alert
 *
 * Also checks document expiry (7/14/30 days) and sends push alerts.
 */

import { query } from "../lib/db.js";

interface EscalationResult {
  casesChecked: number;
  escalations: number;
  docAlerts: number;
  errors: number;
}

export async function runEscalationScan(tenantId: string): Promise<EscalationResult> {
  let escalations = 0, docAlerts = 0, errors = 0;

  // ── 1. Case SLA breach escalation ──────────────────────────────────
  const breachedCases = await query<any>(
    `SELECT c.*, w.first_name, w.last_name,
       EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400 AS days_in_stage,
       CASE WHEN c.sla_deadline IS NOT NULL AND NOW() > c.sla_deadline THEN true ELSE false END AS sla_breached
     FROM legal_cases c JOIN workers w ON c.worker_id = w.id
     WHERE c.tenant_id = $1 AND c.status NOT IN ('APPROVED')
       AND c.sla_deadline IS NOT NULL AND NOW() > c.sla_deadline`,
    [tenantId]
  );

  for (const c of breachedCases) {
    try {
      const workerName = `${c.first_name} ${c.last_name}`;
      const daysOver = Math.round(c.days_in_stage - (c.sla_deadline ? 0 : 999));

      // Push notification (1+ day)
      try {
        const { notifySLABreach } = await import("./push-sender.service.js");
        await notifySLABreach(tenantId, workerName, c.case_type, c.status, c.days_in_stage);
      } catch { /* push may not be configured */ }

      // WhatsApp to coordinator (3+ days over SLA)
      if (daysOver >= 3) {
        try {
          const { sendWhatsAppAlert } = await import("../lib/whatsapp.js");
          await sendWhatsAppAlert({
            workerName,
            permitType: `${c.case_type} Case`,
            daysUntilExpiry: -daysOver,
          });
        } catch { /* WhatsApp may not be configured */ }
      }

      // Email to executive (7+ days over SLA)
      if (daysOver >= 7) {
        try {
          const { sendAlertEmail } = await import("../lib/mailer.js");
          await sendAlertEmail({
            to: "manish@apatris.pl",
            workerName,
            subject: `[ESCALATION] ${c.case_type} case stuck ${Math.round(c.days_in_stage)} days — ${workerName}`,
            status: "critical",
            details: `Case ${c.id.slice(0, 8)} stuck in ${c.status} for ${Math.round(c.days_in_stage)} days (SLA breached by ${daysOver} days). Worker: ${workerName}. Blocker: ${c.blocker_reason ?? "none"}.`,
          });
        } catch { /* email may not be configured */ }
      }

      // Log in case notebook
      try {
        const { logAlert } = await import("./case-notebook.service.js");
        await logAlert(c.id, tenantId, "SLA_ESCALATION",
          `Auto-escalation: case in ${c.status} for ${Math.round(c.days_in_stage)} days (${daysOver}d over SLA). ${daysOver >= 7 ? "Executive notified." : daysOver >= 3 ? "Coordinator notified via WhatsApp." : "Push notification sent."}`
        );
      } catch { /* non-blocking */ }

      escalations++;
    } catch { errors++; }
  }

  // ── 2. Document expiry alerts ──────────────────────────────────────
  const EXPIRY_THRESHOLDS = [7, 14, 30];
  const now = new Date();

  for (const threshold of EXPIRY_THRESHOLDS) {
    const targetDate = new Date(now.getTime() + threshold * 86_400_000).toISOString().slice(0, 10);
    const fields = [
      { col: "trc_expiry", label: "TRC" },
      { col: "work_permit_expiry", label: "Work Permit" },
      { col: "bhp_expiry", label: "BHP Certificate" },
      { col: "medical_exam_expiry", label: "Medical Exam" },
      { col: "contract_end_date", label: "Contract" },
    ];

    for (const field of fields) {
      try {
        const workers = await query<any>(
          `SELECT id, first_name, last_name, ${field.col}
           FROM workers WHERE tenant_id = $1 AND ${field.col}::date = $2::date`,
          [tenantId, targetDate]
        );

        for (const w of workers) {
          try {
            const { notifyDocExpiry } = await import("./push-sender.service.js");
            await notifyDocExpiry(tenantId, `${w.first_name} ${w.last_name}`, field.label, threshold);
            docAlerts++;
          } catch { /* push may not be configured */ }
        }
      } catch { errors++; }
    }
  }

  // ── 3. Deadline countdown check ─────────────────────────────────
  try {
    const { runDeadlineCheck } = await import("./deadline-engine.service.js");
    const deadlineResult = await runDeadlineCheck(tenantId);
    escalations += deadlineResult.escalated;
    docAlerts += deadlineResult.expired;
  } catch { errors++; }

  return { casesChecked: breachedCases.length, escalations, docAlerts, errors };
}
