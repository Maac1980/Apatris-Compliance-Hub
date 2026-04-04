import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Fingerprint, Plus, CheckCircle2, Clock, AlertTriangle, Wifi, WifiOff } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface EsspassRecord { id: string; worker_name: string; worker_name_live: string | null; esspass_id: string | null; social_security_country: string; a1_certificate_ref: string | null; valid_from: string | null; valid_until: string | null; verification_status: string; assigned_site: string | null; }

const STATUS_STYLES: Record<string, { bg: string; text: string }> = { verified: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400" }, pending: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400" }, expired: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" } };

export default function EsspassPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: summary } = useQuery({ queryKey: ["esspass-summary"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/esspass/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); } });
  const { data, isLoading } = useQuery({ queryKey: ["esspass-records"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/esspass/records`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); } });
  const { data: workersData } = useQuery({ queryKey: ["workers-list"], queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/workers`, { headers: authHeaders() }); if (!r.ok) return { workers: [] }; return r.json(); } });

  const addMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => { const r = await fetch(`${import.meta.env.BASE_URL}api/esspass/records`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "ESSPASS record added" }); queryClient.invalidateQueries({ queryKey: ["esspass-records", "esspass-summary"] }); setShowAdd(false); setForm({}); },
  });

  const verifyMutation = useMutation({
    mutationFn: async (workerId: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/esspass/verify/${workerId}`, { method: "POST", headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: d.message }); queryClient.invalidateQueries({ queryKey: ["esspass-records", "esspass-summary"] }); },
  });

  const s = summary ?? {};
  const records = data?.records ?? [];
  const apiAvailable = data?.apiStatus?.available === true;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Fingerprint className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">EU ESSPASS</h1></div>
        <p className="text-gray-400">European Social Security Pass — digital verification system</p>
      </div>

      {/* API status */}
      <div className={`flex items-center gap-3 p-3 rounded-xl mb-6 ${apiAvailable ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
        {apiAvailable ? <Wifi className="w-5 h-5 text-emerald-400" /> : <WifiOff className="w-5 h-5 text-amber-400" />}
        <div>
          <p className={`text-xs font-bold ${apiAvailable ? "text-emerald-400" : "text-amber-400"}`}>{apiAvailable ? "EU ESSPASS API Connected" : "Manual Entry Mode"}</p>
          <p className="text-[10px] text-slate-400">Awaiting EU ESSPASS API launch — manual records active</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Verified</p><p className="text-2xl font-bold text-emerald-400">{s.verified ?? 0}</p></div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Pending</p><p className="text-2xl font-bold text-amber-400">{s.pending ?? 0}</p></div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Expired</p><p className="text-2xl font-bold text-red-400">{s.expired ?? 0}</p></div>
        <div className={`rounded-xl p-4 ${(s.expiringSoon ?? 0) > 0 ? "bg-amber-500/10 border border-amber-500/20" : "bg-slate-800"}`}><p className="text-xs text-gray-400 font-mono uppercase mb-1">Expiring (60d)</p><p className={`text-2xl font-bold ${(s.expiringSoon ?? 0) > 0 ? "text-amber-400" : "text-white"}`}>{s.expiringSoon ?? 0}</p></div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold"><Plus className="w-4 h-4" />Add Record</button>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : records.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Fingerprint className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No ESSPASS records</p></div>
      ) : (
        <div className="space-y-3">
          {records.map((r: EsspassRecord) => {
            const st = STATUS_STYLES[r.verification_status] || STATUS_STYLES.pending;
            const days = r.valid_until ? Math.ceil((new Date(r.valid_until).getTime() - Date.now()) / 86_400_000) : null;
            return (
              <div key={r.id} className={`rounded-xl border p-4 ${st.bg}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-white">{r.worker_name_live || r.worker_name}</p>
                    <p className="text-xs text-slate-400">SS Country: {r.social_security_country}{r.esspass_id ? ` · ESSPASS: ${r.esspass_id}` : ""}{r.a1_certificate_ref ? ` · A1: ${r.a1_certificate_ref}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${st.text} bg-white/5`}>{r.verification_status.toUpperCase()}</span>
                    {r.verification_status === "pending" && (
                      <button onClick={() => verifyMutation.mutate(r.worker_name)} className="px-2 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold"><CheckCircle2 className="w-3 h-3 inline mr-1" />Verify</button>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-slate-500">
                  {r.valid_from && <span>From: {new Date(r.valid_from).toLocaleDateString("en-GB")}</span>}
                  {r.valid_until && <span>Until: {new Date(r.valid_until).toLocaleDateString("en-GB")}</span>}
                  {days !== null && days <= 60 && <span className="text-amber-400 font-bold">{days}d remaining</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Add ESSPASS Record</h3>
            <div className="space-y-3">
              <select value={form.workerId || ""} onChange={e => { const w = (workersData?.workers ?? []).find((w: any) => w.id === e.target.value); setForm({ ...form, workerId: e.target.value, workerName: w?.fullName || w?.full_name || "" }); }}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="">Select Worker</option>
                {(workersData?.workers ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.fullName || w.full_name}</option>)}
              </select>
              <input placeholder="ESSPASS ID (if known)" value={form.esspassId || ""} onChange={e => setForm({ ...form, esspassId: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none" />
              <input placeholder="Social Security Country (e.g. PL)" value={form.socialSecurityCountry || "PL"} onChange={e => setForm({ ...form, socialSecurityCountry: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none" />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" placeholder="Valid From" value={form.validFrom || ""} onChange={e => setForm({ ...form, validFrom: e.target.value })} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none" />
                <input type="date" placeholder="Valid Until" value={form.validUntil || ""} onChange={e => setForm({ ...form, validUntil: e.target.value })} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => addMutation.mutate(form)} disabled={!form.workerId} className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
