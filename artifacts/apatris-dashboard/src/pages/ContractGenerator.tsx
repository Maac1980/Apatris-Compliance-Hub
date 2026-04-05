import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { FileSignature, Plus, Download, Send, Eye, CheckCircle2, Clock } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface GenContract { id: string; worker_name: string; company_name: string; contract_type: string; status: string; generated_at: string; contract_html: string; }

const TYPES = ["Umowa Zlecenie", "Umowa o Pracę", "B2B"];
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-slate-500/10 border-slate-500/20", text: "text-slate-400" },
  sent_for_signature: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400" },
  signed: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400" },
};

export default function ContractGenerator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showGen, setShowGen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["generated-contracts"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/contracts/generated`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ contracts: GenContract[] }>;
    },
  });

  const { data: workersData } = useQuery({
    queryKey: ["workers-list"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/workers`, { headers: authHeaders() });
      if (!res.ok) return { workers: [] };
      return res.json();
    },
  });

  const { data: companiesData } = useQuery({
    queryKey: ["crm-companies"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/crm/companies`, { headers: authHeaders() });
      if (!res.ok) return { companies: [] };
      return res.json();
    },
  });

  const genMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/contracts/generate`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ description: "Contract generated" });
      queryClient.invalidateQueries({ queryKey: ["generated-contracts"] });
      setShowGen(false); setForm({});
      if (data.contract?.contract_html) setPreview(data.contract.contract_html);
    },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/contracts/generated/${id}/send`, { method: "POST", headers: authHeaders() });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => { toast({ description: "Sent for certified signature" }); queryClient.invalidateQueries({ queryKey: ["generated-contracts"] }); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const contracts = data?.contracts ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <FileSignature className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">AI Contract Generator</h1>
        </div>
        <p className="text-gray-400">Generate Umowa Zlecenie, Umowa o Pracę, or B2B contracts with AI</p>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowGen(true); setForm({ contractType: "Umowa Zlecenie" }); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914]">
          <Plus className="w-4 h-4" />Generate Contract
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><FileSignature className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No contracts generated yet</p></div>
      ) : (
        <div className="space-y-3">
          {contracts.map(c => {
            const st = STATUS_STYLES[c.status] || STATUS_STYLES.draft;
            return (
              <div key={c.id} className={`rounded-xl border p-4 ${st.bg}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-white">{c.worker_name}</p>
                    <p className="text-xs text-slate-400">{c.company_name} · {c.contract_type}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-1">{new Date(c.generated_at).toLocaleDateString("en-GB")}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.bg} ${st.text}`}>{c.status.replace(/_/g, " ").toUpperCase()}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setPreview(c.contract_html)}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-700/50 text-slate-300 rounded text-[10px] font-bold hover:bg-slate-700">
                    <Eye className="w-3 h-3" />Preview
                  </button>
                  <a href={`${import.meta.env.BASE_URL}api/contracts/generated/${c.id}/download`} target="_blank" rel="noopener"
                    className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold hover:bg-blue-600/30">
                    <Download className="w-3 h-3" />Download
                  </a>
                  {c.status === "draft" && (
                    <button onClick={() => sendMutation.mutate(c.id)} disabled={sendMutation.isPending}
                      className="flex items-center gap-1 px-2 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold hover:bg-emerald-600/30 disabled:opacity-50">
                      <Send className="w-3 h-3" />Sign
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Generate dialog */}
      {showGen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowGen(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Generate Contract</h3>
            <div className="space-y-3">
              <select value={form.workerId || ""} onChange={e => setForm({ ...form, workerId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="">Select Worker</option>
                {(workersData?.workers ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.fullName || w.full_name || w.name}</option>)}
              </select>
              <select value={form.companyId || ""} onChange={e => setForm({ ...form, companyId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="">Select Company (optional)</option>
                {(companiesData?.companies ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
              <select value={form.contractType || "Umowa Zlecenie"} onChange={e => setForm({ ...form, contractType: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Hourly Rate (PLN)" type="number" value={form.hourlyRate || ""} onChange={e => setForm({ ...form, hourlyRate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
                <input placeholder="Position" value={form.position || ""} onChange={e => setForm({ ...form, position: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              </div>
              <input placeholder="Scope of work" value={form.scope || ""} onChange={e => setForm({ ...form, scope: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" placeholder="Start Date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
                <input type="date" placeholder="End Date" value={form.endDate || ""} onChange={e => setForm({ ...form, endDate: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowGen(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => genMutation.mutate(form)} disabled={!form.workerId || genMutation.isPending}
                className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">
                {genMutation.isPending ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 px-4 py-3 flex items-center justify-between rounded-t-xl">
              <p className="text-sm font-bold text-white">Contract Preview</p>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-white text-sm">Close</button>
            </div>
            <div dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        </div>
      )}
    </div>
  );
}
