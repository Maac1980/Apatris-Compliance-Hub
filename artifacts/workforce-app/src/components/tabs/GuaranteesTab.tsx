import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Guarantee { id: string; company_name: string; max_coverage_eur: string; incidents: number; incident_count: string; status: string; }

export function GuaranteesTab() {
  const { data: summary } = useQuery({
    queryKey: ["guarantees-summary"],
    queryFn: async () => { const r = await fetch(`${API}api/guarantees/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["guarantees"],
    queryFn: async () => { const r = await fetch(`${API}api/guarantees`, { headers: authHeaders() }); if (!r.ok) return { guarantees: [] }; return r.json() as Promise<{ guarantees: Guarantee[] }>; },
  });

  const guarantees = data?.guarantees ?? [];
  const s = summary ?? {};
  const fmtEur = (n: number) => `€${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3"><ShieldCheck className="w-5 h-5 text-emerald-400" /><h2 className="text-lg font-bold text-white">Guarantees</h2></div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
          <p className="text-sm font-black text-emerald-400">{fmtEur(s.totalCoverage ?? 0)}</p>
          <p className="text-[9px] text-emerald-400/60 uppercase font-bold">Coverage</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
          <p className="text-sm font-black text-emerald-400">{s.zeroIncidentClients ?? 0}</p>
          <p className="text-[9px] text-emerald-400/60 uppercase font-bold">Zero Fail</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full" /></div>
      ) : guarantees.length === 0 ? (
        <div className="text-center py-16 text-white/30"><ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No guarantees</p></div>
      ) : (
        <div className="space-y-2">
          {guarantees.map(g => {
            const zero = Number(g.incident_count) === 0;
            return (
              <div key={g.id} className={cn("rounded-2xl border p-3.5", zero ? "bg-emerald-500/5 border-emerald-500/15" : "bg-white/[0.03] border-white/[0.06]")}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-white">{g.company_name}</p>
                  {zero && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-emerald-400 font-mono">{fmtEur(Number(g.max_coverage_eur))}</span>
                  <span className="text-[10px] text-white/40">{g.incident_count} incidents</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
