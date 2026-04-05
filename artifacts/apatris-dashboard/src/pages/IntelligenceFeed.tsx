import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Radio, Play, Plus, Download } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


const REPORT_TYPES = [{ id: "demand_trends", label: "Demand Trends" }, { id: "rate_movements", label: "Rate Movements" }, { id: "certification_gaps", label: "Certification Gaps" }, { id: "seasonal_patterns", label: "Seasonal Patterns" }, { id: "compliance_rates", label: "Compliance Rates" }];

export default function IntelligenceFeed() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"reports" | "subscribers">("reports");
  const [reportType, setReportType] = useState("demand_trends");
  const [showAddSub, setShowAddSub] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({ queryKey: ["intel-reports"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/intelligence/reports`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); } });
  const { data: subData } = useQuery({ queryKey: ["intel-subs"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/intelligence/subscribers`, { headers: authHeaders() }); if (!r.ok) return { subscribers: [] }; return r.json(); }, enabled: tab === "subscribers" });

  const genMutation = useMutation({
    mutationFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/intelligence/generate`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ reportType }) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Report generated" }); queryClient.invalidateQueries({ queryKey: ["intel-reports"] }); },
  });

  const addSubMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => { const r = await fetch(`${import.meta.env.BASE_URL}api/intelligence/subscribers`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `Subscriber added. API Key: ${d.apiKey?.slice(0, 16)}...` }); queryClient.invalidateQueries({ queryKey: ["intel-subs"] }); setShowAddSub(false); setForm({}); },
  });

  const reports = data?.reports ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Radio className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Market Intelligence Feed</h1></div>
        <p className="text-gray-400">Anonymised labour market data product for investors and firms</p>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("reports")} className={`px-4 py-2 rounded-md text-sm font-bold ${tab === "reports" ? "bg-[#C41E18] text-white" : "text-slate-400"}`}>Reports</button>
        <button onClick={() => setTab("subscribers")} className={`px-4 py-2 rounded-md text-sm font-bold ${tab === "subscribers" ? "bg-[#C41E18] text-white" : "text-slate-400"}`}>Subscribers</button>
      </div>

      {tab === "reports" ? (
        <>
          <div className="flex gap-3 mb-4">
            <select value={reportType} onChange={e => setReportType(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
              {REPORT_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <button onClick={() => genMutation.mutate()} disabled={genMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
              {genMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}Generate Report
            </button>
          </div>

          {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : reports.length === 0 ? (
            <div className="text-center py-20 text-slate-500"><Radio className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No reports generated</p></div>
          ) : (
            <div className="space-y-3">
              {reports.map((r: any) => (
                <div key={r.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-bold mr-2">{r.report_type?.replace("_", " ").toUpperCase()}</span>
                      <span className="text-xs text-slate-400">{r.country}</span>
                    </div>
                    <span className="text-[9px] text-slate-500 font-mono">{new Date(r.created_at).toLocaleDateString("en-GB")}</span>
                  </div>
                  <p className="text-xs text-slate-300 mb-2 line-clamp-3">{r.insights}</p>
                  <span className="text-[9px] text-emerald-400 font-bold">ANONYMISED ✓</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex justify-end mb-4"><button onClick={() => setShowAddSub(true)} className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold"><Plus className="w-4 h-4" />Add Subscriber</button></div>
          <div className="space-y-2">
            {(subData?.subscribers ?? []).map((s: any) => (
              <div key={s.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
                <div><p className="text-sm font-bold text-white">{s.name}</p><p className="text-xs text-slate-400">{s.email} · {s.company || "—"}</p></div>
                <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-bold">{s.subscription_type}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {showAddSub && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowAddSub(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Add Subscriber</h3>
            <div className="space-y-3">
              <input placeholder="Name" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none" />
              <input placeholder="Email" value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none" />
              <input placeholder="Company" value={form.company || ""} onChange={e => setForm({ ...form, company: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none" />
            </div>
            <div className="flex gap-2 mt-4"><button onClick={() => setShowAddSub(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => addSubMutation.mutate(form)} disabled={!form.name || !form.email} className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Add</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
