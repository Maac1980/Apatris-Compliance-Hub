/**
 * Weekly Compliance Digest — Monday 8am email to T1/T2.
 *
 * Contents:
 *  - Documents expiring this week
 *  - SLA breaches
 *  - Cases stuck in each stage
 *  - Document health %
 *  - AI-generated docs pending review
 *  - Escalation count
 */

import { query, queryOne } from "../lib/db.js";

interface DigestData {
  expiringThisWeek: Array<{ workerName: string; docType: string; expiryDate: string; daysLeft: number }>;
  slaBreaches: Array<{ workerName: string; caseType: string; stage: string; daysInStage: number }>;
  casePipeline: Record<string, number>;
  docHealth: { compliant: number; expiring: number; action: number; total: number };
  pendingDrafts: number;
  totalWorkers: number;
}

export async function buildWeeklyDigest(tenantId: string): Promise<DigestData> {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  // Expiring this week
  const expiringThisWeek: DigestData["expiringThisWeek"] = [];
  const fields = [
    { col: "trc_expiry", label: "TRC" },
    { col: "work_permit_expiry", label: "Work Permit" },
    { col: "bhp_expiry", label: "BHP" },
    { col: "medical_exam_expiry", label: "Medical Exam" },
    { col: "contract_end_date", label: "Contract" },
    { col: "passport_expiry", label: "Passport" },
  ];

  for (const f of fields) {
    try {
      const rows = await query<any>(
        `SELECT first_name, last_name, ${f.col} FROM workers
         WHERE tenant_id = $1 AND ${f.col}::date BETWEEN $2::date AND $3::date`,
        [tenantId, today, weekEnd]
      );
      for (const r of rows) {
        const daysLeft = Math.ceil((new Date(r[f.col]).getTime() - now.getTime()) / 86_400_000);
        expiringThisWeek.push({
          workerName: `${r.first_name} ${r.last_name}`,
          docType: f.label,
          expiryDate: r[f.col],
          daysLeft,
        });
      }
    } catch { /* column may not exist */ }
  }

  // SLA breaches
  const slaBreaches = await query<any>(
    `SELECT c.case_type, c.status, w.first_name, w.last_name,
       EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400 AS days_in_stage
     FROM legal_cases c JOIN workers w ON c.worker_id = w.id
     WHERE c.tenant_id = $1 AND c.status NOT IN ('APPROVED')
       AND c.sla_deadline IS NOT NULL AND NOW() > c.sla_deadline`,
    [tenantId]
  );

  // Case pipeline
  const pipelineRows = await query<any>(
    "SELECT status, COUNT(*)::int AS count FROM legal_cases WHERE tenant_id = $1 GROUP BY status",
    [tenantId]
  );
  const casePipeline: Record<string, number> = {};
  for (const r of pipelineRows) casePipeline[r.status] = r.count;

  // Doc health
  const workers = await query<any>(
    "SELECT trc_expiry, work_permit_expiry, bhp_expiry, medical_exam_expiry, contract_end_date FROM workers WHERE tenant_id = $1",
    [tenantId]
  );
  let compliant = 0, expiring = 0, action = 0;
  for (const w of workers) {
    const dates = [w.trc_expiry, w.work_permit_expiry, w.bhp_expiry, w.medical_exam_expiry, w.contract_end_date].filter(Boolean);
    const minDays = dates.length > 0 ? Math.min(...dates.map((d: string) => Math.ceil((new Date(d).getTime() - now.getTime()) / 86_400_000))) : 999;
    if (minDays > 60) compliant++;
    else if (minDays > 0) expiring++;
    else action++;
  }

  // Pending AI docs
  const drafts = await queryOne<any>(
    "SELECT COUNT(*)::int AS c FROM case_generated_docs WHERE tenant_id = $1 AND status IN ('DRAFT','UNDER_REVIEW')",
    [tenantId]
  );

  return {
    expiringThisWeek: expiringThisWeek.sort((a, b) => a.daysLeft - b.daysLeft),
    slaBreaches: slaBreaches.map((s: any) => ({
      workerName: `${s.first_name} ${s.last_name}`,
      caseType: s.case_type,
      stage: s.status,
      daysInStage: Math.round(s.days_in_stage),
    })),
    casePipeline,
    docHealth: { compliant, expiring, action, total: workers.length },
    pendingDrafts: drafts?.c ?? 0,
    totalWorkers: workers.length,
  };
}

export async function sendWeeklyDigestEmail(tenantId: string): Promise<void> {
  const digest = await buildWeeklyDigest(tenantId);

  const complianceRate = digest.docHealth.total > 0
    ? Math.round((digest.docHealth.compliant / digest.docHealth.total) * 100)
    : 0;

  const body = `
WEEKLY COMPLIANCE DIGEST — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}

📊 OVERVIEW
Workers: ${digest.totalWorkers} | Compliance: ${complianceRate}% | Pending AI Docs: ${digest.pendingDrafts}

📅 EXPIRING THIS WEEK (${digest.expiringThisWeek.length})
${digest.expiringThisWeek.length === 0 ? "None — all documents safe this week." :
  digest.expiringThisWeek.map(e => `• ${e.workerName} — ${e.docType} expires in ${e.daysLeft} days (${e.expiryDate})`).join("\n")}

⚠️ SLA BREACHES (${digest.slaBreaches.length})
${digest.slaBreaches.length === 0 ? "None — all cases within SLA." :
  digest.slaBreaches.map(s => `• ${s.workerName} — ${s.caseType} stuck in ${s.stage} for ${s.daysInStage} days`).join("\n")}

📋 CASE PIPELINE
${Object.entries(digest.casePipeline).map(([k, v]) => `${k}: ${v}`).join(" | ") || "No active cases"}

📑 DOCUMENT HEALTH
Compliant: ${digest.docHealth.compliant} | Expiring: ${digest.docHealth.expiring} | Action Required: ${digest.docHealth.action}
`.trim();

  try {
    const { sendAlertEmail } = await import("../lib/mailer.js");
    await sendAlertEmail({
      to: "manish@apatris.pl",
      workerName: "Apatris System",
      subject: `[Apatris] Weekly Digest — ${complianceRate}% compliance, ${digest.expiringThisWeek.length} expiring, ${digest.slaBreaches.length} SLA breaches`,
      status: digest.slaBreaches.length > 0 ? "critical" : digest.expiringThisWeek.length > 0 ? "warning" : "info",
      details: body,
    });
  } catch { /* email may not be configured */ }
}
