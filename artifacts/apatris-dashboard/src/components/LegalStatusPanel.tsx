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
import {
  ShieldCheck, Shield, AlertTriangle, XOctagon, HelpCircle,
  ChevronDown, ChevronUp, Info,
} from "lucide-react";
import {
  STATUS_DISPLAY, BASIS_LABELS, RISK_DISPLAY,
  generateLegalExplanation,
  type LegalSnapshotForExplanation,
  type ExplanationAudience,
} from "@/lib/legal-explanation";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

interface LegalStatusPanelProps {
  snapshot: LegalSnapshotForExplanation & {
    deployability?: string;
    snapshotCreatedAt?: string;
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

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export function LegalStatusPanel({ snapshot, defaultAudience = "internal" }: LegalStatusPanelProps) {
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
            <div className="text-slate-500 mb-0.5">Legal Basis</div>
            <div className="text-slate-200 font-medium">{basisLabel}</div>
          </div>
          <div className="rounded bg-slate-900/60 px-2 py-1.5">
            <div className="text-slate-500 mb-0.5">Risk Level</div>
            <div className={`font-semibold ${riskCfg.color}`}>{riskCfg.label}</div>
          </div>
          {snapshot.deployability && (
            <div className="rounded bg-slate-900/60 px-2 py-1.5">
              <div className="text-slate-500 mb-0.5">Deployability</div>
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
            Internal
          </button>
          <button
            onClick={() => setAudience("worker")}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              audience === "worker" ? "bg-slate-700 text-slate-200" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Worker-facing
          </button>
        </div>
      </div>

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
