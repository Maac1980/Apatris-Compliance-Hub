/**
 * SchengenTab — Mobile Schengen 90/180 day counter for workers.
 * Shows remaining days, Art. 108 exemption, and visual gauge.
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe, Shield, AlertTriangle, XOctagon, Loader2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

export function SchengenTab() {
  const [selectedId, setSelectedId] = useState("");

  const { data: workersData } = useQuery({
    queryKey: ["schengen-mobile-workers"],
    queryFn: async () => {
      const r = await fetch(`${API}/workers`, { headers: authHeaders() });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.workers ?? j ?? []).map((w: any) => ({
        id: w.id, name: w.name ?? w.full_name,
        trcExpiry: w.trcExpiry ?? w.trc_expiry,
        lastEntryDate: w.lastEntryDate ?? w.last_entry_date,
      }));
    },
  });

  const workers = (workersData ?? []) as any[];
  const selected = workers.find((w: any) => w.id === selectedId);
  const hasTRC = selected?.trcExpiry && new Date(selected.trcExpiry).getTime() > Date.now();

  const calc = useMemo(() => {
    if (!selected) return null;
    if (hasTRC) return { daysUsed: 0, daysRemaining: 90, exempt: true, status: "exempt" as const };

    const now = new Date();
    const windowStart = new Date(now.getTime() - 180 * 86_400_000);
    let daysInSchengen = 0;

    if (selected.lastEntryDate) {
      const entry = new Date(selected.lastEntryDate);
      if (entry >= windowStart) {
        daysInSchengen = Math.ceil((now.getTime() - entry.getTime()) / 86_400_000);
      }
    }

    const remaining = Math.max(0, 90 - daysInSchengen);
    const status = remaining <= 0 ? "overstay" as const : remaining <= 10 ? "critical" as const : remaining <= 15 ? "warning" as const : "ok" as const;
    return { daysUsed: daysInSchengen, daysRemaining: remaining, exempt: false, status };
  }, [selected, hasTRC]);

  const statusColor = !calc ? "text-slate-400" : calc.exempt ? "text-blue-400" : calc.status === "ok" ? "text-emerald-400" : calc.status === "warning" ? "text-amber-400" : "text-red-400";
  const barColor = !calc ? "bg-slate-500" : calc.exempt ? "bg-blue-500" : calc.status === "ok" ? "bg-emerald-500" : calc.status === "warning" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-20 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Schengen 90/180</h2>
      </div>

      {/* Worker selector */}
      <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
        className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-xs text-white mb-4 focus:outline-none">
        <option value="">Select worker...</option>
        {workers.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>

      {calc && (
        <div className="space-y-4">
          {/* TRC Exemption */}
          {calc.exempt && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-3">
              <Shield className="w-6 h-6 text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-blue-400">Art. 108 — Exempt</p>
                <p className="text-[10px] text-blue-300/70">Valid TRC — 90/180 rule does not apply</p>
              </div>
            </div>
          )}

          {/* Gauge */}
          <div className={`rounded-xl border p-5 ${calc.exempt ? "bg-blue-500/10 border-blue-500/20" : calc.status === "ok" ? "bg-emerald-500/10 border-emerald-500/20" : calc.status === "warning" ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20"}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Days Used / 90</span>
              <span className={`text-4xl font-black ${statusColor}`}>
                {calc.exempt ? "N/A" : calc.daysRemaining}
              </span>
            </div>
            {!calc.exempt && (
              <>
                <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, (calc.daysUsed / 90) * 100)}%` }} />
                </div>
                <p className="text-[10px] text-slate-400">
                  {calc.daysUsed} days used · {calc.daysRemaining} remaining
                </p>
                {calc.status === "overstay" && (
                  <p className="text-xs text-red-400 font-bold mt-2 flex items-center gap-1">
                    <XOctagon className="w-4 h-4" /> OVERSTAY — Immediate action required
                  </p>
                )}
                {calc.status === "critical" && (
                  <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Less than 10 days remaining
                  </p>
                )}
                {calc.status === "warning" && (
                  <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Less than 15 days remaining
                  </p>
                )}
              </>
            )}
          </div>

          {/* Worker info */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 space-y-1.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Worker Details</p>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Name</span>
              <span className="text-white font-medium">{selected?.name}</span>
            </div>
            {selected?.trcExpiry && (
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">TRC Expiry</span>
                <span className="text-white font-mono">{new Date(selected.trcExpiry).toLocaleDateString("en-GB")}</span>
              </div>
            )}
            {selected?.lastEntryDate && (
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Last Entry</span>
                <span className="text-white font-mono">{new Date(selected.lastEntryDate).toLocaleDateString("en-GB")}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedId && (
        <div className="text-center py-12 text-slate-600">
          <Globe className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Select a worker to view their Schengen day count</p>
        </div>
      )}
    </div>
  );
}
