import { useQuery } from "@tanstack/react-query";
import { Award, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface TrustScore { id: string; worker_name: string; score: number; calculated_at: string; }

function tier(s: number): { label: string; color: string; bg: string } {
  if (s >= 90) return { label: "PLATINUM", color: "text-slate-200", bg: "bg-slate-300/10 border-slate-300/20" };
  if (s >= 75) return { label: "GOLD", color: "text-[#B8860B]", bg: "bg-[#B8860B]/10 border-[#B8860B]/20" };
  if (s >= 50) return { label: "SILVER", color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20" };
  return { label: "BRONZE", color: "text-amber-700", bg: "bg-amber-900/10 border-amber-800/20" };
}

export function TrustTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["trust-scores"],
    queryFn: async () => {
      const res = await fetch(`${API}api/trust/scores`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ scores: TrustScore[] }>;
    },
  });

  const scores = (data?.scores ?? []).sort((a, b) => b.score - a.score);

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <Award className="w-5 h-5 text-[#B8860B]" />
        <h2 className="text-lg font-bold text-white">Trust Scores</h2>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#B8860B] border-t-transparent rounded-full" /></div>
      ) : scores.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Award className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No scores yet</p></div>
      ) : (
        <div className="space-y-2">
          {scores.map((s, i) => {
            const t = tier(s.score);
            return (
              <div key={s.id} className={cn("rounded-2xl border p-3.5 flex items-center gap-3", t.bg)}>
                <span className="text-[10px] font-mono text-white/30 w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{s.worker_name}</p>
                  <span className={cn("text-[9px] font-bold", t.color)}>{t.label}</span>
                </div>
                <span className={cn("text-xl font-black font-mono", t.color)}>{s.score}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
