import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

export function MarginTab() {
  const { data: summary } = useQuery({
    queryKey: ["margins-summary"],
    queryFn: async () => { const r = await fetch(`${API}api/margins/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); },
  });

  const s = summary ?? {};

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4"><BarChart3 className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Margins</h2></div>

      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center mb-4">
        <p className="text-[10px] text-emerald-400/60 uppercase font-bold mb-1">Average Margin</p>
        <p className="text-2xl font-black text-emerald-400">{s.avgMargin ?? 0}%</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center"><p className="text-lg font-black text-emerald-400">{s.healthy ?? 0}</p><p className="text-[9px] text-emerald-400/60 uppercase font-bold">Healthy</p></div>
        <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center"><p className="text-lg font-black text-amber-400">{s.warning ?? 0}</p><p className="text-[9px] text-amber-400/60 uppercase font-bold">Warning</p></div>
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center"><p className="text-lg font-black text-red-400">{s.critical ?? 0}</p><p className="text-[9px] text-red-400/60 uppercase font-bold">Critical</p></div>
        <div className="px-3 py-2 bg-red-900/20 border border-red-800/30 rounded-xl text-center"><p className="text-lg font-black text-red-300">{s.losing ?? 0}</p><p className="text-[9px] text-red-300/60 uppercase font-bold">Losing</p></div>
      </div>

      {(s.bestClients?.length > 0) && (
        <div className="mb-3">
          <p className="text-xs font-bold text-emerald-400 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" />Best</p>
          {s.bestClients.map((c: any) => <p key={c.name} className="text-[10px] text-white/60">{c.name}: <span className="text-emerald-400 font-mono font-bold">{c.margin}%</span></p>)}
        </div>
      )}
      {(s.worstClients?.length > 0) && (
        <div>
          <p className="text-xs font-bold text-red-400 mb-1 flex items-center gap-1"><TrendingDown className="w-3 h-3" />Worst</p>
          {s.worstClients.map((c: any) => <p key={c.name} className="text-[10px] text-white/60">{c.name}: <span className={cn("font-mono font-bold", c.margin < 0 ? "text-red-400" : "text-amber-400")}>{c.margin}%</span></p>)}
        </div>
      )}
    </div>
  );
}
