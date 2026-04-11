/**
 * DecisionExplanationCard — displays structured decision explanations.
 * Shows what was decided, why, what's missing, contradictions, and next actions.
 */

import React, { useState } from "react";
import {
  AlertTriangle, XOctagon, ShieldAlert, CheckCircle2, Zap,
  ChevronDown, ChevronUp, AlertCircle, HelpCircle, ArrowRight,
} from "lucide-react";

type DecisionVerdict = "HALTED" | "WARNING" | "REQUIRES_REVIEW" | "PROCEED" | "ESCALATE";
type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface DecisionExplanation {
  decision: DecisionVerdict;
  confidence: number;
  summary: string;
  reasons: string[];
  missing_inputs: string[];
  contradictions: string[];
  next_actions: string[];
  severity: Severity;
  human_review_required: boolean;
}

const VERDICT_CONFIG: Record<DecisionVerdict, {
  icon: React.ElementType;
  label: string;
  bg: string;
  border: string;
  text: string;
  badge: string;
}> = {
  HALTED: {
    icon: XOctagon,
    label: "HALTED",
    bg: "bg-red-500/5",
    border: "border-red-500/20",
    text: "text-red-400",
    badge: "bg-red-500/20 text-red-400 border-red-500/30",
  },
  ESCALATE: {
    icon: Zap,
    label: "ESCALATE",
    bg: "bg-orange-500/5",
    border: "border-orange-500/20",
    text: "text-orange-400",
    badge: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
  WARNING: {
    icon: AlertTriangle,
    label: "WARNING",
    bg: "bg-amber-500/5",
    border: "border-amber-500/20",
    text: "text-amber-400",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  REQUIRES_REVIEW: {
    icon: ShieldAlert,
    label: "REVIEW REQUIRED",
    bg: "bg-purple-500/5",
    border: "border-purple-500/20",
    text: "text-purple-400",
    badge: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  },
  PROCEED: {
    icon: CheckCircle2,
    label: "PROCEED",
    bg: "bg-emerald-500/5",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
};

const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: "text-red-400",
  HIGH: "text-orange-400",
  MEDIUM: "text-amber-400",
  LOW: "text-slate-400",
};

interface Props {
  explanation: DecisionExplanation;
  /** Compact mode hides details behind expand toggle */
  compact?: boolean;
  className?: string;
}

export function DecisionExplanationCard({ explanation: ex, compact = false, className }: Props) {
  const [expanded, setExpanded] = useState(!compact);
  const cfg = VERDICT_CONFIG[ex.decision] ?? VERDICT_CONFIG.REQUIRES_REVIEW;
  const Icon = cfg.icon;

  const hasDetails = ex.reasons.length > 0 || ex.missing_inputs.length > 0
    || ex.contradictions.length > 0 || ex.next_actions.length > 0;

  return (
    <div className={`rounded-xl border ${cfg.bg} ${cfg.border} ${className ?? ""}`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 ${compact && hasDetails ? "cursor-pointer" : ""}`}
        onClick={() => compact && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.badge} border shrink-0`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-black uppercase tracking-wider ${cfg.text}`}>{cfg.label}</span>
              <span className={`text-[9px] font-bold uppercase ${SEVERITY_COLOR[ex.severity]}`}>{ex.severity}</span>
              {ex.human_review_required && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  HUMAN REVIEW
                </span>
              )}
              <span className="text-[10px] font-mono text-slate-500">{ex.confidence}% confidence</span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{ex.summary}</p>
          </div>
        </div>
        {compact && hasDetails && (
          <div className="shrink-0 ml-2">
            {expanded
              ? <ChevronUp className="w-4 h-4 text-slate-500" />
              : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </div>
        )}
      </div>

      {/* Detail sections */}
      {expanded && hasDetails && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-800/50 pt-3">
          {/* Why */}
          {ex.reasons.length > 0 && (
            <Section icon={HelpCircle} title="Why" color="text-slate-400">
              {ex.reasons.map((r, i) => (
                <li key={i} className="text-xs text-slate-300 leading-relaxed">{r}</li>
              ))}
            </Section>
          )}

          {/* Missing Inputs */}
          {ex.missing_inputs.length > 0 && (
            <Section icon={AlertCircle} title="Missing Inputs" color="text-amber-400">
              {ex.missing_inputs.map((m, i) => (
                <li key={i} className="text-xs text-amber-300/80">{m}</li>
              ))}
            </Section>
          )}

          {/* Contradictions */}
          {ex.contradictions.length > 0 && (
            <Section icon={AlertTriangle} title="Contradictions" color="text-red-400">
              {ex.contradictions.map((c, i) => (
                <li key={i} className="text-xs text-red-300/80">{c}</li>
              ))}
            </Section>
          )}

          {/* Next Actions */}
          {ex.next_actions.length > 0 && (
            <Section icon={ArrowRight} title="Next Actions" color="text-blue-400">
              {ex.next_actions.map((a, i) => (
                <li key={i} className="text-xs text-blue-300/80 leading-relaxed">{a}</li>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ icon: SIcon, title, color, children }: {
  icon: React.ElementType; title: string; color: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-1.5`}>
        <SIcon className={`w-3 h-3 ${color}`} />
        <span className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{title}</span>
      </div>
      <ul className="space-y-1 pl-4 list-disc marker:text-slate-600">{children}</ul>
    </div>
  );
}
