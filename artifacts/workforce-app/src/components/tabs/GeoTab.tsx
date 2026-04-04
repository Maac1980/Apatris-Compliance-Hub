import { useQuery } from "@tanstack/react-query";
import { MapPin, AlertTriangle } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

export function GeoTab() {
  const { data: sites } = useQuery({
    queryKey: ["geo-sites"],
    queryFn: async () => { const r = await fetch(`${API}api/geo/sites`, { headers: authHeaders() }); if (!r.ok) return { sites: [] }; return r.json(); },
  });

  const { data: workers } = useQuery({
    queryKey: ["geo-workers"],
    queryFn: async () => { const r = await fetch(`${API}api/geo/workers`, { headers: authHeaders() }); if (!r.ok) return { totalWorkers: 0, farFromSite: 0 }; return r.json(); },
  });

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4"><MapPin className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Geo Intel</h2></div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-blue-400">{(sites?.sites ?? []).length}</p>
          <p className="text-[9px] text-blue-400/60 uppercase font-bold">Sites</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-slate-500/10 border border-slate-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-white">{workers?.totalWorkers ?? 0}</p>
          <p className="text-[9px] text-white/40 uppercase font-bold">Workers</p>
        </div>
        <div className={`flex-1 px-3 py-2 rounded-xl text-center ${(workers?.farFromSite ?? 0) > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}>
          <p className={`text-lg font-black ${(workers?.farFromSite ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>{workers?.farFromSite ?? 0}</p>
          <p className="text-[9px] text-white/40 uppercase font-bold">Far</p>
        </div>
      </div>

      <p className="text-xs font-bold text-white mb-2">Sites</p>
      <div className="space-y-2">
        {(sites?.sites ?? []).map((s: any) => (
          <div key={s.name} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 flex items-center gap-3">
            <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{s.name}</p>
              <p className="text-[9px] text-white/30 font-mono">{s.lat?.toFixed(2)}, {s.lng?.toFixed(2)}</p>
            </div>
            <span className="text-sm font-black text-blue-400">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
