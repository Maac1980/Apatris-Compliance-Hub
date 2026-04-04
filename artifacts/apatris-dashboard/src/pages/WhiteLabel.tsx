import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Users, DollarSign } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface Agency { id: string; agency_name: string; domain: string | null; primary_color: string; plan: string; monthly_fee: string; worker_limit: number; worker_count: string; status: string; }

const PLAN_COLORS: Record<string, string> = { starter: "text-blue-400 bg-blue-500/10", professional: "text-amber-400 bg-amber-500/10", enterprise: "text-emerald-400 bg-emerald-500/10" };

export default function WhiteLabel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ plan: "starter" });

  const { data, isLoading } = useQuery({
    queryKey: ["wl-agencies"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/whitelabel/agencies`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json() as Promise<{ agencies: Agency[] }>; },
  });

  const addMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => { const r = await fetch(`${import.meta.env.BASE_URL}api/whitelabel/agencies`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { toast({ description: "Agency created" }); queryClient.invalidateQueries({ queryKey: ["wl-agencies"] }); setShowAdd(false); setForm({ plan: "starter" }); },
  });

  const agencies = data?.agencies ?? [];
  const totalRevenue = agencies.reduce((s, a) => s + Number(a.monthly_fee), 0);
  const totalWorkers = agencies.reduce((s, a) => s + Number(a.worker_count), 0);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><Building2 className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">White-Label Platform</h1></div>
        <p className="text-gray-400">Any staffing agency runs Apatris under their brand</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Agencies</p><p className="text-2xl font-bold text-white">{agencies.length}</p></div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Monthly Revenue</p><p className="text-xl font-bold text-emerald-400">€{totalRevenue.toLocaleString()}</p></div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Total Workers</p><p className="text-2xl font-bold text-blue-400">{totalWorkers}</p></div>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[{ name: "Starter", fee: "€199", limit: "25 workers", color: "border-blue-500/20" }, { name: "Professional", fee: "€499", limit: "100 workers", color: "border-amber-500/20" }, { name: "Enterprise", fee: "€999", limit: "Unlimited", color: "border-emerald-500/20" }].map(p => (
          <div key={p.name} className={`bg-slate-900 border ${p.color} rounded-xl p-4 text-center`}>
            <p className="text-sm font-bold text-white">{p.name}</p>
            <p className="text-xl font-black text-[#C41E18] mt-1">{p.fee}<span className="text-xs text-slate-500">/mo</span></p>
            <p className="text-[10px] text-slate-400 mt-1">{p.limit}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold"><Plus className="w-4 h-4" />Add Agency</button>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : agencies.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No white-label agencies</p></div>
      ) : (
        <div className="space-y-3">
          {agencies.map(a => (
            <div key={a.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2"><p className="text-sm font-bold text-white">{a.agency_name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PLAN_COLORS[a.plan] || PLAN_COLORS.starter}`}>{a.plan.toUpperCase()}</span>
                  </div>
                  {a.domain && <p className="text-xs text-slate-400">{a.domain}</p>}
                </div>
                <div className="w-6 h-6 rounded-full" style={{ background: a.primary_color }} />
              </div>
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1 text-blue-400"><Users className="w-3 h-3" />{a.worker_count}/{a.worker_limit}</span>
                <span className="flex items-center gap-1 text-emerald-400"><DollarSign className="w-3 h-3" />€{Number(a.monthly_fee)}/mo</span>
                <span className={`ml-auto ${a.status === "active" ? "text-emerald-400" : "text-slate-500"}`}>{a.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Add White-Label Agency</h3>
            <div className="space-y-3">
              <input placeholder="Agency Name" value={form.agencyName || ""} onChange={e => setForm({ ...form, agencyName: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <input placeholder="Domain (e.g. app.agency.com)" value={form.domain || ""} onChange={e => setForm({ ...form, domain: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <input placeholder="Contact Email" value={form.contactEmail || ""} onChange={e => setForm({ ...form, contactEmail: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <select value={form.plan || "starter"} onChange={e => setForm({ ...form, plan: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="starter">Starter — €199/mo (25 workers)</option>
                <option value="professional">Professional — €499/mo (100 workers)</option>
                <option value="enterprise">Enterprise — €999/mo (unlimited)</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-[10px] text-slate-500 mb-1">Primary Color</p><input type="color" value={form.primaryColor || "#C41E18"} onChange={e => setForm({ ...form, primaryColor: e.target.value })} className="w-full h-8 rounded" /></div>
                <div><p className="text-[10px] text-slate-500 mb-1">Secondary Color</p><input type="color" value={form.secondaryColor || "#0f172a"} onChange={e => setForm({ ...form, secondaryColor: e.target.value })} className="w-full h-8 rounded" /></div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => addMutation.mutate(form)} disabled={!form.agencyName} className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
