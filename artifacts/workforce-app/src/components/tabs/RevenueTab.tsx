import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, DollarSign } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

export function RevenueTab() {
  const { data: forecast } = useQuery({
    queryKey: ["revenue-forecast"],
    queryFn: async () => {
      const res = await fetch(`${API}api/revenue/forecast`, { headers: authHeaders() });
      if (!res.ok) return { forecast: [] };
      return res.json();
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["revenue-summary"],
    queryFn: async () => {
      const res = await fetch(`${API}api/revenue/summary`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const forecastData = forecast?.forecast ?? [];
  const fmtEur = (n: number) => n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const sixMonth = forecastData.reduce((s: number, f: any) => s + f.netProjected, 0);

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-emerald-400" />
        <h2 className="text-lg font-bold text-white">Revenue</h2>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-emerald-400">{fmtEur(summary?.currentMonth ?? 0)}</p>
          <p className="text-[9px] text-emerald-400/60 uppercase font-bold">This Month</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-blue-400">{fmtEur(sixMonth)}</p>
          <p className="text-[9px] text-blue-400/60 uppercase font-bold">6-Month</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-slate-500/10 border border-slate-500/20 rounded-xl text-center">
          <p className="text-sm font-black text-white">{summary?.activeWorkers ?? 0}</p>
          <p className="text-[9px] text-white/40 uppercase font-bold">Active</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-sm font-black text-amber-400">{summary?.benchWorkers ?? 0}</p>
          <p className="text-[9px] text-amber-400/60 uppercase font-bold">Bench</p>
        </div>
      </div>

      {/* Forecast list */}
      <p className="text-xs font-bold text-white mb-2">6-Month Projection</p>
      <div className="space-y-1.5">
        {forecastData.map((f: any) => (
          <div key={f.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">{f.label}</p>
              <p className="text-[10px] text-white/40">{f.activeWorkers} workers</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-emerald-400 font-mono">{fmtEur(f.netProjected)}</p>
              {f.revenueAtRisk > 0 && <p className="text-[9px] text-red-400 font-mono">-{fmtEur(f.revenueAtRisk)} at risk</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Top clients */}
      {(summary?.topClients ?? []).length > 0 && (
        <>
          <p className="text-xs font-bold text-white mt-4 mb-2">Top Clients</p>
          <div className="space-y-1">
            {(summary?.topClients ?? []).map((c: any, i: number) => (
              <div key={c.name} className="flex items-center justify-between py-1.5">
                <p className="text-[10px] text-white/60 truncate flex-1">{i + 1}. {c.name}</p>
                <span className="text-xs font-bold text-emerald-400 font-mono ml-2">{fmtEur(c.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
