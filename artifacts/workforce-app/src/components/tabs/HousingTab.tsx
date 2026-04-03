import { useQuery } from "@tanstack/react-query";
import { Home, AlertTriangle, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Hostel { id: string; name: string; city: string | null; country: string; owner_type: string; cost_per_bed_monthly: string; total_capacity: string; total_occupancy: string; }

export function HousingTab() {
  const { data: summary } = useQuery({
    queryKey: ["housing-summary"],
    queryFn: async () => {
      const res = await fetch(`${API}api/housing/summary`, { headers: authHeaders() });
      if (!res.ok) return { totalHostels: 0, monthlyThirdPartyCost: 0, unhousedWorkers: 0 };
      return res.json();
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["housing-hostels"],
    queryFn: async () => {
      const res = await fetch(`${API}api/housing/hostels`, { headers: authHeaders() });
      if (!res.ok) return { hostels: [] };
      return res.json() as Promise<{ hostels: Hostel[] }>;
    },
  });

  const hostels = data?.hostels ?? [];
  const fmtEur = (n: number) => n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3">
        <Home className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Housing</h2>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-slate-500/10 border border-slate-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-white">{summary?.totalHostels ?? 0}</p>
          <p className="text-[9px] text-white/40 uppercase font-bold">Hostels</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-amber-400">{fmtEur(summary?.monthlyThirdPartyCost ?? 0)}</p>
          <p className="text-[9px] text-amber-400/60 uppercase font-bold">Monthly</p>
        </div>
        <div className={cn("flex-1 px-3 py-2 rounded-xl text-center", (summary?.unhousedWorkers ?? 0) > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20")}>
          <p className={cn("text-lg font-black", (summary?.unhousedWorkers ?? 0) > 0 ? "text-red-400" : "text-emerald-400")}>{summary?.unhousedWorkers ?? 0}</p>
          <p className="text-[9px] text-white/40 uppercase font-bold">Unhoused</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : hostels.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Home className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No hostels</p></div>
      ) : (
        <div className="space-y-2">
          {hostels.map(h => {
            const cap = Number(h.total_capacity); const occ = Number(h.total_occupancy);
            const pct = cap > 0 ? Math.round((occ / cap) * 100) : 0;
            const isOwned = h.owner_type === "owned";
            return (
              <div key={h.id} className={cn("rounded-2xl border p-3.5", isOwned ? "bg-emerald-500/5 border-emerald-500/15" : "bg-amber-500/5 border-amber-500/15")}>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <p className="text-xs font-bold text-white">{h.name}</p>
                    <p className="text-[10px] text-white/40">{h.city}{h.country ? `, ${h.country}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-white font-mono">{occ}/{cap}</p>
                    <span className={cn("text-[9px] font-bold", isOwned ? "text-emerald-400" : "text-amber-400")}>{isOwned ? "OWNED" : `${Number(h.cost_per_bed_monthly).toFixed(0)}€/bed`}</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
