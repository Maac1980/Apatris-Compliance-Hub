/**
 * MOS 2026 Package Generator — creates structured readiness packages per worker.
 *
 * Generates:
 *  1. Structured JSON (Annex 1 data — worker + employer + permit details)
 *  2. 9-Point Strategy Brief (derived from legal snapshot)
 *  3. Professional PDF (via jsPDF, generated on the frontend)
 *
 * Employer: Apatris Sp. z o.o., NIP: 5252828706
 */

import { queryOne, execute } from "../lib/db.js";
import { getWorkerLegalSnapshot, evaluateDeployability } from "./legal-status.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface AnnexData {
  employer: { name: string; nip: string; address: string; regon: string };
  worker: {
    fullName: string;
    dateOfBirth: string | null;
    nationality: string | null;
    passportNumber: string | null;
    passportExpiry: string | null;
    pesel: string | null;
    assignedSite: string | null;
    specialization: string | null;
    hourlyRate: number;
    monthlyHours: number;
  };
  permit: {
    type: string | null;
    expiryDate: string | null;
    filingDate: string | null;
    trcSubmitted: boolean;
    portalLink: string | null;
    feeAmount: number | null;
  };
}

export interface StrategyPoint {
  id: number;
  title: string;
  value: string;
  status: "ok" | "warning" | "critical" | "info";
}

export interface MOSPackage {
  workerId: string;
  workerName: string;
  generatedAt: string;
  annex: AnnexData;
  strategyBrief: StrategyPoint[];
  legalStatus: string;
  riskLevel: string;
  deployability: string;
  mosReadiness: "ready" | "needs_attention" | "blocked";
}

// ═══ EMPLOYER CONSTANTS ═════════════════════════════════════════════════════

const APATRIS_EMPLOYER = {
  name: "Apatris Sp. z o.o.",
  nip: "5252828706",
  regon: "525282870600000",
  krs: "0001058153",
  address: "ul. Chlodna 51, 00-867 Warszawa, Poland",
};

// ═══ PACKAGE GENERATOR ═════════════════════════════════════════════════════

export async function generateMOSPackage(workerId: string, tenantId: string): Promise<MOSPackage> {
  // 1. Get worker data
  const worker = await queryOne<any>(
    `SELECT id, full_name, date_of_birth, nationality, passport_number, passport_expiry,
            pesel, assigned_site, specialization, hourly_rate, monthly_hours,
            trc_expiry, work_permit_expiry, mos_portal_link, mos_fee_amount
     FROM workers WHERE id = $1 AND tenant_id = $2`,
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");

  // 2. Get legal snapshot (includes trustedInputs, rejectionReasons, recommendedActions, authorityDraftContext)
  const snapshot = await getWorkerLegalSnapshot(workerId, tenantId);
  const deploy = evaluateDeployability({
    legalStatus: snapshot.legalStatus,
    legalBasis: snapshot.legalBasis,
    riskLevel: snapshot.riskLevel,
  });

  // 3. Get approved document data for enrichment
  const approvedPassport = await queryOne<any>(
    `SELECT confirmed_fields_json FROM document_intake
     WHERE tenant_id = $1 AND (confirmed_worker_id = $2 OR matched_worker_id = $2)
       AND status = 'CONFIRMED' AND ai_classification IN ('PASSPORT','TRC')
     ORDER BY confirmed_at DESC LIMIT 1`,
    [tenantId, workerId]
  );
  let docFields: Record<string, any> = {};
  if (approvedPassport?.confirmed_fields_json) {
    try {
      const raw = typeof approvedPassport.confirmed_fields_json === "string"
        ? JSON.parse(approvedPassport.confirmed_fields_json)
        : approvedPassport.confirmed_fields_json;
      for (const [k, v] of Object.entries(raw)) {
        docFields[k] = typeof v === "object" && v !== null ? (v as any).value : v;
      }
    } catch { /* ignore parse errors */ }
  }

  // 4. Build Annex 1 data
  const toDate = (v: any): string | null => { if (!v) return null; if (v instanceof Date) return v.toISOString().slice(0, 10); const s = String(v); return s.includes("T") ? s.slice(0, 10) : s.length >= 10 && !isNaN(Date.parse(s)) ? new Date(s).toISOString().slice(0, 10) : s; };
  const annex: AnnexData = {
    employer: APATRIS_EMPLOYER,
    worker: {
      fullName: worker.full_name,
      dateOfBirth: toDate(docFields.date_of_birth ?? worker.date_of_birth),
      nationality: docFields.nationality ?? worker.nationality ?? null,
      passportNumber: docFields.passport_number ?? worker.passport_number ?? null,
      passportExpiry: toDate(worker.passport_expiry ?? docFields.expiry_date),
      pesel: worker.pesel ?? null,
      assignedSite: worker.assigned_site ?? null,
      specialization: worker.specialization ?? null,
      hourlyRate: Number(worker.hourly_rate) || 0,
      monthlyHours: Number(worker.monthly_hours) || 0,
    },
    permit: {
      type: snapshot.legalBasis === "PERMIT_VALID" ? "TRC" : snapshot.legalBasis === "ART_108_CONTINUITY" ? "TRC (Art. 108)" : "Work Permit",
      expiryDate: snapshot.permitExpiresAt?.slice(0, 10) ?? worker.trc_expiry ?? worker.work_permit_expiry ?? null,
      filingDate: snapshot.authorityDraftContext?.filingDate ?? null,
      trcSubmitted: snapshot.trcApplicationSubmitted,
      portalLink: worker.mos_portal_link ?? null,
      feeAmount: worker.mos_fee_amount ? Number(worker.mos_fee_amount) : null,
    },
  };

  // 5. Build 9-Point Strategy Brief
  const ctx = snapshot.authorityDraftContext;
  const rejections = snapshot.rejectionReasons ?? [];
  const missing = snapshot.missingRequirements ?? [];
  const actions = snapshot.recommendedActions ?? [];

  const strategyBrief: StrategyPoint[] = [
    {
      id: 1,
      title: "Identity",
      value: `${annex.worker.fullName}${annex.worker.nationality ? `, ${annex.worker.nationality}` : ""}${annex.worker.passportNumber ? ` (${annex.worker.passportNumber})` : ""}`,
      status: annex.worker.passportNumber ? "ok" : "warning",
    },
    {
      id: 2,
      title: "Legal Status",
      value: snapshot.legalStatus.replace(/_/g, " "),
      status: snapshot.legalStatus === "VALID" ? "ok" : snapshot.legalStatus === "PROTECTED_PENDING" ? "info" : "critical",
    },
    {
      id: 3,
      title: "Permit Expiry",
      value: annex.permit.expiryDate
        ? `${annex.permit.expiryDate}${snapshot.permitExpiresAt && new Date(snapshot.permitExpiresAt).getTime() < Date.now() ? " (EXPIRED)" : ""}`
        : "No expiry date on file",
      status: !annex.permit.expiryDate ? "warning"
        : snapshot.permitExpiresAt && new Date(snapshot.permitExpiresAt).getTime() < Date.now() ? "critical"
        : snapshot.permitExpiresAt && new Date(snapshot.permitExpiresAt).getTime() < Date.now() + 60 * 86_400_000 ? "warning"
        : "ok",
    },
    {
      id: 4,
      title: "TRC Filing",
      value: annex.permit.trcSubmitted
        ? `Filed${annex.permit.filingDate ? ` on ${annex.permit.filingDate}` : ""}`
        : "Not filed",
      status: annex.permit.trcSubmitted ? "ok" : "critical",
    },
    {
      id: 5,
      title: "Employer Continuity",
      value: snapshot.sameEmployerFlag ? "Confirmed — same employer" : "Not confirmed",
      status: snapshot.sameEmployerFlag ? "ok" : "warning",
    },
    {
      id: 6,
      title: "Art. 108 Protection",
      value: snapshot.legalProtectionFlag
        ? "Eligible — continuity protection applies"
        : snapshot.trcApplicationSubmitted
          ? "Pending — filed but conditions not fully verified"
          : "Not eligible — no TRC application filed before expiry",
      status: snapshot.legalProtectionFlag ? "ok" : snapshot.trcApplicationSubmitted ? "info" : "critical",
    },
    {
      id: 7,
      title: "Document Gaps",
      value: missing.length > 0 ? missing.join("; ") : "No gaps identified",
      status: missing.length > 0 ? "warning" : "ok",
    },
    {
      id: 8,
      title: "Required Actions",
      value: actions.length > 0 ? actions[0] + (actions.length > 1 ? ` (+${actions.length - 1} more)` : "") : "No actions required",
      status: actions.length > 0 ? "warning" : "ok",
    },
    {
      id: 9,
      title: "Risk Assessment",
      value: `${snapshot.riskLevel} risk — ${deploy.deployability}${rejections.length > 0 ? `. ${rejections[0]}` : ""}`,
      status: snapshot.riskLevel === "LOW" ? "ok" : snapshot.riskLevel === "MEDIUM" ? "warning" : "critical",
    },
  ];

  // 6. Determine overall readiness
  const critCount = strategyBrief.filter(p => p.status === "critical").length;
  const warnCount = strategyBrief.filter(p => p.status === "warning").length;
  const mosReadiness: MOSPackage["mosReadiness"] = critCount > 0 ? "blocked" : warnCount > 0 ? "needs_attention" : "ready";

  // 7. Update worker record
  await execute(
    `UPDATE workers SET mos_status = $1, mos_package_url = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4`,
    [mosReadiness, `mos-package-${workerId}`, workerId, tenantId]
  ).catch(() => { /* columns may not exist yet */ });

  return {
    workerId,
    workerName: worker.full_name,
    generatedAt: new Date().toISOString(),
    annex,
    strategyBrief,
    legalStatus: snapshot.legalStatus,
    riskLevel: snapshot.riskLevel,
    deployability: deploy.deployability,
    mosReadiness,
  };
}
