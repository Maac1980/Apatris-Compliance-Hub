import { useQuery } from "@tanstack/react-query";
import { Shield, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Policy { id: string; policy_name: string; policy_type: string; coverage_amount: string; premium_monthly: string; end_date: string | null; workers_covered: number; }

export function InsuranceTab() {
  const { data: summary } = useQuery({
    queryKey: ["insurance-summary"],
    queryFn: async () => { const r = await fetch(`${API}api/insurance/summary`, { headers: authHeaders() }); if (!r.ok) return {}; return r.json(); },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["insurance-policies"],
    queryFn: async () => { const r = await fetch(`${API}api/insurance/policies`, { headers: authHeaders() }); if (!r.ok) return { policies: [] }; return r.json() as Promise<{ policies: Policy[] }>; },
  });

  const policies = data?.policies ?? [];
  const fmtEur = (n: number) => `€${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3"><Shield className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Insurance</h2></div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
          <p className="text-sm font-black text-emerald-400">{fmtEur(summary?.totalCoverage ?? 0)}</p>
          <p className="text-[9px] text-emerald-400/60 uppercase font-bold">Coverage</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-sm font-black text-amber-400">{fmtEur(summary?.monthlyPremium ?? 0)}</p>
          <p className="text-[9px] text-amber-400/60 uppercase font-bold">Premium/mo</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
          <p className="text-sm font-black text-red-400">{summary?.openClaims ?? 0}</p>
          <p className="text-[9px] text-red-400/60 uppercase font-bold">Claims</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : policies.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Shield className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No policies</p></div>
      ) : (
        <div className="space-y-2">
          {policies.map(p => {
            const days = p.end_date ? Math.ceil((new Date(p.end_date).getTime() - Date.now()) / 86_400_000) : null;
            return (
              <div key={p.id} className={cn("rounded-2xl border p-3.5", days !== null && days <= 30 ? "bg-red-500/5 border-red-500/15" : "bg-white/[0.03] border-white/[0.06]")}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-white truncate">{p.policy_name}</p>
                  {days !== null && days <= 30 && <AlertTriangle className="w-3 h-3 text-red-400" />}
                </div>
                <p className="text-[10px] text-white/40">{p.policy_type} · {p.workers_covered} workers</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-emerald-400 font-mono font-bold">{fmtEur(Number(p.coverage_amount))}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{p.end_date ? new Date(p.end_date).toLocaleDateString("en-GB") : "—"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
