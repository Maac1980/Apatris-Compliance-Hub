import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Plus, CheckCircle2, AlertTriangle, ChevronRight, X } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Guarantee { id: string; company_name: string; guarantee_start: string; guarantee_end: string; max_coverage_eur: string; incidents: number; fines_covered: string; status: string; incident_count: string; total_covered: string; }

export default function ComplianceGuarantees() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: summary } = useQuery({
    queryKey: ["guarantees-summary"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/guarantees/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["guarantees"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/guarantees`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ guarantees: Guarantee[] }>; },
  });

  const { data: companiesData } = useQuery({
    queryKey: ["crm-companies"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/crm/companies`, { headers: authHeaders() }); if (!r.ok) return { companies: [] }; return r.json(); },
  });

  const { data: detailData } = useQuery({
    queryKey: ["guarantee-detail", selectedId],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/guarantees/${selectedId}`, { headers: authHeaders() }); if (!r.ok) return null; return r.json(); },
    enabled: !!selectedId,
  });

  const addMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => { const r = await fetch(`${import.meta.env.BASE_URL}api/guarantees`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Guarantee created" }); queryClient.invalidateQueries({ queryKey: ["guarantees", "guarantees-summary"] }); setShowAdd(false); setForm({}); },
  });

  const s = summary ?? {};
  const guarantees = data?.guarantees ?? [];
  const fmtEur = (n: number) => `€${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><ShieldCheck className="w-7 h-7 text-emerald-400" /><h1 className="text-3xl font-bold text-white">Compliance Guarantees</h1></div>
        <p className="text-gray-400">SLA-backed compliance guarantees per enterprise client</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Total Coverage</p><p className="text-xl font-bold text-emerald-400">{fmtEur(s.totalCoverage ?? 0)}</p></div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Zero Incidents</p><p className="text-2xl font-bold text-emerald-400">{s.zeroIncidentClients ?? 0}</p></div>
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Active</p><p className="text-2xl font-bold text-white">{s.activeGuarantees ?? 0}</p></div>
        <div className={`rounded-xl p-4 ${(s.totalIncidents ?? 0) > 0 ? "bg-amber-500/10 border border-amber-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}>
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Incidents</p>
          <p className={`text-2xl font-bold ${(s.totalIncidents ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>{s.totalIncidents ?? 0}</p>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowAdd(true); setForm({}); }} className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914]"><Plus className="w-4 h-4" />New Guarantee</button>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : guarantees.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No guarantees</p></div>
      ) : (
        <div className="space-y-3">
          {guarantees.map(g => {
            const zeroIncidents = Number(g.incident_count) === 0;
            const utilisation = Number(g.max_coverage_eur) > 0 ? (Number(g.total_covered) / Number(g.max_coverage_eur)) * 100 : 0;
            return (
              <button key={g.id} onClick={() => setSelectedId(g.id)}
                className={`w-full text-left rounded-xl border p-4 transition-colors ${zeroIncidents ? "bg-emerald-500/5 border-emerald-500/15 hover:bg-emerald-500/10" : "bg-slate-900 border-slate-700 hover:bg-slate-800/60"}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white">{g.company_name}</p>
                      {zeroIncidents && <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full text-[9px] font-bold border border-emerald-500/20">ZERO FAILURES ✓</span>}
                    </div>
                    <p className="text-xs text-slate-400">{g.guarantee_start ? new Date(g.guarantee_start).toLocaleDateString("en-GB") : ""} — {g.guarantee_end ? new Date(g.guarantee_end).toLocaleDateString("en-GB") : ""}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="text-emerald-400 font-mono font-bold">{fmtEur(Number(g.max_coverage_eur))} coverage</span>
                  <span className="text-slate-400">{g.incident_count} incidents</span>
                  <span className="text-amber-400 font-mono">{fmtEur(Number(g.total_covered))} covered</span>
                  <span className="text-slate-500">{utilisation.toFixed(0)}% utilised</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail panel */}
      {selectedId && detailData && (
        <div className="fixed inset-0 z-[250] flex justify-end" onClick={() => setSelectedId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div><h2 className="text-lg font-bold text-white">{(detailData.guarantee as any)?.company_name}</h2><p className="text-xs text-slate-400">Compliance Guarantee</p></div>
              <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                <div><p className="text-slate-500">Coverage</p><p className="text-emerald-400 font-mono font-bold">{fmtEur(Number((detailData.guarantee as any)?.max_coverage_eur))}</p></div>
                <div><p className="text-slate-500">Fines Covered</p><p className="text-amber-400 font-mono font-bold">{fmtEur(Number((detailData.guarantee as any)?.fines_covered))}</p></div>
                <div><p className="text-slate-500">Incidents</p><p className="text-white font-bold">{(detailData.guarantee as any)?.incidents}</p></div>
                <div><p className="text-slate-500">Status</p><p className="text-white capitalize">{(detailData.guarantee as any)?.status}</p></div>
              </div>
              <h3 className="text-sm font-bold text-white mb-2">Incident Log</h3>
              {(detailData.incidents ?? []).length === 0 ? (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><p className="text-xs font-bold text-emerald-400">Zero compliance failures — perfect record</p></div>
              ) : (
                <div className="space-y-2">{(detailData.incidents ?? []).map((inc: any) => (
                  <div key={inc.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-white">{inc.incident_type}</p>
                      <span className={`text-[10px] font-bold ${inc.covered ? "text-emerald-400" : "text-red-400"}`}>{inc.covered ? "COVERED" : "NOT COVERED"}</span>
                    </div>
                    <p className="text-xs text-red-400 font-mono">{fmtEur(Number(inc.fine_amount))}</p>
                    {inc.worker_name && <p className="text-[10px] text-slate-500">Worker: {inc.worker_name}</p>}
                  </div>
                ))}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">New Compliance Guarantee</h3>
            <div className="space-y-3">
              <select value={form.companyId || ""} onChange={e => { const co = (companiesData?.companies ?? []).find((c: any) => c.id === e.target.value); setForm({ ...form, companyId: e.target.value, companyName: co?.company_name || "" }); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="">Select Company</option>
                {(companiesData?.companies ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
              <input type="number" placeholder="Max Coverage (EUR)" value={form.maxCoverageEur || ""} onChange={e => setForm({ ...form, maxCoverageEur: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => addMutation.mutate(form)} disabled={!form.companyId} className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
