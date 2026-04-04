import { useQuery } from "@tanstack/react-query";
import { Award, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Rec { certification: string; shortage: number; premiumPerHour: number; estimatedMonthlyRevenue: number; demandLevel: string; }

export function SkillsGapTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["skills-recs"],
    queryFn: async () => { const r = await fetch(`${API}api/skills/recommendations`, { headers: authHeaders() }); if (!r.ok) return { recommendations: [] }; return r.json() as Promise<{ recommendations: Rec[] }>; },
  });

  const recs = data?.recommendations ?? [];
  const fmtEur = (n: number) => `€${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4"><Award className="w-5 h-5 text-[#B8860B]" /><h2 className="text-lg font-bold text-white">Skills Gap</h2></div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#B8860B] border-t-transparent rounded-full" /></div>
      ) : recs.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Award className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No data — run analysis in dashboard</p></div>
      ) : (
        <>
          <p className="text-xs font-bold text-[#B8860B] mb-3 flex items-center gap-1"><TrendingUp className="w-3 h-3" />Top Certifications to Invest In</p>
          <div className="space-y-2">
            {recs.map((r, i) => (
              <div key={i} className="bg-[#B8860B]/5 border border-[#B8860B]/15 rounded-2xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-white">{r.certification}</p>
                  <span className={cn("text-[9px] font-bold uppercase",
                    r.demandLevel === "critical" ? "text-red-400" : r.demandLevel === "high" ? "text-amber-400" : "text-blue-400"
                  )}>{r.demandLevel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40">Shortage: {r.shortage} · +€{r.premiumPerHour}/h</span>
                  <span className="text-sm font-black text-[#B8860B] font-mono">{fmtEur(r.estimatedMonthlyRevenue)}/mo</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
