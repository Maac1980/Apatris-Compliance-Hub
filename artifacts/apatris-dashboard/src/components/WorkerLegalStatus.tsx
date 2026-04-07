/**
 * WorkerLegalStatus — worker-facing legal status display.
 * Shows simplified, approved information only.
 * No internal terms, no risk scores, no legal articles.
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { Shield, Clock, CheckCircle2, AlertTriangle, HelpCircle, Phone } from "lucide-react";

interface WorkerLegalView {
  statusLabel: string;
  statusColor: string;
  explanation: string;
  whatHappensNext: string;
  whatYouNeedToDo: string | null;
  contactMessage: string;
  lastUpdated: string;
  customMessage: string | null;
}

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; icon: typeof Shield }> = {
  green: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", icon: CheckCircle2 },
  blue:  { bg: "bg-blue-500/10",    border: "border-blue-500/20",    text: "text-blue-400",    icon: Shield },
  amber: { bg: "bg-amber-500/10",   border: "border-amber-500/20",   text: "text-amber-400",   icon: Clock },
  red:   { bg: "bg-red-500/10",     border: "border-red-500/20",     text: "text-red-400",     icon: AlertTriangle },
  gray:  { bg: "bg-slate-800",      border: "border-slate-700",      text: "text-slate-400",   icon: HelpCircle },
};

export function WorkerLegalStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ["worker-legal-status-self"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/self-service/legal-status`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json() as Promise<WorkerLegalView>;
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6 text-center">
        <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full mx-auto" />
        <p className="text-xs text-slate-400 mt-2">Loading your status...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6">
        <p className="text-sm text-slate-400">Your status information is being set up. Your coordinator will contact you.</p>
      </div>
    );
  }

  const style = COLOR_MAP[data.statusColor] ?? COLOR_MAP.gray;
  const Icon = style.icon;

  return (
    <div className="space-y-4">
      {/* Status card */}
      <div className={`rounded-xl border ${style.border} ${style.bg} p-5`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-lg ${style.bg}`}>
            <Icon className={`w-6 h-6 ${style.text}`} />
          </div>
          <div>
            <h2 className={`text-lg font-bold ${style.text}`}>{data.statusLabel}</h2>
            <p className="text-[11px] text-slate-500">
              Updated: {new Date(data.lastUpdated).toLocaleDateString("en-GB")}
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-200 leading-relaxed">{data.explanation}</p>
      </div>

      {/* What happens next */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">What happens next</h3>
        <p className="text-sm text-slate-300 leading-relaxed">{data.whatHappensNext}</p>
      </div>

      {/* What you need to do */}
      {data.whatYouNeedToDo && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">What you need to do</h3>
          <p className="text-sm text-slate-300 leading-relaxed">{data.whatYouNeedToDo}</p>
        </div>
      )}

      {/* Contact */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 flex items-start gap-3">
        <Phone className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-slate-400 leading-relaxed">{data.contactMessage}</p>
      </div>
    </div>
  );
}
