/**
 * Regulatory Deployment Center + Audit Trail — Stage 5
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Shield, Loader2, CheckCircle2, XOctagon, Clock, ChevronDown, ChevronUp, RefreshCw, RotateCcw,
} from "lucide-react";

const DEP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PLANNED:     { label: "Planned",     color: "text-blue-400",    bg: "bg-blue-500/20" },
  EXECUTED:    { label: "Executed",    color: "text-emerald-400", bg: "bg-emerald-500/20" },
  ROLLED_BACK: { label: "Rolled Back", color: "text-amber-400",   bg: "bg-amber-500/20" },
};

export default function RegulatoryDeployments() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"deployments" | "audit">("deployments");
  const [filter, setFilter] = useState("");

  const { data: depData, isLoading: loadingDeps } = useQuery({
    queryKey: ["reg-deployments", filter],
    queryFn: async () => {
      const params = filter ? `?status=${filter}` : "";
      const res = await fetch(`${BASE}api/v1/regulatory/deployments${params}`, { headers: authHeaders() });
      if (!res.ok) return { deployments: [] };
      return res.json();
    },
  });

  const { data: auditData, isLoading: loadingAudit } = useQuery({
    queryKey: ["reg-audit-full"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/regulatory/audit`, { headers: authHeaders() });
      if (!res.ok) return { events: [] };
      return res.json();
    },
    enabled: tab === "audit",
  });

  const rollbackMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}api/v1/regulatory/deployments/${id}/rollback`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Rollback failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Rolled back" }); qc.invalidateQueries({ queryKey: ["reg-deployments"] }); },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const deps = depData?.deployments ?? [];
  const events = auditData?.events ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-y-auto pb-20">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-slate-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Deployment Center</h1>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Execute · Rollback · Audit</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        <div className="flex border-b border-slate-800 mb-4">
          <button onClick={() => setTab("deployments")} className={`px-4 py-3 text-sm font-bold border-b-2 ${tab === "deployments" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-white"}`}>Deployments</button>
          <button onClick={() => setTab("audit")} className={`px-4 py-3 text-sm font-bold border-b-2 ${tab === "audit" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-white"}`}>Audit Trail</button>
        </div>

        {tab === "deployments" && (
          <>
            <div className="flex gap-2">
              {["", "PLANNED", "EXECUTED", "ROLLED_BACK"].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={`text-xs px-3 py-1 rounded font-bold ${filter === s ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
                  {s || "All"}
                </button>
              ))}
            </div>

            {loadingDeps ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
            : deps.length === 0 ? <div className="text-center py-12 text-slate-600"><Shield className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No deployments.</p></div>
            : deps.map((d: any) => {
              const st = DEP_STATUS[d.deployment_status] ?? DEP_STATUS.PLANNED;
              return (
                <div key={d.id} className="rounded-xl border bg-slate-900 border-slate-800 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{d.update_title || "Update"}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${st.bg} ${st.color}`}>{st.label}</span>
                        <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{d.target_module?.replace(/_/g, " ")}</span>
                        <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{d.deployment_type}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                        {d.deployed_by && <span>By: {d.deployed_by}</span>}
                        {d.deployed_at && <span>{new Date(d.deployed_at).toLocaleString("pl-PL")}</span>}
                      </div>
                    </div>
                    {d.deployment_status === "EXECUTED" && d.rollback_available && (
                      <button onClick={() => rollbackMut.mutate(d.id)} disabled={rollbackMut.isPending}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-amber-600/20 text-amber-400 border border-amber-500/30 font-bold hover:bg-amber-600/30 disabled:opacity-50">
                        <RotateCcw className="w-3 h-3" /> Rollback
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === "audit" && (
          <>
            {loadingAudit ? <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
            : events.length === 0 ? <div className="text-center py-12 text-slate-600"><Clock className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No audit events.</p></div>
            : (
              <div className="space-y-1">
                {events.map((e: any, i: number) => (
                  <div key={e.id ?? i} className="flex items-start gap-3 text-xs py-2 border-b border-slate-800/50">
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{e.event_type}</span>
                        <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{e.actor_type}</span>
                        {e.actor_id && <span className="text-slate-500">{e.actor_id}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        {e.update_title && <span>{e.update_title}</span>}
                        <span>{new Date(e.created_at).toLocaleString("pl-PL")}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
