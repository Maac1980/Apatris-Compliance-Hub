import { useQuery } from "@tanstack/react-query";
import { GraduationCap, TrendingUp } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Path { worker_name: string; current_role: string; recommended_next_cert: string; estimated_salary_increase: string; steps: any; progress: number; }

export function CareerTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["career-paths"],
    queryFn: async () => { const r = await fetch(`${API}api/careers/paths`, { headers: authHeaders() }); if (!r.ok) return { paths: [] }; return r.json() as Promise<{ paths: Path[] }>; },
  });

  const paths = data?.paths ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4"><GraduationCap className="w-5 h-5 text-[#B8860B]" /><h2 className="text-lg font-bold text-white">Career Paths</h2></div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#B8860B] border-t-transparent rounded-full" /></div>
      ) : paths.length === 0 ? (
        <div className="text-center py-16 text-white/30"><GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No career paths yet</p></div>
      ) : (
        <div className="space-y-3">
          {paths.map((p, i) => {
            const steps = typeof p.steps === "string" ? JSON.parse(p.steps) : (p.steps || []);
            return (
              <div key={i} className="bg-[#B8860B]/5 border border-[#B8860B]/15 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div><p className="text-sm font-bold text-white">{p.worker_name}</p><p className="text-[10px] text-white/40">{p.current_role}</p></div>
                  <span className="text-lg font-black text-[#B8860B] font-mono">+€{Number(p.estimated_salary_increase)}/h</span>
                </div>
                <p className="text-[10px] text-[#B8860B] mb-2">Next: {p.recommended_next_cert}</p>
                {/* Mini ladder */}
                <div className="space-y-1">
                  {steps.slice(0, 3).map((s: any, j: number) => (
                    <div key={j} className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${j === 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-[#B8860B]/20 text-[#B8860B]"}`}>{s.step || j + 1}</div>
                      <p className="text-[10px] text-white/60 flex-1 truncate">{s.title}</p>
                      {s.rateIncrease > 0 && <span className="text-[9px] text-[#B8860B] font-mono">+€{s.rateIncrease}</span>}
                    </div>
                  ))}
                </div>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-[#B8860B] rounded-full" style={{ width: `${p.progress}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
