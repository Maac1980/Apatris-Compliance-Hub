/**
 * System Health Service — surfaces silent failures across all subsystems.
 * Read-only. Queries existing audit/status tables. No new tables needed.
 */

import { query, queryOne } from "../lib/db.js";

export interface SubsystemStatus {
  name: string;
  status: "OK" | "WARNING" | "FAILED" | "STALE" | "DISABLED" | "UNKNOWN";
  lastRun: string | null;
  detail: string;
  hoursAgo: number | null;
}

export interface SystemHealthResult {
  overall: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  subsystems: SubsystemStatus[];
  timestamp: string;
}

export async function getSystemHealth(tenantId: string): Promise<SystemHealthResult> {
  const subsystems: SubsystemStatus[] = [];
  const now = Date.now();

  // 1. Daily Legal Scan
  const lastScan = await queryOne<any>(
    "SELECT started_at, completed_at, workers_scanned, errors FROM legal_scan_runs WHERE tenant_id = $1 ORDER BY started_at DESC LIMIT 1",
    [tenantId]
  );
  if (lastScan) {
    const hoursAgo = Math.round((now - new Date(lastScan.started_at).getTime()) / 3_600_000);
    const failed = !lastScan.completed_at || Number(lastScan.errors) > 0;
    subsystems.push({
      name: "Daily Legal Scan",
      status: failed ? "FAILED" : hoursAgo > 36 ? "STALE" : "OK",
      lastRun: lastScan.started_at,
      detail: failed
        ? `Last scan had ${lastScan.errors} error(s)`
        : hoursAgo > 36
          ? `Last scan was ${hoursAgo}h ago — expected every 24h`
          : `Scanned ${lastScan.workers_scanned} workers, ${hoursAgo}h ago`,
      hoursAgo,
    });
  } else {
    subsystems.push({ name: "Daily Legal Scan", status: "UNKNOWN", lastRun: null, detail: "Never run — trigger manually or wait for scheduled run", hoursAgo: null });
  }

  // 2. Automation Engine
  const tenant = await queryOne<any>("SELECT automation_mode FROM tenants WHERE id = $1", [tenantId]);
  const autoMode = tenant?.automation_mode ?? "disabled";
  const lastAuto = await queryOne<any>(
    "SELECT started_at, completed_at, mode, actions_executed, errors FROM automation_runs WHERE tenant_id = $1 ORDER BY started_at DESC LIMIT 1",
    [tenantId]
  );
  if (autoMode === "disabled") {
    subsystems.push({ name: "Automation Engine", status: "DISABLED", lastRun: lastAuto?.started_at ?? null, detail: "Automation is disabled for this tenant", hoursAgo: null });
  } else if (lastAuto) {
    const hoursAgo = Math.round((now - new Date(lastAuto.started_at).getTime()) / 3_600_000);
    const failed = Number(lastAuto.errors) > 0;
    subsystems.push({
      name: "Automation Engine",
      status: failed ? "WARNING" : "OK",
      lastRun: lastAuto.started_at,
      detail: `Mode: ${lastAuto.mode}. ${lastAuto.actions_executed} executed, ${lastAuto.errors} errors. ${hoursAgo}h ago`,
      hoursAgo,
    });
  } else {
    subsystems.push({ name: "Automation Engine", status: "UNKNOWN", lastRun: null, detail: `Mode: ${autoMode} — no runs yet`, hoursAgo: null });
  }

  // 3. AI Services (Claude)
  const recentAI = await query<any>(
    "SELECT status, COUNT(*) as cnt FROM ai_requests WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '24 hours' GROUP BY status",
    [tenantId]
  );
  const aiCompleted = Number(recentAI.find((r: any) => r.status === "completed")?.cnt ?? 0);
  const aiFailed = Number(recentAI.find((r: any) => r.status === "failed")?.cnt ?? 0);
  const aiTotal = aiCompleted + aiFailed;
  if (aiTotal === 0) {
    subsystems.push({ name: "AI Services (Claude)", status: "OK", lastRun: null, detail: "No AI calls in last 24h", hoursAgo: null });
  } else {
    subsystems.push({
      name: "AI Services (Claude)",
      status: aiFailed > aiCompleted ? "WARNING" : aiFailed > 0 ? "OK" : "OK",
      lastRun: null,
      detail: `Last 24h: ${aiCompleted} succeeded, ${aiFailed} failed (fallback used)`,
      hoursAgo: null,
    });
  }

  // 4. OCR Verification
  const ocrStats = await query<any>(
    "SELECT extraction_status, COUNT(*) as cnt FROM legal_evidence WHERE tenant_id = $1 AND extraction_status IS NOT NULL GROUP BY extraction_status",
    [tenantId]
  );
  const ocrSuccess = Number(ocrStats.find((r: any) => r.extraction_status === "SUCCESS")?.cnt ?? 0);
  const ocrFailed = Number(ocrStats.find((r: any) => r.extraction_status === "FAILED")?.cnt ?? 0);
  const ocrReview = Number(ocrStats.find((r: any) => r.extraction_status === "REVIEW_REQUIRED")?.cnt ?? 0);
  const ocrTotal = ocrSuccess + ocrFailed + ocrReview;
  const mismatchCount = await queryOne<any>(
    "SELECT COUNT(*) as cnt FROM legal_evidence WHERE tenant_id = $1 AND verification_status = 'MISMATCH'",
    [tenantId]
  );
  const mismatches = Number(mismatchCount?.cnt ?? 0);
  subsystems.push({
    name: "OCR Verification",
    status: mismatches > 0 ? "WARNING" : ocrFailed > 0 ? "WARNING" : "OK",
    lastRun: null,
    detail: ocrTotal === 0
      ? "No OCR extractions performed"
      : `${ocrSuccess} verified, ${ocrFailed} failed, ${ocrReview} need review, ${mismatches} mismatches`,
    hoursAgo: null,
  });

  // 5. Legal Alerts
  const unreadAlerts = await queryOne<any>(
    "SELECT COUNT(*) as cnt FROM legal_alerts WHERE tenant_id = $1 AND is_read = FALSE",
    [tenantId]
  );
  const criticalAlerts = await queryOne<any>(
    "SELECT COUNT(*) as cnt FROM legal_alerts WHERE tenant_id = $1 AND is_read = FALSE AND severity IN ('CRITICAL','HIGH')",
    [tenantId]
  );
  const unread = Number(unreadAlerts?.cnt ?? 0);
  const critical = Number(criticalAlerts?.cnt ?? 0);
  subsystems.push({
    name: "Legal Alerts",
    status: critical > 0 ? "WARNING" : "OK",
    lastRun: null,
    detail: unread === 0 ? "No unread alerts" : `${unread} unread (${critical} critical/high)`,
    hoursAgo: null,
  });

  // Overall
  const hasFailure = subsystems.some(s => s.status === "FAILED");
  const hasWarning = subsystems.some(s => s.status === "WARNING" || s.status === "STALE");
  const overall = hasFailure ? "UNHEALTHY" : hasWarning ? "DEGRADED" : "HEALTHY";

  return { overall, subsystems, timestamp: new Date().toISOString() };
}
