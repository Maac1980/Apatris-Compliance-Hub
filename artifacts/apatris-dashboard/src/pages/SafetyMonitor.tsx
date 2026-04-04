import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Shield, AlertTriangle, CheckCircle2, Brain, Eye } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface Incident { id: string; worker_name: string | null; site: string; incident_type: string; severity: string; description: string | null; ai_analysis: any; status: string; reported_at: string; }
interface SiteScore { site: string; score: number; totalIncidents: number; openIncidents: number; critical: number; zone: string; }

const SEV_STYLES: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" },
  high: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400" },
  medium: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400" },
  low: { bg: "bg-slate-500/10 border-slate-500/20", text: "text-slate-400" },
};

export default function SafetyMonitor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: scoresData } = useQuery({
    queryKey: ["safety-scores"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/safety/scores`, { headers: authHeaders() });
      if (!res.ok) return { scores: [] };
      return res.json() as Promise<{ scores: SiteScore[] }>;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["safety-incidents"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/safety/incidents`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ incidents: Incident[] }>;
    },
  });

  const analyseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/safety/incidents/${id}/analyse`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_, id) => { toast({ description: "AI analysis complete" }); queryClient.invalidateQueries({ queryKey: ["safety-incidents"] }); setExpandedId(id); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/safety/incidents/${id}/resolve`, { method: "PATCH", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Resolved" }); queryClient.invalidateQueries({ queryKey: ["safety-incidents", "safety-scores"] }); },
  });

  const scores = scoresData?.scores ?? [];
  const incidents = data?.incidents ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Site Safety AI</h1>
        </div>
        <p className="text-gray-400">AI-powered safety monitoring and incident analysis</p>
      </div>

      {/* Site scores */}
      {scores.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {scores.map(s => (
            <div key={s.site} className={`rounded-xl border p-4 ${s.zone === "green" ? "bg-emerald-500/10 border-emerald-500/20" : s.zone === "amber" ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20"}`}>
              <p className="text-xs text-slate-400 truncate mb-1">{s.site}</p>
              <p className={`text-2xl font-black ${s.zone === "green" ? "text-emerald-400" : s.zone === "amber" ? "text-amber-400" : "text-red-400"}`}>{s.score}/100</p>
              <p className="text-[10px] text-slate-500">{s.openIncidents} open · {s.critical} critical</p>
            </div>
          ))}
        </div>
      )}

      <h3 className="text-sm font-bold text-white mb-3">Incidents ({incidents.length})</h3>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Shield className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No incidents reported</p></div>
      ) : (
        <div className="space-y-3">
          {incidents.map(inc => {
            const sv = SEV_STYLES[inc.severity] || SEV_STYLES.medium;
            const analysis = inc.ai_analysis ? (typeof inc.ai_analysis === "string" ? JSON.parse(inc.ai_analysis) : inc.ai_analysis) : null;
            const isOpen = expandedId === inc.id;
            return (
              <div key={inc.id} className={`rounded-xl border p-4 ${sv.bg}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {inc.severity === "critical" && <AlertTriangle className="w-4 h-4 text-red-400" />}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${sv.text}`}>{inc.severity.toUpperCase()}</span>
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] font-mono">{inc.incident_type}</span>
                    </div>
                    <p className="text-sm font-bold text-white">{inc.site}</p>
                    {inc.worker_name && <p className="text-xs text-slate-400">Reported by: {inc.worker_name}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    {!analysis && (
                      <button onClick={() => analyseMutation.mutate(inc.id)} disabled={analyseMutation.isPending}
                        className="px-2 py-1 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded text-[10px] font-bold hover:bg-indigo-600/30 disabled:opacity-50">
                        <Brain className="w-3 h-3 inline mr-1" />Analyse
                      </button>
                    )}
                    {inc.status === "open" && (
                      <button onClick={() => resolveMutation.mutate(inc.id)}
                        className="px-2 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold hover:bg-emerald-600/30">
                        <CheckCircle2 className="w-3 h-3 inline mr-1" />Resolve
                      </button>
                    )}
                  </div>
                </div>
                {inc.description && <p className="text-xs text-slate-300 mb-2">{inc.description}</p>}
                <p className="text-[10px] text-slate-500 font-mono">{new Date(inc.reported_at).toLocaleString("en-GB")}</p>

                {analysis && (
                  <div className="mt-3 bg-slate-900/50 rounded-lg p-3 border border-indigo-500/10">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">AI Safety Analysis</p>
                    {analysis.violations_found?.length > 0 && (
                      <div className="mb-2">{analysis.violations_found.map((v: string, i: number) => (
                        <span key={i} className="inline-block mr-1.5 mb-1 px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-[9px] font-bold">{v}</span>
                      ))}</div>
                    )}
                    {analysis.recommended_actions?.length > 0 && (
                      <ul className="space-y-0.5">{analysis.recommended_actions.map((a: string, i: number) => (
                        <li key={i} className="text-[10px] text-slate-400 flex items-start gap-1.5"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 mt-0.5 flex-shrink-0" />{a}</li>
                      ))}</ul>
                    )}
                    {analysis.root_cause && <p className="text-[10px] text-slate-500 mt-2">Root cause: {analysis.root_cause}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
