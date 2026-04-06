/**
 * PIP Readiness Service — calculates inspection readiness from real compliance data.
 *
 * Scoring formula (v1 — simple, explainable, adjustable):
 *
 * Start at 100 points. Deduct for each risk:
 *   - Expired document:           -8 points per instance
 *   - Critical document (<30d):   -4 points per instance
 *   - Warning document (30-60d):  -1 point per instance
 *   - Missing contract:           -5 points per worker without active contract
 *   - Expired work permit:        -10 points per instance (highest weight — PIP fine risk)
 *   - Expired A1 certificate:     -6 points per instance (posted worker risk)
 *   - Missing medical exam:       -4 points per worker
 *   - Missing BHP training:       -4 points per worker
 *
 * Score clamped to 0-100.
 * Risk levels: >=80 LOW, >=50 MEDIUM, <50 HIGH
 */

import { query } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker, type Worker } from "../lib/compliance.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface PIPRiskItem {
  severity: "expired" | "critical" | "warning" | "missing";
  category: string;
  description: string;
  workerName?: string;
  workerId?: string;
  daysRemaining?: number;
  pointsDeducted: number;
}

export interface PIPReadinessResult {
  score: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  totalWorkers: number;
  counts: {
    expired: number;
    critical: number;
    warning: number;
    missing: number;
  };
  topRisks: PIPRiskItem[];
  fixFirst: string[];
  explanation: string;
}

// ═══ SCORING WEIGHTS (adjustable) ═══════════════════════════════════════════

const WEIGHTS = {
  expired:           8,
  critical:          4,
  warning:           1,
  missingContract:   5,
  expiredPermit:    10,
  expiredA1:         6,
  missingMedical:    4,
  missingBHP:        4,
};

// ═══ MAIN CALCULATION ═══════════════════════════════════════════════════════

export async function calculatePIPReadiness(tenantId: string): Promise<PIPReadinessResult> {
  const risks: PIPRiskItem[] = [];
  let score = 100;
  const counts = { expired: 0, critical: 0, warning: 0, missing: 0 };

  // 1. Fetch all workers with compliance status
  const rows = await fetchAllWorkers(tenantId);
  const workers = rows.map(mapRowToWorker);
  const totalWorkers = workers.length;

  if (totalWorkers === 0) {
    return {
      score: 100, riskLevel: "LOW", totalWorkers: 0,
      counts, topRisks: [], fixFirst: [],
      explanation: "No workers in the system. PIP readiness cannot be assessed.",
    };
  }

  // 2. Check each worker's document expiries
  const docFields: Array<{ field: keyof Worker; label: string; category: string }> = [
    { field: "trcExpiry" as any, label: "TRC / Residence Permit", category: "Immigration" },
    { field: "passportExpiry" as any, label: "Passport", category: "Identity" },
    { field: "bhpExpiry" as any, label: "BHP Safety Training", category: "Safety" },
    { field: "workPermitExpiry" as any, label: "Work Permit", category: "Immigration" },
    { field: "contractEndDate" as any, label: "Contract", category: "Contract" },
    { field: "medicalExamExpiry" as any, label: "Medical Examination", category: "Medical" },
  ];

  const now = new Date();
  for (const w of workers) {
    const wAny = w as any;
    for (const df of docFields) {
      const dateStr = wAny[df.field];
      if (!dateStr) {
        // Missing document
        counts.missing++;
        const pts = df.category === "Safety" ? WEIGHTS.missingBHP
                  : df.category === "Medical" ? WEIGHTS.missingMedical
                  : df.category === "Contract" ? WEIGHTS.missingContract : 2;
        score -= pts;
        risks.push({
          severity: "missing", category: df.category,
          description: `${df.label} missing for ${w.name}`,
          workerName: w.name, workerId: w.id, pointsDeducted: pts,
        });
        continue;
      }

      const expiry = new Date(dateStr);
      const days = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);

      if (days < 0) {
        counts.expired++;
        const pts = df.category === "Immigration" ? WEIGHTS.expiredPermit : WEIGHTS.expired;
        score -= pts;
        risks.push({
          severity: "expired", category: df.category,
          description: `${df.label} expired ${Math.abs(days)} days ago for ${w.name}`,
          workerName: w.name, workerId: w.id, daysRemaining: days, pointsDeducted: pts,
        });
      } else if (days <= 30) {
        counts.critical++;
        score -= WEIGHTS.critical;
        risks.push({
          severity: "critical", category: df.category,
          description: `${df.label} expires in ${days} days for ${w.name}`,
          workerName: w.name, workerId: w.id, daysRemaining: days, pointsDeducted: WEIGHTS.critical,
        });
      } else if (days <= 60) {
        counts.warning++;
        score -= WEIGHTS.warning;
        risks.push({
          severity: "warning", category: df.category,
          description: `${df.label} expires in ${days} days for ${w.name}`,
          workerName: w.name, workerId: w.id, daysRemaining: days, pointsDeducted: WEIGHTS.warning,
        });
      }
    }
  }

  // 3. Check A1 certificates
  try {
    const a1expired = await query<{ worker_name: string; host_country: string }>(
      "SELECT worker_name, host_country FROM a1_certificates WHERE tenant_id = $1 AND status = 'expired'",
      [tenantId]
    );
    for (const a of a1expired) {
      counts.expired++;
      score -= WEIGHTS.expiredA1;
      risks.push({
        severity: "expired", category: "Posted Workers",
        description: `A1 certificate expired for ${a.worker_name} (${a.host_country})`,
        workerName: a.worker_name, pointsDeducted: WEIGHTS.expiredA1,
      });
    }
  } catch { /* table may not exist */ }

  // 4. Clamp score
  score = Math.max(0, Math.min(100, score));

  // 5. Risk level
  const riskLevel: "LOW" | "MEDIUM" | "HIGH" = score >= 80 ? "LOW" : score >= 50 ? "MEDIUM" : "HIGH";

  // 6. Sort risks by severity (expired first, then critical, then warning, then missing)
  const sevOrder = { expired: 0, critical: 1, warning: 2, missing: 3 };
  risks.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.pointsDeducted - a.pointsDeducted);

  // 7. "Fix first" list — top 5 actionable items
  const fixFirst = risks
    .filter(r => r.severity === "expired" || r.severity === "critical" || r.severity === "missing")
    .slice(0, 5)
    .map(r => r.description);

  // 8. Plain-language explanation (rule-based — no AI needed for v1)
  const explanation = generateExplanation(score, riskLevel, counts, totalWorkers, risks);

  return {
    score, riskLevel, totalWorkers, counts,
    topRisks: risks.slice(0, 20),
    fixFirst,
    explanation,
  };
}

// ═══ EXPLANATION GENERATOR ══════════════════════════════════════════════════

function generateExplanation(
  score: number, level: string,
  counts: { expired: number; critical: number; warning: number; missing: number },
  totalWorkers: number, risks: PIPRiskItem[]
): string {
  if (score >= 90) {
    return `PIP readiness is strong at ${score}%. All ${totalWorkers} workers have up-to-date documentation. ${counts.warning > 0 ? `${counts.warning} document(s) will need renewal within 60 days.` : "No immediate actions required."}`;
  }

  const parts: string[] = [];
  parts.push(`PIP readiness is at ${score}%${level === "HIGH" ? " — immediate action required" : ""}.`);

  if (counts.expired > 0) {
    const permitExpired = risks.filter(r => r.severity === "expired" && r.category === "Immigration").length;
    parts.push(`${counts.expired} document(s) have expired${permitExpired > 0 ? ` including ${permitExpired} work permit(s) — this carries fine risk up to 50,000 PLN per worker` : ""}.`);
  }

  if (counts.critical > 0) {
    parts.push(`${counts.critical} document(s) expire within 30 days and need urgent renewal.`);
  }

  if (counts.missing > 0) {
    const missingBHP = risks.filter(r => r.severity === "missing" && r.category === "Safety").length;
    const missingMedical = risks.filter(r => r.severity === "missing" && r.category === "Medical").length;
    const others = counts.missing - missingBHP - missingMedical;
    const missingParts: string[] = [];
    if (missingBHP > 0) missingParts.push(`${missingBHP} BHP training record(s)`);
    if (missingMedical > 0) missingParts.push(`${missingMedical} medical exam record(s)`);
    if (others > 0) missingParts.push(`${others} other document(s)`);
    parts.push(`${counts.missing} document(s) are missing: ${missingParts.join(", ")}.`);
  }

  if (counts.warning > 0) {
    parts.push(`${counts.warning} document(s) will expire within 60 days.`);
  }

  return parts.join(" ");
}
