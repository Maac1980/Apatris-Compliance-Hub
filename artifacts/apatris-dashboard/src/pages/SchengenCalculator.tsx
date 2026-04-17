/**
 * Schengen 90/180 Calculator — visual day counter for border compliance.
 * Art. 108 aware: if TRC pending, 90/180 doesn't apply.
 */

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  ArrowLeft, Globe, AlertTriangle, CheckCircle2, XOctagon, Plus, Trash2, Shield,
} from "lucide-react";

interface BorderCrossing {
  id: string;
  type: "entry" | "exit";
  date: string;
}

export default function SchengenCalculator() {
  const [crossings, setCrossings] = useState<BorderCrossing[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");

  // Fetch workers
  const { data: workersData } = useQuery({
    queryKey: ["schengen-workers"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || "Failed to load data"); }
      const j = await r.json();
      return (j.workers ?? j ?? []).map((w: any) => ({
        id: w.id, name: w.name ?? w.full_name,
        trcExpiry: w.trcExpiry ?? w.trc_expiry,
        lastEntryDate: w.lastEntryDate ?? w.last_entry_date,
      }));
    },
  });

  const workers = (workersData ?? []) as any[];
  const selectedWorker = workers.find((w: any) => w.id === selectedWorkerId);
  const hasTRC = selectedWorker?.trcExpiry && new Date(selectedWorker.trcExpiry).getTime() > Date.now();

  // Calculate 90/180
  const calculation = useMemo(() => {
    if (hasTRC) return { daysUsed: 0, daysRemaining: 90, exempt: true, latestExitDate: null, status: "exempt" as const };

    const now = new Date();
    const windowStart = new Date(now.getTime() - 180 * 86_400_000);

    // Sort crossings by date
    const sorted = [...crossings].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate days in Schengen within the 180-day window
    let daysInSchengen = 0;
    let inSchengen = false;
    let lastEntry: Date | null = null;

    for (const c of sorted) {
      const d = new Date(c.date);
      if (d < windowStart) continue;

      if (c.type === "entry") {
        inSchengen = true;
        lastEntry = d;
      } else if (c.type === "exit" && lastEntry) {
        daysInSchengen += Math.ceil((d.getTime() - lastEntry.getTime()) / 86_400_000);
        inSchengen = false;
        lastEntry = null;
      }
    }

    // If still in Schengen, count days until now
    if (inSchengen && lastEntry) {
      daysInSchengen += Math.ceil((now.getTime() - lastEntry.getTime()) / 86_400_000);
    }

    // If no crossings but worker has last_entry_date, use that
    if (crossings.length === 0 && selectedWorker?.lastEntryDate) {
      const entry = new Date(selectedWorker.lastEntryDate);
      if (entry >= windowStart) {
        daysInSchengen = Math.ceil((now.getTime() - entry.getTime()) / 86_400_000);
        inSchengen = true;
      }
    }

    const remaining = Math.max(0, 90 - daysInSchengen);
    const latestExitDate = remaining > 0 ? new Date(now.getTime() + remaining * 86_400_000).toISOString().slice(0, 10) : null;
    const status = remaining <= 0 ? "overstay" as const : remaining <= 10 ? "critical" as const : remaining <= 15 ? "warning" as const : "ok" as const;

    return { daysUsed: daysInSchengen, daysRemaining: remaining, exempt: false, latestExitDate, status };
  }, [crossings, hasTRC, selectedWorker]);

  const addCrossing = (type: "entry" | "exit") => {
    setCrossings(prev => [...prev, { id: crypto.randomUUID(), type, date: new Date().toISOString().slice(0, 10) }]);
  };

  const updateCrossing = (id: string, date: string) => {
    setCrossings(prev => prev.map(c => c.id === id ? { ...c, date } : c));
  };

  const removeCrossing = (id: string) => {
    setCrossings(prev => prev.filter(c => c.id !== id));
  };

  const statusColor = calculation.exempt ? "text-blue-400" : calculation.status === "ok" ? "text-emerald-400" : calculation.status === "warning" ? "text-amber-400" : "text-red-400";
  const statusBg = calculation.exempt ? "bg-blue-500/10 border-blue-500/20" : calculation.status === "ok" ? "bg-emerald-500/10 border-emerald-500/20" : calculation.status === "warning" ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20";
  const barColor = calculation.exempt ? "bg-blue-500" : calculation.status === "ok" ? "bg-emerald-500" : calculation.status === "warning" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <a href="/legal-immigration" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </a>
        <Globe className="w-7 h-7 text-[#C41E18]" />
        <div>
          <h1 className="text-2xl font-bold text-white">Schengen 90/180 Calculator</h1>
          <p className="text-sm text-slate-400">Track Schengen days for border compliance</p>
        </div>
      </div>

      {/* Worker selector */}
      <div className="mb-6">
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Select Worker</label>
        <select
          value={selectedWorkerId}
          onChange={e => { setSelectedWorkerId(e.target.value); setCrossings([]); }}
          className="w-full max-w-md px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"
        >
          <option value="">— Select a worker —</option>
          {workers.map((w: any) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      {selectedWorkerId && (
        <div className="max-w-xl space-y-4">
          {/* TRC Exemption */}
          {hasTRC && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-3">
              <Shield className="w-6 h-6 text-blue-400" />
              <div>
                <p className="text-sm font-bold text-blue-400">Art. 108 — 90/180 Rule Does Not Apply</p>
                <p className="text-[10px] text-blue-300/70">This worker has a valid TRC (expires {new Date(selectedWorker.trcExpiry).toLocaleDateString("en-GB")}). The 90/180 Schengen limit does not apply while TRC is valid or application is pending.</p>
              </div>
            </div>
          )}

          {/* Main gauge */}
          <div className={`rounded-xl border p-5 ${statusBg}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Days Used / 90</span>
              <span className={`text-3xl font-black ${statusColor}`}>
                {calculation.exempt ? "EXEMPT" : calculation.daysRemaining}
              </span>
            </div>
            {!calculation.exempt && (
              <>
                <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, (calculation.daysUsed / 90) * 100)}%` }} />
                </div>
                <p className="text-[10px] text-slate-400">
                  {calculation.daysUsed} days used · {calculation.daysRemaining} days remaining
                  {calculation.latestExitDate && ` · Must exit by ${calculation.latestExitDate}`}
                </p>
                {calculation.status === "overstay" && (
                  <p className="text-xs text-red-400 font-bold mt-2 flex items-center gap-1">
                    <XOctagon className="w-4 h-4" /> OVERSTAY — 90 days exceeded. Immediate action required.
                  </p>
                )}
                {calculation.status === "critical" && (
                  <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> CRITICAL — Less than 10 days remaining. File MOS application immediately.
                  </p>
                )}
                {calculation.status === "warning" && (
                  <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> WARNING — Less than 15 days remaining. Plan accordingly.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Border crossings */}
          {!calculation.exempt && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Border Crossings</p>
                <div className="flex gap-1">
                  <button onClick={() => addCrossing("entry")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/30 transition-colors">
                    <Plus className="w-3 h-3" /> Entry
                  </button>
                  <button onClick={() => addCrossing("exit")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/30 transition-colors">
                    <Plus className="w-3 h-3" /> Exit
                  </button>
                </div>
              </div>
              {crossings.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-4">
                  {selectedWorker?.lastEntryDate ? `Using last entry date: ${new Date(selectedWorker.lastEntryDate).toLocaleDateString("en-GB")}` : "Add border crossing dates to calculate"}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {[...crossings].sort((a, b) => a.date.localeCompare(b.date)).map(c => (
                    <div key={c.id} className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${c.type === "entry" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                        {c.type}
                      </span>
                      <input
                        type="date"
                        value={c.date}
                        onChange={e => updateCrossing(c.id, e.target.value)}
                        className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                      />
                      <button onClick={() => removeCrossing(c.id)} className="p-1 text-slate-600 hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
