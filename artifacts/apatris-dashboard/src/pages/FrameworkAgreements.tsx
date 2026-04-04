import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Brain, Download, ChevronRight, X } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface Agreement { id: string; company_name: string; agreement_name: string; start_date: string; end_date: string; status: string; rate_card_count: string; signed_at: string | null; }

export default function FrameworkAgreements() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["frameworks"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/frameworks`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ agreements: Agreement[] }>; },
  });

  const { data: companiesData } = useQuery({
    queryKey: ["crm-companies"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/crm/companies`, { headers: authHeaders() }); if (!r.ok) return { companies: [] }; return r.json(); },
  });

  const { data: detailData } = useQuery({
    queryKey: ["framework-detail", selectedId],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/frameworks/${selectedId}`, { headers: authHeaders() }); if (!r.ok) return null; return r.json(); },
    enabled: !!selectedId,
  });

  const genMutation = useMutation({
    mutationFn: async (companyId: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/frameworks/generate`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ companyId }) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Framework agreement generated" }); queryClient.invalidateQueries({ queryKey: ["frameworks"] }); },
  });

  const agreements = data?.agreements ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><FileText className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Framework Agreements</h1></div>
        <p className="text-gray-400">AI-generated staffing framework agreements with rate cards</p>
      </div>

      <div className="flex gap-3 mb-6">
        <select id="genCompany" className="flex-1 max-w-sm px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
          <option value="">Select company</option>
          {(companiesData?.companies ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
        </select>
        <button onClick={() => { const el = document.getElementById("genCompany") as HTMLSelectElement; if (el.value) genMutation.mutate(el.value); }}
          disabled={genMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
          {genMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Brain className="w-4 h-4" />}
          AI Generate
        </button>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : agreements.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No framework agreements</p></div>
      ) : (
        <div className="space-y-3">
          {agreements.map(a => {
            const days = a.end_date ? Math.ceil((new Date(a.end_date).getTime() - Date.now()) / 86_400_000) : null;
            return (
              <button key={a.id} onClick={() => setSelectedId(a.id)}
                className={`w-full text-left rounded-xl border p-4 hover:bg-slate-800/60 transition-colors ${days !== null && days <= 30 ? "bg-red-500/5 border-red-500/15" : "bg-slate-900 border-slate-700"}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-white">{a.agreement_name}</p>
                    <p className="text-xs text-slate-400">{a.company_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.status === "signed" ? "bg-emerald-500/10 text-emerald-400" : a.status === "draft" ? "bg-slate-500/10 text-slate-400" : "bg-blue-500/10 text-blue-400"}`}>{a.status.toUpperCase()}</span>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-slate-500">
                  <span>{a.start_date ? new Date(a.start_date).toLocaleDateString("en-GB") : ""} — {a.end_date ? new Date(a.end_date).toLocaleDateString("en-GB") : ""}</span>
                  <span>{a.rate_card_count} rate cards</span>
                  {days !== null && days <= 30 && <span className="text-red-400 font-bold">Expires in {days}d</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedId && detailData && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div><h2 className="text-lg font-bold text-white">{(detailData.agreement as any)?.agreement_name}</h2><p className="text-xs text-slate-400">{(detailData.agreement as any)?.company_name}</p></div>
              <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-slate-800 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6">
              <h3 className="text-sm font-bold text-white mb-3">Rate Cards</h3>
              {(detailData.rateCards ?? []).length === 0 ? <p className="text-slate-500 text-sm">No rate cards</p> : (
                <div className="bg-slate-800 rounded-lg overflow-hidden mb-4">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-700"><th className="text-left px-3 py-2 text-slate-500">Role</th><th className="px-3 py-2 text-slate-500">Country</th><th className="px-3 py-2 text-slate-500">Rate</th><th className="px-3 py-2 text-slate-500">Hours</th></tr></thead>
                    <tbody>{(detailData.rateCards ?? []).map((rc: any) => (
                      <tr key={rc.id} className="border-b border-slate-700/50"><td className="px-3 py-2 text-white font-medium">{rc.role_type}</td><td className="px-3 py-2 text-slate-400">{rc.country}</td><td className="px-3 py-2 text-emerald-400 font-mono font-bold">€{Number(rc.rate_per_hour).toFixed(2)}/h</td><td className="px-3 py-2 text-slate-400">{rc.minimum_hours}h</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <a href={`${import.meta.env.BASE_URL}api/frameworks/${selectedId}/download`} target="_blank" rel="noopener"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold hover:bg-blue-600/30">
                <Download className="w-3 h-3" />Download Agreement
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
