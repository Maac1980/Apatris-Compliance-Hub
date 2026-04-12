/**
 * Apatris Deployability Gauge — site readiness for tonnage production.
 *
 * Determines which welders can legally be deployed on-site today.
 * Combines: permit status + 90/180 Schengen rule + Art. 108 protection.
 *
 * 90/180 Rule (simplified MVP):
 *   - If last_entry_date is set, calculate days since entry
 *   - If days > 90 and no valid TRC/work permit → PRODUCTION_RISK
 *   - Full travel-log based 90/180 rolling window deferred to Phase 2
 */

import { query } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface WorkerDeployability {
  workerId: string;
  workerName: string;
  specialization: string;
  assignedSite: string | null;
  deployable: boolean;
  riskLevel: "clear" | "attention" | "production_risk" | "blocked";
  reason: string;
  daysRemaining: number | null;
  hasArt108: boolean;
}

export interface SpecializationCapacity {
  specialization: string;
  total: number;
  deployable: number;
  atRisk: number;
  blocked: number;
}

export interface DeployabilityReport {
  totalWorkers: number;
  deployableWorkers: number;
  atRiskWorkers: number;
  blockedWorkers: number;
  clearPercentage: number;
  bySpecialization: SpecializationCapacity[];
  workers: WorkerDeployability[];
  mosSignerAging: Array<{ workerId: string; workerName: string; deadline: string; daysLeft: number }>;
  generatedAt: string;
}

// ═══ GAUGE CALCULATOR ═══════════════════════════════════════════════════════

export async function calculateDeployabilityGauge(tenantId: string): Promise<DeployabilityReport> {
  const now = Date.now();

  const workers = await query<any>(
    `SELECT id, full_name, specialization, assigned_site,
            trc_expiry, work_permit_expiry, passport_expiry,
            last_entry_date, visa_expiry, mos_status,
            mos_link_received_at, mos_signature_deadline
     FROM workers WHERE tenant_id = $1`,
    [tenantId]
  );

  const results: WorkerDeployability[] = [];

  for (const w of workers) {
    const name = w.full_name ?? "Unknown";
    const spec = w.specialization ?? "GENERAL";
    const site = w.assigned_site ?? null;

    // Check permit validity
    const trcExp = w.trc_expiry ? new Date(w.trc_expiry).getTime() : null;
    const wpExp = w.work_permit_expiry ? new Date(w.work_permit_expiry).getTime() : null;
    const nearestPermit = [trcExp, wpExp].filter(Boolean).sort()[0] as number | undefined;
    const permitExpired = nearestPermit ? nearestPermit < now : true;
    const permitDays = nearestPermit ? Math.ceil((nearestPermit - now) / 86_400_000) : null;

    // Check 90/180 Schengen (simplified: days since last entry)
    const lastEntry = w.last_entry_date ? new Date(w.last_entry_date).getTime() : null;
    const daysSinceEntry = lastEntry ? Math.ceil((now - lastEntry) / 86_400_000) : null;
    const schengenDaysUsed = daysSinceEntry ?? 0;
    const schengenRemaining = 90 - schengenDaysUsed;

    // Check visa expiry
    const visaExp = w.visa_expiry ? new Date(w.visa_expiry).getTime() : null;
    const visaExpired = visaExp ? visaExp < now : false;

    // Art. 108: has valid TRC or TRC filed (trc_expiry exists and was valid at some point)
    const hasArt108 = trcExp !== null && !permitExpired;

    // Determine deployability
    let deployable = true;
    let riskLevel: WorkerDeployability["riskLevel"] = "clear";
    let reason = "Clear for deployment";
    let daysRemaining: number | null = permitDays;

    if (permitExpired && !hasArt108) {
      deployable = false;
      riskLevel = "blocked";
      reason = "Permit expired — no Art. 108 protection";
    } else if (visaExpired) {
      deployable = false;
      riskLevel = "blocked";
      reason = "Visa expired";
    } else if (daysSinceEntry !== null && schengenRemaining <= 0 && !trcExp) {
      deployable = false;
      riskLevel = "blocked";
      reason = "90/180 Schengen days exhausted — no TRC";
    } else if (permitDays !== null && permitDays <= 10 && !hasArt108) {
      deployable = true;
      riskLevel = "production_risk";
      reason = `Permit expires in ${permitDays} day(s) — no Art. 108 protection`;
      daysRemaining = permitDays;
    } else if (daysSinceEntry !== null && schengenRemaining <= 10 && !trcExp) {
      deployable = true;
      riskLevel = "production_risk";
      reason = `${schengenRemaining} Schengen days remaining — no TRC`;
      daysRemaining = schengenRemaining;
    } else if (permitDays !== null && permitDays <= 30) {
      riskLevel = "attention";
      reason = `Permit expires in ${permitDays} day(s)`;
      daysRemaining = permitDays;
    }

    results.push({ workerId: w.id, workerName: name, specialization: spec, assignedSite: site, deployable, riskLevel, reason, daysRemaining, hasArt108 });
  }

  // Group by specialization
  const specMap = new Map<string, SpecializationCapacity>();
  for (const r of results) {
    if (!specMap.has(r.specialization)) {
      specMap.set(r.specialization, { specialization: r.specialization, total: 0, deployable: 0, atRisk: 0, blocked: 0 });
    }
    const s = specMap.get(r.specialization)!;
    s.total++;
    if (r.riskLevel === "blocked") s.blocked++;
    else if (r.riskLevel === "production_risk") s.atRisk++;
    else s.deployable++;
  }

  // MOS signer aging report
  const mosAging = workers
    .filter((w: any) => w.mos_signature_deadline)
    .map((w: any) => {
      const deadline = new Date(w.mos_signature_deadline);
      const daysLeft = Math.ceil((deadline.getTime() - now) / 86_400_000);
      return { workerId: w.id, workerName: w.full_name, deadline: deadline.toISOString().slice(0, 10), daysLeft };
    })
    .filter((m: any) => m.daysLeft <= 30)
    .sort((a: any, b: any) => a.daysLeft - b.daysLeft);

  const deployable = results.filter(r => r.deployable).length;
  const blocked = results.filter(r => r.riskLevel === "blocked").length;
  const atRisk = results.filter(r => r.riskLevel === "production_risk").length;

  return {
    totalWorkers: results.length,
    deployableWorkers: deployable,
    atRiskWorkers: atRisk,
    blockedWorkers: blocked,
    clearPercentage: results.length > 0 ? Math.round((deployable / results.length) * 100) : 0,
    bySpecialization: Array.from(specMap.values()).sort((a, b) => b.total - a.total),
    workers: results.sort((a, b) => {
      const order = { blocked: 0, production_risk: 1, attention: 2, clear: 3 };
      return order[a.riskLevel] - order[b.riskLevel];
    }),
    mosSignerAging: mosAging,
    generatedAt: new Date().toISOString(),
  };
}
