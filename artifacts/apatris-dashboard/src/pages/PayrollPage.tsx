import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  ArrowLeft, Calculator, CheckCircle2, Loader2, AlertTriangle,
  ChevronDown, Calendar, DollarSign, Users, TrendingDown, FileCheck,
  Search, Building2, Mail, Landmark, ToggleLeft, ToggleRight,
  Settings, RefreshCw, Info, Edit2, X, Save
} from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PayrollWorker {
  id: string;
  name: string;
  email: string | null;
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
  payslipsSent: number;
}

interface ZUSBreakdown {
  employeeZUS: number;
  healthInsurance: number;
  estimatedTax: number;
  netAfterTax: number;
  takeHome: number;
}

interface SplitBreakdown {
  otherGross: number;
  otherPIT: number;
  otherNet: number;
  zusSaved: number;      // ZUS + health not paid at 2nd employer
  totalNet: number;      // main take-home + other net
}

// ─── ZUS Rates Config ─────────────────────────────────────────────────────────
interface ZUSRates {
  year: number;
  emerytalneEmployee: number;  // %
  rentoweEmployee: number;     // %
  zdrowotne: number;           // % of (gross - ZUS)
  kup: number;                 // % cost-of-obtaining
  pit: number;                 // % flat PIT rate
  updatedAt: string;
}

const DEFAULT_RATES_2026: ZUSRates = {
  year: 2026,
  emerytalneEmployee: 9.76,
  rentoweEmployee: 1.5,
  zdrowotne: 9.0,
  kup: 20.0,
  pit: 12.0,
  updatedAt: "2026-01-01",
};

function loadZUSRates(): ZUSRates {
  try {
    const stored = localStorage.getItem("apatris_zus_rates");
    if (stored) return JSON.parse(stored) as ZUSRates;
  } catch {}
  return DEFAULT_RATES_2026;
}

function saveZUSRates(rates: ZUSRates) {
  localStorage.setItem("apatris_zus_rates", JSON.stringify(rates));
}

// ─── Calculation ──────────────────────────────────────────────────────────────
function calcZUS(gross: number, advance: number, penalties: number, rates: ZUSRates): ZUSBreakdown {
  const zusRate = (rates.emerytalneEmployee + rates.rentoweEmployee) / 100;
  const employeeZUS = gross * zusRate;
  const healthInsurance = (gross - employeeZUS) * (rates.zdrowotne / 100);
  const kup = gross * (rates.kup / 100);
  const taxBase = Math.max(0, gross - employeeZUS - kup);
  const estimatedTax = taxBase * (rates.pit / 100);
  const netAfterTax = Math.max(0, gross - employeeZUS - healthInsurance - estimatedTax);
  const takeHome = netAfterTax - advance - penalties;
  return { employeeZUS, healthInsurance, estimatedTax, netAfterTax, takeHome };
}

// ─── Split-Employer Calculator ────────────────────────────────────────────────
// In Poland: if Contract 1 (Apatris) covers minimum wage, Contract 2 (other
// company) is ZUS-exempt. Worker pays only PIT on the 2nd employer's income.
function calcSplit(
  mainTakeHome: number,
  splitHours: number,
  hourlyRate: number,
  rates: ZUSRates
): SplitBreakdown {
  const otherGross = splitHours * hourlyRate;
  // 2nd employer: no ZUS, no health insurance — only PIT on (gross - KUP)
  const otherKUP = otherGross * (rates.kup / 100);
  const otherTaxBase = Math.max(0, otherGross - otherKUP);
  const otherPIT = otherTaxBase * (rates.pit / 100);
  const otherNet = otherGross - otherPIT;
  // ZUS saved = what WOULD have been deducted if these hours were at Apatris
  const zusRate = (rates.emerytalneEmployee + rates.rentoweEmployee) / 100;
  const wouldBeZUS = otherGross * zusRate;
  const wouldBeHealth = (otherGross - wouldBeZUS) * (rates.zdrowotne / 100);
  const zusSaved = wouldBeZUS + wouldBeHealth;
  const totalNet = mainTakeHome + otherNet;
  return { otherGross, otherPIT, otherNet, zusSaved, totalNet };
}

function fmt(n: number) {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Editable Number Cell ─────────────────────────────────────────────────────
function NumCell({
  value, workerId, field, onSave, accent, disabled,
}: {
  value: number; workerId: string; field: "hourlyRate" | "monthlyHours" | "advance" | "penalties";
  onSave: (id: string, field: string, val: number) => void; accent?: string; disabled?: boolean;
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

  if (disabled) {
    return <span className={`text-sm font-mono text-gray-600 block text-right px-2`}>{fmt(value)}</span>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef} type="number" value={draft} step="0.01" min="0"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(String(value)); } }}
        className="w-full bg-slate-700 border border-red-500/60 text-white rounded px-2 py-1 text-sm font-mono focus:outline-none text-right"
        style={{ minWidth: "80px", maxWidth: "110px" }}
      />
    );
  }

  return (
    <button onClick={() => setEditing(true)} title="Click to edit"
      className={`text-sm font-mono font-semibold text-right w-full transition-colors px-2 py-1 rounded hover:bg-white/5 ${accent ?? "text-gray-200"}`}>
      {fmt(value)}
    </button>
  );
}

// ─── ZUS Rates Editor Modal ───────────────────────────────────────────────────
function ZUSRatesModal({ rates, onSave, onClose }: {
  rates: ZUSRates; onSave: (r: ZUSRates) => void; onClose: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const [draft, setDraft] = useState<ZUSRates>({ ...rates });

  const field = (label: string, key: keyof ZUSRates, desc: string) => (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-slate-700/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white">{label}</p>
        <p className="text-[10px] text-gray-500 font-mono">{desc}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input
          type="number" step="0.01" min="0" max="100"
          value={draft[key] as number}
          onChange={(e) => setDraft({ ...draft, [key]: parseFloat(e.target.value) || 0 })}
          className="w-20 bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-purple-500/60 text-right"
        />
        <span className="text-xs text-gray-400">%</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-purple-500/40 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-purple-400" /> ZUS / PIT Rates
            </h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">Umowa Zlecenie — Update annually when ZUS changes</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <label className="text-xs text-gray-400 font-mono block mb-1">Rate Year</label>
          <input
            type="number" min="2020" max="2099"
            value={draft.year}
            onChange={(e) => setDraft({ ...draft, year: parseInt(e.target.value) || currentYear })}
            className="w-28 bg-slate-800 border border-slate-600 text-white rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-purple-500/60"
          />
          {draft.year !== currentYear && (
            <p className="text-xs text-yellow-400 font-mono mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Year differs from current year ({currentYear})
            </p>
          )}
        </div>

        <div className="bg-slate-800 rounded-xl p-4 mb-5 border border-slate-700">
          <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-3">Employee Contributions</p>
          {field("Emerytalne (Pension)", "emerytalneEmployee", "Employee pension contribution")}
          {field("Rentowe (Disability)", "rentoweEmployee", "Employee disability contribution")}
          <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mt-4 mb-3">Deductions</p>
          {field("Zdrowotne (Health)", "zdrowotne", "Applied on (Gross − ZUS)")}
          {field("KUP (Cost of Work)", "kup", "Cost of obtaining income — applied on Gross")}
          {field("PIT (Income Tax)", "pit", "Flat tax rate — no PIT-2 reduction")}
        </div>

        <div className="bg-slate-800/60 rounded-xl px-4 py-3 mb-5 border border-slate-700 text-xs font-mono">
          <p className="text-gray-400 mb-1">Effective employee ZUS:</p>
          <p className="text-purple-300 font-bold text-sm">
            {(draft.emerytalneEmployee + draft.rentoweEmployee).toFixed(2)}%
            <span className="text-gray-500 font-normal text-xs ml-2">(emerytalne + rentowe, chorobowe excluded)</span>
          </p>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm font-bold transition-all">
            Cancel
          </button>
          <button onClick={() => { onSave({ ...draft, updatedAt: new Date().toISOString().slice(0, 10) }); onClose(); }}
            className="flex-1 py-2.5 bg-purple-700 hover:bg-purple-600 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> Save Rates
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PayrollPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "Admin";

  const today = new Date();
  const currentYear = today.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(format(today, "yyyy-MM"));
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [pending, setPending] = useState<Record<string, Record<string, number>>>({});
  const [payrollSearch, setPayrollSearch] = useState("");
  const [showZUS, setShowZUS] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [splitHours, setSplitHours] = useState<Record<string, number>>({});
  const [zusRates, setZUSRates] = useState<ZUSRates>(loadZUSRates);
  const [showRatesModal, setShowRatesModal] = useState(false);

  // Auto-prompt when new year and rates not updated
  const ratesOutdated = zusRates.year < currentYear;

  const handleSaveRates = (r: ZUSRates) => {
    saveZUSRates(r);
    setZUSRates(r);
  };

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
        method: "PATCH", headers: { "Content-Type": "application/json" },
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

  const handleSave = (id: string, field: string, val: number) => saveMutation.mutate({ id, field, val });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/payroll/commit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
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

  const filteredWorkers = useMemo(() => {
    if (!payrollSearch.trim()) return workers;
    const q = payrollSearch.toLowerCase();
    return workers.filter((w) =>
      w.name.toLowerCase().includes(q) ||
      (w.assignedSite || "").toLowerCase().includes(q) ||
      (w.specialization || "").toLowerCase().includes(q)
    );
  }, [workers, payrollSearch]);

  const totals = useMemo(() => ({
    hours: workers.reduce((s, w) => s + w.monthlyHours, 0),
    gross: workers.reduce((s, w) => s + w.grossPayout, 0),
    advances: workers.reduce((s, w) => s + w.advance, 0),
    penalties: workers.reduce((s, w) => s + w.penalties, 0),
    netto: workers.reduce((s, w) => s + w.finalNetto, 0),
  }), [workers]);

  const zusTotal = useMemo(() => {
    if (!showZUS || !isAdmin) return null;
    return workers.reduce((acc, w) => {
      const z = calcZUS(w.grossPayout, w.advance, w.penalties, zusRates);
      return {
        zus: acc.zus + z.employeeZUS,
        health: acc.health + z.healthInsurance,
        tax: acc.tax + z.estimatedTax,
        net: acc.net + z.netAfterTax,
        take: acc.take + z.takeHome,
      };
    }, { zus: 0, health: 0, tax: 0, net: 0, take: 0 });
  }, [workers, showZUS, isAdmin, zusRates]);

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(196, 30, 24);
    doc.text("APATRIS SP. Z O.O. — PAYROLL SUMMARY", 14, 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100, 100, 100);
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
      columnStyles: {
        4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
        7: { halign: "right" }, 8: { halign: "right", fontStyle: "bold" }
      },
    });

    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `apatris-payroll-${selectedMonth}.pdf`;
    a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleBankExport = () => {
    const [year, month] = selectedMonth.split("-");
    const monthNames: Record<string, string> = {
      "01": "Styczeń", "02": "Luty", "03": "Marzec", "04": "Kwiecień",
      "05": "Maj", "06": "Czerwiec", "07": "Lipiec", "08": "Sierpień",
      "09": "Wrzesień", "10": "Październik", "11": "Listopad", "12": "Grudzień"
    };
    const periodPL = `${monthNames[month] ?? month} ${year}`;
    const headers = ["Imię i Nazwisko", "Miejscowość / Budowa", "Kwota Netto (PLN)", "Tytuł Przelewu", "IBAN"];
    const rows = workers.filter((w) => w.finalNetto > 0).map((w) => [
      w.name, w.assignedSite || "—", fmt(w.finalNetto), `Wynagrodzenie za ${periodPL}`, "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `apatris-bank-transfers-${selectedMonth}.csv`;
    a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // Column classes
  const thCls = "px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap";
  const tdCls = "px-4 py-3 align-middle";

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="h-16 border-b border-slate-700 bg-slate-900/95 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between gap-4"
        style={{ boxShadow: "0 1px 0 rgba(196,30,24,0.08), 0 4px 20px rgba(0,0,0,0.3)" }}>
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-shrink-0">
          <button onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-mono flex-shrink-0">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Dashboard</span>
          </button>
          <div className="w-px h-5 bg-white/10 flex-shrink-0" />
          <div className="flex items-center gap-2.5 min-w-0">
            <Calculator className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold tracking-wide text-white leading-none">Monthly Payroll Run</h1>
              <p className="text-[10px] text-red-400 font-mono uppercase tracking-widest hidden sm:block">Rozliczenie Miesięczne</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-white rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-mono focus:outline-none focus:border-red-500/60"
            />
          </div>
          {isAdmin && (
            <button onClick={() => setShowZUS((v) => !v)} title="Toggle ZUS/PIT breakdown view"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${showZUS ? "border-purple-500/60 bg-purple-900/30 text-purple-300" : "border-slate-600 text-gray-400 hover:bg-slate-700"}`}>
              {showZUS ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              <span className="hidden sm:inline">ZUS View</span>
            </button>
          )}
          {isAdmin && (
            <button onClick={handleBankExport} title="Export bank transfer list"
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-600 text-gray-300 hover:bg-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors">
              <Landmark className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bank CSV</span>
            </button>
          )}
          <button onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-600 text-gray-300 hover:bg-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors">
            <FileCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </header>

      <main className="p-4 sm:p-6 max-w-[1800px] mx-auto space-y-5">

        {/* ── Outdated Rates Alert ─────────────────────────────────────── */}
        {isAdmin && ratesOutdated && (
          <div className="flex items-start gap-3 px-4 py-3 bg-yellow-950/40 border border-yellow-500/40 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-yellow-300 uppercase tracking-widest mb-0.5">ZUS Rates Outdated</p>
              <p className="text-xs text-yellow-200/70 font-mono">
                Your saved rates are for {zusRates.year}, but the current year is {currentYear}.
                Please review and update ZUS rates for {currentYear}.
              </p>
            </div>
            <button onClick={() => setShowRatesModal(true)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg text-xs font-bold transition-colors whitespace-nowrap">
              <RefreshCw className="w-3 h-3" /> Update Rates
            </button>
          </div>
        )}

        {/* ── Summary Cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          {[
            { label: "Active Workers", value: workers.length.toString(), icon: Users, color: "text-blue-400" },
            { label: "Total Hours", value: fmt(totals.hours), icon: Calculator, color: "text-purple-400" },
            { label: "Gross Payroll", value: `${fmt(totals.gross)} PLN`, icon: DollarSign, color: "text-blue-400" },
            { label: "Deductions", value: `${fmt(totals.advances + totals.penalties)} PLN`, icon: TrendingDown, color: "text-orange-400" },
            { label: "Total Netto", value: `${fmt(totals.netto)} PLN`, icon: CheckCircle2, color: "text-green-400" },
          ].map((c) => (
            <div key={c.label} className="bg-slate-800 border border-slate-700 rounded-xl p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <c.icon className={`w-4 h-4 ${c.color} flex-shrink-0`} />
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-tight">{c.label}</p>
              </div>
              <p className={`text-base sm:text-xl font-mono font-bold ${c.color} truncate`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* ── ZUS View Banner ──────────────────────────────────────────── */}
        {showZUS && isAdmin && (
          <div className="flex flex-col sm:flex-row items-start gap-3 px-4 py-4 bg-purple-950/40 border border-purple-500/30 rounded-xl">
            <Calculator className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-purple-300 font-bold uppercase tracking-widest text-[10px]">
                  ZUS / PIT Rates — {zusRates.year}
                </span>
                <span className="text-[10px] text-gray-500 font-mono">Last updated: {zusRates.updatedAt}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono">
                {[
                  { label: "Emerytalne", value: `${zusRates.emerytalneEmployee}%` },
                  { label: "Rentowe", value: `${zusRates.rentoweEmployee}%` },
                  { label: "Zdrowotne", value: `${zusRates.zdrowotne}% (net base)` },
                  { label: "KUP", value: `${zusRates.kup}%` },
                  { label: "PIT flat", value: `${zusRates.pit}%` },
                ].map((r) => (
                  <div key={r.label} className="bg-purple-900/30 rounded-lg px-2.5 py-1.5 border border-purple-700/30">
                    <p className="text-gray-500 text-[9px] uppercase tracking-widest">{r.label}</p>
                    <p className="text-purple-200 font-bold">{r.value}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 font-mono mt-2">
                Effective ZUS: {(zusRates.emerytalneEmployee + zusRates.rentoweEmployee).toFixed(2)}% · Chorobowe excluded (voluntary) · ZUS base = Gross Salary (Rate × Hours)
              </p>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button onClick={() => setShowRatesModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-800/60 hover:bg-purple-700/60 border border-purple-500/40 text-purple-200 rounded-lg text-xs font-bold transition-colors whitespace-nowrap">
                <Edit2 className="w-3 h-3" /> Edit Rates
              </button>
              <button onClick={() => setShowSplit((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${showSplit ? "border-teal-500/60 bg-teal-900/40 text-teal-200" : "border-slate-600 bg-slate-800/60 text-gray-400 hover:bg-slate-700/60"}`}>
                {showSplit ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
                2nd Employer Split
              </button>
            </div>
          </div>
        )}

        {/* ── Split Employer Explanation ───────────────────────────────── */}
        {showZUS && showSplit && isAdmin && (
          <div className="flex items-start gap-3 px-4 py-3 bg-teal-950/40 border border-teal-500/30 rounded-xl text-xs font-mono">
            <Info className="w-4 h-4 text-teal-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-teal-300 font-bold uppercase tracking-widest text-[10px] mb-1">2nd Employer ZUS Split — Dwie Umowy Zlecenie</p>
              <p className="text-teal-200/70">
                When Contract 1 (Apatris) covers minimum wage, Contract 2 at another company is <span className="text-teal-300 font-semibold">ZUS-exempt</span> — worker pays PIT only.
                Enter the hours worked at the other company in the <span className="text-teal-300 font-semibold">"2nd Co. Hrs"</span> column.
                The <span className="text-green-400 font-semibold">"ZUS Saved"</span> column shows how much the worker saves vs. having all hours at one employer.
              </p>
            </div>
          </div>
        )}

        {/* ── Coordinator Notice ───────────────────────────────────────── */}
        {!isAdmin && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-950/40 border border-blue-500/30 rounded-xl">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div>
              <span className="text-blue-400 font-bold uppercase tracking-widest text-[10px]">Coordinator View</span>
              <span className="text-white/20 mx-2">|</span>
              <span className="text-xs text-blue-200/70 font-mono">Update worker hours by clicking the yellow Hours cell. Rate, advances, penalties and payroll close are Admin-only.</span>
            </div>
          </div>
        )}

        {/* ── Payroll Grid ─────────────────────────────────────────────── */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-700 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 flex-shrink-0">
              {isAdmin ? (showZUS ? "Payroll Grid — ZUS Breakdown" : "Payroll Grid — Click any value to edit") : "Hours Grid — Click Hours to update"}
            </p>
            <div className="flex items-center gap-3 ml-auto flex-wrap">
              {saveMutation.isPending && (
                <span className="flex items-center gap-1.5 text-xs text-yellow-400 font-mono">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
                </span>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                <input type="text" placeholder="Search workers…" value={payrollSearch} onChange={(e) => setPayrollSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-600 text-white rounded-lg text-xs font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600 w-44 sm:w-52" />
              </div>
              {payrollSearch && (
                <span className="text-[10px] font-mono text-gray-400">{filteredWorkers.length} / {workers.length}</span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: showZUS && showSplit && isAdmin ? "1700px" : showZUS && isAdmin ? "1300px" : "860px" }}>
              <thead className="bg-slate-900/60 border-b border-slate-700">
                <tr>
                  <th className={`${thCls} text-left`} style={{ minWidth: "180px" }}>Worker</th>
                  <th className={`${thCls} text-left`} style={{ minWidth: "140px" }}>Spec / Site</th>
                  <th className={`${thCls} text-right`} style={{ minWidth: "110px" }}>
                    {isAdmin ? "Rate (PLN/h)" : <span className="text-gray-600">Rate</span>}
                  </th>
                  <th className={`${thCls} text-right`} style={{ minWidth: "100px" }}>
                    <span className="text-yellow-400">Hours ✎</span>
                  </th>
                  <th className={`${thCls} text-right`} style={{ minWidth: "120px" }}>
                    {isAdmin ? "Gross (PLN)" : <span className="text-gray-600">Gross</span>}
                  </th>
                  {showZUS && isAdmin && <>
                    <th className={`${thCls} text-right text-purple-400`} style={{ minWidth: "110px" }}>Emp. ZUS</th>
                    <th className={`${thCls} text-right text-purple-400`} style={{ minWidth: "110px" }}>Health Ins.</th>
                    <th className={`${thCls} text-right text-purple-400`} style={{ minWidth: "100px" }}>Est. PIT</th>
                    <th className={`${thCls} text-right text-purple-300`} style={{ minWidth: "120px" }}>Net After Tax</th>
                  </>}
                  {showZUS && showSplit && isAdmin && <>
                    <th className={`${thCls} text-right text-teal-400`} style={{ minWidth: "110px" }}>2nd Co. Hrs ✎</th>
                    <th className={`${thCls} text-right text-teal-400`} style={{ minWidth: "110px" }}>2nd Gross</th>
                    <th className={`${thCls} text-right text-green-400`} style={{ minWidth: "110px" }}>ZUS Saved</th>
                    <th className={`${thCls} text-right text-green-300`} style={{ minWidth: "130px" }}>Total Net (Split)</th>
                  </>}
                  <th className={`${thCls} text-right`} style={{ minWidth: "110px" }}>
                    {isAdmin ? <span className="text-orange-400">Advances ✎</span> : <span className="text-gray-600">Advances</span>}
                  </th>
                  <th className={`${thCls} text-right`} style={{ minWidth: "110px" }}>
                    {isAdmin ? <span className="text-red-400">Penalties ✎</span> : <span className="text-gray-600">Penalties</span>}
                  </th>
                  <th className={`${thCls} text-right`} style={{ minWidth: "130px" }}>
                    <span className="text-green-400">{showZUS && isAdmin ? "Take-Home" : "Final Netto"}</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-700/40">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={showZUS && isAdmin ? 11 : 7} className="px-5 py-4">
                        <div className="h-4 bg-white/5 rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : filteredWorkers.length === 0 ? (
                  <tr>
                    <td colSpan={showZUS && isAdmin ? 11 : 7} className="px-5 py-12 text-center text-gray-500 font-mono text-sm">
                      {payrollSearch ? "No workers match your search" : "No workers found"}
                    </td>
                  </tr>
                ) : (
                  filteredWorkers.map((w) => {
                    const zus = (showZUS && isAdmin) ? calcZUS(w.grossPayout, w.advance, w.penalties, zusRates) : null;
                    const wSplitHrs = splitHours[w.id] ?? 0;
                    const split = (showZUS && showSplit && isAdmin && zus) ? calcSplit(zus.takeHome, wSplitHrs, w.hourlyRate, zusRates) : null;
                    return (
                      <tr key={w.id} className="hover:bg-slate-700/25 transition-colors group">
                        {/* Worker */}
                        <td className={tdCls}>
                          <p className="text-sm font-semibold text-white leading-tight whitespace-nowrap">{w.name}</p>
                          {w.email && (
                            <p className="text-[10px] text-gray-500 font-mono flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate max-w-[160px]">{w.email}</span>
                            </p>
                          )}
                        </td>
                        {/* Spec / Site */}
                        <td className={tdCls}>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-mono text-gray-400 whitespace-nowrap">{w.specialization || "—"}</span>
                            {w.assignedSite && (
                              <span className="text-[10px] text-red-400 whitespace-nowrap">{w.assignedSite}</span>
                            )}
                          </div>
                        </td>
                        {/* Rate */}
                        <td className={`${tdCls} text-right`}>
                          {isAdmin
                            ? <NumCell value={w.hourlyRate} workerId={w.id} field="hourlyRate" onSave={handleSave} accent="text-blue-400" />
                            : <span className="text-sm font-mono text-gray-600 block text-right">{fmt(w.hourlyRate)}</span>}
                        </td>
                        {/* Hours */}
                        <td className={`${tdCls} text-right`}>
                          <NumCell value={w.monthlyHours} workerId={w.id} field="monthlyHours" onSave={handleSave} accent="text-yellow-400" />
                        </td>
                        {/* Gross */}
                        <td className={`${tdCls} text-right`}>
                          <span className={`text-sm font-mono font-semibold ${isAdmin ? "text-blue-400" : "text-gray-600"}`}>
                            {fmt(w.grossPayout)}
                          </span>
                        </td>
                        {/* ZUS columns */}
                        {showZUS && isAdmin && zus && <>
                          <td className={`${tdCls} text-right`}>
                            <span className="text-sm font-mono text-purple-400">− {fmt(zus.employeeZUS)}</span>
                          </td>
                          <td className={`${tdCls} text-right`}>
                            <span className="text-sm font-mono text-purple-400">− {fmt(zus.healthInsurance)}</span>
                          </td>
                          <td className={`${tdCls} text-right`}>
                            <span className="text-sm font-mono text-purple-400">− {fmt(zus.estimatedTax)}</span>
                          </td>
                          <td className={`${tdCls} text-right`}>
                            <span className="text-sm font-mono font-semibold text-purple-300">{fmt(zus.netAfterTax)}</span>
                          </td>
                        </>}
                        {/* Split columns */}
                        {showZUS && showSplit && isAdmin && <>
                          <td className={`${tdCls} text-right`}>
                            <input
                              type="number" min="0" step="1"
                              value={wSplitHrs || ""}
                              placeholder="0"
                              onChange={(e) => setSplitHours((prev) => ({ ...prev, [w.id]: parseFloat(e.target.value) || 0 }))}
                              className="w-20 bg-slate-700 border border-teal-500/40 text-teal-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-teal-400 text-right placeholder:text-gray-600"
                            />
                          </td>
                          <td className={`${tdCls} text-right`}>
                            <span className="text-sm font-mono text-teal-400">{split ? fmt(split.otherGross) : "—"}</span>
                          </td>
                          <td className={`${tdCls} text-right`}>
                            {split && split.zusSaved > 0 ? (
                              <span className="text-sm font-mono font-bold text-green-400">+ {fmt(split.zusSaved)}</span>
                            ) : <span className="text-sm font-mono text-gray-600">—</span>}
                          </td>
                          <td className={`${tdCls} text-right`}>
                            {split && split.otherGross > 0 ? (
                              <div>
                                <span className="text-sm font-mono font-bold text-green-300">{fmt(split.totalNet)}</span>
                                <span className="text-[10px] text-gray-500 ml-1 font-mono">PLN</span>
                              </div>
                            ) : <span className="text-sm font-mono text-gray-600">—</span>}
                          </td>
                        </>}
                        {/* Advances */}
                        <td className={`${tdCls} text-right`}>
                          {isAdmin
                            ? <NumCell value={w.advance} workerId={w.id} field="advance" onSave={handleSave} accent="text-orange-400" />
                            : <span className="text-sm font-mono text-gray-600 block text-right">{fmt(w.advance)}</span>}
                        </td>
                        {/* Penalties */}
                        <td className={`${tdCls} text-right`}>
                          {isAdmin
                            ? <NumCell value={w.penalties} workerId={w.id} field="penalties" onSave={handleSave} accent="text-red-400" />
                            : <span className="text-sm font-mono text-gray-600 block text-right">{fmt(w.penalties)}</span>}
                        </td>
                        {/* Take-home / Netto */}
                        <td className={`${tdCls} text-right`}>
                          <div>
                            <span className={`text-sm font-mono font-bold ${(showZUS && zus ? zus.takeHome : w.finalNetto) < 0 ? "text-red-400" : "text-green-400"}`}>
                              {fmt(showZUS && zus ? zus.takeHome : w.finalNetto)}
                            </span>
                            <span className="text-[10px] text-gray-500 ml-1 font-mono">PLN</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Totals Footer */}
              {filteredWorkers.length > 0 && (
                <tfoot className="bg-slate-900/80 border-t-2 border-slate-600">
                  <tr>
                    <td className={`${tdCls} text-xs font-bold text-gray-300 uppercase tracking-widest`} colSpan={2}>
                      TOTALS — {filteredWorkers.length}
                      {payrollSearch && workers.length !== filteredWorkers.length ? ` of ${workers.length}` : ""} workers
                    </td>
                    <td className={`${tdCls} text-right text-sm font-mono text-gray-500`}>—</td>
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-yellow-400`}>{fmt(totals.hours)}</td>
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-blue-400`}>{fmt(totals.gross)}</td>
                    {showZUS && isAdmin && zusTotal && <>
                      <td className={`${tdCls} text-right text-sm font-mono font-bold text-purple-400`}>− {fmt(zusTotal.zus)}</td>
                      <td className={`${tdCls} text-right text-sm font-mono font-bold text-purple-400`}>− {fmt(zusTotal.health)}</td>
                      <td className={`${tdCls} text-right text-sm font-mono font-bold text-purple-400`}>− {fmt(zusTotal.tax)}</td>
                      <td className={`${tdCls} text-right text-sm font-mono font-bold text-purple-300`}>{fmt(zusTotal.net)}</td>
                    </>}
                    {showZUS && showSplit && isAdmin && (() => {
                      const splitTotals = filteredWorkers.reduce((acc, w) => {
                        const zus = calcZUS(w.grossPayout, w.advance, w.penalties, zusRates);
                        const hrs = splitHours[w.id] ?? 0;
                        const s = calcSplit(zus.takeHome, hrs, w.hourlyRate, zusRates);
                        return { gross: acc.gross + s.otherGross, saved: acc.saved + s.zusSaved, net: acc.net + s.totalNet };
                      }, { gross: 0, saved: 0, net: 0 });
                      return <>
                        <td className={`${tdCls} text-right text-sm font-mono text-gray-500`}>—</td>
                        <td className={`${tdCls} text-right text-sm font-mono font-bold text-teal-400`}>{fmt(splitTotals.gross)}</td>
                        <td className={`${tdCls} text-right text-sm font-mono font-bold text-green-400`}>+ {fmt(splitTotals.saved)}</td>
                        <td className={`${tdCls} text-right text-sm font-mono font-bold text-green-300`}>{fmt(splitTotals.net)}</td>
                      </>;
                    })()}
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-orange-400`}>{fmt(totals.advances)}</td>
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-red-400`}>{fmt(totals.penalties)}</td>
                    <td className={`${tdCls} text-right`}>
                      <span className="text-base font-mono font-bold text-green-400">{fmt(totals.netto)}</span>
                      <span className="text-xs text-gray-500 ml-1 font-mono">PLN</span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* ── Close Month ──────────────────────────────────────────────── */}
        {isAdmin && (
          <div className="border border-red-500/30 bg-red-950/20 rounded-xl p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-red-400" /> Close Month & Save to Ledger
              </h2>
              <p className="text-xs text-gray-400 font-mono mt-1">
                Zamknij Miesiąc — Saves a permanent snapshot for each worker and resets Hours, Advances & Penalties to 0.
              </p>
              <p className="text-xs text-yellow-400 font-mono mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> This action cannot be undone. Ensure all values are correct before committing.
              </p>
              {workers.filter((w) => w.email).length > 0 && (
                <p className="text-xs text-blue-400 font-mono mt-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Payslip emails will be sent to {workers.filter((w) => w.email).length} workers with email addresses.
                </p>
              )}
            </div>
            <button onClick={() => setShowCommitModal(true)} disabled={workers.length === 0}
              className="flex-shrink-0 flex items-center gap-2 px-5 sm:px-6 py-3 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold uppercase tracking-wider text-sm transition-all shadow-[0_0_20px_rgba(196,30,24,0.3)] whitespace-nowrap">
              <FileCheck className="w-4 h-4" /> Close Month — {selectedMonth}
            </button>
          </div>
        )}
      </main>

      {/* ── ZUS Rates Modal ──────────────────────────────────────────────── */}
      {showRatesModal && (
        <ZUSRatesModal rates={zusRates} onSave={handleSaveRates} onClose={() => setShowRatesModal(false)} />
      )}

      {/* ── Commit Confirmation Modal ─────────────────────────────────── */}
      {showCommitModal && !commitResult && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-5">
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
              <div className="flex justify-between text-sm"><span className="text-gray-400">Total Deductions:</span><span className="font-mono text-red-400">− {fmt(totals.advances + totals.penalties)} PLN</span></div>
              <div className="flex justify-between text-base border-t border-slate-600 pt-2 mt-2 font-bold">
                <span className="text-gray-300">Final Netto Payout:</span>
                <span className="font-mono text-green-400">{fmt(totals.netto)} PLN</span>
              </div>
            </div>
            <p className="text-xs text-yellow-400 mb-5 font-mono">
              After committing, Hours, Advances and Penalties will be reset to 0 for all workers.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowCommitModal(false)}
                className="flex-1 py-2.5 border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm font-bold transition-all">
                Cancel
              </button>
              <button onClick={() => { commitMutation.mutate(); setShowCommitModal(false); }} disabled={commitMutation.isPending}
                className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                {commitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                Confirm & Commit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Modal ─────────────────────────────────────────────── */}
      {commitResult && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-green-500/40 rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
            <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-1">Month Closed Successfully</h2>
            <p className="text-sm text-gray-400 font-mono mb-5">{commitResult.monthYear} — Ledger updated</p>
            <div className="space-y-2 mb-6 p-4 bg-slate-800 rounded-xl text-left border border-slate-700">
              <div className="flex justify-between text-sm"><span className="text-gray-400">Workers Processed:</span><span className="font-mono text-white">{commitResult.workersProcessed}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-400">Snapshots Saved:</span><span className="font-mono text-green-400">{commitResult.snapshotsSaved}</span></div>
              {commitResult.payslipsSent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Payslips Emailed:</span>
                  <span className="font-mono text-blue-400">{commitResult.payslipsSent} workers</span>
                </div>
              )}
              <div className="flex justify-between text-base border-t border-slate-600 pt-2 mt-2 font-bold">
                <span className="text-gray-300">Total Netto Paid:</span>
                <span className="font-mono text-green-400">{fmt(commitResult.totalNettoPayout)} PLN</span>
              </div>
            </div>
            <button onClick={() => setCommitResult(null)}
              className="w-full py-2.5 bg-green-700 hover:bg-green-600 text-white rounded-xl font-bold transition-all">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
