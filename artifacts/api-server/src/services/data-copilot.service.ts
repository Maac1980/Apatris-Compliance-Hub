/**
 * Data Copilot — natural language interface to ALL Apatris endpoints.
 *
 * User asks a question → copilot identifies intent → calls the right endpoint
 * → reads real data → returns human-readable answer.
 *
 * NOT a chatbot. This queries YOUR actual database through existing APIs.
 *
 * Intent categories:
 *  - WORKERS: who, how many, filter by nationality/site/status
 *  - DEADLINES: what's expiring, what's overdue
 *  - CASES: case status, pipeline, stuck cases
 *  - SAFETY: can worker check in, BHP/medical status
 *  - COMPLIANCE: compliance rate, trends, certificate
 *  - DOCUMENTS: search vault, pending intake
 *  - UKRAINIAN: CUKR deadlines, PESEL UKR status
 *  - PIP: inspection readiness, generate pack
 *  - LEGAL: law questions → routes to intelligence pipeline
 *  - PAYROLL: ZUS audit trail, payroll info
 *  - RECRUITMENT: applications, recruitment link
 */

import { query, queryOne } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface CopilotResponse {
  answer: string;
  dataSource: string;
  recordCount?: number;
  data?: any;
  followUp?: string;
}

// ═══ INTENT DETECTION ═══════════════════════════════════════════════════════

interface IntentMatch {
  intent: string;
  confidence: number;
  params: Record<string, string>;
}

const INTENT_PATTERNS: Array<{ intent: string; patterns: RegExp[]; extract?: (q: string) => Record<string, string> }> = [
  // Ukrainian workers
  { intent: "UKRAINIAN_STATUS", patterns: [/ukrain/i, /cukr/i, /pesel.*ukr/i, /specustawa/i] },

  // Deadlines
  { intent: "DEADLINES", patterns: [/deadline/i, /expir.*this.*week/i, /overdue/i, /countdown/i, /pup.*notif/i, /zus.*regist.*deadline/i, /annex.*1.*sign/i] },

  // Cases
  { intent: "CASES_PIPELINE", patterns: [/case.*pipeline/i, /stuck.*case/i, /how.*many.*case/i, /defect.*notice/i, /case.*status/i, /pending.*case/i, /legal.*case/i] },

  // Safety check
  { intent: "SAFETY_CHECK", patterns: [/safe.*deploy/i, /can.*check.*in/i, /bhp.*expir/i, /medical.*expir/i, /safe.*work/i],
    extract: (q) => {
      const nameMatch = q.match(/(?:worker|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      return nameMatch ? { workerName: nameMatch[1] } : {};
    }
  },

  // PIP inspection
  { intent: "PIP_READINESS", patterns: [/pip/i, /inspection/i, /compliance.*pack/i, /ready.*for.*pip/i] },

  // Compliance rate / trends
  { intent: "COMPLIANCE_RATE", patterns: [/compliance.*rate/i, /how.*compliant/i, /document.*health/i, /compliance.*trend/i] },

  // Workers - general
  { intent: "WORKERS_QUERY", patterns: [/how.*many.*worker/i, /worker.*at.*site/i, /worker.*list/i, /total.*worker/i, /worker.*nation/i, /who.*expir/i],
    extract: (q) => {
      const siteMatch = q.match(/(?:at|site|in)\s+([A-Za-z0-9\s-]+?)(?:\s+with|\s+who|\?|$)/i);
      const natMatch = q.match(/(?:from|nationality)\s+(\w+)/i);
      return { ...(siteMatch ? { site: siteMatch[1].trim() } : {}), ...(natMatch ? { nationality: natMatch[1] } : {}) };
    }
  },

  // Documents / vault search
  { intent: "VAULT_SEARCH", patterns: [/search.*doc/i, /find.*document/i, /vault.*search/i, /look.*up/i] },

  // Payroll / ZUS
  { intent: "PAYROLL_INFO", patterns: [/payroll/i, /zus.*audit/i, /salary/i, /netto/i, /brutto/i] },

  // Recruitment
  { intent: "RECRUITMENT", patterns: [/application/i, /recruit/i, /candidate/i, /how.*many.*appl/i] },

  // Contract validation
  { intent: "CONTRACT_CHECK", patterns: [/contract.*valid/i, /permit.*match/i, /contract.*permit/i, /b2b.*risk/i] },

  // Generated documents / review queue
  { intent: "REVIEW_QUEUE", patterns: [/draft/i, /review.*queue/i, /pending.*approv/i, /ai.*document/i, /generated.*doc/i] },

  // Legal question (fallback to intelligence routing)
  { intent: "LEGAL_QUESTION", patterns: [/art.*108/i, /work.*permit/i, /mos/i, /schengen/i, /posted.*worker/i, /fine/i, /law/i, /legal/i] },
];

function detectIntent(question: string): IntentMatch {
  const q = question.toLowerCase();
  for (const ip of INTENT_PATTERNS) {
    for (const pattern of ip.patterns) {
      if (pattern.test(q)) {
        const params = ip.extract ? ip.extract(question) : {};
        return { intent: ip.intent, confidence: 85, params };
      }
    }
  }
  return { intent: "LEGAL_QUESTION", confidence: 50, params: {} };
}

// ═══ INTENT HANDLERS ════════════════════════════════════════════════════════

async function handleUkrainianStatus(tenantId: string): Promise<CopilotResponse> {
  const workers = await query<any>(
    `SELECT id, first_name, last_name, trc_expiry, work_permit_expiry, pesel
     FROM workers WHERE tenant_id = $1 AND LOWER(nationality) LIKE '%ukrain%' ORDER BY last_name`,
    [tenantId]
  );

  const now = new Date();
  const peselDays = Math.ceil((new Date("2026-08-31").getTime() - now.getTime()) / 86_400_000);
  const cukrDays = Math.ceil((new Date("2027-03-04").getTime() - now.getTime()) / 86_400_000);
  const needsAction = workers.filter((w: any) => !w.trc_expiry && !w.work_permit_expiry).length;

  let answer = `You have ${workers.length} Ukrainian worker(s).\n\n`;
  answer += `PESEL UKR photo-ID update deadline: ${peselDays} days (August 31, 2026)\n`;
  answer += `CUKR application deadline: ${cukrDays} days (March 4, 2027)\n\n`;

  if (needsAction > 0) {
    answer += `⚠️ ${needsAction} worker(s) need action — no TRC or work permit on record:\n`;
    workers.filter((w: any) => !w.trc_expiry && !w.work_permit_expiry).forEach((w: any) => {
      answer += `• ${w.first_name} ${w.last_name} (PESEL: ${w.pesel ?? "N/A"})\n`;
    });
  } else {
    answer += `✓ All Ukrainian workers have permits on record.`;
  }

  return { answer, dataSource: "Ukrainian Worker Status Tracker", recordCount: workers.length, followUp: "Ask me about specific deadlines or CUKR eligibility." };
}

async function handleDeadlines(tenantId: string): Promise<CopilotResponse> {
  const active = await query<any>(
    `SELECT d.*, (d.deadline_date::date - CURRENT_DATE) AS days_remaining,
            w.first_name || ' ' || w.last_name AS worker_name
     FROM deadline_countdowns d LEFT JOIN workers w ON d.worker_id = w.id
     WHERE d.tenant_id = $1 AND d.status IN ('active','escalated')
     ORDER BY d.deadline_date ASC LIMIT 20`,
    [tenantId]
  );

  const overdue = active.filter((d: any) => d.days_remaining < 0);
  const urgent = active.filter((d: any) => d.days_remaining >= 0 && d.days_remaining <= 3);

  let answer = `${active.length} active deadline(s).\n`;
  if (overdue.length > 0) {
    answer += `\n🔴 ${overdue.length} OVERDUE:\n`;
    overdue.forEach((d: any) => { answer += `• ${d.worker_name ?? "Unknown"} — ${d.deadline_type}: ${d.description} (${Math.abs(d.days_remaining)} days over)\n`; });
  }
  if (urgent.length > 0) {
    answer += `\n🟡 ${urgent.length} URGENT (≤3 days):\n`;
    urgent.forEach((d: any) => { answer += `• ${d.worker_name ?? "Unknown"} — ${d.deadline_type}: ${d.days_remaining} days left\n`; });
  }
  if (overdue.length === 0 && urgent.length === 0) {
    answer += `\n✓ No overdue or urgent deadlines.`;
  }

  return { answer, dataSource: "Deadline Countdown Engine", recordCount: active.length };
}

async function handleCasesPipeline(tenantId: string): Promise<CopilotResponse> {
  const pipeline = await query<{ status: string; count: string }>(
    "SELECT status, COUNT(*)::int AS count FROM legal_cases WHERE tenant_id = $1 GROUP BY status ORDER BY count DESC",
    [tenantId]
  );
  const blocked = await query<any>(
    `SELECT c.status, c.case_type, c.blocker_reason, w.first_name, w.last_name,
       EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400 AS days_in_stage
     FROM legal_cases c JOIN workers w ON c.worker_id = w.id
     WHERE c.tenant_id = $1 AND c.blocker_type = 'HARD'`,
    [tenantId]
  );

  let answer = "Case Pipeline:\n";
  pipeline.forEach(p => { answer += `• ${p.status}: ${p.count}\n`; });

  if (blocked.length > 0) {
    answer += `\n🔴 ${blocked.length} HARD BLOCKED case(s):\n`;
    blocked.forEach((b: any) => {
      answer += `• ${b.first_name} ${b.last_name} — ${b.case_type} in ${b.status} (${Math.round(b.days_in_stage)}d). Reason: ${b.blocker_reason}\n`;
    });
  }

  return { answer, dataSource: "Legal Case Pipeline", recordCount: pipeline.reduce((s, p) => s + Number(p.count), 0) };
}

async function handleSafetyCheck(tenantId: string, params: Record<string, string>): Promise<CopilotResponse> {
  let sql = `SELECT id, first_name, last_name, bhp_expiry, medical_exam_expiry FROM workers WHERE tenant_id = $1`;
  const sqlParams: any[] = [tenantId];

  if (params.workerName) {
    sqlParams.push(`%${params.workerName}%`);
    sql += ` AND (first_name || ' ' || last_name) ILIKE $2`;
  } else {
    sql += ` AND (bhp_expiry < CURRENT_DATE OR medical_exam_expiry < CURRENT_DATE)`;
  }
  sql += " ORDER BY last_name LIMIT 20";

  const workers = await query<any>(sql, sqlParams);
  const now = new Date();

  if (workers.length === 0) {
    return { answer: params.workerName ? `No worker found matching "${params.workerName}".` : "✓ No workers with expired BHP or medical exams.", dataSource: "Safety Compliance Lock" };
  }

  let answer = params.workerName ? "" : `⚠️ ${workers.length} worker(s) with safety issues:\n\n`;
  workers.forEach((w: any) => {
    const bhpDays = w.bhp_expiry ? Math.ceil((new Date(w.bhp_expiry).getTime() - now.getTime()) / 86_400_000) : null;
    const medDays = w.medical_exam_expiry ? Math.ceil((new Date(w.medical_exam_expiry).getTime() - now.getTime()) / 86_400_000) : null;
    answer += `${w.first_name} ${w.last_name}:\n`;
    if (bhpDays !== null && bhpDays < 0) answer += `  🔴 BHP EXPIRED (${Math.abs(bhpDays)} days ago) — CANNOT WORK\n`;
    else if (bhpDays !== null) answer += `  BHP: ${bhpDays} days left\n`;
    if (medDays !== null && medDays < 0) answer += `  🔴 Medical EXPIRED (${Math.abs(medDays)} days ago) — CANNOT WORK\n`;
    else if (medDays !== null) answer += `  Medical: ${medDays} days left\n`;
    const canWork = (bhpDays === null || bhpDays >= 0) && (medDays === null || medDays >= 0);
    answer += `  → ${canWork ? "✓ Safe to deploy" : "✗ BLOCKED — cannot check in"}\n\n`;
  });

  return { answer, dataSource: "Safety Compliance Lock", recordCount: workers.length };
}

async function handlePipReadiness(tenantId: string): Promise<CopilotResponse> {
  const total = await queryOne<any>("SELECT COUNT(*)::int AS c FROM workers WHERE tenant_id = $1", [tenantId]);
  const expired = await queryOne<any>(
    `SELECT COUNT(*)::int AS c FROM workers WHERE tenant_id = $1
     AND (bhp_expiry < CURRENT_DATE OR medical_exam_expiry < CURRENT_DATE OR work_permit_expiry < CURRENT_DATE)`,
    [tenantId]
  );
  const compliant = (total?.c ?? 0) - (expired?.c ?? 0);
  const rate = total?.c > 0 ? Math.round((compliant / total.c) * 100) : 0;

  let answer = `PIP Inspection Readiness:\n\n`;
  answer += `Total workers: ${total?.c ?? 0}\n`;
  answer += `Fully compliant: ${compliant} (${rate}%)\n`;
  answer += `Issues found: ${expired?.c ?? 0}\n\n`;

  if (rate >= 90) answer += `✓ Ready for PIP inspection.\n`;
  else if (rate >= 70) answer += `⚠️ Moderate risk — resolve ${expired?.c} issues before PIP arrives.\n`;
  else answer += `🔴 HIGH RISK — ${expired?.c} workers have compliance issues. Fix immediately.\n`;

  answer += `\nGenerate full PIP pack PDF: /api/v1/enforcement/pip-pack/pdf`;

  return { answer, dataSource: "PIP Inspection Mode", recordCount: total?.c };
}

async function handleComplianceRate(tenantId: string): Promise<CopilotResponse> {
  const workers = await query<any>(
    "SELECT trc_expiry, work_permit_expiry, bhp_expiry, medical_exam_expiry, contract_end_date FROM workers WHERE tenant_id = $1",
    [tenantId]
  );
  const now = new Date();
  let compliant = 0, expiring = 0, action = 0;
  for (const w of workers) {
    const dates = [w.trc_expiry, w.work_permit_expiry, w.bhp_expiry, w.medical_exam_expiry, w.contract_end_date].filter(Boolean);
    const minDays = dates.length > 0 ? Math.min(...dates.map((d: string) => Math.ceil((new Date(d).getTime() - now.getTime()) / 86_400_000))) : 999;
    if (minDays > 60) compliant++;
    else if (minDays > 0) expiring++;
    else action++;
  }
  const rate = workers.length > 0 ? Math.round((compliant / workers.length) * 100) : 0;

  return {
    answer: `Compliance Rate: ${rate}%\n\n✓ Compliant (>60d): ${compliant}\n⚠️ Expiring (30-60d): ${expiring}\n🔴 Action required (<30d/expired): ${action}\n\nTotal workforce: ${workers.length}`,
    dataSource: "Compliance Analytics",
    recordCount: workers.length,
  };
}

async function handleWorkersQuery(tenantId: string, params: Record<string, string>): Promise<CopilotResponse> {
  let sql = "SELECT first_name, last_name, nationality, specialization, assigned_site, compliance_status FROM workers WHERE tenant_id = $1";
  const p: any[] = [tenantId];

  if (params.site) { p.push(`%${params.site}%`); sql += ` AND assigned_site ILIKE $${p.length}`; }
  if (params.nationality) { p.push(`%${params.nationality}%`); sql += ` AND nationality ILIKE $${p.length}`; }
  sql += " ORDER BY last_name LIMIT 30";

  const workers = await query<any>(sql, p);
  const total = await queryOne<any>("SELECT COUNT(*)::int AS c FROM workers WHERE tenant_id = $1", [tenantId]);

  let answer = `${workers.length} worker(s) found`;
  if (params.site) answer += ` at site "${params.site}"`;
  if (params.nationality) answer += ` from ${params.nationality}`;
  answer += ` (${total?.c ?? 0} total):\n\n`;

  workers.slice(0, 15).forEach((w: any) => {
    answer += `• ${w.first_name} ${w.last_name} — ${w.nationality ?? "?"} | ${w.specialization ?? "?"} | ${w.assigned_site ?? "unassigned"} | ${w.compliance_status ?? "unknown"}\n`;
  });
  if (workers.length > 15) answer += `\n... and ${workers.length - 15} more.`;

  return { answer, dataSource: "Worker Database", recordCount: workers.length };
}

async function handleReviewQueue(tenantId: string): Promise<CopilotResponse> {
  const stats = await query<{ status: string; count: string }>(
    "SELECT status, COUNT(*)::int AS count FROM case_generated_docs WHERE tenant_id = $1 GROUP BY status",
    [tenantId]
  );
  const counts: Record<string, number> = {};
  for (const r of stats) counts[r.status] = Number(r.count);

  let answer = "AI Document Review Queue:\n\n";
  answer += `📝 Drafts awaiting review: ${counts.DRAFT ?? 0}\n`;
  answer += `🔍 Under review: ${counts.UNDER_REVIEW ?? 0}\n`;
  answer += `✓ Approved: ${counts.APPROVED ?? 0}\n`;
  answer += `✗ Rejected: ${counts.REJECTED ?? 0}\n`;
  answer += `📤 Sent: ${counts.SENT ?? 0}\n`;

  if ((counts.DRAFT ?? 0) > 0) answer += `\n⚠️ ${counts.DRAFT} document(s) need lawyer review.`;

  return { answer, dataSource: "Lawyer Review Queue", recordCount: Object.values(counts).reduce((a, b) => a + b, 0) };
}

async function handleRecruitment(tenantId: string): Promise<CopilotResponse> {
  const total = await queryOne<any>("SELECT COUNT(*)::int AS c FROM job_applications WHERE tenant_id = $1", [tenantId]);
  const recent = await query<any>(
    "SELECT first_name, last_name, specialization, status, applied_at FROM job_applications WHERE tenant_id = $1 ORDER BY applied_at DESC LIMIT 5",
    [tenantId]
  );

  let answer = `${total?.c ?? 0} total application(s).\n\n`;
  if (recent.length > 0) {
    answer += "Latest applications:\n";
    recent.forEach((a: any) => {
      answer += `• ${a.first_name ?? ""} ${a.last_name ?? ""} — ${a.specialization ?? "N/A"} | ${a.status ?? "new"} | ${a.applied_at ? new Date(a.applied_at).toLocaleDateString("en-GB") : ""}\n`;
    });
  }
  answer += `\nShare recruitment form: /api/public/apply/form`;

  return { answer, dataSource: "Job Applications", recordCount: total?.c };
}

async function handleLegalQuestion(question: string, tenantId: string): Promise<CopilotResponse> {
  try {
    const { routeIntelligenceQuery } = await import("./intelligence-router.service.js");
    const result = await routeIntelligenceQuery(question, tenantId, "en");
    return {
      answer: result.answer,
      dataSource: `Legal Intelligence (${result.sourceTier})`,
      data: { confidence: result.confidence, citations: result.citations },
    };
  } catch {
    return { answer: "Could not process legal question. Please try rephrasing.", dataSource: "Legal Intelligence" };
  }
}

// ═══ MAIN COPILOT FUNCTION ══════════════════════════════════════════════════

export async function askCopilot(question: string, tenantId: string): Promise<CopilotResponse> {
  const { intent, params } = detectIntent(question);

  switch (intent) {
    case "UKRAINIAN_STATUS":  return handleUkrainianStatus(tenantId);
    case "DEADLINES":         return handleDeadlines(tenantId);
    case "CASES_PIPELINE":    return handleCasesPipeline(tenantId);
    case "SAFETY_CHECK":      return handleSafetyCheck(tenantId, params);
    case "PIP_READINESS":     return handlePipReadiness(tenantId);
    case "COMPLIANCE_RATE":   return handleComplianceRate(tenantId);
    case "WORKERS_QUERY":     return handleWorkersQuery(tenantId, params);
    case "REVIEW_QUEUE":      return handleReviewQueue(tenantId);
    case "RECRUITMENT":       return handleRecruitment(tenantId);
    case "CONTRACT_CHECK":    return handleSafetyCheck(tenantId, params); // reuses safety check with name param
    case "VAULT_SEARCH":      return handleLegalQuestion(question, tenantId);
    case "PAYROLL_INFO":      return { answer: "ZUS audit trail and payroll data available at /api/v1/enforcement/zus-audit. The ZUS calculator is in the workforce app under More → ZUS Calculator.", dataSource: "Payroll Info" };
    case "LEGAL_QUESTION":    return handleLegalQuestion(question, tenantId);
    default:                  return handleLegalQuestion(question, tenantId);
  }
}
