import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  ArrowLeft, Calculator, CheckCircle2, Loader2, AlertTriangle,
  ChevronDown, Calendar, DollarSign, Users, TrendingDown, FileCheck
} from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PayrollWorker {
  id: string;
  name: string;
  specialization: string;
  assignedSite: string | null;
  hourlyRate: number;
  monthlyHours: number;
  advance: number;
  penalties: number;
  grossPayout: number;
  finalNetto: number;
  complianceStatus: string;
}

interface CommitResult {
  success: boolean;
  monthYear: string;
  workersProcessed: number;
  snapshotsSaved: number;
  totalNettoPayout: number;
}

function fmt(n: number) {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function NumCell({
  value,
  workerId,
  field,
  onSave,
  accent,
}: {
  value: number;
  workerId: string;
  field: "hourlyRate" | "monthlyHours" | "advance" | "penalties";
  onSave: (id: string, field: string, val: number) => void;
  accent?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(String(value)); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (!isNaN(n) && n !== value) onSave(workerId, field, n);
    else setDraft(String(value));
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        step="0.01"
        min="0"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(String(value)); } }}
        className="w-full bg-slate-700 border border-red-500/60 text-white rounded px-2 py-1 text-sm font-mono focus:outline-none text-right"
        style={{ maxWidth: "90px" }}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`text-sm font-mono font-semibold text-right w-full transition-colors px-2 py-1 rounded hover:bg-white/5 ${accent ?? "text-gray-200"}`}
    >
      {fmt(value)}
    </button>
  );
}

export default function PayrollPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "Admin";

  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(format(today, "yyyy-MM"));
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);

  // Local state for dirty edits before they're flushed to the API
  const [pending, setPending] = useState<Record<string, Record<string, number>>>({});

  const { data, isLoading, refetch } = useQuery<{ workers: PayrollWorker[] }>({
    queryKey: ["payroll-current"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/payroll/current`);
      if (!res.ok) throw new Error("Failed to load payroll data");
      return res.json();
    },
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, field, val }: { id: string; field: string; val: number }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/payroll/workers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: val }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return { id, field, val };
    },
    onSuccess: ({ id, field, val }) => {
      setPending((p) => {
        const next = { ...p };
        if (!next[id]) next[id] = {};
        next[id][field] = val;
        return next;
      });
    },
  });

  const handleSave = (id: string, field: string, val: number) => {
    saveMutation.mutate({ id, field, val });
  };

  const commitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/payroll/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthYear: selectedMonth, committedBy: user?.name || "Admin" }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Commit failed"); }
      return res.json() as Promise<CommitResult>;
    },
    onSuccess: (result) => {
      setCommitResult(result);
      setPending({});
      queryClient.invalidateQueries({ queryKey: ["payroll-current"] });
      refetch();
    },
  });

  // Merge API data with any pending local changes
  const workers: PayrollWorker[] = useMemo(() => {
    if (!data?.workers) return [];
    return data.workers.map((w) => {
      const p = pending[w.id] ?? {};
      const hourlyRate = p.hourlyRate ?? w.hourlyRate;
      const monthlyHours = p.monthlyHours ?? w.monthlyHours;
      const advance = p.advance ?? w.advance;
      const penalties = p.penalties ?? w.penalties;
      const grossPayout = hourlyRate * monthlyHours;
      const finalNetto = grossPayout - advance - penalties;
      return { ...w, hourlyRate, monthlyHours, advance, penalties, grossPayout, finalNetto };
    });
  }, [data, pending]);

  const totals = useMemo(() => ({
    hours: workers.reduce((s, w) => s + w.monthlyHours, 0),
    gross: workers.reduce((s, w) => s + w.grossPayout, 0),
    advances: workers.reduce((s, w) => s + w.advance, 0),
    penalties: workers.reduce((s, w) => s + w.penalties, 0),
    netto: workers.reduce((s, w) => s + w.finalNetto, 0),
  }), [workers]);

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(196, 30, 24);
    doc.text("APATRIS SP. Z O.O. — PAYROLL SUMMARY", 14, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${selectedMonth}  |  Generated: ${format(new Date(), "dd.MM.yyyy HH:mm")}  |  By: ${user?.name}`, 14, 26);

    autoTable(doc, {
      startY: 32,
      head: [["Worker", "Spec", "Site", "Rate (PLN/h)", "Hours", "Gross (PLN)", "Advances", "Penalties", "Final Netto (PLN)"]],
      body: workers.map((w) => [
        w.name, w.specialization || "—", w.assignedSite || "—",
        fmt(w.hourlyRate), String(w.monthlyHours),
        fmt(w.grossPayout), fmt(w.advance), fmt(w.penalties), fmt(w.finalNetto),
      ]),
      foot: [["TOTALS", "", "", "", fmt(totals.hours), fmt(totals.gross), fmt(totals.advances), fmt(totals.penalties), fmt(totals.netto)]],
      headStyles: { fillColor: [196, 30, 24], textColor: 255, fontStyle: "bold", fontSize: 8 },
      footStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { cellPadding: 2.5 },
      columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right", fontStyle: "bold" } },
    });

    doc.save(`apatris-payroll-${selectedMonth}.pdf`);
  };

  const thCls = "px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 text-left whitespace-nowrap";
  const tdCls = "px-3 py-2 align-middle";

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="h-16 border-b border-slate-700 bg-slate-900/95 sticky top-0 z-30 px-6 flex items-center justify-between"
        style={{ boxShadow: "0 1px 0 rgba(196,30,24,0.08), 0 4px 20px rgba(0,0,0,0.3)" }}>
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-mono">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </button>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-2.5">
            <Calculator className="w-5 h-5 text-red-500" />
            <div>
              <h1 className="text-base font-bold tracking-wide text-white leading-none">Monthly Payroll Run</h1>
              <p className="text-[10px] text-red-400 font-mono uppercase tracking-widest">Rozliczenie Miesięczne</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-red-500/60"
            />
          </div>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-3 py-1.5 border border-slate-600 text-gray-300 hover:bg-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
          >
            <FileCheck className="w-3.5 h-3.5" /> Export PDF
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Active Workers", value: workers.length.toString(), icon: Users, color: "text-blue-400" },
            { label: "Total Hours", value: fmt(totals.hours), icon: Calculator, color: "text-purple-400" },
            { label: "Gross Payroll", value: `${fmt(totals.gross)} PLN`, icon: DollarSign, color: "text-blue-400" },
            { label: "Deductions", value: `${fmt(totals.advances + totals.penalties)} PLN`, icon: TrendingDown, color: "text-orange-400" },
            { label: "Total Netto", value: `${fmt(totals.netto)} PLN`, icon: CheckCircle2, color: "text-green-400" },
          ].map((c) => (
            <div key={c.label} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <c.icon className={`w-4 h-4 ${c.color}`} />
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{c.label}</p>
              </div>
              <p className={`text-xl font-mono font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Coordinator notice */}
        {!isAdmin && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-950/40 border border-blue-500/30 rounded-xl text-sm text-blue-300 font-mono">
            <span className="text-blue-400 font-bold uppercase tracking-widest text-[10px]">Coordinator View</span>
            <span className="text-white/20">|</span>
            You can update worker hours by clicking the yellow Hours cell. Rate, advances, penalties and payroll close are Admin-only.
          </div>
        )}

        {/* Payroll Grid */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
              {isAdmin ? "Payroll Grid — Click any value cell to edit inline" : "Hours Grid — Click the Hours cell to update"}
            </p>
            {saveMutation.isPending && (
              <span className="flex items-center gap-1.5 text-xs text-yellow-400 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: "900px" }}>
              <thead className="bg-slate-900/60 border-b border-slate-700">
                <tr>
                  <th className={thCls}>Worker</th>
                  <th className={thCls}>Spec / Site</th>
                  <th className={`${thCls} text-right`}>
                    {isAdmin ? "Rate (PLN/h)" : <span className="text-gray-600">Rate</span>}
                  </th>
                  <th className={`${thCls} text-right`}>
                    <span className="text-yellow-400">Hours ✎</span>
                  </th>
                  <th className={`${thCls} text-right`}>
                    {isAdmin ? "Gross (PLN)" : <span className="text-gray-600">Gross</span>}
                  </th>
                  <th className={`${thCls} text-right`}>
                    {isAdmin ? <span className="text-orange-400">Advances ✎</span> : <span className="text-gray-600">Advances</span>}
                  </th>
                  <th className={`${thCls} text-right`}>
                    {isAdmin ? <span className="text-red-400">Penalties ✎</span> : <span className="text-gray-600">Penalties</span>}
                  </th>
                  <th className={`${thCls} text-right`}>
                    <span className="text-green-400">Final Netto</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-4 py-4">
                        <div className="h-4 bg-white/5 rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : workers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500 font-mono text-sm">No workers found</td>
                  </tr>
                ) : (
                  workers.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-700/30 transition-colors group">
                      <td className={tdCls}>
                        <p className="text-sm font-semibold text-white">{w.name}</p>
                      </td>
                      <td className={tdCls}>
                        <span className="text-xs font-mono text-gray-400">{w.specialization || "—"}</span>
                        {w.assignedSite && <span className="ml-1.5 text-xs text-red-400">{w.assignedSite}</span>}
                      </td>
                      <td className={`${tdCls} text-right`}>
                        {isAdmin
                          ? <NumCell value={w.hourlyRate} workerId={w.id} field="hourlyRate" onSave={handleSave} accent="text-blue-400" />
                          : <span className="text-sm font-mono text-gray-600">{fmt(w.hourlyRate)}</span>}
                      </td>
                      <td className={`${tdCls} text-right`}>
                        <NumCell value={w.monthlyHours} workerId={w.id} field="monthlyHours" onSave={handleSave} accent="text-yellow-400" />
                      </td>
                      <td className={`${tdCls} text-right`}>
                        <span className={`text-sm font-mono ${isAdmin ? "text-blue-400" : "text-gray-600"}`}>{fmt(w.grossPayout)}</span>
                      </td>
                      <td className={`${tdCls} text-right`}>
                        {isAdmin
                          ? <NumCell value={w.advance} workerId={w.id} field="advance" onSave={handleSave} accent="text-orange-400" />
                          : <span className="text-sm font-mono text-gray-600">{fmt(w.advance)}</span>}
                      </td>
                      <td className={`${tdCls} text-right`}>
                        {isAdmin
                          ? <NumCell value={w.penalties} workerId={w.id} field="penalties" onSave={handleSave} accent="text-red-400" />
                          : <span className="text-sm font-mono text-gray-600">{fmt(w.penalties)}</span>}
                      </td>
                      <td className={`${tdCls} text-right`}>
                        <span className={`text-sm font-mono font-bold ${w.finalNetto < 0 ? "text-red-400" : "text-green-400"}`}>
                          {fmt(w.finalNetto)} PLN
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {/* Totals row */}
              {workers.length > 0 && (
                <tfoot className="bg-slate-900/80 border-t border-slate-600">
                  <tr>
                    <td className={`${tdCls} text-xs font-bold text-gray-400 uppercase tracking-widest`} colSpan={3}>
                      TOTALS — {workers.length} workers
                    </td>
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-yellow-400`}>{fmt(totals.hours)}</td>
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-blue-400`}>{fmt(totals.gross)} PLN</td>
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-orange-400`}>{fmt(totals.advances)} PLN</td>
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-red-400`}>{fmt(totals.penalties)} PLN</td>
                    <td className={`${tdCls} text-right text-lg font-mono font-bold text-green-400`}>{fmt(totals.netto)} PLN</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Commit to Ledger */}
        {isAdmin && (
          <div className="border border-red-500/30 bg-red-950/20 rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-red-400" />
                Close Month & Save to Ledger
              </h2>
              <p className="text-xs text-gray-400 font-mono mt-1">
                Zamknij Miesiąc — Saves a permanent snapshot for each worker and resets Hours, Advances & Penalties to 0.
              </p>
              <p className="text-xs text-yellow-400 font-mono mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                This action cannot be undone. Ensure all values are correct before committing.
              </p>
            </div>
            <button
              onClick={() => setShowCommitModal(true)}
              disabled={workers.length === 0}
              className="flex-shrink-0 flex items-center gap-2 px-6 py-3 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold uppercase tracking-wider text-sm transition-all shadow-[0_0_20px_rgba(196,30,24,0.4)] whitespace-nowrap"
            >
              <FileCheck className="w-4 h-4" />
              Close Month — {selectedMonth}
            </button>
          </div>
        )}
      </main>

      {/* Commit Confirmation Modal */}
      {showCommitModal && !commitResult && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Confirm Payroll Commit</h2>
                <p className="text-xs text-gray-400 font-mono">Month: {selectedMonth}</p>
              </div>
            </div>
            <div className="space-y-2 mb-5 p-4 bg-slate-800 rounded-xl border border-slate-700">
              <div className="flex justify-between text-sm"><span className="text-gray-400">Workers:</span><span className="font-mono text-white">{workers.length}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Total Hours:</span><span className="font-mono text-yellow-400">{fmt(totals.hours)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Gross Payroll:</span><span className="font-mono text-blue-400">{fmt(totals.gross)} PLN</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Total Deductions:</span><span className="font-mono text-red-400">- {fmt(totals.advances + totals.penalties)} PLN</span></div>
              <div className="flex justify-between text-base border-t border-slate-600 pt-2 mt-2 font-bold"><span className="text-gray-300">Final Netto Payout:</span><span className="font-mono text-green-400">{fmt(totals.netto)} PLN</span></div>
            </div>
            <p className="text-xs text-yellow-400 mb-5 font-mono">After committing, Hours, Advances and Penalties will be reset to 0 for all workers.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCommitModal(false)} className="flex-1 py-2.5 border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm font-bold transition-all">
                Cancel
              </button>
              <button
                onClick={() => { commitMutation.mutate(); setShowCommitModal(false); }}
                disabled={commitMutation.isPending}
                className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
              >
                {commitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                Confirm & Commit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {commitResult && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-green-500/40 rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
            <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-1">Month Closed Successfully</h2>
            <p className="text-sm text-gray-400 font-mono mb-5">{commitResult.monthYear} — Ledger updated</p>
            <div className="space-y-2 mb-6 p-4 bg-slate-800 rounded-xl text-left">
              <div className="flex justify-between text-sm"><span className="text-gray-400">Workers Processed:</span><span className="font-mono text-white">{commitResult.workersProcessed}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Snapshots Saved:</span><span className="font-mono text-green-400">{commitResult.snapshotsSaved}</span></div>
              <div className="flex justify-between text-sm font-bold"><span className="text-gray-300">Total Netto Paid:</span><span className="font-mono text-green-400">{fmt(commitResult.totalNettoPayout)} PLN</span></div>
            </div>
            <button onClick={() => setCommitResult(null)} className="w-full py-2.5 bg-green-700 hover:bg-green-600 text-white rounded-xl font-bold transition-all">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
