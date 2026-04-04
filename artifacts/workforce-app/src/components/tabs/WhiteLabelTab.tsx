import { useQuery } from "@tanstack/react-query";
import { Building2, Users, DollarSign } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";
const PLAN_COLORS: Record<string, string> = { starter: "text-blue-400", professional: "text-amber-400", enterprise: "text-emerald-400" };

export function WhiteLabelTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["wl-agencies"],
    queryFn: async () => { const r = await fetch(`${API}api/whitelabel/agencies`, { headers: authHeaders() }); if (!r.ok) return { agencies: [] }; return r.json(); },
  });

  const agencies = (data?.agencies ?? []) as Array<{ agency_name: string; plan: string; monthly_fee: string; worker_count: string; worker_limit: number; status: string; primary_color: string }>;
  const totalRev = agencies.reduce((s, a) => s + Number(a.monthly_fee), 0);

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-3"><Building2 className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">White-Label</h2></div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 px-3 py-2 bg-slate-500/10 border border-slate-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-white">{agencies.length}</p><p className="text-[9px] text-white/40 uppercase font-bold">Agencies</p>
        </div>
        <div className="flex-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
          <p className="text-lg font-black text-emerald-400">€{totalRev}</p><p className="text-[9px] text-emerald-400/60 uppercase font-bold">Monthly</p>
        </div>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div> : agencies.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No agencies</p></div>
      ) : (
        <div className="space-y-2">
          {agencies.map((a, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: a.primary_color }} />
                <p className="text-xs font-bold text-white truncate">{a.agency_name}</p>
                <span className={`text-[9px] font-bold ml-auto ${PLAN_COLORS[a.plan] || "text-blue-400"}`}>{a.plan.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-blue-400 flex items-center gap-1"><Users className="w-2.5 h-2.5" />{a.worker_count}/{a.worker_limit}</span>
                <span className="text-emerald-400 flex items-center gap-1"><DollarSign className="w-2.5 h-2.5" />€{Number(a.monthly_fee)}/mo</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
