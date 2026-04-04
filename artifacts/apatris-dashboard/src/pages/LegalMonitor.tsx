import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Scale, Play, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface LegalUpdate { id: string; source: string; title: string; summary: string; impact_level: string; affected_areas: any; affected_workers_estimate: number; published_date: string | null; url: string | null; status: string; acknowledged_by: string | null; }

const IMPACT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
  high:     { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  medium:   { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  low:      { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/20" },
};

export default function LegalMonitor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["legal-summary"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/legal/summary`, { headers: authHeaders() });
      if (!res.ok) return { unread: { critical: 0, high: 0, medium: 0, low: 0 }, totalUnread: 0 };
      return res.json();
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["legal-updates"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/legal/updates`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ updates: LegalUpdate[] }>;
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/legal/scan`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (d) => { toast({ description: `Scanned ${d.scanned} topics: ${d.found} new, ${d.critical} critical` }); queryClient.invalidateQueries({ queryKey: ["legal-updates", "legal-summary"] }); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const ackMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/legal/updates/${id}/acknowledge`, { method: "PATCH", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Acknowledged" }); queryClient.invalidateQueries({ queryKey: ["legal-updates", "legal-summary"] }); },
  });

  const updates = data?.updates ?? [];
  const s = summary?.unread ?? { critical: 0, high: 0, medium: 0, low: 0 };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Scale className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Legal Change Monitor</h1>
        </div>
        <p className="text-gray-400">AI-powered Polish and EU regulatory change tracking</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Unread</p><p className="text-2xl font-bold text-white">{summary?.totalUnread ?? 0}</p></div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Critical</p><p className="text-2xl font-bold text-red-400">{s.critical}</p></div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">High</p><p className="text-2xl font-bold text-amber-400">{s.high}</p></div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Medium</p><p className="text-2xl font-bold text-blue-400">{s.medium}</p></div>
        <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Low</p><p className="text-2xl font-bold text-slate-400">{s.low}</p></div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
          {scanMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}
          Scan for Changes
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : updates.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Scale className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No legal updates</p><p className="text-sm mt-1">Click "Scan for Changes" to check for new regulations</p></div>
      ) : (
        <div className="space-y-3">
          {updates.map(u => {
            const is_ = IMPACT_STYLES[u.impact_level] || IMPACT_STYLES.low;
            const areas = typeof u.affected_areas === "string" ? JSON.parse(u.affected_areas) : (u.affected_areas || []);
            return (
              <div key={u.id} className={`rounded-xl border p-4 ${is_.bg} ${is_.border}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {u.impact_level === "critical" && <AlertTriangle className="w-4 h-4 text-red-400" />}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${is_.bg} ${is_.text} border ${is_.border}`}>{u.impact_level.toUpperCase()}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{u.source}</span>
                    </div>
                    <p className="text-sm font-bold text-white">{u.title}</p>
                  </div>
                  {u.status === "unread" ? (
                    <button onClick={() => ackMutation.mutate(u.id)}
                      className="px-3 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold hover:bg-emerald-600/30 flex-shrink-0">
                      <CheckCircle2 className="w-3 h-3 inline mr-1" />Acknowledge
                    </button>
                  ) : (
                    <span className="text-[10px] text-emerald-600 flex-shrink-0">Reviewed</span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mb-2">{u.summary}</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {areas.map((a: string) => (
                    <span key={a} className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[9px] font-mono">{a}</span>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span>~{u.affected_workers_estimate} workers affected</span>
                  {u.published_date && <span className="font-mono">{new Date(u.published_date).toLocaleDateString("en-GB")}</span>}
                  {u.url && <a href={u.url} target="_blank" rel="noopener" className="flex items-center gap-1 text-blue-400 hover:underline"><ExternalLink className="w-3 h-3" />Source</a>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
