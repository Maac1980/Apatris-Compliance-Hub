/**
 * Cross-Worker Intelligence Engine — aggregated pattern detection.
 *
 * Batch SQL queries only. No per-worker loops.
 * Read-only. No modifications to any data.
 * Tenant-isolated. No cross-tenant leakage.
 */

import { query } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface InsightPattern {
  type: string;
  count: number;
  description: string;
  impact: string;
  recommendedAction: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface RejectionInsight {
  category: string;
  count: number;
  percentage: number;
  trend: "up" | "down" | "stable";
  trendPercent: number;
}

export interface VoivodeshipInsight {
  voivodeship: string;
  totalCases: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  rejectionRate: number;
  avgProcessingDays: number | null;
  topIssue: string | null;
}

export interface SystemicIssue {
  type: string;
  affectedWorkers: number;
  description: string;
  impact: string;
  action: string;
  severity: "HIGH" | "CRITICAL";
}

export interface IntelligenceOverview {
  riskPatterns: InsightPattern[];
  rejectionInsights: RejectionInsight[];
  voivodeshipInsights: VoivodeshipInsight[];
  systemicIssues: SystemicIssue[];
  summary: { totalWorkers: number; atRisk: number; criticalPatterns: number; topAction: string };
}

// ═══ RISK PATTERNS ══════════════════════════════════════════════════════════

export async function getRiskPatterns(tenantId: string): Promise<InsightPattern[]> {
  const patterns: InsightPattern[] = [];

  // Expiring permits in 7/14/30 days — single batch query
  const expiryRows = await query<any>(`
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(trc_expiry, work_permit_expiry) <= CURRENT_DATE) as expired,
      COUNT(*) FILTER (WHERE COALESCE(trc_expiry, work_permit_expiry) > CURRENT_DATE AND COALESCE(trc_expiry, work_permit_expiry) <= CURRENT_DATE + 7) as in_7d,
      COUNT(*) FILTER (WHERE COALESCE(trc_expiry, work_permit_expiry) > CURRENT_DATE + 7 AND COALESCE(trc_expiry, work_permit_expiry) <= CURRENT_DATE + 14) as in_14d,
      COUNT(*) FILTER (WHERE COALESCE(trc_expiry, work_permit_expiry) > CURRENT_DATE + 14 AND COALESCE(trc_expiry, work_permit_expiry) <= CURRENT_DATE + 30) as in_30d,
      COUNT(*) as total
    FROM workers WHERE tenant_id = $1 AND (status IS NULL OR status NOT IN ('departed','terminated'))
  `, [tenantId]);

  const e = expiryRows[0] ?? {};
  const expired = Number(e.expired ?? 0), in7 = Number(e.in_7d ?? 0), in14 = Number(e.in_14d ?? 0), in30 = Number(e.in_30d ?? 0);

  if (expired > 0) patterns.push({ type: "EXPIRED_PERMITS", count: expired, description: `${expired} worker(s) with expired permits`, impact: "PIP fine risk 50,000 PLN per worker", recommendedAction: "Suspend deployment and file urgently", severity: "CRITICAL" });
  if (in7 > 0) patterns.push({ type: "EXPIRY_7D", count: in7, description: `${in7} permits expire within 7 days`, impact: "Loss of legal work authorization", recommendedAction: "File TRC applications immediately", severity: "CRITICAL" });
  if (in14 > 0) patterns.push({ type: "EXPIRY_14D", count: in14, description: `${in14} permits expire within 14 days`, impact: "Urgent renewal needed", recommendedAction: "Start TRC renewal packages", severity: "HIGH" });
  if (in30 > 0) patterns.push({ type: "EXPIRY_30D", count: in30, description: `${in30} permits expire within 30 days`, impact: "Plan renewals now", recommendedAction: "Begin document collection", severity: "MEDIUM" });

  // Workers without TRC cases nearing expiry
  const noCase = await query<any>(`
    SELECT COUNT(*) as cnt FROM workers w
    WHERE w.tenant_id = $1 AND (w.status IS NULL OR w.status NOT IN ('departed','terminated'))
    AND COALESCE(w.trc_expiry, w.work_permit_expiry) <= CURRENT_DATE + 30
    AND COALESCE(w.trc_expiry, w.work_permit_expiry) > CURRENT_DATE
    AND NOT EXISTS (SELECT 1 FROM legal_cases lc WHERE lc.worker_id = w.id AND lc.tenant_id = $1)
  `, [tenantId]);
  const noCaseCount = Number(noCase[0]?.cnt ?? 0);
  if (noCaseCount > 0) patterns.push({ type: "NO_LEGAL_CASE", count: noCaseCount, description: `${noCaseCount} workers nearing expiry with no legal case`, impact: "Art. 108 continuity protection will NOT apply", recommendedAction: "Create TRC cases and file before expiry", severity: "CRITICAL" });

  // Missing evidence
  const noEvidence = await query<any>(`
    SELECT COUNT(*) as cnt FROM workers w
    WHERE w.tenant_id = $1 AND (w.status IS NULL OR w.status NOT IN ('departed','terminated'))
    AND EXISTS (SELECT 1 FROM legal_cases lc WHERE lc.worker_id = w.id AND lc.tenant_id = $1)
    AND NOT EXISTS (SELECT 1 FROM legal_evidence le WHERE le.worker_id = w.id AND le.tenant_id = $1)
  `, [tenantId]);
  const noEvCount = Number(noEvidence[0]?.cnt ?? 0);
  if (noEvCount > 0) patterns.push({ type: "MISSING_EVIDENCE", count: noEvCount, description: `${noEvCount} workers with legal cases but no filing evidence`, impact: "PIP inspection failure risk", recommendedAction: "Upload MoS/UPO receipts for all", severity: "HIGH" });

  // OCR mismatches
  const mismatch = await query<any>(`
    SELECT COUNT(DISTINCT worker_id) as cnt FROM legal_evidence
    WHERE tenant_id = $1 AND verification_status = 'MISMATCH'
  `, [tenantId]);
  const mismatchCount = Number(mismatch[0]?.cnt ?? 0);
  if (mismatchCount > 0) patterns.push({ type: "OCR_MISMATCHES", count: mismatchCount, description: `${mismatchCount} workers with OCR date mismatches`, impact: "Filing dates may be incorrect — Art. 108 risk", recommendedAction: "Manually verify filing dates", severity: "HIGH" });

  return patterns;
}

// ═══ REJECTION PATTERNS ═════════════════════════════════════════════════════

export async function getRejectionPatterns(tenantId: string): Promise<RejectionInsight[]> {
  // Category counts
  const cats = await query<any>(`
    SELECT category, COUNT(*) as cnt
    FROM rejection_analyses WHERE tenant_id = $1
    GROUP BY category ORDER BY cnt DESC
  `, [tenantId]);

  const total = cats.reduce((s: number, r: any) => s + Number(r.cnt), 0);
  if (total === 0) return [];

  // Month-over-month trend
  const thisMonth = await query<any>(`
    SELECT category, COUNT(*) as cnt FROM rejection_analyses
    WHERE tenant_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)
    GROUP BY category
  `, [tenantId]);

  const lastMonth = await query<any>(`
    SELECT category, COUNT(*) as cnt FROM rejection_analyses
    WHERE tenant_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
    AND created_at < date_trunc('month', CURRENT_DATE)
    GROUP BY category
  `, [tenantId]);

  const thisMap = new Map(thisMonth.map((r: any) => [r.category, Number(r.cnt)]));
  const lastMap = new Map(lastMonth.map((r: any) => [r.category, Number(r.cnt)]));

  return cats.map((r: any) => {
    const cnt = Number(r.cnt);
    const thisC = thisMap.get(r.category) ?? 0;
    const lastC = lastMap.get(r.category) ?? 0;
    let trend: "up" | "down" | "stable" = "stable";
    let trendPercent = 0;
    if (lastC > 0) {
      trendPercent = Math.round(((thisC - lastC) / lastC) * 100);
      trend = trendPercent > 10 ? "up" : trendPercent < -10 ? "down" : "stable";
    } else if (thisC > 0) {
      trend = "up"; trendPercent = 100;
    }
    return { category: r.category, count: cnt, percentage: Math.round((cnt / total) * 100), trend, trendPercent };
  });
}

// ═══ VOIVODESHIP INSIGHTS ═══════════════════════════════════════════════════

export async function getVoivodeshipInsights(tenantId: string): Promise<VoivodeshipInsight[]> {
  const rows = await query<any>(`
    SELECT
      tc.voivodeship,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE tc.status IN ('Approved','approved')) as approved,
      COUNT(*) FILTER (WHERE tc.status IN ('Rejected','rejected')) as rejected,
      COUNT(*) FILTER (WHERE tc.status NOT IN ('Approved','approved','Rejected','rejected')) as pending,
      AVG(CASE WHEN tc.status IN ('Approved','approved','Rejected','rejected') AND tc.start_date IS NOT NULL
          THEN EXTRACT(EPOCH FROM (tc.updated_at - tc.start_date::timestamp)) / 86400 END)::int as avg_days
    FROM trc_cases tc
    WHERE tc.tenant_id = $1::text AND tc.voivodeship IS NOT NULL AND tc.voivodeship != ''
    GROUP BY tc.voivodeship
    ORDER BY total DESC
  `, [tenantId]);

  // Top rejection reason per voivodeship
  const rejReasons = await query<any>(`
    SELECT tc.voivodeship, ra.category, COUNT(*) as cnt
    FROM rejection_analyses ra
    JOIN legal_cases lc ON lc.id = ra.legal_case_id
    JOIN trc_cases tc ON tc.id = lc.trc_case_id
    WHERE ra.tenant_id = $1
    GROUP BY tc.voivodeship, ra.category
    ORDER BY tc.voivodeship, cnt DESC
  `, [tenantId]);

  const topIssueMap = new Map<string, string>();
  for (const r of rejReasons) {
    if (!topIssueMap.has(r.voivodeship)) topIssueMap.set(r.voivodeship, r.category);
  }

  return rows.map((r: any) => ({
    voivodeship: r.voivodeship,
    totalCases: Number(r.total),
    approvedCount: Number(r.approved),
    rejectedCount: Number(r.rejected),
    pendingCount: Number(r.pending),
    rejectionRate: Number(r.total) > 0 ? Math.round((Number(r.rejected) / Number(r.total)) * 100) : 0,
    avgProcessingDays: r.avg_days ?? null,
    topIssue: topIssueMap.get(r.voivodeship) ?? null,
  }));
}

// ═══ SYSTEMIC ISSUES ════════════════════════════════════════════════════════

export async function getSystemicIssues(tenantId: string): Promise<SystemicIssue[]> {
  const issues: SystemicIssue[] = [];

  // Repeated missing documents (same doc type missing for 3+ workers)
  const missingPoa = await query<any>(`
    SELECT COUNT(*) as cnt FROM workers w
    WHERE w.tenant_id = $1 AND (w.status IS NULL OR w.status NOT IN ('departed','terminated'))
    AND EXISTS (SELECT 1 FROM legal_cases lc WHERE lc.worker_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM legal_documents ld WHERE ld.worker_id = w.id AND ld.template_type = 'POWER_OF_ATTORNEY' AND ld.status != 'archived')
  `, [tenantId]);
  if (Number(missingPoa[0]?.cnt ?? 0) >= 3) {
    issues.push({ type: "SYSTEMIC_MISSING_POA", affectedWorkers: Number(missingPoa[0].cnt), description: `${missingPoa[0].cnt} workers with active cases but no POA`, impact: "Cannot represent workers before authorities", action: "Run automation to generate POA for all", severity: "HIGH" });
  }

  // Repeated OCR mismatches (pattern, not individual)
  const ocrIssues = await query<any>(`
    SELECT COUNT(DISTINCT worker_id) as cnt FROM legal_evidence
    WHERE tenant_id = $1 AND verification_status = 'MISMATCH'
  `, [tenantId]);
  if (Number(ocrIssues[0]?.cnt ?? 0) >= 3) {
    issues.push({ type: "SYSTEMIC_OCR_MISMATCH", affectedWorkers: Number(ocrIssues[0].cnt), description: `${ocrIssues[0].cnt} workers have OCR date mismatches`, impact: "Possible systematic filing date recording error", action: "Audit filing evidence and re-verify dates", severity: "HIGH" });
  }

  // Repeated formal defects
  const defects = await query<any>(`
    SELECT COUNT(*) as cnt FROM trc_cases
    WHERE tenant_id = $1::text AND status = 'formal_defect'
  `, [tenantId]);
  if (Number(defects[0]?.cnt ?? 0) >= 3) {
    issues.push({ type: "SYSTEMIC_FORMAL_DEFECTS", affectedWorkers: Number(defects[0].cnt), description: `${defects[0].cnt} TRC cases with formal defects`, impact: "Repeated defects suggest document preparation issue", action: "Review document checklist and preparation process", severity: "CRITICAL" });
  }

  // Workers without any snapshots
  const noSnapshot = await query<any>(`
    SELECT COUNT(*) as cnt FROM workers w
    WHERE w.tenant_id = $1 AND (w.status IS NULL OR w.status NOT IN ('departed','terminated'))
    AND NOT EXISTS (SELECT 1 FROM worker_legal_snapshots wls WHERE wls.worker_id = w.id)
  `, [tenantId]);
  if (Number(noSnapshot[0]?.cnt ?? 0) >= 5) {
    issues.push({ type: "SYSTEMIC_NO_SNAPSHOTS", affectedWorkers: Number(noSnapshot[0].cnt), description: `${noSnapshot[0].cnt} workers have never been scanned`, impact: "Legal status unknown — risk invisible", action: "Run daily legal scan to create snapshots", severity: "HIGH" });
  }

  return issues;
}

// ═══ OVERVIEW ═══════════════════════════════════════════════════════════════

export async function getIntelligenceOverview(tenantId: string): Promise<IntelligenceOverview> {
  const [riskPatterns, rejectionInsights, voivodeshipInsights, systemicIssues] = await Promise.all([
    getRiskPatterns(tenantId),
    getRejectionPatterns(tenantId),
    getVoivodeshipInsights(tenantId),
    getSystemicIssues(tenantId),
  ]);

  const totalWorkers = riskPatterns.find(p => p.type === "EXPIRY_7D" || p.type === "EXPIRED_PERMITS")?.count ?? 0;
  const atRisk = riskPatterns.reduce((s, p) => s + p.count, 0);
  const criticalPatterns = riskPatterns.filter(p => p.severity === "CRITICAL").length + systemicIssues.filter(i => i.severity === "CRITICAL").length;

  const topAction = riskPatterns[0]?.recommendedAction ?? systemicIssues[0]?.action ?? "No urgent actions";

  return { riskPatterns, rejectionInsights, voivodeshipInsights, systemicIssues, summary: { totalWorkers, atRisk, criticalPatterns, topAction } };
}
