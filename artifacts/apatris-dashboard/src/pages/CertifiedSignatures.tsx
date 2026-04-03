import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { FileSignature, Send, CheckCircle2, Eye, Clock, X, Download, Plus } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface CertSig {
  id: string; contract_id: string; contract_title: string | null; worker_name: string; worker_email: string;
  provider: string; envelope_id: string; status: string; sent_at: string | null; signed_at: string | null;
  signing_url: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  draft:     { bg: "bg-slate-500/10 border-slate-500/20", text: "text-slate-400", icon: Clock },
  sent:      { bg: "bg-blue-500/10 border-blue-500/20",   text: "text-blue-400",  icon: Send },
  viewed:    { bg: "bg-indigo-500/10 border-indigo-500/20", text: "text-indigo-400", icon: Eye },
  signed:    { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", icon: CheckCircle2 },
  completed: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", icon: CheckCircle2 },
  declined:  { bg: "bg-red-500/10 border-red-500/20",     text: "text-red-400",   icon: X },
};

export default function CertifiedSignatures() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSend, setShowSend] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["certified-signatures"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/signatures/certified`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ signatures: CertSig[] }>;
    },
  });

  const { data: contractsData } = useQuery({
    queryKey: ["contracts-list"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/contracts`, { headers: authHeaders() });
      if (!res.ok) return { contracts: [] };
      return res.json();
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/signatures/certified/send`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ description: `Sent for signature. URL: ${data.signingUrl}` });
      queryClient.invalidateQueries({ queryKey: ["certified-signatures"] });
      setShowSend(false); setForm({});
    },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const sigs = data?.signatures ?? [];
  const signed = sigs.filter(s => s.status === "signed" || s.status === "completed").length;
  const pending = sigs.filter(s => s.status === "sent" || s.status === "viewed").length;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <FileSignature className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Certified Signatures</h1>
        </div>
        <p className="text-gray-400">Legally binding electronic signatures (eIDAS compliant)</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Signed</p>
          <p className="text-2xl font-bold text-emerald-400">{signed}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Pending</p>
          <p className="text-2xl font-bold text-blue-400">{pending}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Total</p>
          <p className="text-2xl font-bold text-white">{sigs.length}</p>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowSend(true); setForm({}); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914]">
          <Plus className="w-4 h-4" />Send for Signature
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : sigs.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><FileSignature className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No certified signatures</p></div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Worker</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Contract</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Provider</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Sent</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sigs.map(s => {
                const st = STATUS_STYLES[s.status] || STATUS_STYLES.draft;
                const Icon = st.icon;
                return (
                  <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{s.worker_name}</p>
                      <p className="text-[10px] text-slate-500">{s.worker_email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{s.contract_title || s.contract_id?.slice(0, 8) || "—"}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono uppercase">{s.provider}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">{s.sent_at ? new Date(s.sent_at).toLocaleDateString("en-GB") : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.bg} ${st.text}`}>
                        <Icon className="w-2.5 h-2.5" />{s.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(s.status === "signed" || s.status === "completed") && (
                        <a href={`${import.meta.env.BASE_URL}api/signatures/certified/${s.id}/certificate`}
                          target="_blank" rel="noopener"
                          className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold hover:bg-emerald-600/30">
                          <Download className="w-3 h-3" />Certificate
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSend(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Send for Certified Signature</h3>
            <div className="space-y-3">
              <select value={form.contractId || ""} onChange={e => setForm({ ...form, contractId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="">Select Contract</option>
                {(contractsData?.contracts ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.title || c.worker_name} — {c.contract_type}</option>)}
              </select>
              <input placeholder="Worker Name" value={form.workerName || ""} onChange={e => setForm({ ...form, workerName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <input placeholder="Worker Email" type="email" value={form.workerEmail || ""} onChange={e => setForm({ ...form, workerEmail: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowSend(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => sendMutation.mutate(form)} disabled={!form.contractId || !form.workerName || !form.workerEmail}
                className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
