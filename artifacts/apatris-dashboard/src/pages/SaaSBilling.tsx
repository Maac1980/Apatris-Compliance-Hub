import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


const PLAN_STYLES: Record<string, { color: string; bg: string }> = {
  starter: { color: "text-blue-400", bg: "border-blue-500/20" },
  professional: { color: "text-amber-400", bg: "border-amber-500/20" },
  enterprise: { color: "text-emerald-400", bg: "border-emerald-500/20" },
};

export default function SaaSBilling() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: subData } = useQuery({
    queryKey: ["billing-sub"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/billing/subscription`, { headers: authHeaders() }); if (!r.ok) return null; return r.json(); },
  });

  const { data: planData } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/billing/plans`); if (!r.ok) return { plans: [] }; return r.json(); },
  });

  const { data: histData } = useQuery({
    queryKey: ["billing-history"],
    queryFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/billing/history`, { headers: authHeaders() }); if (!r.ok) return { history: [] }; return r.json(); },
  });

  const subscribeMutation = useMutation({
    mutationFn: async (plan: string) => { const r = await fetch(`${import.meta.env.BASE_URL}api/billing/subscribe`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ plan }) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { toast({ description: `Subscribed to ${d.plan} — €${d.price}/mo` }); queryClient.invalidateQueries({ queryKey: ["billing-sub", "billing-history"] }); },
  });

  const portalMutation = useMutation({
    mutationFn: async () => { const r = await fetch(`${import.meta.env.BASE_URL}api/billing/portal`, { headers: authHeaders() }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: (d) => { if (d.url) window.open(d.url, "_blank"); else toast({ description: d.message || "Portal not available" }); },
  });

  const sub = subData?.subscription;
  const plans = planData?.plans ?? [];
  const history = histData?.history ?? [];
  const currentPlan = sub?.plan || "starter";

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2"><CreditCard className="w-7 h-7 text-[#C41E18]" /><h1 className="text-3xl font-bold text-white">Billing</h1></div>
        <p className="text-gray-400">Subscription plans, invoices, and payment management</p>
      </div>

      {/* Current plan */}
      {sub && (
        <div className={`bg-slate-900 border rounded-xl p-6 mb-6 ${PLAN_STYLES[currentPlan]?.bg || "border-slate-700"}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Current Plan</p>
              <p className={`text-2xl font-black ${PLAN_STYLES[currentPlan]?.color || "text-white"}`}>{currentPlan.toUpperCase()}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${sub.status === "active" ? "bg-emerald-500/10 text-emerald-400" : sub.status === "trialing" ? "bg-blue-500/10 text-blue-400" : "bg-red-500/10 text-red-400"}`}>{sub.status.toUpperCase()}</span>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-slate-400">Workers: <span className={`font-bold ${subData?.overLimit ? "text-red-400" : "text-white"}`}>{subData?.workerCount}/{subData?.workerLimit}</span></span>
            {sub.current_period_end && <span className="text-slate-400">Renews: <span className="text-white">{new Date(sub.current_period_end).toLocaleDateString("en-GB")}</span></span>}
          </div>
          {subData?.overLimit && <p className="text-xs text-red-400 mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Worker limit exceeded — please upgrade</p>}
          <button onClick={() => portalMutation.mutate()}
            className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-600">
            <ExternalLink className="w-3 h-3" />Manage Payment Method
          </button>
        </div>
      )}

      {/* Plans */}
      <h3 className="text-sm font-bold text-white mb-3">Available Plans</h3>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {plans.map((p: any) => {
          const isCurrent = p.id === currentPlan;
          const ps = PLAN_STYLES[p.id] || PLAN_STYLES.starter;
          return (
            <div key={p.id} className={`bg-slate-900 border rounded-xl p-4 ${isCurrent ? ps.bg : "border-slate-700"}`}>
              <p className={`text-sm font-bold ${ps.color}`}>{p.id.charAt(0).toUpperCase() + p.id.slice(1)}</p>
              <p className="text-2xl font-black text-white mt-1">€{p.price}<span className="text-xs text-slate-500">/mo</span></p>
              <ul className="mt-2 space-y-1">{p.features.map((f: string) => <li key={f} className="text-[10px] text-slate-400 flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />{f}</li>)}</ul>
              {!isCurrent && (
                <button onClick={() => subscribeMutation.mutate(p.id)} disabled={subscribeMutation.isPending}
                  className="mt-3 w-full py-2 bg-[#C41E18] text-white rounded-lg text-xs font-bold hover:bg-[#a51914] disabled:opacity-50">
                  {p.price > (subData?.planDetails?.price || 0) ? "Upgrade" : "Downgrade"}
                </button>
              )}
              {isCurrent && <p className="mt-3 text-center text-[10px] text-emerald-400 font-bold">CURRENT PLAN</p>}
            </div>
          );
        })}
      </div>

      {/* Invoice history */}
      <h3 className="text-sm font-bold text-white mb-3">Invoice History</h3>
      {history.length === 0 ? <p className="text-slate-500 text-sm">No invoices yet</p> : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400">Date</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400">Description</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-400">Status</th>
            </tr></thead>
            <tbody>{history.map((h: any) => (
              <tr key={h.id} className="border-b border-slate-800">
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{new Date(h.created_at).toLocaleDateString("en-GB")}</td>
                <td className="px-4 py-3 text-white text-xs">{h.description || "Subscription"}</td>
                <td className="px-4 py-3 text-emerald-400 font-mono text-xs font-bold">€{Number(h.amount)}</td>
                <td className="px-4 py-3"><span className={`text-[10px] font-bold ${h.status === "paid" ? "text-emerald-400" : "text-amber-400"}`}>{h.status.toUpperCase()}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
