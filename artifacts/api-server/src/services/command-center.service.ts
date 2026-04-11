/**
 * Command Center Service — deep readiness intelligence.
 * Operations control tower data for executive dashboard.
 */

import { query, queryOne } from "../lib/db.js";

export interface CommandCenterData {
  workforce: { total: number; deployable: number; blocked: number; missingDocs: number; expiringPermits: number; expiredPermits: number; expiringPassports: number; expiringBHP: number; expiringContracts: number };
  cases: { active: number; needingAction: number; rejected: number; pendingAppeals: number; missingEvidence: number; approachingDeadline: number; overdueDeadline: number };
  regulatory: { underReview: number; approvedForDeploy: number; deploymentsPending: number; criticalChanges: number; affectedWorkersTotal: number };
  approvals: { pendingReviewTasks: number; overdueReviewTasks: number; byRole: Record<string, number> };
  workload: { legalTasks: number; opsTasks: number; adminApprovals: number; urgentActions: number };
  bottlenecks: Array<{ issue: string; severity: string; count: number; link: string }>;
  topActions: Array<{ action: string; urgency: string; count: number; link: string }>;
  computedAt: string;
}

export async function getCommandCenterData(tenantId: string): Promise<CommandCenterData> {
  const now = new Date();
  const soon30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  // ── Workforce ──
  const total = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1", [tenantId]));
  const expiredTRC = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1 AND trc_expiry < NOW()", [tenantId]));
  const expiringTRC = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1 AND trc_expiry BETWEEN NOW() AND $2::date", [tenantId, soon30]));
  const expiredWP = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1 AND work_permit_expiry < NOW()", [tenantId]));
  const expiringPassports = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1 AND passport_expiry BETWEEN NOW() AND $2::date", [tenantId, soon30]));
  const expiringBHP = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1 AND bhp_expiry BETWEEN NOW() AND $2::date", [tenantId, soon30]));
  const expiringContracts = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1 AND contract_end_date BETWEEN NOW() AND $2::date", [tenantId, soon30]));

  const blocked = expiredTRC + expiredWP;
  const deployable = Math.max(0, total - blocked - expiringTRC);

  // ── Cases ──
  const activeCases = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id = $1 AND status IN ('NEW','PENDING')", [tenantId]));
  const rejectedCases = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id = $1 AND status = 'REJECTED'", [tenantId]));
  const pendingAppeals = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id = $1 AND case_type = 'APPEAL' AND status IN ('NEW','PENDING')", [tenantId]));
  const overdueDeadline = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id = $1 AND appeal_deadline < NOW() AND status IN ('NEW','PENDING')", [tenantId]));
  const approachingDeadline = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id = $1 AND appeal_deadline BETWEEN NOW() AND NOW() + INTERVAL '7 days' AND status IN ('NEW','PENDING')", [tenantId]));

  // ── Regulatory ──
  const underReview = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE status = 'UNDER_REVIEW'"));
  const approvedForDeploy = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE status = 'APPROVED_FOR_DEPLOYMENT'"));
  let deploymentsPending = 0;
  try { deploymentsPending = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_deployments WHERE deployment_status = 'PLANNED'")); } catch {}
  const criticalChanges = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE severity = 'CRITICAL' AND status NOT IN ('ARCHIVED','DUPLICATE','REJECTED')"));

  let affectedWorkersTotal = 0;
  try { affectedWorkersTotal = N(await queryOne<any>("SELECT COALESCE(SUM(affected_workers_count),0)::int as c FROM regulatory_simulations")); } catch {}

  // ── Approvals ──
  let pendingReview = 0, overdueReview = 0, legalTasks = 0, opsTasks = 0, adminApprovals = 0;
  try {
    pendingReview = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_review_tasks WHERE task_status IN ('PENDING','IN_REVIEW')"));
    overdueReview = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_review_tasks WHERE task_status = 'PENDING' AND due_date < NOW()"));
    legalTasks = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_review_tasks WHERE review_type = 'LEGAL' AND task_status IN ('PENDING','IN_REVIEW')"));
    opsTasks = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_review_tasks WHERE review_type = 'OPS' AND task_status IN ('PENDING','IN_REVIEW')"));
    adminApprovals = N(await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_review_tasks WHERE review_type = 'ADMIN' AND task_status IN ('PENDING','IN_REVIEW')"));
  } catch {}

  // ── Bottlenecks ──
  const bottlenecks: CommandCenterData["bottlenecks"] = [];
  if (blocked > 0) bottlenecks.push({ issue: "Workers with expired permits", severity: "CRITICAL", count: blocked, link: "/?filter=expired" });
  if (overdueDeadline > 0) bottlenecks.push({ issue: "Cases with missed appeal deadlines", severity: "CRITICAL", count: overdueDeadline, link: "/legal-intelligence" });
  if (overdueReview > 0) bottlenecks.push({ issue: "Overdue regulatory review tasks", severity: "HIGH", count: overdueReview, link: "/regulatory/review" });
  if (approvedForDeploy > 0) bottlenecks.push({ issue: "Approved updates pending deployment", severity: "HIGH", count: approvedForDeploy, link: "/regulatory/deployments" });
  if (rejectedCases > 0) bottlenecks.push({ issue: "Rejected cases needing attention", severity: "MEDIUM", count: rejectedCases, link: "/rejection-intelligence" });

  // ── Top Actions ──
  const topActions: CommandCenterData["topActions"] = [];
  if (blocked > 0) topActions.push({ action: "Resolve expired worker permits", urgency: "CRITICAL", count: blocked, link: "/?filter=expired" });
  if (overdueDeadline > 0) topActions.push({ action: "Handle overdue appeal deadlines", urgency: "CRITICAL", count: overdueDeadline, link: "/legal-intelligence" });
  if (overdueReview > 0) topActions.push({ action: "Complete overdue reviews", urgency: "HIGH", count: overdueReview, link: "/regulatory/review" });
  if (approvedForDeploy > 0) topActions.push({ action: "Execute approved deployments", urgency: "HIGH", count: approvedForDeploy, link: "/regulatory/deployments" });
  if (expiringTRC > 0) topActions.push({ action: "Initiate TRC renewals", urgency: "HIGH", count: expiringTRC, link: "/trc-service" });
  if (pendingAppeals > 0) topActions.push({ action: "Process pending appeals", urgency: "MEDIUM", count: pendingAppeals, link: "/rejection-intelligence" });

  return {
    workforce: { total, deployable, blocked, missingDocs: 0, expiringPermits: expiringTRC, expiredPermits: expiredTRC, expiringPassports, expiringBHP, expiringContracts },
    cases: { active: activeCases, needingAction: activeCases + rejectedCases, rejected: rejectedCases, pendingAppeals, missingEvidence: 0, approachingDeadline, overdueDeadline },
    regulatory: { underReview, approvedForDeploy, deploymentsPending, criticalChanges, affectedWorkersTotal },
    approvals: { pendingReviewTasks: pendingReview, overdueReviewTasks: overdueReview, byRole: { LEGAL: legalTasks, OPS: opsTasks, ADMIN: adminApprovals } },
    workload: { legalTasks, opsTasks, adminApprovals, urgentActions: topActions.filter(a => a.urgency === "CRITICAL").length },
    bottlenecks, topActions,
    computedAt: now.toISOString(),
  };
}

function N(row: any): number { return Number(row?.c ?? 0); }
