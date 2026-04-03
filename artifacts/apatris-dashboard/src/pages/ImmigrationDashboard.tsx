import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Stamp, X, ChevronRight, Filter, Plus, Search, Brain, Play, Shield, AlertTriangle, CheckCircle2,
  Bell, Send, Phone, MessageSquare,
} from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const PERMIT_TYPES = ["TRC", "Work Permit", "Visa", "A1", "Passport"] as const;
const STATUSES = ["active", "expired", "pending", "revoked"] as const;

interface Permit {
  id: string;
  worker_id: string;
  worker_name: string;
  worker_name_live?: string;
  permit_type: string;
  country: string;
  issue_date: string | null;
  expiry_date: string | null;
  status: string;
  application_ref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function daysRemaining(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const diff = new Date(expiryDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function colourZone(days: number | null, status: string): "green" | "amber" | "red" | "expired" | "gray" {
  if (status === "expired") return "expired";
  if (days === null) return "gray";
  if (days < 0) return "expired";
  if (days < 30) return "red";
  if (days <= 60) return "amber";
  return "green";
}

const ZONE_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  green:   { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400", label: "GREEN" },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-400",   dot: "bg-amber-400",   label: "AMBER" },
  red:     { bg: "bg-red-500/10",     text: "text-red-400",     dot: "bg-red-400",     label: "RED" },
  expired: { bg: "bg-red-900/20",     text: "text-red-300",     dot: "bg-red-600",     label: "EXPIRED" },
  gray:    { bg: "bg-slate-700/30",   text: "text-slate-400",   dot: "bg-slate-500",   label: "N/A" },
};

function ZoneBadge({ zone }: { zone: string }) {
  const s = ZONE_STYLES[zone] ?? ZONE_STYLES.gray;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold font-mono ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

interface AlertStatus {
  permit_id: string;
  worker_id: string;
  worker_name: string;
  permit_type: string;
  expiry_date: string | null;
  trc_application_submitted: boolean;
  worker_phone: string | null;
  last_alert_status: string | null;
  last_alert_at: string | null;
  message_preview: string | null;
}

export default function ImmigrationDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"permits" | "alerts">("permits");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [selectedWorkerName, setSelectedWorkerName] = useState<string>("");
  const [prediction, setPrediction] = useState<any>(null);
  const [predictingId, setPredictingId] = useState<string | null>(null);

  // Fetch all permits
  const { data, isLoading } = useQuery({
    queryKey: ["immigration-permits"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/immigration`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<{ permits: Permit[]; count: number }>;
    },
  });

  // Fetch worker permit history (side panel)
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["immigration-worker-history", selectedWorkerId],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/immigration/worker/${selectedWorkerId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json() as Promise<{ permits: Permit[]; count: number }>;
    },
    enabled: !!selectedWorkerId,
  });

  // Alerts tab data
  const { data: alertStatusData, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ["immigration-alert-status"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/immigration/alerts/status`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ workers: AlertStatus[] }>;
    },
    enabled: activeTab === "alerts",
  });

  const sendAlertsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/immigration/alerts/send`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to send alerts");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ description: `Alerts sent: ${data.sent}, skipped: ${data.skipped}` });
      refetchAlerts();
    },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const predictMutation = useMutation({
    mutationFn: async (permitId: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/immigration/${permitId}/predict`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Prediction failed");
      return res.json();
    },
    onSuccess: (data) => { setPrediction(data.prediction); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Prediction failed", variant: "destructive" }); },
  });

  const renewalMutation = useMutation({
    mutationFn: async (permitId: string) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/immigration/${permitId}/start-renewal`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to start renewal");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Renewal workflow created" }); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const runPrediction = (permitId: string) => {
    setPredictingId(permitId);
    setPrediction(null);
    predictMutation.mutate(permitId);
  };

  const permits = data?.permits ?? [];

  // Enrich with computed fields
  const enriched = useMemo(() => permits.map(p => {
    const days = daysRemaining(p.expiry_date);
    const zone = colourZone(days, p.status);
    return { ...p, days, zone };
  }), [permits]);

  // Filter
  const filtered = useMemo(() => {
    return enriched.filter(p => {
      if (filterType && p.permit_type !== filterType) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = (p.worker_name_live || p.worker_name || "").toLowerCase();
        const ref = (p.application_ref || "").toLowerCase();
        if (!name.includes(q) && !ref.includes(q) && !p.country.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [enriched, filterType, filterStatus, search]);

  // Summary counts
  const summary = useMemo(() => {
    const s = { green: 0, amber: 0, red: 0, expired: 0, total: enriched.length };
    for (const p of enriched) {
      if (p.zone === "green") s.green++;
      else if (p.zone === "amber") s.amber++;
      else if (p.zone === "red") s.red++;
      else if (p.zone === "expired") s.expired++;
    }
    return s;
  }, [enriched]);

  const openPanel = (workerId: string, workerName: string) => {
    setSelectedWorkerId(workerId);
    setSelectedWorkerName(workerName);
    setPrediction(null);
    setPredictingId(null);
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Stamp className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Immigration & Work Permits</h1>
        </div>
        <p className="text-gray-400">Track all worker permits, visas, TRCs and documents across countries</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("permits")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${
            activeTab === "permits" ? "bg-[#C41E18] text-white shadow" : "text-slate-400 hover:text-white"
          }`}
        >
          <Stamp className="w-4 h-4" />
          Permits
        </button>
        <button
          onClick={() => setActiveTab("alerts")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${
            activeTab === "alerts" ? "bg-[#C41E18] text-white shadow" : "text-slate-400 hover:text-white"
          }`}
        >
          <Bell className="w-4 h-4" />
          WhatsApp Alerts
        </button>
      </div>

      {activeTab === "alerts" ? (
        /* ─── Alerts Tab ─────────────────────────────────────────────── */
        <div>
          {/* Send alerts button */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-400">
              Alerts sent at <span className="text-white font-mono">60, 30, 14, 7, 1</span> days before expiry via WhatsApp
            </p>
            <button
              onClick={() => sendAlertsMutation.mutate()}
              disabled={sendAlertsMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-bold hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
            >
              {sendAlertsMutation.isPending ? (
                <div className="animate-spin w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send Alerts Now
            </button>
          </div>

          {/* Alert status table */}
          {alertsLoading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" />
            </div>
          ) : !alertStatusData?.workers?.length ? (
            <div className="text-center py-20 text-slate-500">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-semibold">No active permits</p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/50">
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Worker</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Permit</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Expiry</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Days</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Phone</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">TRC Filed</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Last Alert</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertStatusData.workers.map((w) => {
                      const days = w.expiry_date ? Math.ceil((new Date(w.expiry_date).getTime() - Date.now()) / 86_400_000) : null;
                      const zone = days === null ? "gray" : days < 0 ? "expired" : days < 30 ? "red" : days <= 60 ? "amber" : "green";
                      return (
                        <tr key={w.permit_id} className="border-b border-slate-800 hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-medium text-white">{w.worker_name}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs font-mono">{w.permit_type}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                            {w.expiry_date ? new Date(w.expiry_date).toLocaleDateString("en-GB") : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-bold font-mono text-xs ${
                              zone === "green" ? "text-emerald-400" : zone === "amber" ? "text-amber-400" : zone === "red" || zone === "expired" ? "text-red-400" : "text-slate-400"
                            }`}>
                              {days !== null ? (days < 0 ? `${Math.abs(days)}d over` : `${days}d`) : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {w.worker_phone ? (
                              <span className="flex items-center gap-1 text-xs text-emerald-400">
                                <Phone className="w-3 h-3" />{w.worker_phone}
                              </span>
                            ) : (
                              <span className="text-xs text-red-400">No phone</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {w.trc_application_submitted ? (
                              <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold">
                                <Shield className="w-3 h-3" />Protected
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">No</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                            {w.last_alert_at ? new Date(w.last_alert_at).toLocaleDateString("en-GB") : "Never"}
                          </td>
                          <td className="px-4 py-3">
                            {w.trc_application_submitted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                                <Shield className="w-2.5 h-2.5" />Exempt
                              </span>
                            ) : !w.last_alert_status ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/50 text-slate-400">Pending</span>
                            ) : w.last_alert_status === "sent" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                                <CheckCircle2 className="w-2.5 h-2.5" />Sent
                              </span>
                            ) : w.last_alert_status === "failed" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400">
                                <AlertTriangle className="w-2.5 h-2.5" />Failed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400">
                                <MessageSquare className="w-2.5 h-2.5" />{w.last_alert_status}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total", value: summary.total, color: "text-white", bg: "bg-slate-800" },
          { label: "GREEN (>60d)", value: summary.green, color: "text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
          { label: "AMBER (30-60d)", value: summary.amber, color: "text-amber-400", bg: "bg-amber-500/10 border border-amber-500/20" },
          { label: "RED (<30d)", value: summary.red, color: "text-red-400", bg: "bg-red-500/10 border border-red-500/20" },
          { label: "EXPIRED", value: summary.expired, color: "text-red-300", bg: "bg-red-900/20 border border-red-800/30" },
        ].map(c => (
          <div key={c.label} className={`rounded-xl p-4 ${c.bg}`}>
            <p className="text-xs text-gray-400 font-mono uppercase mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, ref, country..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]"
          >
            <option value="">All Types</option>
            {PERMIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]"
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          {(filterType || filterStatus || search) && (
            <button
              onClick={() => { setFilterType(""); setFilterStatus(""); setSearch(""); }}
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Stamp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No permits found</p>
          <p className="text-sm mt-1">Add immigration permits to start tracking</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Worker</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Permit Type</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Country</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Expiry</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Days Left</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Ref</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => openPanel(p.worker_id, p.worker_name_live || p.worker_name)}
                    className="border-b border-slate-800 hover:bg-slate-800/60 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-white">{p.worker_name_live || p.worker_name}</td>
                    <td className="px-4 py-3 text-slate-300">
                      <span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs font-mono">{p.permit_type}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{p.country}</td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                      {p.expiry_date ? new Date(p.expiry_date).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.days !== null ? (
                        <span className={`font-bold font-mono ${
                          p.zone === "green" ? "text-emerald-400" :
                          p.zone === "amber" ? "text-amber-400" :
                          p.zone === "red" || p.zone === "expired" ? "text-red-400" :
                          "text-slate-400"
                        }`}>
                          {p.days < 0 ? `${Math.abs(p.days)}d overdue` : `${p.days}d`}
                        </span>
                      ) : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-4 py-3"><ZoneBadge zone={p.zone} /></td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono truncate max-w-[120px]">{p.application_ref || "—"}</td>
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </>
      )}

      {/* Side Panel — Worker Permit History */}
      {selectedWorkerId && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedWorkerId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg bg-slate-900 border-l border-slate-700 h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedWorkerName}</h2>
                <p className="text-xs text-slate-400">Permit History</p>
              </div>
              <button onClick={() => setSelectedWorkerId(null)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {historyLoading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" />
                </div>
              ) : !historyData?.permits?.length ? (
                <p className="text-slate-500 text-center py-10">No permit records found</p>
              ) : (
                historyData.permits.map(h => {
                  const days = daysRemaining(h.expiry_date);
                  const zone = colourZone(days, h.status);
                  return (
                    <div key={h.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <span className="px-2 py-0.5 bg-slate-700 rounded text-xs font-mono font-bold text-white">{h.permit_type}</span>
                        <ZoneBadge zone={zone} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-slate-500">Country</p>
                          <p className="text-white font-medium">{h.country}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Status</p>
                          <p className="text-white font-medium capitalize">{h.status}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Issue Date</p>
                          <p className="text-white font-mono">{h.issue_date ? new Date(h.issue_date).toLocaleDateString("en-GB") : "—"}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Expiry Date</p>
                          <p className="text-white font-mono">{h.expiry_date ? new Date(h.expiry_date).toLocaleDateString("en-GB") : "—"}</p>
                        </div>
                        {h.application_ref && (
                          <div className="col-span-2">
                            <p className="text-slate-500">Application Ref</p>
                            <p className="text-white font-mono">{h.application_ref}</p>
                          </div>
                        )}
                        {h.notes && (
                          <div className="col-span-2">
                            <p className="text-slate-500">Notes</p>
                            <p className="text-slate-300">{h.notes}</p>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-600 mt-2 font-mono">
                        {days !== null && (days < 0 ? `${Math.abs(days)} days overdue` : `${days} days remaining`)}
                      </p>

                      {/* Predict button per permit */}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => runPrediction(h.id)}
                          disabled={predictMutation.isPending && predictingId === h.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-bold hover:bg-indigo-600/30 transition-colors disabled:opacity-50"
                        >
                          {predictMutation.isPending && predictingId === h.id ? (
                            <div className="animate-spin w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full" />
                          ) : (
                            <Brain className="w-3 h-3" />
                          )}
                          AI Predict
                        </button>
                        <button
                          onClick={() => renewalMutation.mutate(h.id)}
                          disabled={renewalMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C41E18]/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-bold hover:bg-[#C41E18]/30 transition-colors disabled:opacity-50"
                        >
                          <Play className="w-3 h-3" />
                          Start Renewal
                        </button>
                      </div>

                      {/* Prediction result */}
                      {prediction && predictingId === h.id && (
                        <div className="mt-3 bg-slate-900 border border-indigo-500/20 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Brain className="w-4 h-4 text-indigo-400" />
                            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">AI Renewal Prediction</p>
                          </div>

                          {prediction.trc_protection_status === "protected_trc_pending" ? (
                            <div className="flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-3">
                              <Shield className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-bold text-emerald-400">TRC Application Pending — Protected</p>
                                <p className="text-xs text-slate-300 mt-1">{prediction.summary}</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={`flex items-start gap-2 p-3 rounded-lg mb-3 ${
                                prediction.risk_level === "high" ? "bg-red-500/10 border border-red-500/20" :
                                prediction.risk_level === "medium" ? "bg-amber-500/10 border border-amber-500/20" :
                                "bg-emerald-500/10 border border-emerald-500/20"
                              }`}>
                                {prediction.risk_level === "high" ? <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" /> :
                                 prediction.risk_level === "medium" ? <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" /> :
                                 <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />}
                                <div>
                                  <p className={`text-xs font-bold ${
                                    prediction.risk_level === "high" ? "text-red-400" :
                                    prediction.risk_level === "medium" ? "text-amber-400" : "text-emerald-400"
                                  }`}>
                                    Risk: {prediction.risk_level.toUpperCase()}
                                  </p>
                                  <p className="text-xs text-slate-300 mt-1">{prediction.summary}</p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                <div>
                                  <p className="text-slate-500">Start By</p>
                                  <p className="text-white font-mono font-bold">
                                    {prediction.recommended_start_date ? new Date(prediction.recommended_start_date).toLocaleDateString("en-GB") : "ASAP"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-slate-500">Est. Processing</p>
                                  <p className="text-white font-mono font-bold">{prediction.processing_days_estimate} days</p>
                                </div>
                              </div>
                            </>
                          )}

                          {prediction.action_items?.length > 0 && (
                            <div>
                              <p className="text-xs text-slate-500 mb-1.5">Action Items</p>
                              <ul className="space-y-1">
                                {prediction.action_items.map((item: string, i: number) => (
                                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                                    <span className="text-indigo-400 mt-0.5">•</span>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
