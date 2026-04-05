import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Play, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Alert { id: string; alert_type: string; severity: string; description: string; worker_name: string | null; evidence: any; detected_at: string; }

const TYPE_LABELS: Record<string, string> = { ghost_worker: "Ghost Worker", duplicate_document: "Duplicate Document", payroll_anomaly: "Payroll Anomaly", duplicate_bank: "Duplicate Bank", checkin_anomaly: "Check-in Anomaly", advance_abuse: "Advance Abuse" };
const SEV: Record<string, { bg: string; text: string }> = { critical: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" }, high: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400" }, medium: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400" }, low: { bg: "bg-slate-500/10 border-slate-500/20", text: "text-slate-400" } };

export default function FraudDetection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["fraud-summary"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/fraud/summary`, { headers: authHeaders() }); if (!r.ok) return { totalActive: 0, critical: 0, resolved: 0 }; return r.json(); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["fraud-alerts"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/fraud/alerts`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ alerts: Alert[] }>; },
  });

  const scanMutation = useMutation({
    mutationFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/fraud/scan`, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `${d.alertsFound} alerts found, ${d.highCritical} high/critical` }); queryClient.invalidateQueries({ queryKey: ["fraud-alerts", "fraud-summary"] }); },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolution }: { id: string; resolution: string }) => { const r = await fetch(`${import.meta.env.BASE_URL}api/fraud/alerts/${id}/resolve`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ resolution }) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Resolved" }); queryClient.invalidateQueries({ queryKey: ["fraud-alerts", "fraud-summary"] }); },
  });

  const alerts = data?.alerts ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Fraud Detection</h1>
        </div>
        <p className="text-gray-400">Automated cross-reference scanning for anomalies and fraud</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Critical</p><p className="text-2xl font-bold text-red-400">{summary?.critical ?? 0}</p></div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Active Alerts</p><p className="text-2xl font-bold text-amber-400">{summary?.totalActive ?? 0}</p></div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Resolved</p><p className="text-2xl font-bold text-emerald-400">{summary?.resolved ?? 0}</p></div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
          {scanMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}
          Run Fraud Scan
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No active fraud alerts</p></div>
      ) : (
        <div className="space-y-3">
          {alerts.map(a => {
            const sv = SEV[a.severity] || SEV.medium;
            const evidence = typeof a.evidence === "string" ? JSON.parse(a.evidence) : (a.evidence || {});
            return (
              <div key={a.id} className={`rounded-xl border p-4 ${sv.bg}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {a.severity === "critical" && <AlertTriangle className="w-4 h-4 text-red-400" />}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${sv.text}`}>{a.severity.toUpperCase()}</span>
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] font-mono">{TYPE_LABELS[a.alert_type] || a.alert_type}</span>
                    </div>
                    <p className="text-sm font-bold text-white">{a.description}</p>
                    {a.worker_name && <p className="text-xs text-slate-400">Worker: {a.worker_name}</p>}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => resolveMutation.mutate({ id: a.id, resolution: "false_positive" })}
                      className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-[10px] font-bold hover:bg-slate-600">False +</button>
                    <button onClick={() => resolveMutation.mutate({ id: a.id, resolution: "confirmed_fraud" })}
                      className="px-2 py-1 bg-red-600/20 text-red-400 border border-red-500/30 rounded text-[10px] font-bold hover:bg-red-600/30">Confirm</button>
                  </div>
                </div>
                {Object.keys(evidence).length > 0 && (
                  <div className="bg-slate-900/50 rounded-lg p-2 mt-2">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Evidence</p>
                    {Object.entries(evidence).map(([k, v]) => (
                      <p key={k} className="text-[10px] text-slate-400"><span className="text-slate-500">{k}:</span> {String(v)}</p>
                    ))}
                  </div>
                )}
                <p className="text-[9px] text-slate-600 font-mono mt-2">{new Date(a.detected_at).toLocaleString("en-GB")}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
