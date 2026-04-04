import { useQuery } from "@tanstack/react-query";
import { Eye, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

export function CompetitorTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["competitor-summary"],
    queryFn: async () => {
      const res = await fetch(`${API}api/competitors/summary`, { headers: authHeaders() });
      if (!res.ok) return { comparisons: [], overpriced: 0, underpriced: 0, competitive: 0 };
      return res.json();
    },
  });

  const comparisons = data?.comparisons ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Competitors</h2>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-amber-400">{data?.overpriced ?? 0}</p>
          <p className="text-[9px] text-amber-400/60 uppercase font-bold">Over</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-emerald-400">{data?.competitive ?? 0}</p>
          <p className="text-[9px] text-emerald-400/60 uppercase font-bold">OK</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-red-400">{data?.underpriced ?? 0}</p>
          <p className="text-[9px] text-red-400/60 uppercase font-bold">Under</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : (
        <div className="space-y-1.5">
          {comparisons.map((c: any, i: number) => {
            const our = Number(c.our_rate); const their = Number(c.their_rate);
            const pct = their > 0 ? Math.round(((our - their) / their) * 100) : 0;
            return (
              <div key={i} className={cn("rounded-xl border p-3 flex items-center justify-between",
                c.status === "overpriced" ? "bg-amber-500/5 border-amber-500/15" :
                c.status === "underpriced" ? "bg-red-500/5 border-red-500/15" :
                "bg-emerald-500/5 border-emerald-500/15"
              )}>
                <div>
                  <p className="text-[11px] font-bold text-white">{c.role_type}</p>
                  <p className="text-[9px] text-white/40">{c.country} · €{our}/h vs €{their}/h</p>
                </div>
                <span className={cn("text-xs font-black font-mono flex items-center gap-0.5",
                  pct > 0 ? "text-amber-400" : pct < 0 ? "text-red-400" : "text-emerald-400"
                )}>
                  {pct > 0 ? <ArrowUp className="w-3 h-3" /> : pct < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {pct > 0 ? "+" : ""}{pct}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
