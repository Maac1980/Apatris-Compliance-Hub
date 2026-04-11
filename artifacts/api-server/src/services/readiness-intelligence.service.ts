/**
 * Readiness Intelligence — executive command dashboard data.
 * Aggregates state across all Apatris subsystems. Read-only.
 */

import { query, queryOne } from "../lib/db.js";

export interface ReadinessReport {
  workforce: { total: number; ready: number; blocked: number; criticalRisk: number; highRisk: number; expiringSoon: number };
  cases: { active: number; needingAction: number; pendingAppeals: number; rejectedCases: number };
  regulatory: { updatesPending: number; underReview: number; approvedForDeployment: number; deploymentsPending: number };
  compliance: { compliant: number; warning: number; expired: number; noPermit: number };
  bottlenecks: string[];
  topActions: Array<{ action: string; urgency: string; count: number }>;
  computedAt: string;
}

export async function getExecutiveReadiness(tenantId: string): Promise<ReadinessReport> {
  const now = new Date();
  const soon30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  // Workforce
  const totalWorkers = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1", [tenantId]))?.c ?? 0);
  const expiredTRC = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1 AND trc_expiry < NOW()", [tenantId]))?.c ?? 0);
  const expiringSoonTRC = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1 AND trc_expiry BETWEEN NOW() AND $2::date", [tenantId, soon30]))?.c ?? 0);
  const expiredWP = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1 AND work_permit_expiry < NOW()", [tenantId]))?.c ?? 0);
  const noTRC = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM workers WHERE tenant_id = $1 AND trc_expiry IS NULL", [tenantId]))?.c ?? 0);

  const criticalRisk = expiredTRC + expiredWP;
  const highRisk = expiringSoonTRC;
  const blocked = criticalRisk;
  const ready = totalWorkers - blocked - highRisk;

  // Cases
  const activeCases = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id = $1 AND status IN ('NEW','PENDING')", [tenantId]))?.c ?? 0);
  const rejectedCases = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id = $1 AND status = 'REJECTED'", [tenantId]))?.c ?? 0);
  const pendingAppeals = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM legal_cases WHERE tenant_id = $1 AND case_type = 'APPEAL' AND status IN ('NEW','PENDING')", [tenantId]))?.c ?? 0);

  // Regulatory
  const updatesPending = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE status = 'NEW'"))?.c ?? 0);
  const underReview = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE status = 'UNDER_REVIEW'"))?.c ?? 0);
  const approvedForDeploy = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE status = 'APPROVED_FOR_DEPLOYMENT'"))?.c ?? 0);

  let deploymentsPending = 0;
  try { deploymentsPending = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_deployments WHERE deployment_status = 'PLANNED'"))?.c ?? 0); } catch {}

  // Bottlenecks
  const bottlenecks: string[] = [];
  if (criticalRisk > 0) bottlenecks.push(`${criticalRisk} workers with expired permits — legal stay at risk`);
  if (underReview > 0) bottlenecks.push(`${underReview} regulatory updates awaiting review`);
  if (rejectedCases > 0) bottlenecks.push(`${rejectedCases} rejected cases needing attention`);
  if (approvedForDeploy > 0) bottlenecks.push(`${approvedForDeploy} approved updates pending deployment`);
  if (highRisk > 5) bottlenecks.push(`${highRisk} workers with permits expiring within 30 days`);

  // Top actions
  const topActions: Array<{ action: string; urgency: string; count: number }> = [];
  if (criticalRisk > 0) topActions.push({ action: "Resolve expired permits", urgency: "CRITICAL", count: criticalRisk });
  if (underReview > 0) topActions.push({ action: "Review pending regulatory updates", urgency: "HIGH", count: underReview });
  if (approvedForDeploy > 0) topActions.push({ action: "Execute approved deployments", urgency: "HIGH", count: approvedForDeploy });
  if (highRisk > 0) topActions.push({ action: "Initiate TRC renewals for expiring permits", urgency: "HIGH", count: highRisk });
  if (rejectedCases > 0) topActions.push({ action: "Process rejected cases — file appeals or close", urgency: "MEDIUM", count: rejectedCases });

  return {
    workforce: { total: totalWorkers, ready: Math.max(0, ready), blocked, criticalRisk, highRisk, expiringSoon: expiringSoonTRC },
    cases: { active: activeCases, needingAction: activeCases + rejectedCases, pendingAppeals, rejectedCases },
    regulatory: { updatesPending, underReview, approvedForDeployment: approvedForDeploy, deploymentsPending },
    compliance: { compliant: Math.max(0, ready), warning: highRisk, expired: expiredTRC, noPermit: noTRC },
    bottlenecks,
    topActions,
    computedAt: now.toISOString(),
  };
}
