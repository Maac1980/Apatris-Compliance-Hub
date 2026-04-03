import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Home, Plus, AlertTriangle, Users, DollarSign, Building2 } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface Hostel { id: string; name: string; address: string | null; city: string | null; country: string; owner_type: string; cost_per_bed_monthly: string; total_capacity: string; total_occupancy: string; room_count: string; }
interface Summary { totalHostels: number; ownedHostels: number; thirdPartyHostels: number; monthlyThirdPartyCost: number; unhousedWorkers: number; capacityAlerts: Array<{ name: string; occupancy: string }>; }

export default function HousingManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: summary } = useQuery({
    queryKey: ["housing-summary"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/housing/summary`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json() as Promise<Summary>;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["housing-hostels"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/housing/hostels`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ hostels: Hostel[] }>;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/housing/hostels`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Hostel added" }); queryClient.invalidateQueries({ queryKey: ["housing-hostels", "housing-summary"] }); setShowAdd(false); setForm({}); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const hostels = data?.hostels ?? [];
  const s = summary ?? { totalHostels: 0, ownedHostels: 0, thirdPartyHostels: 0, monthlyThirdPartyCost: 0, unhousedWorkers: 0, capacityAlerts: [] };
  const fmtEur = (n: number) => n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Home className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Housing Management</h1>
        </div>
        <p className="text-gray-400">Hostels, rooms, and worker accommodation</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Total Hostels</p><p className="text-2xl font-bold text-white">{s.totalHostels}</p></div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Owned</p><p className="text-2xl font-bold text-emerald-400">{s.ownedHostels}</p></div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Third Party</p><p className="text-2xl font-bold text-amber-400">{s.thirdPartyHostels}</p></div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4"><p className="text-xs text-gray-400 font-mono uppercase mb-1">Monthly Cost</p><p className="text-xl font-bold text-red-400">{fmtEur(s.monthlyThirdPartyCost)}</p></div>
        <div className={`rounded-xl p-4 ${s.unhousedWorkers > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-slate-800"}`}>
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Unhoused</p>
          <p className={`text-2xl font-bold ${s.unhousedWorkers > 0 ? "text-red-400" : "text-white"}`}>{s.unhousedWorkers}</p>
        </div>
      </div>

      {s.capacityAlerts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-400">Capacity Alerts (90%+)</p>
            {s.capacityAlerts.map(a => <p key={a.name} className="text-xs text-slate-300">{a.name}: {a.occupancy}</p>)}
          </div>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowAdd(true); setForm({ ownerType: "owned" }); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914]">
          <Plus className="w-4 h-4" />Add Hostel
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : hostels.length === 0 ? (
        <div className="text-center py-20 text-slate-500"><Home className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-semibold">No hostels</p></div>
      ) : (
        <div className="space-y-3">
          {hostels.map(h => {
            const cap = Number(h.total_capacity);
            const occ = Number(h.total_occupancy);
            const pct = cap > 0 ? Math.round((occ / cap) * 100) : 0;
            const isOwned = h.owner_type === "owned";
            return (
              <div key={h.id} className={`rounded-xl border p-4 ${isOwned ? "bg-emerald-500/5 border-emerald-500/15" : "bg-amber-500/5 border-amber-500/15"}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white">{h.name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${isOwned ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                        {isOwned ? "OWNED" : "THIRD PARTY"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{h.city || ""}{h.country ? `, ${h.country}` : ""}{h.address ? ` · ${h.address}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black font-mono text-white">{occ}/{cap}</p>
                    {!isOwned && <p className="text-[10px] text-amber-400 font-mono">{Number(h.cost_per_bed_monthly).toFixed(0)} EUR/bed</p>}
                  </div>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">{pct}% occupancy · {h.room_count} rooms</p>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Add Hostel</h3>
            <div className="space-y-3">
              <input placeholder="Hostel Name" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="City" value={form.city || ""} onChange={e => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
                <input placeholder="Country" value={form.country || "PL"} onChange={e => setForm({ ...form, country: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              </div>
              <input placeholder="Address" value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <select value={form.ownerType || "owned"} onChange={e => setForm({ ...form, ownerType: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="owned">Owned (Apatris)</option><option value="third_party">Third Party</option>
              </select>
              {form.ownerType === "third_party" && (
                <input type="number" placeholder="Cost per bed/month (EUR)" value={form.costPerBedMonthly || ""} onChange={e => setForm({ ...form, costPerBedMonthly: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => addMutation.mutate(form)} disabled={!form.name}
                className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
