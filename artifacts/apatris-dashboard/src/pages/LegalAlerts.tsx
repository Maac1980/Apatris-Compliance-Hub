/**
 * Legal Alerts — proactive legal status change notifications.
 */

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Bell, AlertTriangle, Shield, CheckCircle2, Clock, Eye, Loader2, Play, Filter,
} from "lucide-react";

interface LegalAlert {
  id: string;
  worker_id: string;
  worker_name: string;
  alert_type: string;
  severity: string;
  previous_status: string | null;
  new_status: string | null;
  previous_risk_level: string | null;
  new_risk_level: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

const SEV_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  CRITICAL: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", dot: "bg-red-400" },
  HIGH:     { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20", dot: "bg-orange-400" },
  MEDIUM:   { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", dot: "bg-amber-400" },
  LOW:      { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-400" },
};

const TYPE_LABEL: Record<string, string> = {
  STATUS_CHANGED: "Status Changed",
  RISK_INCREASED: "Risk Increased",
  EXPIRY_WARNING: "Expiry Warning",
  REVIEW_REQUIRED: "Review Required",
  PROTECTION_ACTIVATED: "Protection Active",
  PROTECTION_LOST: "Protection Lost",
};

export default function LegalAlerts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterSev, setFilterSev] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showRead, setShowRead] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["legal-alerts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/alerts`, { headers: authHeaders() });
      if (!res.ok) return { alerts: [] };
      return res.json() as Promise<{ alerts: LegalAlert[] }>;
    },
    refetchInterval: 30_000,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/v1/legal/scan/run`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Scan failed");
      return res.json();
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["legal-alerts"] });
      toast({ description: `Scan complete: ${r.workersScanned} workers, ${r.alertsCreated} alerts` });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${BASE}api/v1/legal/alerts/${id}/read`, { method: "POST", headers: authHeaders() });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["legal-alerts"] }),
  });

  const alerts = data?.alerts ?? [];

  const filtered = useMemo(() => {
    return alerts.filter(a => {
      if (!showRead && a.is_read) return false;
      if (filterSev && a.severity !== filterSev) return false;
      if (filterType && a.alert_type !== filterType) return false;
      return true;
    });
  }, [alerts, filterSev, filterType, showRead]);

  const counts = useMemo(() => {
    const c = { total: alerts.length, unread: 0, critical: 0, high: 0 };
    for (const a of alerts) {
      if (!a.is_read) c.unread++;
      if (a.severity === "CRITICAL") c.critical++;
      if (a.severity === "HIGH") c.high++;
    }
    return c;
  }, [alerts]);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-2">
            <Bell className="w-7 h-7 text-[#C41E18]" />
            <h1 className="text-3xl font-bold text-white">Legal Alerts</h1>
            {counts.unread > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400">{counts.unread} unread</span>
            )}
          </div>
          <button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#C41E18]/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-bold hover:bg-[#C41E18]/30 transition-colors disabled:opacity-50"
          >
            {scanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Scan Now
          </button>
        </div>
        <p className="text-gray-400">Proactive detection of legal status transitions across all workers</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl p-3 bg-slate-800"><p className="text-[10px] text-gray-400 font-mono uppercase">Total</p><p className="text-xl font-bold text-white">{counts.total}</p></div>
        <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20"><p className="text-[10px] text-gray-400 font-mono uppercase">Critical</p><p className="text-xl font-bold text-red-400">{counts.critical}</p></div>
        <div className="rounded-xl p-3 bg-orange-500/10 border border-orange-500/20"><p className="text-[10px] text-gray-400 font-mono uppercase">High</p><p className="text-xl font-bold text-orange-400">{counts.high}</p></div>
        <div className="rounded-xl p-3 bg-slate-800"><p className="text-[10px] text-gray-400 font-mono uppercase">Unread</p><p className="text-xl font-bold text-white">{counts.unread}</p></div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-slate-500" />
        <select value={filterSev} onChange={e => setFilterSev(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white">
          <option value="">All Severity</option>
          {["CRITICAL","HIGH","MEDIUM","LOW"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white">
          <option value="">All Types</option>
          {Object.entries(TYPE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" checked={showRead} onChange={e => setShowRead(e.target.checked)} className="rounded" />
          Show read
        </label>
        {(filterSev || filterType) && (
          <button onClick={() => { setFilterSev(""); setFilterType(""); }} className="text-xs text-slate-400 hover:text-white underline">Clear</button>
        )}
      </div>

      {/* Alert list */}
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No alerts</p>
          <p className="text-sm mt-1">{alerts.length > 0 ? "All alerts filtered out" : "Run a scan to detect status changes"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => {
            const s = SEV_STYLE[a.severity] ?? SEV_STYLE.MEDIUM;
            return (
              <div key={a.id} className={`rounded-xl border ${s.border} ${a.is_read ? "bg-slate-800/30 opacity-60" : s.bg} p-3 transition-all`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                      <span className="text-sm font-semibold text-white">{a.worker_name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>{a.severity}</span>
                      <span className="text-[10px] text-slate-500">{TYPE_LABEL[a.alert_type] ?? a.alert_type}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{a.message}</p>
                    {(a.previous_status || a.new_status) && (
                      <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                        {a.previous_status && <span className="text-slate-500">{a.previous_status}</span>}
                        {a.previous_status && a.new_status && <span className="text-slate-600">→</span>}
                        {a.new_status && <span className={s.text}>{a.new_status}</span>}
                        {a.previous_risk_level && a.new_risk_level && a.previous_risk_level !== a.new_risk_level && (
                          <span className="text-slate-600 ml-2">Risk: {a.previous_risk_level} → {a.new_risk_level}</span>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-slate-600 font-mono mt-1">{new Date(a.created_at).toLocaleString("en-GB")}</p>
                  </div>
                  {!a.is_read && (
                    <button
                      onClick={() => markReadMutation.mutate(a.id)}
                      className="p-1 text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
                      title="Mark as read"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
