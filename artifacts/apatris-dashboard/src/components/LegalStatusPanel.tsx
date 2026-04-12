/**
 * LegalStatusPanel — displays a worker's legal state clearly.
 *
 * Answers: "What is this worker legally allowed to do right now,
 * why, and what is required next?"
 *
 * Reuses existing Apatris UI patterns:
 *  - ZoneBadge-style dot indicators
 *  - slate-800 card with slate-700 border (same as permit cards)
 *  - slate-900 sub-cards for detail grids
 *  - text-xs label + value pairs
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck, Shield, AlertTriangle, XOctagon, HelpCircle,
  ChevronDown, ChevronUp, Info, FileCheck, GitBranch, CircleAlert, CircleMinus, Lightbulb,
  Scale, Clock, FileSignature,
} from "lucide-react";
import {
  STATUS_DISPLAY, BASIS_LABELS, RISK_DISPLAY,
  generateLegalExplanation,
  type LegalSnapshotForExplanation,
  type ExplanationAudience,
} from "@/lib/legal-explanation";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

interface TrustedInput {
  intakeId: string;
  documentType: string;
  field: string;
  value: string;
  confidence?: number;
  source?: "ai" | "manual";
  approvedAt?: string | null;
}

interface DecisionTraceEntry {
  field: string;
  value: string;
  origin: "approved_document" | "immigration_permit" | "trc_case" | "legal_evidence" | "worker_record";
  overriddenBy?: string;
}

interface LegalStatusPanelProps {
  snapshot: LegalSnapshotForExplanation & {
    deployability?: string;
    snapshotCreatedAt?: string;
    trustedInputs?: TrustedInput[];
    decisionTrace?: DecisionTraceEntry[];
    rejectionReasons?: string[];
    missingRequirements?: string[];
    recommendedActions?: string[];
    appealRelevant?: boolean;
    appealUrgency?: "low" | "medium" | "high" | null;
    appealBasis?: string[];
    appealDeadlineNote?: string | null;
    authorityDraftContext?: {
      workerName: string | null;
      employerName: string | null;
      documentType: string | null;
      caseReference: string | null;
      currentStatus: string;
      filingDate: string | null;
      expiryDate: string | null;
      decisionOutcome: string | null;
      decisionDate: string | null;
      keyFacts: string[];
      missingDocuments: string[];
      nextAuthorityActions: string[];
    } | null;
  };
  defaultAudience?: ExplanationAudience;
}

// ═══ ICON MAP ═══════════════════════════════════════════════════════════════

const ICON_MAP = {
  "shield-check": ShieldCheck,
  "shield": Shield,
  "alert-triangle": AlertTriangle,
  "x-octagon": XOctagon,
  "help-circle": HelpCircle,
} as const;

const FIELD_LABELS: Record<string, string> = {
  filing_date: "Filing Date", expiry_date: "Expiry", employer_name: "Employer",
  work_position: "Role", case_reference: "Case Ref", decision_outcome: "Decision",
  nationality: "Nationality", passport_number: "Passport", employer_match: "Employer Match",
};

const ORIGIN_LABELS: Record<string, string> = {
  approved_document: "Approved Doc",
  immigration_permit: "Permit Record",
  trc_case: "TRC Case",
  legal_evidence: "Filing Evidence",
  worker_record: "Worker Profile",
};

// Polish translations for section headers
const PL_LABELS: Record<string, string> = {
  "Legal Basis": "Podstawa prawna", "Risk Level": "Poziom ryzyka", "Deployability": "Zdolnosc do pracy",
  "Approved Document Inputs": "Zatwierdzone dane dokumentow", "Decision Trace": "Slad decyzji",
  "Why this status?": "Dlaczego ten status?", "Reasons": "Powody", "Missing": "Brakujace", "Recommended": "Zalecane",
  "Appeal Signal": "Sygnal odwolania", "Authority Draft Context": "Kontekst pisma urzedowego",
  "Key Facts": "Kluczowe fakty", "Missing Documents": "Brakujace dokumenty",
  "Worker": "Pracownik", "Employer": "Pracodawca", "Case Ref": "Nr sprawy", "Doc Type": "Typ dokumentu",
  "Status": "Status", "Decision": "Decyzja", "Internal": "Wewnetrzne", "Worker-facing": "Dla pracownika",
};

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export function LegalStatusPanel({ snapshot, defaultAudience = "internal" }: LegalStatusPanelProps) {
  const { i18n } = useTranslation();
  const isPl = i18n.language === "pl";
  const L = (key: string) => isPl ? (PL_LABELS[key] ?? key) : key;
  const [audience, setAudience] = useState<ExplanationAudience>(defaultAudience);
  const [expanded, setExpanded] = useState(false);

  const statusCfg = STATUS_DISPLAY[snapshot.legalStatus] ?? STATUS_DISPLAY.REVIEW_REQUIRED;
  const basisLabel = BASIS_LABELS[snapshot.legalBasis] ?? snapshot.legalBasis;
  const riskCfg = RISK_DISPLAY[snapshot.riskLevel] ?? RISK_DISPLAY.HIGH;
  const explanation = generateLegalExplanation(snapshot, audience);
  const StatusIcon = ICON_MAP[statusCfg.icon];

  const conditions = snapshot.conditions ?? [];
  const warnings = snapshot.warnings ?? [];
  const actions = snapshot.requiredActions ?? [];
  const hasDetails = conditions.length > 0 || warnings.length > 0 || actions.length > 0;

  const deployColor =
    snapshot.deployability === "ALLOWED" ? "text-emerald-400" :
    snapshot.deployability === "CONDITIONAL" ? "text-amber-400" :
    snapshot.deployability === "APPROVAL_REQUIRED" ? "text-orange-400" :
    snapshot.deployability === "BLOCKED" ? "text-red-400" : "text-slate-400";

  return (
    <div className={`rounded-xl border ${statusCfg.borderColor} ${statusCfg.bgColor} overflow-hidden`}>
      {/* ── Header: Status + Risk ──────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-4 h-4 ${statusCfg.color}`} />
            <span className={`text-sm font-bold ${statusCfg.color}`}>{statusCfg.label}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotColor}`} />
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${riskCfg.bgColor} ${riskCfg.color}`}>
            {snapshot.riskLevel} RISK
          </span>
        </div>

        {/* ── Key fields grid ──────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
          <div className="rounded bg-slate-900/60 px-2 py-1.5">
            <div className="text-slate-500 mb-0.5">{L("Legal Basis")}</div>
            <div className="text-slate-200 font-medium">{basisLabel}</div>
          </div>
          <div className="rounded bg-slate-900/60 px-2 py-1.5">
            <div className="text-slate-500 mb-0.5">{L("Risk Level")}</div>
            <div className={`font-semibold ${riskCfg.color}`}>{riskCfg.label}</div>
          </div>
          {snapshot.deployability && (
            <div className="rounded bg-slate-900/60 px-2 py-1.5">
              <div className="text-slate-500 mb-0.5">{L("Deployability")}</div>
              <div className={`font-semibold ${deployColor}`}>{snapshot.deployability}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Explanation ────────────────────────────────────────────────── */}
      <div className="px-4 pb-2">
        <div className="rounded bg-slate-900/40 px-3 py-2.5">
          <p className={`text-xs font-semibold ${statusCfg.color} mb-1`}>{explanation.headline}</p>
          <p className="text-[11px] text-slate-300 leading-relaxed">{explanation.body}</p>
        </div>

        {/* Audience toggle */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => setAudience("internal")}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              audience === "internal" ? "bg-slate-700 text-slate-200" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {L("Internal")}
          </button>
          <button
            onClick={() => setAudience("worker")}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              audience === "worker" ? "bg-slate-700 text-slate-200" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {L("Worker-facing")}
          </button>
        </div>
      </div>

      {/* ── Trusted approved inputs ─────────────────────────────────────── */}
      {(snapshot.trustedInputs ?? []).length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileCheck className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider">{L("Approved Document Inputs")}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(snapshot.trustedInputs ?? []).map((ti, i) => (
              <span
                key={i}
                className="group relative inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 border border-emerald-500/15 text-emerald-300 rounded px-1.5 py-0.5"
                title={`Intake: ${ti.intakeId?.slice(0, 8) ?? "—"}… · Approved: ${ti.approvedAt ? new Date(ti.approvedAt).toLocaleString("en-GB") : "—"}`}
              >
                <span className="font-bold">{FIELD_LABELS[ti.field] ?? ti.field}:</span>
                <span className="text-emerald-400">{ti.value}</span>
                <span className="text-emerald-400/50">· {ti.documentType}</span>
                {ti.source && (
                  <span className={`ml-0.5 px-1 py-px rounded text-[8px] font-bold uppercase ${
                    ti.source === "ai" ? "bg-blue-500/20 text-blue-300" : "bg-slate-500/20 text-slate-300"
                  }`}>
                    {ti.source === "ai" ? "AI" : "Manual"}
                  </span>
                )}
                {/* Hover tooltip */}
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col items-center z-50">
                  <span className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[9px] text-slate-300 whitespace-nowrap shadow-lg">
                    {ti.intakeId ? `Intake: ${ti.intakeId.slice(0, 8)}…` : ""}
                    {ti.approvedAt ? ` · ${new Date(ti.approvedAt).toLocaleDateString("en-GB")}` : ""}
                    {typeof ti.confidence === "number" ? ` · ${Math.round(ti.confidence * 100)}%` : ""}
                  </span>
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Decision Trace ──────────────────────────────────────────────── */}
      {(snapshot.decisionTrace ?? []).length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <GitBranch className="w-3 h-3 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400/80 uppercase tracking-wider">{L("Decision Trace")}</span>
          </div>
          <div className="space-y-1">
            {(snapshot.decisionTrace ?? []).map((dt, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className="text-slate-400 font-medium w-24 flex-shrink-0">{FIELD_LABELS[dt.field] ?? dt.field}</span>
                <span className="text-slate-200 font-mono">{dt.value}</span>
                <span className="text-slate-500">←</span>
                <span className={`px-1 py-px rounded text-[9px] font-bold ${
                  dt.origin === "approved_document" ? "bg-emerald-500/15 text-emerald-400" :
                  dt.origin === "immigration_permit" ? "bg-blue-500/15 text-blue-400" :
                  dt.origin === "trc_case" ? "bg-purple-500/15 text-purple-400" :
                  dt.origin === "legal_evidence" ? "bg-amber-500/15 text-amber-400" :
                  "bg-slate-500/15 text-slate-400"
                }`}>
                  {ORIGIN_LABELS[dt.origin] ?? dt.origin}
                </span>
                {dt.overriddenBy && (
                  <span className="text-[9px] text-amber-500/70 italic">overrode fallback</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rejection Intelligence — Why this status? ───────────────────── */}
      {snapshot.legalStatus !== "VALID" && (
        (snapshot.rejectionReasons?.length ?? 0) > 0 ||
        (snapshot.missingRequirements?.length ?? 0) > 0 ||
        (snapshot.recommendedActions?.length ?? 0) > 0
      ) && (
        <div className="px-4 pb-2">
          <div className="rounded bg-red-500/5 border border-red-500/15 px-3 py-2.5 space-y-2">
            <p className="text-[10px] font-bold text-red-400/90 uppercase tracking-wider">{L("Why this status?")}</p>

            {(snapshot.rejectionReasons?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <CircleAlert className="w-3 h-3 text-red-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reasons</span>
                </div>
                <ul className="space-y-0.5">
                  {snapshot.rejectionReasons!.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-red-300/90">
                      <span className="text-red-400/60 mt-0.5 flex-shrink-0">-</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(snapshot.missingRequirements?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <CircleMinus className="w-3 h-3 text-amber-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Missing</span>
                </div>
                <ul className="space-y-0.5">
                  {snapshot.missingRequirements!.map((m, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-300/90">
                      <span className="text-amber-400/60 mt-0.5 flex-shrink-0">-</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(snapshot.recommendedActions?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Lightbulb className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recommended</span>
                </div>
                <ul className="space-y-0.5">
                  {snapshot.recommendedActions!.map((a, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-blue-300/90">
                      <span className="text-blue-400/60 mt-0.5 flex-shrink-0">{i + 1}.</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Appeal Signal ────────────────────────────────────────────────── */}
      {snapshot.appealRelevant && (snapshot.appealBasis?.length ?? 0) > 0 && (
        <div className="px-4 pb-2">
          <div className="rounded bg-purple-500/5 border border-purple-500/15 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Scale className="w-3 h-3 text-purple-400" />
                <span className="text-[10px] font-bold text-purple-400/90 uppercase tracking-wider">{L("Appeal Signal")}</span>
              </div>
              {snapshot.appealUrgency && (
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                  snapshot.appealUrgency === "high" ? "bg-red-500/20 text-red-300" :
                  snapshot.appealUrgency === "medium" ? "bg-amber-500/20 text-amber-300" :
                  "bg-slate-500/20 text-slate-300"
                }`}>
                  {snapshot.appealUrgency} urgency
                </span>
              )}
            </div>

            <ul className="space-y-0.5">
              {snapshot.appealBasis!.map((b, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-purple-300/90">
                  <span className="text-purple-400/60 mt-0.5 flex-shrink-0">-</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            {snapshot.appealDeadlineNote && (
              <div className="flex items-start gap-1.5 pt-1 border-t border-purple-500/10">
                <Clock className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                <span className="text-[10px] text-amber-300/80 leading-relaxed">{snapshot.appealDeadlineNote}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Authority Draft Context ──────────────────────────────────────── */}
      {snapshot.authorityDraftContext && (
        <div className="px-4 pb-2">
          <div className="rounded bg-slate-800/50 border border-slate-700/40 px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-1.5">
              <FileSignature className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400/80 uppercase tracking-wider">{L("Authority Draft Context")}</span>
            </div>

            {/* Identity row */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              {snapshot.authorityDraftContext.workerName && (
                <div><span className="text-slate-500">Worker:</span> <span className="text-slate-200">{snapshot.authorityDraftContext.workerName}</span></div>
              )}
              {snapshot.authorityDraftContext.employerName && (
                <div><span className="text-slate-500">Employer:</span> <span className="text-slate-200">{snapshot.authorityDraftContext.employerName}</span></div>
              )}
              {snapshot.authorityDraftContext.caseReference && (
                <div><span className="text-slate-500">Case Ref:</span> <span className="text-slate-200 font-mono">{snapshot.authorityDraftContext.caseReference}</span></div>
              )}
              {snapshot.authorityDraftContext.documentType && (
                <div><span className="text-slate-500">Doc Type:</span> <span className="text-slate-200">{snapshot.authorityDraftContext.documentType}</span></div>
              )}
              <div><span className="text-slate-500">Status:</span> <span className="text-slate-200">{snapshot.authorityDraftContext.currentStatus.replace(/_/g, " ")}</span></div>
              {snapshot.authorityDraftContext.decisionOutcome && (
                <div><span className="text-slate-500">Decision:</span> <span className="text-red-400 font-medium">{snapshot.authorityDraftContext.decisionOutcome}</span></div>
              )}
            </div>

            {/* Key facts */}
            {snapshot.authorityDraftContext.keyFacts.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Key Facts</p>
                <ul className="space-y-0.5">
                  {snapshot.authorityDraftContext.keyFacts.map((f, i) => (
                    <li key={i} className="text-[10px] text-slate-300 flex items-start gap-1">
                      <span className="text-slate-500 mt-0.5 flex-shrink-0">·</span><span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Missing documents */}
            {snapshot.authorityDraftContext.missingDocuments.length > 0 && (
              <div>
                <p className="text-[9px] font-bold text-amber-500/70 uppercase tracking-wider mb-0.5">Missing Documents</p>
                <ul className="space-y-0.5">
                  {snapshot.authorityDraftContext.missingDocuments.map((m, i) => (
                    <li key={i} className="text-[10px] text-amber-300/80 flex items-start gap-1">
                      <span className="text-amber-500/50 mt-0.5 flex-shrink-0">-</span><span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Expandable details ─────────────────────────────────────────── */}
      {hasDetails && (
        <div className="border-t border-slate-700/50">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span>{expanded ? "Hide details" : "Show conditions, warnings & actions"}</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {expanded && (
            <div className="px-4 pb-3 space-y-2.5">
              {conditions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Conditions</p>
                  <ul className="space-y-0.5">
                    {conditions.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                        <span className="text-blue-400 mt-0.5 flex-shrink-0">-</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {warnings.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-amber-500/80 uppercase tracking-wider mb-1">Warnings</p>
                  <ul className="space-y-0.5">
                    {warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                        <span className="text-amber-400 mt-0.5 flex-shrink-0">!</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {actions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Required Actions</p>
                  <ul className="space-y-0.5">
                    {actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                        <span className="text-slate-400 mt-0.5 flex-shrink-0">{i + 1}.</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-t border-slate-700/50 flex items-start gap-1.5">
        <Info className="w-3 h-3 text-slate-600 mt-0.5 flex-shrink-0" />
        <div className="text-[10px] text-slate-600 leading-relaxed">
          Status based on current facts in Apatris. May change if legal facts or documents change.
          {snapshot.snapshotCreatedAt && (
            <span className="ml-1 font-mono">
              Last evaluated: {new Date(snapshot.snapshotCreatedAt).toLocaleDateString("en-GB")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
