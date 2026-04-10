/**
 * Intelligence Scan Service — daily fleet-wide scan using next-action engine.
 *
 * Stores historical snapshots, provides acknowledgment tracking,
 * and surfaces errors clearly.
 *
 * NO auto-actions. NO auto-messages. Read-only scan + snapshot storage.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { getFleetSignals, getWorkerIntelligence, type WorkerIntelligence } from "./next-action-engine.service.js";

// ═══ TABLE SETUP ════════════════════════════════════════════════════════════

async function ensureTables(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS intelligence_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL DEFAULT 'default',
      scan_date DATE NOT NULL DEFAULT CURRENT_DATE,
      total_workers INT NOT NULL DEFAULT 0,
      expired_count INT NOT NULL DEFAULT 0,
      expiring_soon_count INT NOT NULL DEFAULT 0,
      cases_needing_action INT NOT NULL DEFAULT 0,
      missing_critical_docs INT NOT NULL DEFAULT 0,
      critical_risk_count INT NOT NULL DEFAULT 0,
      high_risk_count INT NOT NULL DEFAULT 0,
      medium_risk_count INT NOT NULL DEFAULT 0,
      low_risk_count INT NOT NULL DEFAULT 0,
      top_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
      scan_duration_ms INT NOT NULL DEFAULT 0,
      scan_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS action_acknowledgments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL DEFAULT 'default',
      worker_id TEXT NOT NULL,
      case_id TEXT,
      action_text TEXT NOT NULL,
      acknowledged_by TEXT NOT NULL,
      acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT
    )
  `);
}

// ═══ DAILY INTELLIGENCE SCAN ════════════════════════════════════════════════

export async function runIntelligenceScan(tenantId?: string): Promise<{ success: boolean; snapshot: any; errors: string[] }> {
  await ensureTables();
  const tid = tenantId ?? "default";
  const startMs = Date.now();
  const errors: string[] = [];

  console.log(`[IntelScan] Starting fleet intelligence scan for tenant ${tid}...`);

  // Get fleet signals
  let signals: any;
  try {
    signals = await getFleetSignals(tid);
  } catch (err: any) {
    const msg = `Fleet signals failed: ${err.message}`;
    console.error(`[IntelScan] ${msg}`);
    errors.push(msg);
    signals = { totalWorkers: 0, expiringSoon: 0, expired: 0, casesNeedingAction: 0, missingCriticalDocs: 0, criticalRisk: 0, highRisk: 0 };
  }

  // Scan individual workers for risk distribution + top actions
  let riskDist = { critical: 0, high: 0, medium: 0, low: 0 };
  const topActions: Array<{ workerId: string; workerName: string; action: string; priority: string }> = [];

  try {
    const workerIds = await query<{ id: string }>(
      `SELECT id FROM workers WHERE (tenant_id = $1 OR tenant_id IS NULL) AND (worker_status IS NULL OR worker_status != 'Archived') LIMIT 500`,
      [tid],
    );

    for (const { id } of workerIds) {
      try {
        const intel = await getWorkerIntelligence(id, tid);
        // Count risk
        if (intel.riskLevel === "CRITICAL") riskDist.critical++;
        else if (intel.riskLevel === "HIGH") riskDist.high++;
        else if (intel.riskLevel === "MEDIUM") riskDist.medium++;
        else riskDist.low++;

        // Collect top critical/high actions
        for (const a of intel.nextActions.filter(a => a.priority === "critical" || a.priority === "high").slice(0, 2)) {
          topActions.push({ workerId: id, workerName: intel.workerName, action: a.action, priority: a.priority });
        }
      } catch (err: any) {
        errors.push(`Worker ${id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`Worker scan failed: ${err.message}`);
  }

  // Sort top actions by priority
  topActions.sort((a, b) => (a.priority === "critical" ? 0 : 1) - (b.priority === "critical" ? 0 : 1));

  const durationMs = Date.now() - startMs;

  // Store snapshot
  try {
    await execute(
      `INSERT INTO intelligence_snapshots
         (tenant_id, scan_date, total_workers, expired_count, expiring_soon_count,
          cases_needing_action, missing_critical_docs, critical_risk_count,
          high_risk_count, medium_risk_count, low_risk_count,
          top_actions, scan_duration_ms, scan_errors)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        tid, signals.totalWorkers, signals.expired, signals.expiringSoon,
        signals.casesNeedingAction, signals.missingCriticalDocs,
        riskDist.critical, riskDist.high, riskDist.medium, riskDist.low,
        JSON.stringify(topActions.slice(0, 20)), durationMs, JSON.stringify(errors),
      ],
    );
  } catch (err: any) {
    errors.push(`Snapshot save failed: ${err.message}`);
  }

  console.log(`[IntelScan] Complete in ${durationMs}ms. ${signals.totalWorkers} workers. Risk: ${riskDist.critical}C/${riskDist.high}H/${riskDist.medium}M/${riskDist.low}L. Errors: ${errors.length}`);

  return {
    success: errors.length === 0,
    snapshot: {
      scanDate: new Date().toISOString().slice(0, 10),
      ...signals,
      riskDistribution: riskDist,
      topActions: topActions.slice(0, 20),
      durationMs,
      errorCount: errors.length,
    },
    errors,
  };
}

// ═══ HISTORICAL SNAPSHOTS ═══════════════════════════════════════════════════

export async function getSnapshots(tenantId: string, limit = 30) {
  await ensureTables();
  return query<Record<string, any>>(
    `SELECT * FROM intelligence_snapshots WHERE tenant_id = $1 ORDER BY scan_date DESC LIMIT $2`,
    [tenantId, limit],
  );
}

export async function getLatestSnapshot(tenantId: string) {
  await ensureTables();
  return queryOne<Record<string, any>>(
    `SELECT * FROM intelligence_snapshots WHERE tenant_id = $1 ORDER BY scan_date DESC LIMIT 1`,
    [tenantId],
  );
}

// ═══ ALERT ACKNOWLEDGMENT ═══════════════════════════════════════════════════

export async function acknowledgeAction(
  tenantId: string,
  workerId: string,
  actionText: string,
  acknowledgedBy: string,
  caseId?: string,
  notes?: string,
) {
  await ensureTables();
  const rows = await query<{ id: string }>(
    `INSERT INTO action_acknowledgments (tenant_id, worker_id, case_id, action_text, acknowledged_by, notes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [tenantId, workerId, caseId ?? null, actionText, acknowledgedBy, notes ?? null],
  );
  return rows[0];
}

export async function getAcknowledgments(tenantId: string, workerId?: string) {
  await ensureTables();
  if (workerId) {
    return query<Record<string, any>>(
      `SELECT * FROM action_acknowledgments WHERE tenant_id = $1 AND worker_id = $2 ORDER BY acknowledged_at DESC LIMIT 50`,
      [tenantId, workerId],
    );
  }
  return query<Record<string, any>>(
    `SELECT * FROM action_acknowledgments WHERE tenant_id = $1 ORDER BY acknowledged_at DESC LIMIT 100`,
    [tenantId],
  );
}

// ═══ RELEASE READINESS CHECK ════════════════════════════════════════════════

export interface ReadinessCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

export async function checkReleaseReadiness(): Promise<ReadinessCheck[]> {
  const checks: ReadinessCheck[] = [];

  // 1. Database connection
  try {
    await queryOne("SELECT 1 as ok");
    checks.push({ name: "Database", status: "pass", detail: "PostgreSQL connection OK" });
  } catch {
    checks.push({ name: "Database", status: "fail", detail: "Cannot connect to PostgreSQL" });
  }

  // 2. AI provider
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  checks.push({
    name: "AI Provider (Claude)",
    status: anthropicKey ? "pass" : "warn",
    detail: anthropicKey ? "ANTHROPIC_API_KEY configured" : "ANTHROPIC_API_KEY not set — AI features disabled",
  });

  // 3. Perplexity
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  checks.push({
    name: "Research Provider (Perplexity)",
    status: perplexityKey ? "pass" : "warn",
    detail: perplexityKey ? "PERPLEXITY_API_KEY configured" : "PERPLEXITY_API_KEY not set — research disabled",
  });

  // 4. Email
  const smtpUser = process.env.SMTP_USER || process.env.BREVO_SMTP_USER;
  checks.push({
    name: "Email (SMTP)",
    status: smtpUser ? "pass" : "warn",
    detail: smtpUser ? "SMTP configured" : "SMTP not configured — email alerts disabled",
  });

  // 5. JWT secret
  const jwtSecret = process.env.JWT_SECRET;
  checks.push({
    name: "JWT Secret",
    status: jwtSecret && jwtSecret.length >= 32 ? "pass" : "fail",
    detail: jwtSecret ? `JWT_SECRET set (${jwtSecret.length} chars)` : "JWT_SECRET not set — auth will fail",
  });

  // 6. Workers table exists and has data
  try {
    const row = await queryOne<{ count: number }>("SELECT COUNT(*)::int as count FROM workers");
    checks.push({
      name: "Workers Table",
      status: (row?.count ?? 0) > 0 ? "pass" : "warn",
      detail: `${row?.count ?? 0} workers in database`,
    });
  } catch {
    checks.push({ name: "Workers Table", status: "fail", detail: "Workers table not accessible" });
  }

  // 7. Legal tables
  try {
    await queryOne("SELECT 1 FROM legal_cases LIMIT 1");
    checks.push({ name: "Legal Tables", status: "pass", detail: "legal_cases table accessible" });
  } catch {
    checks.push({ name: "Legal Tables", status: "warn", detail: "legal_cases table not found — legal features may fail on first use" });
  }

  // 8. Storage (R2)
  const r2Key = process.env.R2_ACCESS_KEY_ID;
  checks.push({
    name: "Storage (R2)",
    status: r2Key ? "pass" : "warn",
    detail: r2Key ? "R2 storage configured" : "R2 not configured — file uploads disabled",
  });

  // 9. Node version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1));
  checks.push({
    name: "Node.js Runtime",
    status: majorVersion >= 20 ? "pass" : "warn",
    detail: `Node ${nodeVersion}`,
  });

  return checks;
}
