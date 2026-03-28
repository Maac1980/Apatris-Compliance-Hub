import React, { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, History, BarChart3, Activity,
  ChevronDown, ChevronRight, Download, TrendingUp, Users,
  DollarSign, CheckCircle2, Clock, Mail, Phone, MessageSquare
} from "lucide-react";
import { format, parseISO } from "date-fns";

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "");

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

function api<T>(path: string): Promise<T> {
  return fetch(`${BASE}${path}`, { headers: authHeaders() }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<T>;
  });
}

function fmt(n: number | string) {
  return Number(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  try { return format(parseISO(iso), "dd MMM yyyy, HH:mm"); } catch { return iso; }
}

// ── Action badge colours ───────────────────────────────────────────────────────
const ACTION_STYLES: Record<string, string> = {
  PAYROLL_COMMIT:    "bg-green-600/20 text-green-300 border-green-500/30",
  ADMIN_LOGIN:       "bg-blue-600/20 text-blue-300 border-blue-500/30",
  UPDATE_WORKER:     "bg-yellow-600/20 text-yellow-300 border-yellow-500/30",
  CREATE_WORKER:     "bg-purple-600/20 text-purple-300 border-purple-500/30",
  DELETE_WORKER:     "bg-red-600/20 text-red-300 border-red-500/30",
  UPLOAD_DOCUMENT:   "bg-cyan-600/20 text-cyan-300 border-cyan-500/30",
  SEND_NOTIFICATION: "bg-orange-600/20 text-orange-300 border-orange-500/30",
  DOCUMENT_CHANGE:   "bg-pink-600/20 text-pink-300 border-pink-500/30",
};
function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_STYLES[action] ?? "bg-slate-600/20 text-slate-300 border-slate-500/30";
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${cls}`}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

// ── Channel badge ──────────────────────────────────────────────────────────────
function ChannelBadge({ channel }: { channel: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    payslip:   { cls: "bg-green-600/20 text-green-300 border-green-500/30",  icon: <Mail className="w-3 h-3" /> },
    email:     { cls: "bg-blue-600/20 text-blue-300 border-blue-500/30",     icon: <Mail className="w-3 h-3" /> },
    whatsapp:  { cls: "bg-emerald-600/20 text-emerald-300 border-emerald-500/30", icon: <Phone className="w-3 h-3" /> },
  };
  const { cls, icon } = map[channel] ?? { cls: "bg-slate-600/20 text-slate-300 border-slate-500/30", icon: null };
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${cls}`}>
      {icon}{channel.toUpperCase()}
    </span>
  );
}

// ── Tab component ─────────────────────────────────────────────────────────────
function Tab({ id, active, label, icon, onClick }: { id: string; active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold font-mono transition-all ${
        active ? "bg-red-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
      }`}
    >
      {icon}{label}
    </button>
  );
}

// ── PAYROLL TAB ────────────────────────────────────────────────────────────────
function PayrollTab() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["history-commits"],
    queryFn: () => api<{ commits: any[] }>("/api/history/commits"),
  });
  const { data: detail } = useQuery({
    queryKey: ["history-commit-detail", expanded],
    queryFn: () => api<{ commit: any; snapshots: any[] }>(`/api/history/commits/${expanded}`),
    enabled: expanded !== null,
  });

  function downloadCSV(commitId: number, month: string) {
    if (!detail?.snapshots) return;
    const bom = "\uFEFF";
    const header = "Pracownik;Budowa;Godziny;Stawka;Brutto;ZUS;Ubezp.;PIT;Zaliczka;Kary;Netto\n";
    const rows = detail.snapshots.map((s: any) =>
      [s.worker_name, s.site, s.hours, s.hourly_rate, s.gross, s.employee_zus, s.health_ins, s.est_pit, s.advance, s.penalties, s.netto].join(";")
    ).join("\n");
    const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `Payroll_${month}.csv`; document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(a.href), 100);
  }

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!data?.commits?.length) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <History className="w-12 h-12 text-gray-600" />
      <p className="text-gray-500 font-mono text-sm">No payroll commits yet. Data appears here after the first month is closed.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {data.commits.map((c: any) => {
        const isOpen = expanded === c.id;
        return (
          <div key={c.id} className="glass-panel rounded-xl tech-border overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : c.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-600/20 border border-green-500/30 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green-400" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-white text-sm font-mono">{c.month}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">Committed by {c.committed_by} · {fmtDate(c.committed_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Workers</p>
                  <p className="text-white font-bold font-mono">{c.worker_count}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Gross</p>
                  <p className="text-white font-bold font-mono">{fmt(c.total_gross)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Netto</p>
                  <p className="text-green-400 font-bold font-mono text-lg">{fmt(c.total_netto)}</p>
                </div>
                {c.payslips_sent > 0 && (
                  <span className="text-[10px] font-mono text-blue-300 bg-blue-600/20 border border-blue-500/30 rounded px-2 py-0.5 hidden md:flex items-center gap-1">
                    <Mail className="w-3 h-3" />{c.payslips_sent} sent
                  </span>
                )}
                {isOpen ? <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-white/10">
                {!detail ? (
                  <div className="p-6 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-4 py-2 bg-white/3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 font-mono">{detail.snapshots.length} worker snapshots</span>
                      <button
                        onClick={() => downloadCSV(c.id, c.month)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-500 text-xs font-bold text-gray-300 transition-colors"
                      >
                        <Download className="w-3 h-3" /> Export CSV
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left" style={{ minWidth: "700px" }}>
                        <thead>
                          <tr className="border-b border-white/5">
                            {["Worker", "Site", "Hours", "Rate", "Gross", "ZUS", "Health", "PIT", "Advance", "Penalties", "Net Pay"].map((h) => (
                              <th key={h} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 font-mono">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.snapshots.map((s: any, i: number) => (
                            <tr key={i} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                              <td className="px-3 py-2 text-sm font-medium text-white">{s.worker_name}</td>
                              <td className="px-3 py-2 text-xs text-red-400 font-mono">{s.site || "—"}</td>
                              <td className="px-3 py-2 text-xs text-gray-300 font-mono">{Number(s.hours).toFixed(1)}</td>
                              <td className="px-3 py-2 text-xs text-gray-300 font-mono">{fmt(s.hourly_rate)}</td>
                              <td className="px-3 py-2 text-xs text-white font-mono">{fmt(s.gross)}</td>
                              <td className="px-3 py-2 text-xs text-orange-400 font-mono">{fmt(s.employee_zus)}</td>
                              <td className="px-3 py-2 text-xs text-orange-400 font-mono">{fmt(s.health_ins)}</td>
                              <td className="px-3 py-2 text-xs text-orange-400 font-mono">{fmt(s.est_pit)}</td>
                              <td className="px-3 py-2 text-xs text-yellow-400 font-mono">{fmt(s.advance)}</td>
                              <td className="px-3 py-2 text-xs text-red-400 font-mono">{fmt(s.penalties)}</td>
                              <td className="px-3 py-2 text-sm font-bold text-green-400 font-mono">{fmt(s.netto)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── ANALYTICS TAB ─────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["history-analytics"],
    queryFn: () => api<{ monthly: any[]; topWorkers: any[]; actionBreakdown: any[] }>("/api/history/analytics"),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;

  const monthly = data?.monthly ?? [];
  const maxGross = Math.max(...monthly.map((m: any) => Number(m.total_gross)), 1);
  const topWorkers = data?.topWorkers ?? [];
  const maxEarned = Math.max(...topWorkers.map((w: any) => Number(w.total_gross)), 1);
  const actions = data?.actionBreakdown ?? [];
  const maxAction = Math.max(...actions.map((a: any) => Number(a.count)), 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Gross (all time)", value: `${fmt(monthly.reduce((s: number, m: any) => s + Number(m.total_gross), 0))} PLN`, icon: <DollarSign className="w-5 h-5 text-white" />, color: "bg-green-600/20 border-green-500/30" },
          { label: "Total Netto (all time)", value: `${fmt(monthly.reduce((s: number, m: any) => s + Number(m.total_netto), 0))} PLN`, icon: <TrendingUp className="w-5 h-5 text-white" />, color: "bg-blue-600/20 border-blue-500/30" },
          { label: "Total Commits", value: String(monthly.reduce((s: number, m: any) => s + Number(m.commit_count), 0)), icon: <CheckCircle2 className="w-5 h-5 text-white" />, color: "bg-purple-600/20 border-purple-500/30" },
          { label: "Months Tracked", value: String(monthly.length), icon: <Clock className="w-5 h-5 text-white" />, color: "bg-orange-600/20 border-orange-500/30" },
        ].map((card) => (
          <div key={card.label} className={`glass-panel rounded-xl p-4 border ${card.color}`}>
            <div className="flex items-center gap-2 mb-2">{card.icon}<span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 font-mono">{card.label}</span></div>
            <p className="text-xl font-bold text-white font-mono">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly trend */}
      <div className="glass-panel rounded-xl p-5 tech-border">
        <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 font-mono mb-4">Monthly Payout Trend</p>
        {monthly.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <BarChart3 className="w-8 h-8 text-gray-700" />
            <p className="text-xs font-mono text-gray-600">Payroll trend appears after first month is committed.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {monthly.map((m: any) => {
                const g = Number(m.total_gross);
                const n = Number(m.total_netto);
                return (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-400 w-16 flex-shrink-0">{m.month}</span>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="bg-white/10 rounded-full flex-1 h-2 overflow-hidden">
                          <div className="h-full bg-white/40 rounded-full" style={{ width: `${(g / maxGross) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-gray-400 w-28 text-right">{fmt(g)} PLN</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="bg-green-950/40 rounded-full flex-1 h-2 overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${(n / maxGross) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-green-400 w-28 text-right">{fmt(n)} PLN</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-gray-500 w-16 text-right flex-shrink-0">{m.worker_count} workers</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400"><span className="w-3 h-2 rounded bg-white/40" /> Gross</span>
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400"><span className="w-3 h-2 rounded bg-green-500" /> Netto</span>
            </div>
          </>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Top earners */}
        <div className="glass-panel rounded-xl p-5 tech-border">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 font-mono mb-4">Top 10 Earners (all time)</p>
          {topWorkers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 gap-2">
              <Users className="w-8 h-8 text-gray-700" />
              <p className="text-xs font-mono text-gray-600">Appears after first payroll commit.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {topWorkers.map((w: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-gray-600 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{w.worker_name}</p>
                    <p className="text-[10px] font-mono text-red-400">{w.site || "—"} · {w.months}mo</p>
                  </div>
                  <div className="text-right">
                    <div className="bg-white/5 rounded-full w-24 h-1.5 mb-1 overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${(Number(w.total_gross) / maxEarned) * 100}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-green-400">{fmt(w.total_gross)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action breakdown — always visible */}
        <div className="glass-panel rounded-xl p-5 tech-border">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 font-mono mb-4">Activity Breakdown</p>
          {actions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 gap-2">
              <Activity className="w-8 h-8 text-gray-700" />
              <p className="text-xs font-mono text-gray-600">No activity recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {actions.map((a: any) => (
                <div key={a.action} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <ActionBadge action={a.action} />
                  </div>
                  <div className="w-24 bg-white/5 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${(Number(a.count) / maxAction) * 100}%` }} />
                  </div>
                  <span className="text-xs font-bold font-mono text-white w-8 text-right">{a.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ACTIVITY TAB ───────────────────────────────────────────────────────────────
function ActivityTab() {
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["history-audit", action, actor],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "200" });
      if (action) params.set("action", action);
      if (actor) params.set("actor", actor);
      return api<{ entries: any[] }>(`/api/history/audit?${params}`);
    },
  });

  const entries = data?.entries ?? [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={action} onChange={(e) => setAction(e.target.value)}
          className="bg-slate-800 border border-white/10 text-gray-300 text-xs font-mono rounded-lg px-3 py-2 focus:outline-none focus:border-red-500"
        >
          <option value="">All actions</option>
          {["PAYROLL_COMMIT","ADMIN_LOGIN","UPDATE_WORKER","CREATE_WORKER","DELETE_WORKER","UPLOAD_DOCUMENT","SEND_NOTIFICATION","DOCUMENT_CHANGE"].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          value={actor} onChange={(e) => setActor(e.target.value)}
          placeholder="Filter by actor…"
          className="bg-slate-800 border border-white/10 text-gray-300 text-xs font-mono rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 w-48"
        />
        <button onClick={() => refetch()} className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-500 text-xs font-bold text-gray-300 transition-colors">Refresh</button>
        <span className="text-xs font-mono text-gray-500 ml-auto">{entries.length} entries</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : !entries.length ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Activity className="w-12 h-12 text-gray-600" />
          <p className="text-gray-500 font-mono text-sm">No activity logged yet.</p>
        </div>
      ) : (
        <div className="glass-panel rounded-xl tech-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ minWidth: "600px" }}>
              <thead>
                <tr className="border-b border-white/10">
                  {["Time", "Action", "Actor", "Worker", "Note"].map((h) => (
                    <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 font-mono">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any) => (
                  <tr key={e.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-2.5 text-[11px] font-mono text-gray-400 whitespace-nowrap">{fmtDate(e.timestamp)}</td>
                    <td className="px-4 py-2.5"><ActionBadge action={e.action} /></td>
                    <td className="px-4 py-2.5 text-xs font-mono text-white">{e.actor || "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-300 max-w-[160px] truncate">{e.workerName || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[200px] truncate">{e.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MESSAGES TAB ───────────────────────────────────────────────────────────────
function MessagesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["history-notifications"],
    queryFn: () => api<{ notifications: any[] }>("/api/history/notifications"),
  });
  const notifications = data?.notifications ?? [];

  const payslips   = notifications.filter((n: any) => n.channel === "payslip").length;
  const whatsapps  = notifications.filter((n: any) => n.channel === "whatsapp").length;
  const emails     = notifications.filter((n: any) => n.channel === "email").length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Payslips Sent", value: payslips, icon: <Mail className="w-4 h-4 text-green-400" />, cls: "border-green-500/20" },
          { label: "WhatsApp Msgs", value: whatsapps, icon: <Phone className="w-4 h-4 text-emerald-400" />, cls: "border-emerald-500/20" },
          { label: "Emails Sent", value: emails, icon: <Mail className="w-4 h-4 text-blue-400" />, cls: "border-blue-500/20" },
        ].map((s) => (
          <div key={s.label} className={`glass-panel rounded-xl p-4 border ${s.cls} flex items-center gap-3`}>
            {s.icon}
            <div><p className="text-xl font-bold text-white font-mono">{s.value}</p><p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{s.label}</p></div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : !notifications.length ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <MessageSquare className="w-12 h-12 text-gray-600" />
          <p className="text-gray-500 font-mono text-sm">No messages logged yet. Payslip emails appear here automatically after each payroll commit.</p>
        </div>
      ) : (
        <div className="glass-panel rounded-xl tech-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ minWidth: "580px" }}>
              <thead>
                <tr className="border-b border-white/10">
                  {["Time", "Channel", "Worker", "Recipient", "Sent By", "Preview"].map((h) => (
                    <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 font-mono">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notifications.map((n: any) => (
                  <tr key={n.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-2.5 text-[11px] font-mono text-gray-400 whitespace-nowrap">{fmtDate(n.sent_at)}</td>
                    <td className="px-4 py-2.5"><ChannelBadge channel={n.channel} /></td>
                    <td className="px-4 py-2.5 text-xs font-mono text-white max-w-[140px] truncate">{n.worker_name || "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-300 max-w-[160px] truncate">{n.recipient || "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-400">{n.sent_by || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[200px] truncate">{n.message_preview || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"payroll" | "analytics" | "activity" | "messages">("payroll");

  return (
    <div className="app-shell-page h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => setLocation("/")}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-300" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center">
              <History className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white font-mono">History & Analytics</h1>
              <p className="text-[10px] text-gray-500 font-mono">Permanent record of all payroll, activity & communications</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto max-w-6xl mx-auto px-4 py-6 space-y-6 w-full">
        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 p-1 bg-slate-900/60 rounded-xl border border-white/5 w-fit">
          <Tab id="payroll"   active={tab==="payroll"}   label="Payroll"   icon={<DollarSign className="w-4 h-4" />}     onClick={() => setTab("payroll")} />
          <Tab id="analytics" active={tab==="analytics"} label="Analytics" icon={<BarChart3 className="w-4 h-4" />}      onClick={() => setTab("analytics")} />
          <Tab id="activity"  active={tab==="activity"}  label="Activity"  icon={<Activity className="w-4 h-4" />}       onClick={() => setTab("activity")} />
          <Tab id="messages"  active={tab==="messages"}  label="Messages"  icon={<MessageSquare className="w-4 h-4" />}  onClick={() => setTab("messages")} />
        </div>

        {tab === "payroll"   && <PayrollTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "activity"  && <ActivityTab />}
        {tab === "messages"  && <MessagesTab />}
      </main>
    </div>
  );
}
