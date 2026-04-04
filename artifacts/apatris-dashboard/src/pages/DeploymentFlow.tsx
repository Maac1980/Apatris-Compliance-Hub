import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Zap, Play, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

export default function DeploymentFlow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: stats } = useQuery({ queryKey: ["deployment-stats"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/deployments/stats`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); } });
  const { data, isLoading } = useQuery({ queryKey: ["deployments"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/deployments`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); } });

  const { data: companiesData } = useQuery({ queryKey: ["crm-companies"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/crm/companies`, { headers: authHeaders() }); if (!r.ok) return { companies: [] }; return r.json(); } });

  const deployMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => { const r = await fetch(`${import.meta.env.BASE_URL}api/deployments/start`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `Deployed in ${d.totalMinutes} min — SLA ${d.slaMet ? "MET ✓" : "EXCEEDED"}` }); queryClient.invalidateQueries({ queryKey: ["deployments", "deployment-stats"] }); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const s = stats ?? {};
  const deployments = data?.deployments ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Zap className="w-7 h-7 text-[#B8860B]" /><h1 className="text-3xl font-bold text-white">15-Minute Deployment</h1></div>
        <p className="text-gray-400">Job request → AI match → contract → WhatsApp notify — under 15 minutes</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#B8860B]/10 border border-[#B8860B]/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Avg Time</p><p className="text-2xl font-bold text-[#B8860B]">{s.avgMinutes ?? 0} min</p></div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">SLA Met</p><p className="text-2xl font-bold text-emerald-400">{s.slaPercentage ?? 0}%</p></div>
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Total</p><p className="text-2xl font-bold text-white">{s.totalDeployments ?? 0}</p></div>
        <div className="bg-[#B8860B]/10 border border-[#B8860B]/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Fastest</p><p className="text-2xl font-bold text-[#B8860B]">{s.fastestMinutes ?? 0} min</p></div>
      </div>

      {/* Deploy form */}
      <div className="bg-slate-900 border border-[#B8860B]/20 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-bold text-[#B8860B] mb-3 flex items-center gap-2"><Zap className="w-4 h-4" />Start 15-Minute Deployment</h3>
        <div className="flex flex-wrap gap-3">
          <input placeholder="Role Type (e.g. TIG Welder)" value={form.roleType || ""} onChange={e => setForm({ ...form, roleType: e.target.value })} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 flex-1 min-w-[200px] focus:outline-none focus:ring-1 focus:ring-[#B8860B]" />
          <input placeholder="Location" value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 w-48 focus:outline-none" />
          <select value={form.companyId || ""} onChange={e => { const co = (companiesData?.companies ?? []).find((c: any) => c.id === e.target.value); setForm({ ...form, companyId: e.target.value, companyName: co?.company_name || "" }); }}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white w-48 focus:outline-none">
            <option value="">Client (optional)</option>
            {(companiesData?.companies ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          <button onClick={() => deployMutation.mutate(form)} disabled={!form.roleType || deployMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-[#B8860B] text-white rounded-lg text-sm font-bold hover:bg-[#996F00] disabled:opacity-50">
            {deployMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Zap className="w-4 h-4" />}
            DEPLOY NOW
          </button>
        </div>
      </div>

      {/* Deployment history */}
      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#B8860B] border-t-transparent rounded-full" /></div> : deployments.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Zap className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No deployments yet</p></div>
      ) : (
        <div className="space-y-3">
          {deployments.map((d: any) => {
            const tl = typeof d.timeline === "string" ? JSON.parse(d.timeline) : (d.timeline || []);
            return (
              <div key={d.id} className={`rounded-xl border p-4 ${d.sla_met ? "bg-emerald-500/5 border-emerald-500/15" : "bg-amber-500/5 border-amber-500/15"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-white">{d.worker_name || "—"} → {d.company_name || "Direct"}</p>
                    <p className="text-xs text-slate-400">{new Date(d.started_at).toLocaleString("en-GB")}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-black font-mono ${d.sla_met ? "text-emerald-400" : "text-amber-400"}`}>{Number(d.total_minutes).toFixed(1)} min</p>
                    <span className={`text-[10px] font-bold ${d.sla_met ? "text-emerald-400" : "text-amber-400"}`}>{d.sla_met ? "SLA MET ✓" : "SLA EXCEEDED"}</span>
                  </div>
                </div>
                <div className="space-y-1">{tl.map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <CheckCircle2 className={`w-3 h-3 flex-shrink-0 ${i === tl.length - 1 && d.sla_met ? "text-emerald-400" : "text-slate-600"}`} />
                    <span className="text-slate-400">{t.step}</span>
                    <span className="text-slate-600 font-mono ml-auto">{(t.durationMs / 1000).toFixed(1)}s</span>
                  </div>
                ))}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
