import { useQuery } from "@tanstack/react-query";
import { TrendingUp, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Comp { name: string; role: string; country: string; currentRate: number; marketAvg: number; percentDiff: number; status: string; }

export function SalaryBenchTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["salary-compare-all"],
    queryFn: async () => {
      const res = await fetch(`${API}api/salary/compare-all`, { headers: authHeaders() });
      if (!res.ok) return { comparisons: [], underpaid: 0, overpaid: 0, atMarket: 0 };
      return res.json();
    },
  });

  const comparisons = (data?.comparisons ?? []) as Comp[];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Salary Benchmark</h2>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-red-400">{data?.underpaid ?? 0}</p>
          <p className="text-[9px] text-red-400/60 uppercase font-bold">Under</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-emerald-400">{data?.atMarket ?? 0}</p>
          <p className="text-[9px] text-emerald-400/60 uppercase font-bold">Market</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-amber-400">{data?.overpaid ?? 0}</p>
          <p className="text-[9px] text-amber-400/60 uppercase font-bold">Over</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : (
        <div className="space-y-2">
          {comparisons.map(c => (
            <div key={c.name} className={cn("rounded-2xl border p-3.5",
              c.status === "underpaid" ? "bg-red-500/5 border-red-500/15" :
              c.status === "overpaid" ? "bg-amber-500/5 border-amber-500/15" :
              "bg-emerald-500/5 border-emerald-500/15"
            )}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-white truncate">{c.name}</p>
                <span className={cn("flex items-center gap-0.5 text-xs font-black font-mono",
                  c.percentDiff > 0 ? "text-amber-400" : c.percentDiff < 0 ? "text-red-400" : "text-emerald-400"
                )}>
                  {c.percentDiff > 0 ? <ArrowUp className="w-3 h-3" /> : c.percentDiff < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {c.percentDiff > 0 ? "+" : ""}{c.percentDiff}%
                </span>
              </div>
              <p className="text-[10px] text-white/40">{c.role} · {c.country} · €{c.currentRate}/h vs €{c.marketAvg}/h market</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
