import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Shield, Plus, AlertTriangle, CheckCircle2, DollarSign, Users } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Policy { id: string; policy_name: string; provider: string | null; policy_type: string; coverage_amount: string; premium_monthly: string; start_date: string | null; end_date: string | null; status: string; workers_covered: number; open_claims: string; }
interface Claim { id: string; worker_name: string | null; policy_name: string | null; incident_date: string | null; description: string; amount_claimed: string; status: string; }

const TYPE_COLORS: Record<string, string> = { "Group Health": "text-emerald-400 bg-emerald-500/10", "Work Accident": "text-red-400 bg-red-500/10", Liability: "text-amber-400 bg-amber-500/10", Travel: "text-blue-400 bg-blue-500/10", Equipment: "text-slate-400 bg-slate-500/10" };

export default function InsuranceManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"policies" | "claims">("policies");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ policyType: "Group Health" });

  const { data: summary } = useQuery({
    queryKey: ["insurance-summary"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/insurance/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); },
  });

  const { data: polData, isLoading } = useQuery({
    queryKey: ["insurance-policies"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/insurance/policies`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ policies: Policy[] }>; },
  });

  const { data: claimData } = useQuery({
    queryKey: ["insurance-claims"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/insurance/claims`, { headers: authHeaders() }); if (!r.ok) return { claims: [] }; return r.json() as Promise<{ claims: Claim[] }>; },
    enabled: tab === "claims",
  });

  const addMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => { const r = await fetch(`${import.meta.env.BASE_URL}api/insurance/policies`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Policy added" }); queryClient.invalidateQueries({ queryKey: ["insurance-policies", "insurance-summary"] }); setShowAdd(false); setForm({ policyType: "Group Health" }); },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/insurance/claims/${id}/resolve`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ resolution: "approved" }) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Claim resolved" }); queryClient.invalidateQueries({ queryKey: ["insurance-claims", "insurance-summary"] }); },
  });

  const s = summary ?? {};
  const fmtEur = (n: number) => `€${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Shield className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Insurance</h1></div>
        <p className="text-gray-400">Policies, claims, and coverage management</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Total Coverage</p><p className="text-xl font-bold text-emerald-400">{fmtEur(s.totalCoverage ?? 0)}</p></div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Monthly Premium</p><p className="text-xl font-bold text-amber-400">{fmtEur(s.monthlyPremium ?? 0)}</p></div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Open Claims</p><p className="text-2xl font-bold text-red-400">{s.openClaims ?? 0}</p></div>
        <div className={`rounded-xl p-4 ${(s.expiringPolicies ?? 0) > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-slate-800"}`}><p className="text-xs text-gray-400 font-mono uppercase mb-1">Expiring (30d)</p><p className={`text-2xl font-bold ${(s.expiringPolicies ?? 0) > 0 ? "text-red-400" : "text-white"}`}>{s.expiringPolicies ?? 0}</p></div>
      </div>

      <div className="flex gap-1 mb-4 bg-slate-800/50 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("policies")} className={`px-4 py-2 rounded-md text-sm font-bold ${tab === "policies" ? "bg-[#C41E18] text-white" : "text-slate-400"}`}>Policies</button>
        <button onClick={() => setTab("claims")} className={`px-4 py-2 rounded-md text-sm font-bold ${tab === "claims" ? "bg-[#C41E18] text-white" : "text-slate-400"}`}>Claims</button>
      </div>

      {tab === "policies" ? (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold"><Plus className="w-4 h-4" />Add Policy</button>
          </div>
          {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : (
            <div className="space-y-3">
              {(polData?.policies ?? []).map(p => {
                const days = p.end_date ? Math.ceil((new Date(p.end_date).getTime() - Date.now()) / 86_400_000) : null;
                const tc = TYPE_COLORS[p.policy_type] || TYPE_COLORS.Equipment;
                return (
                  <div key={p.id} className={`rounded-xl border p-4 ${days !== null && days <= 30 ? "bg-red-500/5 border-red-500/15" : "bg-slate-900 border-slate-700"}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div><p className="text-sm font-bold text-white">{p.policy_name}</p><p className="text-xs text-slate-400">{p.provider || "—"}</p></div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tc}`}>{p.policy_type}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-xs">
                      <div><p className="text-slate-500">Coverage</p><p className="text-emerald-400 font-mono font-bold">{fmtEur(Number(p.coverage_amount))}</p></div>
                      <div><p className="text-slate-500">Premium</p><p className="text-amber-400 font-mono">{fmtEur(Number(p.premium_monthly))}/mo</p></div>
                      <div><p className="text-slate-500">Workers</p><p className="text-white font-mono">{p.workers_covered}</p></div>
                      <div><p className="text-slate-500">Expires</p><p className={`font-mono ${days !== null && days <= 30 ? "text-red-400 font-bold" : "text-slate-300"}`}>{p.end_date ? new Date(p.end_date).toLocaleDateString("en-GB") : "—"}{days !== null && days <= 30 ? ` (${days}d)` : ""}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          {(claimData?.claims ?? []).length === 0 ? <p className="text-slate-500 text-center py-12">No claims</p> : (claimData?.claims ?? []).map(c => (
            <div key={c.id} className={`rounded-xl border p-4 ${c.status === "open" ? "bg-amber-500/5 border-amber-500/15" : "bg-emerald-500/5 border-emerald-500/15"}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold text-white">{c.worker_name || "Worker"} — {c.policy_name || "Policy"}</p>
                <span className={`text-[10px] font-bold ${c.status === "open" ? "text-amber-400" : "text-emerald-400"}`}>{c.status.toUpperCase()}</span>
              </div>
              <p className="text-xs text-slate-400 mb-1">{c.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-red-400 font-mono font-bold">{fmtEur(Number(c.amount_claimed))}</span>
                {c.status === "open" && <button onClick={() => resolveMutation.mutate(c.id)} className="px-2 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold"><CheckCircle2 className="w-3 h-3 inline mr-1" />Resolve</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Add Policy</h3>
            <div className="space-y-3">
              <input placeholder="Policy Name" value={form.policyName || ""} onChange={e => setForm({ ...form, policyName: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <input placeholder="Provider" value={form.provider || ""} onChange={e => setForm({ ...form, provider: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <select value={form.policyType} onChange={e => setForm({ ...form, policyType: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                {["Group Health", "Work Accident", "Liability", "Travel", "Equipment"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Coverage (EUR)" value={form.coverageAmount || ""} onChange={e => setForm({ ...form, coverageAmount: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
                <input type="number" placeholder="Premium/mo (EUR)" value={form.premiumMonthly || ""} onChange={e => setForm({ ...form, premiumMonthly: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
                <input type="date" value={form.endDate || ""} onChange={e => setForm({ ...form, endDate: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => addMutation.mutate(form)} disabled={!form.policyName} className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
