import React from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  Shield, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2,
  Users, FileCheck, Sparkles, ChevronRight,
} from "lucide-react";

interface RiskItem {
  severity: string; category: string; description: string;
  workerName?: string; daysRemaining?: number; pointsDeducted: number;
}

interface PIPData {
  score: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  totalWorkers: number;
  counts: { expired: number; critical: number; warning: number; missing: number };
  topRisks: RiskItem[];
  fixFirst: string[];
  explanation: string;
  aiSummary?: { summary: string; recommendations: string[]; aiGenerated: boolean } | null;
}

const LEVEL_CONFIG = {
  LOW:    { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "LOW RISK" },
  MEDIUM: { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   label: "MEDIUM RISK" },
  HIGH:   { color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20",     label: "HIGH RISK" },
};

const SEV_ICON: Record<string, React.ReactNode> = {
  expired:  <XCircle className="w-3.5 h-3.5 text-red-400" />,
  critical: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
  warning:  <Clock className="w-3.5 h-3.5 text-yellow-400" />,
  missing:  <FileCheck className="w-3.5 h-3.5 text-slate-400" />,
};

const SEV_COLOR: Record<string, string> = {
  expired:  "bg-red-900/30 border-red-500/20 text-red-300",
  critical: "bg-amber-900/30 border-amber-500/20 text-amber-300",
  warning:  "bg-yellow-900/30 border-yellow-500/20 text-yellow-300",
  missing:  "bg-slate-800 border-slate-600 text-slate-300",
};

export default function PIPReadiness() {
  const { data, isLoading } = useQuery<PIPData>({
    queryKey: ["pip-readiness"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/pip-readiness`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cfg = LEVEL_CONFIG[data.riskLevel];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary" /> PIP Inspection Readiness
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Państwowa Inspekcja Pracy — real-time compliance readiness based on your workforce data
          </p>
        </div>

        {/* Score card */}
        <div className={`${cfg.bg} border ${cfg.border} rounded-2xl p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Readiness Score</p>
              <div className="flex items-baseline gap-3">
                <span className={`text-5xl font-black ${cfg.color}`}>{data.score}%</span>
                <span className={`text-sm font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <Users className="w-4 h-4" /> {data.totalWorkers} workers assessed
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${data.score >= 80 ? "bg-emerald-500" : data.score >= 50 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${data.score}%` }}
            />
          </div>
        </div>

        {/* Counts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-red-900/20 border border-red-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-red-400">{data.counts.expired}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/60">Expired</p>
          </div>
          <div className="bg-amber-900/20 border border-amber-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-amber-400">{data.counts.critical}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/60">Critical</p>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-yellow-400">{data.counts.warning}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-400/60">Warning</p>
          </div>
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-slate-300">{data.counts.missing}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Missing</p>
          </div>
        </div>

        {/* Explanation */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            {data.aiSummary?.aiGenerated ? <Sparkles className="w-4 h-4 text-indigo-400" /> : <Shield className="w-4 h-4 text-primary" />}
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {data.aiSummary?.aiGenerated ? "AI-Assisted Summary" : "Compliance Summary"}
            </p>
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            {data.aiSummary?.summary ?? data.explanation}
          </p>
          {data.aiSummary?.recommendations && data.aiSummary.recommendations.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Recommendations</p>
              {data.aiSummary.recommendations.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ChevronRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fix First */}
        {data.fixFirst.length > 0 && (
          <div className="bg-red-900/10 border border-red-500/20 rounded-xl p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-3">Fix First — Highest Priority</p>
            <div className="space-y-2">
              {data.fixFirst.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                  <p className="text-sm text-foreground">{item}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk details */}
        {data.topRisks.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">All Risk Items ({data.topRisks.length})</p>
            <div className="space-y-1.5">
              {data.topRisks.map((risk, i) => (
                <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${SEV_COLOR[risk.severity] ?? SEV_COLOR.missing}`}>
                  {SEV_ICON[risk.severity]}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{risk.description}</p>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground shrink-0">-{risk.pointsDeducted}pts</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5">
                    {risk.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
