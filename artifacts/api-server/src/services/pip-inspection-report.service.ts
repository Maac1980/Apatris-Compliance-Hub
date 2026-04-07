/**
 * PIP Inspection Report Service — generates site-level compliance proof
 * for Państwowa Inspekcja Pracy inspections.
 *
 * Aggregates from existing data only. Does NOT change any legal status,
 * evidence, or approval state. Read-only compilation.
 */

import { query, queryOne } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface PipReportInput {
  tenantId: string;
  siteId?: string;
  companyId?: string;
  includeOnlyActiveWorkers?: boolean;
}

export interface WorkerRow {
  workerId: string;
  workerName: string;
  nationality: string | null;
  assignedSite: string | null;
  legalStatus: string | null;
  legalBasis: string | null;
  riskLevel: string | null;
  permitExpiryDate: string | null;
  daysUntilExpiry: number | null;
  filingDate: string | null;
  evidenceCount: number;
  evidenceVerified: boolean;
  authorityPackStatus: string | null;
  authorityPackApproved: boolean;
  caseStatus: string | null;
  nextAction: string | null;
  warnings: string[];
}

export interface ReportSummary {
  totalWorkers: number;
  valid: number;
  protectedPending: number;
  reviewRequired: number;
  expiredNotProtected: number;
  noPermit: number;
  expiringSoon: number;
  criticalRisk: number;
  highRisk: number;
  missingEvidence: number;
  unapprovedPacks: number;
}

export type ReadinessLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PipInspectionReport {
  id?: string;
  tenantId: string;
  siteId: string | null;
  companyId: string | null;
  generatedAt: string;
  readinessScore: number;
  readinessLevel: ReadinessLevel;
  summary: ReportSummary;
  workers: WorkerRow[];
}

// ═══ CORE ═══════════════════════════════════════════════════════════════════

export async function generatePipInspectionReport(input: PipReportInput): Promise<PipInspectionReport> {
  const { tenantId, siteId, companyId, includeOnlyActiveWorkers = true } = input;

  // Build worker query with optional filters
  let workerSql = `
    SELECT w.id, w.full_name, w.nationality, w.assigned_site,
           w.trc_expiry, w.work_permit_expiry,
           wls.legal_status, wls.legal_basis, wls.risk_level, wls.permit_expires_at
    FROM workers w
    LEFT JOIN worker_legal_snapshots wls ON wls.worker_id = w.id
    WHERE w.tenant_id = $1`;
  const params: unknown[] = [tenantId];

  if (includeOnlyActiveWorkers) {
    workerSql += " AND (w.status IS NULL OR w.status NOT IN ('departed','terminated'))";
  }
  if (siteId) {
    params.push(siteId);
    workerSql += ` AND w.assigned_site = $${params.length}`;
  }
  workerSql += " ORDER BY w.full_name ASC";

  const workers = await query<any>(workerSql, params);

  // For each worker, enrich with evidence, cases, packs
  const rows: WorkerRow[] = [];
  const now = Date.now();

  for (const w of workers) {
    // Evidence
    const evRows = await query<any>(
      "SELECT id, filing_date, verification_status FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2",
      [w.id, tenantId]
    );

    // Latest authority pack
    const pack = await queryOne<any>(
      `SELECT pack_status, is_approved FROM authority_response_packs
       WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [w.id, tenantId]
    );

    // Latest legal case
    const legalCase = await queryOne<any>(
      "SELECT status, next_action FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
      [w.id, tenantId]
    );

    // Filing date from evidence
    const filingEv = evRows.find((e: any) => e.filing_date);

    // Permit expiry
    const expiryStr = w.permit_expires_at ?? w.trc_expiry ?? w.work_permit_expiry ?? null;
    const daysUntil = expiryStr ? Math.ceil((new Date(expiryStr).getTime() - now) / 86_400_000) : null;

    // Warnings
    const warnings: string[] = [];
    const ls = w.legal_status;
    if (ls === "EXPIRED_NOT_PROTECTED") warnings.push("EXPIRED — no legal protection");
    if (ls === "REVIEW_REQUIRED") warnings.push("Manual review required");
    if (w.risk_level === "CRITICAL") warnings.push("CRITICAL risk");
    if (evRows.length === 0 && ls !== "VALID") warnings.push("No filing evidence on file");
    if (pack && !pack.is_approved && pack.pack_status !== "APPROVED") warnings.push("Authority pack not approved");
    if (daysUntil !== null && daysUntil <= 30 && daysUntil > 0) warnings.push(`Permit expires in ${daysUntil} days`);

    rows.push({
      workerId: w.id,
      workerName: w.full_name ?? "Unknown",
      nationality: w.nationality ?? null,
      assignedSite: w.assigned_site ?? null,
      legalStatus: ls ?? "NO_SNAPSHOT",
      legalBasis: w.legal_basis ?? null,
      riskLevel: w.risk_level ?? null,
      permitExpiryDate: expiryStr ? new Date(expiryStr).toISOString().slice(0, 10) : null,
      daysUntilExpiry: daysUntil,
      filingDate: filingEv?.filing_date ? new Date(filingEv.filing_date).toISOString().slice(0, 10) : null,
      evidenceCount: evRows.length,
      evidenceVerified: evRows.some((e: any) => e.verification_status === "VERIFIED"),
      authorityPackStatus: pack?.pack_status ?? null,
      authorityPackApproved: pack?.is_approved === true || pack?.pack_status === "APPROVED",
      caseStatus: legalCase?.status ?? null,
      nextAction: legalCase?.next_action ?? null,
      warnings,
    });
  }

  // Summary counts
  const summary: ReportSummary = {
    totalWorkers: rows.length,
    valid: rows.filter(r => r.legalStatus === "VALID").length,
    protectedPending: rows.filter(r => r.legalStatus === "PROTECTED_PENDING").length,
    reviewRequired: rows.filter(r => r.legalStatus === "REVIEW_REQUIRED").length,
    expiredNotProtected: rows.filter(r => r.legalStatus === "EXPIRED_NOT_PROTECTED").length,
    noPermit: rows.filter(r => r.legalStatus === "NO_PERMIT" || r.legalStatus === "NO_SNAPSHOT").length,
    expiringSoon: rows.filter(r => r.legalStatus === "EXPIRING_SOON" || (r.daysUntilExpiry !== null && r.daysUntilExpiry <= 60 && r.daysUntilExpiry > 0)).length,
    criticalRisk: rows.filter(r => r.riskLevel === "CRITICAL").length,
    highRisk: rows.filter(r => r.riskLevel === "HIGH").length,
    missingEvidence: rows.filter(r => r.evidenceCount === 0 && r.legalStatus !== "VALID").length,
    unapprovedPacks: rows.filter(r => r.authorityPackStatus && !r.authorityPackApproved).length,
  };

  // Readiness score
  const { readinessScore, readinessLevel } = calculateReadiness(summary, rows.length);

  const report: PipInspectionReport = {
    tenantId,
    siteId: siteId ?? null,
    companyId: companyId ?? null,
    generatedAt: new Date().toISOString(),
    readinessScore,
    readinessLevel,
    summary,
    workers: rows,
  };

  // Persist
  const saved = await queryOne<any>(
    `INSERT INTO pip_inspection_reports (tenant_id, site_id, company_id, readiness_score, readiness_level, summary_json, workers_json, report_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [tenantId, siteId ?? null, companyId ?? null, readinessScore, readinessLevel,
     JSON.stringify(summary), JSON.stringify(rows), JSON.stringify(report)]
  );
  if (saved) report.id = saved.id;

  return report;
}

export async function getReport(reportId: string, tenantId: string): Promise<PipInspectionReport | null> {
  const row = await queryOne<any>(
    "SELECT * FROM pip_inspection_reports WHERE id = $1 AND tenant_id = $2",
    [reportId, tenantId]
  );
  if (!row) return null;
  const rpt = typeof row.report_json === "string" ? JSON.parse(row.report_json) : row.report_json;
  rpt.id = row.id;
  return rpt;
}

export async function getReportsBySite(siteId: string, tenantId: string): Promise<any[]> {
  return query(
    "SELECT id, site_id, readiness_score, readiness_level, created_at FROM pip_inspection_reports WHERE site_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 20",
    [siteId, tenantId]
  );
}

// ═══ READINESS SCORE ════════════════════════════════════════════════════════

function calculateReadiness(s: ReportSummary, total: number): { readinessScore: number; readinessLevel: ReadinessLevel } {
  if (total === 0) return { readinessScore: 0, readinessLevel: "CRITICAL" };

  let score = 100;

  // Heavy penalties
  score -= s.expiredNotProtected * 15;  // Each expired worker is a major risk
  score -= s.noPermit * 15;
  score -= s.criticalRisk * 10;

  // Medium penalties
  score -= s.reviewRequired * 8;
  score -= s.highRisk * 5;
  score -= s.missingEvidence * 5;
  score -= s.unapprovedPacks * 3;

  // Light penalties
  score -= s.expiringSoon * 2;

  score = Math.max(0, Math.min(100, score));

  const readinessLevel: ReadinessLevel =
    score >= 80 ? "HIGH" :
    score >= 60 ? "MEDIUM" :
    score >= 30 ? "LOW" : "CRITICAL";

  return { readinessScore: Math.round(score), readinessLevel };
}
