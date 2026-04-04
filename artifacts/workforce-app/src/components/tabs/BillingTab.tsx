import { useQuery } from "@tanstack/react-query";
import { CreditCard, CheckCircle2 } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";
const PLAN_COLORS: Record<string, string> = { starter: "text-blue-400", professional: "text-amber-400", enterprise: "text-emerald-400" };

export function BillingTab() {
  const { data } = useQuery({
    queryKey: ["billing-sub"],
    queryFn: async () => { const r = await fetch(`${API}api/billing/subscription`, { headers: authHeaders() }); if (!r.ok) return null; return r.json(); },
  });

  const sub = data?.subscription;
  const plan = sub?.plan || "starter";

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4"><CreditCard className="w-5 h-5 text-[#C41E18]" /><h2 className="text-lg font-bold text-white">Billing</h2></div>

      {sub ? (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Current Plan</p>
          <p className={`text-xl font-black ${PLAN_COLORS[plan] || "text-white"}`}>{plan.toUpperCase()}</p>
          <div className="flex items-center gap-3 mt-2 text-[10px]">
            <span className={`px-2 py-0.5 rounded-full font-bold ${sub.status === "active" ? "text-emerald-400 bg-emerald-500/10" : "text-blue-400 bg-blue-500/10"}`}>{sub.status}</span>
            <span className="text-white/40">Workers: {data?.workerCount}/{data?.workerLimit}</span>
          </div>
          {sub.current_period_end && <p className="text-[9px] text-white/20 font-mono mt-2">Renews {new Date(sub.current_period_end).toLocaleDateString("en-GB")}</p>}
        </div>
      ) : (
        <div className="text-center py-16 text-white/30"><CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No subscription</p></div>
      )}

      <p className="text-xs font-bold text-white mb-2">Plans</p>
      <div className="space-y-2">
        {[{ id: "starter", price: 199, limit: "50 workers" }, { id: "professional", price: 499, limit: "200 workers" }, { id: "enterprise", price: 999, limit: "Unlimited" }].map(p => (
          <div key={p.id} className={`rounded-2xl border p-3.5 flex items-center justify-between ${plan === p.id ? "bg-emerald-500/5 border-emerald-500/15" : "bg-white/[0.03] border-white/[0.06]"}`}>
            <div>
              <p className={`text-xs font-bold ${PLAN_COLORS[p.id]}`}>{p.id.charAt(0).toUpperCase() + p.id.slice(1)}</p>
              <p className="text-[10px] text-white/40">{p.limit}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-white">€{p.price}<span className="text-[9px] text-white/30">/mo</span></p>
              {plan === p.id && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
