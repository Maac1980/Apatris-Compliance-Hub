import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Stamp, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

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
}

function daysRemaining(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
}

type Zone = "green" | "amber" | "red" | "expired" | "gray";

function zone(days: number | null, status: string): Zone {
  if (status === "expired") return "expired";
  if (days === null) return "gray";
  if (days < 0) return "expired";
  if (days < 30) return "red";
  if (days <= 60) return "amber";
  return "green";
}

const ZONE_STYLE: Record<Zone, { dot: string; text: string; label: string }> = {
  green:   { dot: "bg-emerald-400", text: "text-emerald-400", label: "GREEN" },
  amber:   { dot: "bg-amber-400",   text: "text-amber-400",   label: "AMBER" },
  red:     { dot: "bg-red-400",     text: "text-red-400",     label: "RED" },
  expired: { dot: "bg-red-600",     text: "text-red-300",     label: "EXPIRED" },
  gray:    { dot: "bg-slate-500",   text: "text-slate-400",   label: "N/A" },
};

const PERMIT_TYPES = ["TRC", "Work Permit", "Visa", "A1", "Passport"];

export function ImmigrationTab() {
  const [filter, setFilter] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["immigration-permits"],
    queryFn: async () => {
      const res = await fetch(`${API}api/immigration`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ permits: Permit[] }>;
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["immigration-history", selectedWorkerId],
    queryFn: async () => {
      const res = await fetch(`${API}api/immigration/worker/${selectedWorkerId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ permits: Permit[] }>;
    },
    enabled: !!selectedWorkerId,
  });

  const enriched = useMemo(() =>
    (data?.permits ?? []).map(p => {
      const days = daysRemaining(p.expiry_date);
      return { ...p, days, zone: zone(days, p.status) };
    }),
  [data]);

  const filtered = useMemo(() => {
    if (!filter) return enriched;
    return enriched.filter(p => p.permit_type === filter);
  }, [enriched, filter]);

  const counts = useMemo(() => {
    const c = { green: 0, amber: 0, red: 0, expired: 0 };
    for (const p of enriched) {
      if (p.zone in c) c[p.zone as keyof typeof c]++;
    }
    return c;
  }, [enriched]);

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Stamp className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Immigration Permits</h2>
      </div>

      {/* Summary pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {([
          { label: "Green", count: counts.green, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
          { label: "Amber", count: counts.amber, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
          { label: "Red", count: counts.red, color: "text-red-400 bg-red-500/10 border-red-500/20" },
          { label: "Expired", count: counts.expired, color: "text-red-300 bg-red-900/20 border-red-800/30" },
        ]).map(s => (
          <div key={s.label} className={cn("flex-shrink-0 px-3 py-2 rounded-xl border text-center min-w-[70px]", s.color)}>
            <p className="text-lg font-black leading-none">{s.count}</p>
            <p className="text-[9px] uppercase tracking-wider font-bold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setFilter("")}
          className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-colors flex-shrink-0",
            !filter ? "bg-white/10 text-white border-white/20" : "text-white/40 border-white/10"
          )}
        >All</button>
        {PERMIT_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-colors flex-shrink-0",
              filter === t ? "bg-white/10 text-white border-white/20" : "text-white/40 border-white/10"
            )}
          >{t}</button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <Stamp className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold">No permits found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const s = ZONE_STYLE[p.zone];
            return (
              <button
                key={p.id}
                onClick={() => { setSelectedWorkerId(p.worker_id); setSelectedName(p.worker_name_live || p.worker_name); }}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform text-left"
              >
                <div className={cn("w-2 h-2 rounded-full flex-shrink-0", s.dot)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{p.worker_name_live || p.worker_name}</p>
                  <p className="text-[11px] text-white/40 font-mono">{p.permit_type} &middot; {p.country}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={cn("text-sm font-black font-mono", s.text)}>
                    {p.days !== null ? (p.days < 0 ? `${Math.abs(p.days)}d over` : `${p.days}d`) : "—"}
                  </p>
                  <p className="text-[9px] text-white/30 uppercase tracking-wider font-bold">{s.label}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Side panel */}
      {selectedWorkerId && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#0c0c0e]/95 backdrop-blur-sm" onClick={() => setSelectedWorkerId(null)}>
          <div className="flex-1 overflow-y-auto pt-4 px-4 pb-24" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">{selectedName}</h3>
                <p className="text-[11px] text-white/40">Permit History</p>
              </div>
              <button onClick={() => setSelectedWorkerId(null)} className="p-2 rounded-xl bg-white/5 active:bg-white/10">
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>

            {historyLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" />
              </div>
            ) : !historyData?.permits?.length ? (
              <p className="text-center text-white/30 py-12 text-sm">No records</p>
            ) : (
              <div className="space-y-3">
                {historyData.permits.map(h => {
                  const days = daysRemaining(h.expiry_date);
                  const z = zone(days, h.status);
                  const st = ZONE_STYLE[z];
                  return (
                    <div key={h.id} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2 py-0.5 bg-white/10 rounded text-xs font-mono font-bold text-white">{h.permit_type}</span>
                        <span className={cn("flex items-center gap-1.5 text-[10px] font-bold", st.text)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", st.dot)} />
                          {st.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><p className="text-white/30">Country</p><p className="text-white font-medium">{h.country}</p></div>
                        <div><p className="text-white/30">Status</p><p className="text-white font-medium capitalize">{h.status}</p></div>
                        <div><p className="text-white/30">Issued</p><p className="text-white font-mono">{h.issue_date ? new Date(h.issue_date).toLocaleDateString("en-GB") : "—"}</p></div>
                        <div><p className="text-white/30">Expires</p><p className="text-white font-mono">{h.expiry_date ? new Date(h.expiry_date).toLocaleDateString("en-GB") : "—"}</p></div>
                        {h.application_ref && <div className="col-span-2"><p className="text-white/30">Ref</p><p className="text-white font-mono">{h.application_ref}</p></div>}
                        {h.notes && <div className="col-span-2"><p className="text-white/30">Notes</p><p className="text-white/70">{h.notes}</p></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
