import { useQuery } from "@tanstack/react-query";
import { Calculator, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Filing {
  id: string; month: number; year: number; status: string;
  worker_count: number; total_contributions: string; submitted_at: string | null;
}

export function ZusTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["zus-filings"],
    queryFn: async () => {
      const res = await fetch(`${API}api/zus/filings`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ filings: Filing[] }>;
    },
  });

  const filings = data?.filings ?? [];
  const totalYear = filings.filter(f => f.year === new Date().getFullYear()).reduce((s, f) => s + Number(f.total_contributions), 0);

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">ZUS Filings</h2>
      </div>

      <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-4">
        <p className="text-[10px] text-emerald-400/60 uppercase tracking-wider font-bold">Year Total</p>
        <p className="text-sm font-black text-emerald-400 font-mono">{totalYear.toLocaleString("pl", { minimumFractionDigits: 2 })} PLN</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : filings.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <Calculator className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold">No filings yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filings.map(f => {
            const isSubmitted = f.status === "submitted";
            const isGenerated = f.status === "generated";
            return (
              <div key={f.id} className={cn("rounded-2xl border p-3.5",
                isSubmitted ? "bg-emerald-500/5 border-emerald-500/15" :
                isGenerated ? "bg-amber-500/5 border-amber-500/15" :
                "bg-white/[0.03] border-white/[0.06]"
              )}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-bold text-white">{MONTHS[f.month - 1]} {f.year}</p>
                  <span className={cn("flex items-center gap-1 text-[10px] font-bold",
                    isSubmitted ? "text-emerald-400" : isGenerated ? "text-amber-400" : "text-slate-400"
                  )}>
                    {isSubmitted ? <CheckCircle2 className="w-3 h-3" /> : isGenerated ? <Clock className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {f.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/40">{f.worker_count} workers</span>
                  <span className="text-emerald-400 font-mono font-bold">{Number(f.total_contributions).toLocaleString("pl")} PLN</span>
                </div>
                {f.submitted_at && <p className="text-[9px] text-emerald-600 font-mono mt-1">Submitted {new Date(f.submitted_at).toLocaleDateString("en-GB")}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
