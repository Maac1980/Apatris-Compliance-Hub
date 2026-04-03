import { useQuery } from "@tanstack/react-query";
import { UserMinus, AlertTriangle, MapPin, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Entry { id: string; worker_name: string; specialization: string | null; last_site: string | null; last_role: string | null; skills_summary: string | null; status: string; days_on_bench: string; available_from: string; }
interface Summary { available: number; avgDays: number; over7Days: number; }

export function BenchTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["bench"],
    queryFn: async () => {
      const res = await fetch(`${API}api/bench`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ entries: Entry[] }>;
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["bench-summary"],
    queryFn: async () => {
      const res = await fetch(`${API}api/bench/summary`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Summary>;
    },
  });

  const entries = data?.entries ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3">
        <UserMinus className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Bench</h2>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-blue-400">{summary?.available ?? 0}</p>
          <p className="text-[9px] text-blue-400/60 uppercase font-bold">Available</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-amber-400">{summary?.avgDays ?? 0}d</p>
          <p className="text-[9px] text-amber-400/60 uppercase font-bold">Avg Days</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-red-400">{summary?.over7Days ?? 0}</p>
          <p className="text-[9px] text-red-400/60 uppercase font-bold">7+ Days</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-white/30"><UserMinus className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No workers on bench</p></div>
      ) : (
        <div className="space-y-2">
          {entries.map(e => {
            const days = Number(e.days_on_bench);
            const isLong = days >= 7;
            return (
              <div key={e.id} className={cn("rounded-2xl border p-3.5",
                isLong ? "bg-red-500/5 border-red-500/15" : "bg-white/[0.03] border-white/[0.06]"
              )}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white">{e.worker_name}</p>
                    {isLong && <AlertTriangle className="w-3 h-3 text-red-400" />}
                  </div>
                  <span className={cn("text-sm font-black font-mono", isLong ? "text-red-400" : days >= 4 ? "text-amber-400" : "text-emerald-400")}>{days}d</span>
                </div>
                <p className="text-[10px] text-white/40">{e.specialization || e.last_role || "—"}</p>
                <div className="flex gap-3 text-[9px] text-white/20 mt-1">
                  {e.last_site && <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{e.last_site}</span>}
                  <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />Since {new Date(e.available_from).toLocaleDateString("en-GB")}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
