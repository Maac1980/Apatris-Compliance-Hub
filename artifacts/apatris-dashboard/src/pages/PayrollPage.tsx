import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Calculator, CheckCircle2, Loader2, AlertTriangle,
  ChevronDown, Calendar, DollarSign, Users, TrendingDown, FileCheck,
  Search, Building2, Mail, Landmark, ToggleLeft, ToggleRight,
  Settings, RefreshCw, Info, Edit2, X, BookOpen, Save
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { PayrollRowSkeleton } from "@/components/Skeleton";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface PayrollWorker {
  id: string;
  name: string;
  email: string | null;
  iban: string | null;
  pit2: boolean;
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
  employerZUS: number;       // what Apatris pays on top of gross
  totalEmployerCost: number; // gross + employerZUS
}

interface SplitBreakdown {
  otherGross: number;
  otherPIT: number;
  otherNet: number;
  zusSaved: number;      // ZUS + health not paid at 2nd employer
  totalNet: number;      // main take-home + other net
}

// ─── IBAN Cell ────────────────────────────────────────────────────────────────
function IBANCell({ value, workerId, onSave }: {
  value: string | null; workerId: string;
  onSave: (id: string, iban: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value ?? ""); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim().replace(/\s+/g, "");
    if (trimmed !== (value ?? "").replace(/\s+/g, "")) onSave(workerId, trimmed);
  };

  if (editing) {
    return (
      <input
        ref={inputRef} type="text" value={draft} placeholder="PL00 0000 0000..."
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setEditing(false); setDraft(value ?? ""); }
        }}
        className="bg-slate-700 border border-cyan-500/60 text-cyan-200 rounded px-2 py-1 text-xs font-mono focus:outline-none w-44"
      />
    );
  }

  if (!value) {
    return (
      <button onClick={() => setEditing(true)} title="Click to add IBAN"
        className="text-xs font-mono text-gray-600 hover:text-cyan-400 transition-colors px-2 py-1 rounded hover:bg-white/5 flex items-center gap-1 whitespace-nowrap">
        <Edit2 className="w-3 h-3" /> Add IBAN
      </button>
    );
  }

  // Format IBAN in groups of 4 for readability
  const formatted = value.replace(/(.{4})/g, "$1 ").trim();
  return (
    <button onClick={() => setEditing(true)} title="Click to edit IBAN"
      className="text-xs font-mono text-cyan-300 hover:text-cyan-200 transition-colors px-2 py-1 rounded hover:bg-white/5 text-left whitespace-nowrap">
      {formatted}
    </button>
  );
}

// ─── ZUS Rates Config ─────────────────────────────────────────────────────────
interface ZUSRates {
  year: number;
  emerytalneEmployee: number;  // % pension (employee)
  rentoweEmployee: number;     // % disability (employee)
  chorobowe: number;           // % sickness (employee)
  zdrowotne: number;           // % of (gross - ZUS)
  kup: number;                 // % cost-of-obtaining
  pit: number;                 // % flat PIT rate
  pit2Reduction: number;       // PLN monthly tax-free reduction (PIT-2 filers)
  // Employer ZUS (paid on top of gross — does not affect worker's net)
  emerytalneEmployer: number;  // % employer pension (9.76%)
  rentoweEmployer: number;     // % employer disability (6.5%)
  wypadkowe: number;           // % accident insurance (~1.67% construction)
  fp: number;                  // % Fundusz Pracy (2.45%)
  fgsp: number;                // % FGŚP (0.10%)
  updatedAt: string;
}

const DEFAULT_RATES_2026: ZUSRates = {
  year: 2026,
  emerytalneEmployee: 9.76,
  rentoweEmployee: 1.5,
  chorobowe: 0,   // voluntary for umowa zlecenie — not included per 2026 standard
  zdrowotne: 9.0,
  kup: 20.0,
  pit: 12.0,
  pit2Reduction: 300,
  emerytalneEmployer: 9.76,
  rentoweEmployer: 6.5,
  wypadkowe: 1.67,
  fp: 2.45,
  fgsp: 0.10,
  updatedAt: "2026-01-01",
};

function loadZUSRates(): ZUSRates {
  try {
    const stored = localStorage.getItem("apatris_zus_rates");
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ZUSRates>;
      // Migrate: if chorobowe is still the old 2.45 default, reset to 0 (2026 standard — voluntary, not included)
      if (parsed.chorobowe === 2.45) {
        parsed.chorobowe = 0;
      }
      return { ...DEFAULT_RATES_2026, ...parsed };
    }
  } catch {}
  return DEFAULT_RATES_2026;
}

function saveZUSRates(rates: ZUSRates) {
  localStorage.setItem("apatris_zus_rates", JSON.stringify(rates));
}

// ─── Calculation ──────────────────────────────────────────────────────────────
// pit2: worker has filed PIT-2 → monthly tax advance reduced by rates.pit2Reduction PLN
// chorobowe defaults to 0 — voluntary for umowa zlecenie (not selected per 2026 standard)
function calcZUS(gross: number, advance: number, penalties: number, rates: ZUSRates, pit2 = false): ZUSBreakdown {
  // Exact same formula as KnowledgeCenter.tsx — round each component separately
  const pension = Math.round(gross * (rates.emerytalneEmployee / 100) * 100) / 100;
  const disability = Math.round(gross * (rates.rentoweEmployee / 100) * 100) / 100;
  const sickness = (rates.chorobowe ?? 0) > 0 ? Math.round(gross * ((rates.chorobowe ?? 0) / 100) * 100) / 100 : 0;
  const employeeZUS = pension + disability + sickness;
  const healthBase = gross - employeeZUS;
  // Health = healthBase × 9%
  const healthInsurance = Math.round(healthBase * (rates.zdrowotne / 100) * 100) / 100;
  // KUP = healthBase × 20%
  const kup = Math.round(healthBase * (rates.kup / 100) * 100) / 100;
  // taxBase = round(healthBase - KUP)
  const taxBase = Math.max(0, Math.round(healthBase - kup));
  // PIT = max(0, round(taxBase × 12%) - 300 with PIT-2)
  const grossTaxRounded = Math.round(taxBase * (rates.pit / 100));
  const estimatedTax = Math.max(0, grossTaxRounded - (pit2 ? (rates.pit2Reduction ?? 300) : 0));
  // Net = gross - ZUS - health - PIT
  const netAfterTax = Math.round((gross - employeeZUS - healthInsurance - estimatedTax) * 100) / 100;
  const takeHome = netAfterTax - advance - penalties;
  // Employer ZUS — paid by Apatris on top of gross, does not affect worker's net
  const employerRate = ((rates.emerytalneEmployer ?? 9.76) + (rates.rentoweEmployer ?? 6.5) + (rates.wypadkowe ?? 1.67) + (rates.fp ?? 2.45) + (rates.fgsp ?? 0.10)) / 100;
  const employerZUS = gross * employerRate;
  const totalEmployerCost = gross + employerZUS;
  return { employeeZUS, healthInsurance, estimatedTax, netAfterTax, takeHome, employerZUS, totalEmployerCost };
}

// Reverse: given desired net/h, find gross/h via binary search
function reverseNetToGross(desiredNetPerHour: number, hours: number, rates: ZUSRates, pit2: boolean): number {
  if (hours <= 0 || desiredNetPerHour <= 0) return 0;
  const targetNet = desiredNetPerHour * hours;
  let lo = 0, hi = targetNet * 3;
  for (let i = 0; i < 100; i++) {
    const midGross = (lo + hi) / 2;
    const r = calcZUS(midGross, 0, 0, rates, pit2);
    if (r.netAfterTax < targetNet) lo = midGross;
    else hi = midGross;
    if (Math.abs(r.netAfterTax - targetNet) < 0.5) break;
  }
  return Math.round(((lo + hi) / 2 / hours) * 100) / 100;
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
  const zusRate = (rates.emerytalneEmployee + rates.rentoweEmployee + (rates.chorobowe ?? 2.45)) / 100;
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
        onChange={(e) => { const v = e.target.value; if (Number(v) >= 0 || v === "") setDraft(v); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(String(value)); } }}
        className="bg-slate-700 border-2 border-yellow-500/70 text-yellow-300 rounded px-1.5 py-1 text-sm font-mono font-bold focus:outline-none focus:border-yellow-400 text-right"
        style={{ width: "80px" }}
      />
    );
  }

  return (
    <button onClick={() => setEditing(true)} title="Click to edit"
      className={`text-sm font-mono font-semibold text-right transition-colors px-2 py-1 rounded hover:bg-white/10 hover:ring-1 hover:ring-yellow-500/30 ${accent ?? "text-gray-200"}`}
      style={{ maxWidth: "80px" }}>
      {fmt(value)}
    </button>
  );
}

// ─── Net/h editable cell — click to type desired net, reverse-calcs gross ────
function NetHourCell({ netPerHour, monthlyHours, workerId, zusRates, pit2, onSave }: {
  netPerHour: number; monthlyHours: number; workerId: string;
  zusRates: ZUSRates; pit2: boolean;
  onSave: (id: string, field: string, val: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const desired = parseFloat(draft);
    if (!isNaN(desired) && desired > 0 && monthlyHours > 0) {
      // Brute force: walk gross/h by 0.01 until net/h >= desired
      let g = 0.01;
      while (g < 500) {
        const r = calcZUS(g * monthlyHours, 0, 0, zusRates, pit2);
        if (r.netAfterTax / monthlyHours >= desired - 0.005) {
          onSave(workerId, "hourlyRate", g);
          break;
        }
        g = Math.round((g + 0.01) * 100) / 100;
      }
    }
  };

  if (editing) {
    return (
      <input ref={inputRef} type="number" step="0.01" min="0" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="bg-slate-700 border-2 border-green-500/70 text-green-300 rounded px-1.5 py-1 text-sm font-mono font-bold focus:outline-none text-right"
        style={{ width: "80px" }}
      />
    );
  }

  return (
    <button onClick={() => { setDraft(netPerHour.toFixed(2)); setEditing(true); }} title="Click to set desired net/h"
      className="text-sm font-mono font-semibold text-right transition-colors px-2 py-1 rounded hover:bg-green-500/10 hover:ring-1 hover:ring-green-500/30 text-green-300"
      style={{ maxWidth: "80px" }}>
      {netPerHour > 0 ? netPerHour.toFixed(2) : "—"}
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

        <div className="bg-slate-800 rounded-xl p-4 mb-4 border border-slate-700">
          <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-3">Employee ZUS Contributions</p>
          {field("Emerytalne (Pension)", "emerytalneEmployee", "Employee pension contribution")}
          {field("Rentowe (Disability)", "rentoweEmployee", "Employee disability contribution")}
          {field("Chorobowe (Sickness)", "chorobowe", "Employee sickness insurance — 2.45% standard")}
          <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mt-4 mb-3">Health & Tax</p>
          {field("Zdrowotne (Health)", "zdrowotne", "Applied on Health Base (Gross − ZUS)")}
          {field("KUP (Cost of Work)", "kup", "Cost of obtaining income — applied on Health Base (Gross − ZUS)")}
          {field("PIT (Income Tax)", "pit", "Flat tax rate before PIT-2 reduction")}
          <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mt-4 mb-3">PIT-2 Declaration</p>
          <div className="flex items-center justify-between gap-4 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">PIT-2 Monthly Reduction</p>
              <p className="text-[10px] text-gray-500 font-mono">Monthly tax advance reduction for workers who filed PIT-2 (300 PLN = 3,600/yr ÷ 12 at 12%)</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <input
                type="number" step="1" min="0"
                value={draft.pit2Reduction ?? 300}
                onChange={(e) => setDraft({ ...draft, pit2Reduction: parseFloat(e.target.value) || 0 })}
                className="w-20 bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-purple-500/60 text-right"
              />
              <span className="text-xs text-gray-400">PLN</span>
            </div>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mt-4 mb-3">Employer ZUS (On Top of Gross)</p>
          {field("Emerytalne — Employer", "emerytalneEmployer", "Employer pension contribution — same rate as employee (9.76%)")}
          {field("Rentowe — Employer", "rentoweEmployer", "Employer disability contribution — higher than employee (6.5%)")}
          {field("Wypadkowe (Accident)", "wypadkowe", "Accident insurance — varies by industry, ~1.67% for construction/welding")}
          {field("FP (Labour Fund)", "fp", "Fundusz Pracy — applies when worker earns above minimum wage (2.45%)")}
          {field("FGŚP (Guarantee Fund)", "fgsp", "Fundusz Gwarantowanych Świadczeń Pracowniczych (0.10%)")}
        </div>

        <div className="bg-slate-800/60 rounded-xl px-4 py-3 mb-2 border border-slate-700 text-xs font-mono">
          <p className="text-gray-400 mb-1">Effective employee ZUS (all 3 contributions):</p>
          <p className="text-purple-300 font-bold text-sm">
            {(draft.emerytalneEmployee + draft.rentoweEmployee + (draft.chorobowe ?? 0)).toFixed(2)}%
            <span className="text-gray-500 font-normal text-xs ml-2">(emerytalne + rentowe + chorobowe)</span>
          </p>
        </div>
        <div className="bg-orange-950/30 rounded-xl px-4 py-3 mb-5 border border-orange-500/20 text-xs font-mono">
          <p className="text-gray-400 mb-1">Total employer burden on top of gross:</p>
          <p className="text-orange-300 font-bold text-sm">
            {((draft.emerytalneEmployer ?? 9.76) + (draft.rentoweEmployer ?? 6.5) + (draft.wypadkowe ?? 1.67) + (draft.fp ?? 2.45) + (draft.fgsp ?? 0.10)).toFixed(2)}%
            <span className="text-gray-500 font-normal text-xs ml-2">(emerytalne + rentowe + wypadkowe + FP + FGŚP)</span>
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
  const { toast } = useToast();
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
  const [siteFilter, setSiteFilter] = useState("");
  const [showZUS, setShowZUS] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [splitHours, setSplitHours] = useState<Record<string, number>>({});
  const [pit2Overrides, setPit2Overrides] = useState<Record<string, boolean>>({});
  const [zusRates, setZUSRates] = useState<ZUSRates>(loadZUSRates);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [showBulkHours, setShowBulkHours] = useState(false);
  const [bulkHoursVal, setBulkHoursVal] = useState("160");
  const [showCalc, setShowCalc] = useState(false);
  const [calcGross, setCalcGross] = useState("5024");

  // Auto-prompt when new year and rates not updated
  const ratesOutdated = zusRates.year < currentYear;

  const handleSaveRates = (r: ZUSRates) => {
    saveZUSRates(r);
    setZUSRates(r);
  };

  const { data, isLoading, refetch } = useQuery<{ workers: PayrollWorker[] }>({
    queryKey: ["payroll-current"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/payroll/current`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load payroll data");
      return res.json();
    },
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, field, val }: { id: string; field: string; val: number }) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/payroll/workers/${id}`, {
        method: "PATCH", headers: authHeaders(),
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

  const handleSaveIBAN = (id: string, iban: string) => {
    fetch(`${import.meta.env.BASE_URL}api/payroll/workers/${id}`, {
      method: "PATCH", headers: authHeaders(),
      body: JSON.stringify({ iban }),
    }).then(() => queryClient.invalidateQueries({ queryKey: ["payroll-current"] }));
  };

  const handleTogglePIT2 = (id: string, newVal: boolean) => {
    setPit2Overrides((p) => ({ ...p, [id]: newVal }));
    fetch(`${import.meta.env.BASE_URL}api/payroll/workers/${id}`, {
      method: "PATCH", headers: authHeaders(),
      body: JSON.stringify({ pit2: newVal }),
    }).catch(() => {});
  };

  const commitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/payroll/commit`, {
        method: "POST", headers: authHeaders(),
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
      toast({
        title: "Payroll committed ✓",
        description: `${result.snapshotsSaved ?? "All"} records saved for ${selectedMonth}.`,
      });
    },
  });

  const workers: PayrollWorker[] = useMemo(() => {
    if (!data?.workers) return [];
    return data.workers.map((w) => {
      const p = pending[w.id] ?? {};
      const hourlyRate = p.hourlyRate ?? w.hourlyRate ?? 31.40;
      const monthlyHours = p.monthlyHours ?? w.monthlyHours ?? 160;
      const advance = p.advance ?? w.advance;
      const penalties = p.penalties ?? w.penalties;
      const grossPayout = hourlyRate * monthlyHours;
      const finalNetto = grossPayout - advance - penalties;
      return { ...w, hourlyRate, monthlyHours, advance, penalties, grossPayout, finalNetto };
    });
  }, [data, pending]);

  // Derive unique sites directly from the loaded workers (no extra API call needed)
  const availableSites = useMemo(() => {
    const sites = new Set<string>();
    workers.forEach((w) => { if (w.assignedSite) sites.add(w.assignedSite); });
    return Array.from(sites).sort();
  }, [workers]);

  // Count workers per site for tab badges
  const siteWorkerCount = useMemo(() => {
    const counts: Record<string, number> = {};
    workers.forEach((w) => { const s = w.assignedSite || ""; if (s) counts[s] = (counts[s] ?? 0) + 1; });
    return counts;
  }, [workers]);

  const filteredWorkers = useMemo(() => {
    let result = workers;
    if (siteFilter) result = result.filter((w) => w.assignedSite === siteFilter);
    if (payrollSearch.trim()) {
      const q = payrollSearch.toLowerCase();
      result = result.filter((w) =>
        w.name.toLowerCase().includes(q) ||
        (w.specialization || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [workers, payrollSearch, siteFilter]);

  const totals = useMemo(() => ({
    hours: filteredWorkers.reduce((s, w) => s + w.monthlyHours, 0),
    gross: filteredWorkers.reduce((s, w) => s + w.grossPayout, 0),
    advances: filteredWorkers.reduce((s, w) => s + w.advance, 0),
    penalties: filteredWorkers.reduce((s, w) => s + w.penalties, 0),
    netto: filteredWorkers.reduce((s, w) => s + w.finalNetto, 0),
  }), [filteredWorkers]);

  // Always calculate ZUS totals for correct Take-Home values
  const zusTotal = useMemo(() => {
    if (!isAdmin) return null;
    return filteredWorkers.reduce((acc, w) => {
      const z = calcZUS(w.grossPayout, w.advance, w.penalties, zusRates, pit2Overrides[w.id] ?? true);
      return {
        zus: acc.zus + z.employeeZUS,
        health: acc.health + z.healthInsurance,
        tax: acc.tax + z.estimatedTax,
        net: acc.net + z.netAfterTax,
        take: acc.take + z.takeHome,
        employerZUS: acc.employerZUS + z.employerZUS,
        totalEmployerCost: acc.totalEmployerCost + z.totalEmployerCost,
      };
    }, { zus: 0, health: 0, tax: 0, net: 0, take: 0, employerZUS: 0, totalEmployerCost: 0 });
  }, [filteredWorkers, showZUS, isAdmin, zusRates]);

  const triggerDownload = (url: string, filename: string) => {
    const isIOSPWA = (window.navigator as any).standalone === true;
    if (isIOSPWA) {
      window.open(url, "_blank");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); }, 200);
  };

  const handleExportPDF = () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    triggerDownload(`${window.location.origin}${base}/api/payroll/export/pdf?month=${selectedMonth}`, `Apatris-Payroll-${selectedMonth}.pdf`);
    toast({ title: "PDF downloading", description: `Payroll report for ${selectedMonth}.` });
  };

  const handleBankExport = () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    triggerDownload(`${window.location.origin}${base}/api/payroll/export/bank-csv?month=${selectedMonth}`, `Apatris-Bank-${selectedMonth}.csv`);
    toast({ title: "Bank CSV downloading", description: `Transfer list for ${selectedMonth}.` });
  };

  const handleAccountingExport = () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    triggerDownload(`${window.location.origin}${base}/api/payroll/export/accounting-csv?month=${selectedMonth}`, `Apatris-Accounting-${selectedMonth}.csv`);
    toast({ title: "Accounting CSV downloading", description: `Full ZUS breakdown for ${selectedMonth}.` });
  };

  // Column classes
  const thCls = "px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap";
  const tdCls = "px-4 py-3 align-middle";

  return (
    <div className="app-shell-page bg-slate-900 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-12 border-b border-slate-700/60 bg-slate-900/98 sticky top-0 z-30 px-4 sm:px-5 flex items-center justify-between gap-4"
        style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04), 0 2px 16px rgba(0,0,0,0.25)" }}>
        <div className="flex items-center gap-2.5 min-w-0 flex-shrink-0">
          <Calculator className="w-4 h-4 text-red-400 flex-shrink-0" />
          <div className="min-w-0">
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-white font-mono leading-none">Monthly Payroll Run</span>
            <span className="text-[10px] text-red-400/70 font-mono uppercase tracking-widest hidden sm:inline ml-2">· Rozliczenie Miesięczne</span>
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
          {isAdmin && (
            <button onClick={handleAccountingExport} title="Export accounting CSV with full ZUS breakdown"
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-600 text-gray-300 hover:bg-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Accounting</span>
            </button>
          )}
          <button onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-600 text-gray-300 hover:bg-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors">
            <FileCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3 p-3 sm:p-4 max-w-[1800px] mx-auto w-full">

        {/* ── Top controls (non-scrolling) ─────────────────────────────── */}
        <div className="flex-shrink-0 flex flex-col gap-3">

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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
          {[
            { label: "Active Workers", value: workers.length.toString(), icon: Users, color: "text-blue-400" },
            { label: "Total Hours", value: fmt(totals.hours), icon: Calculator, color: "text-purple-400" },
            { label: "Gross Payroll", value: `${fmt(totals.gross)} PLN`, icon: DollarSign, color: "text-blue-400" },
            { label: "Deductions", value: `${fmt(totals.advances + totals.penalties)} PLN`, icon: TrendingDown, color: "text-orange-400" },
            { label: "Total Net Pay", value: `${fmt(totals.netto)} PLN`, icon: CheckCircle2, color: "text-green-400" },
          ].map((c) => (
            <div key={c.label} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 flex items-center gap-2.5">
              <c.icon className={`w-4 h-4 ${c.color} flex-shrink-0`} />
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 leading-none mb-0.5">{c.label}</p>
                <p className={`text-sm font-mono font-bold ${c.color} truncate leading-none`}>{c.value}</p>
              </div>
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
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-gray-500 font-mono mt-2">
                <span>Employee ZUS: <span className="text-purple-300 font-bold">{(zusRates.emerytalneEmployee + zusRates.rentoweEmployee + (zusRates.chorobowe ?? 2.45)).toFixed(2)}%</span></span>
                <span>Employer burden: <span className="text-orange-400 font-bold">{((zusRates.emerytalneEmployer ?? 9.76) + (zusRates.rentoweEmployer ?? 6.5) + (zusRates.wypadkowe ?? 1.67) + (zusRates.fp ?? 2.45) + (zusRates.fgsp ?? 0.10)).toFixed(2)}%</span> on top of gross</span>
                <span className="text-gray-600">· ZUS base = Rate × Hours</span>
              </div>
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

        </div>{/* end flex-shrink-0 top controls */}

        {/* ── Payroll Grid (flex-1: fills remaining height) ────────────── */}
        <div className="flex-1 min-h-0 flex flex-col table-responsive-container bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden" style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
          {/* ── Top bar: title + search ── */}
          <div className="flex-shrink-0 px-5 py-3.5 border-b border-slate-700 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 flex-shrink-0">
              {isAdmin ? (showZUS ? "Payroll Grid — ZUS Breakdown" : "Payroll Grid — Click any value to edit") : "Hours Grid — Click Hours to update"}
            </p>
            <div className="flex items-center gap-3 ml-auto flex-wrap">
              {saveMutation.isPending && (
                <span className="flex items-center gap-1.5 text-xs text-yellow-400 font-mono">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
                </span>
              )}
              {isAdmin && (showBulkHours ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-yellow-400 font-mono font-bold uppercase tracking-wider">Set all hrs:</span>
                  <input
                    type="number" min="0" step="1" value={bulkHoursVal}
                    onChange={(e) => setBulkHoursVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const hrs = parseFloat(bulkHoursVal);
                        if (!isNaN(hrs) && hrs >= 0) filteredWorkers.forEach((w) => handleSave(w.id, "monthlyHours", hrs));
                        setShowBulkHours(false);
                      }
                      if (e.key === "Escape") setShowBulkHours(false);
                    }}
                    autoFocus
                    className="w-20 bg-slate-900 border border-yellow-500/60 text-yellow-300 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none text-right"
                    placeholder="hrs"
                  />
                  <button
                    onClick={() => {
                      const hrs = parseFloat(bulkHoursVal);
                      if (!isNaN(hrs) && hrs >= 0) filteredWorkers.forEach((w) => handleSave(w.id, "monthlyHours", hrs));
                      setShowBulkHours(false);
                    }}
                    className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg text-xs font-bold transition-colors whitespace-nowrap">
                    Apply to {filteredWorkers.length}
                  </button>
                  <button onClick={() => setShowBulkHours(false)} className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowBulkHours(true)} title="Set hours for all visible workers at once"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-gray-300 rounded-lg text-xs font-bold transition-colors whitespace-nowrap">
                  <Users className="w-3.5 h-3.5" /> Bulk Hours
                </button>
              ))}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                <input type="text" placeholder="Search workers…" value={payrollSearch} onChange={(e) => setPayrollSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-600 text-white rounded-lg text-xs font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600 w-44 sm:w-52" />
              </div>
              {(payrollSearch || siteFilter) && (
                <span className="text-[10px] font-mono text-gray-400">{filteredWorkers.length} / {workers.length}</span>
              )}
            </div>
          </div>

          {/* ── Brutto → Netto Calculator ─────────────────────────────────── */}
          {(() => {
            const gross    = parseFloat(calcGross) || 0;
            const pension  = gross * 0.0976;                          // Step 2
            const disab    = gross * 0.0150;                          // Step 3
            const sickness = 0;                                       // Step 4 — unchecked
            const workerZUS = pension + disab + sickness;            // Step 5
            const healthBase = gross - workerZUS;                    // Step 6
            const healthTax  = gross * 0.079866;                    // Step 7 - health on GROSS
            const kup        = healthBase * 0.20;                    // Step 8
            const taxBase    = Math.round(healthBase - kup);         // Step 9
            const grossTax   = taxBase * 0.12;                       // Step 10
            const pit2Red    = 300;                                   // Step 11
            const incomeTax  = Math.max(0, Math.round(grossTax - pit2Red)); // Step 12
            const netto      = gross - workerZUS - healthTax - incomeTax;   // Step 13
            const pct = (v: number) => gross > 0 ? `${((v / gross) * 100).toFixed(1)}%` : "—";
            const f   = (v: number) => v.toFixed(2);

            type Row = { step: number; label: string; formula: string; amount: number; kind: "gross"|"sub"|"info"|"netto"; };
            const rows: Row[] = [
              { step: 1,  label: "Contract Gross (Brutto)",              formula: "Starting base amount",                                kind: "gross", amount: gross     },
              { step: 2,  label: "Pension (Emerytalna)",                 formula: `9.76% × ${f(gross)}`,                               kind: "sub",   amount: -pension  },
              { step: 3,  label: "Disability (Rentowa)",                 formula: `1.50% × ${f(gross)}`,                               kind: "sub",   amount: -disab    },
              { step: 4,  label: "Sickness (Chorobowa)",                 formula: "0% — not selected",                                 kind: "info",  amount: 0         },
              { step: 5,  label: "Total Worker ZUS",                     formula: "Pension + Disability",                              kind: "sub",   amount: -workerZUS},
              { step: 6,  label: "Health Base",                          formula: `${f(gross)} − ${f(workerZUS)}`,                     kind: "info",  amount: healthBase },
              { step: 7,  label: "Health Insurance (Zdrowotna, 9%)",     formula: `9% × ${f(healthBase)}`,                             kind: "sub",   amount: -healthTax},
              { step: 8,  label: "Tax Deductible Costs (KUP, 20%)",      formula: `20% × ${f(healthBase)}`,                            kind: "info",  amount: kup        },
              { step: 9,  label: "Taxable Base (Podstawa)",              formula: `round(${f(healthBase)} − ${f(kup)}) = ${taxBase}`,  kind: "info",  amount: taxBase   },
              { step: 10, label: "Gross Income Tax",                     formula: `12% × ${taxBase}`,                                  kind: "info",  amount: grossTax  },
              { step: 11, label: "PIT-2 Reduction (Kwota Zmniejszająca)",formula: "1 employer — PIT-2 filed",                          kind: "info",  amount: -pit2Red  },
              { step: 12, label: "Final Income Tax (Zaliczka PIT)",      formula: `round(${f(grossTax)} − ${pit2Red}) = ${incomeTax}`, kind: "sub",   amount: -incomeTax},
            ];
            const colourAmount = (r: Row) => {
              if (r.kind === "gross") return "text-white";
              if (r.kind === "netto") return "text-lime-400";
              if (r.kind === "sub")   return r.amount < 0 ? "text-red-400" : "text-gray-300";
              return "text-gray-400";
            };
            const prefix = (r: Row) => r.kind === "sub" && r.amount < 0 ? "−" : r.kind === "sub" ? "+" : "";

            return (
              <div className="border-b border-slate-700">
                <button
                  onClick={() => setShowCalc((v) => !v)}
                  className="w-full px-4 py-2.5 flex items-center justify-between group hover:bg-slate-800/40 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Calculator className="w-4 h-4 text-lime-400" />
                    <span className="text-xs font-bold uppercase tracking-widest text-lime-400">Brutto → Netto Calculator</span>
                    <span className="text-[10px] font-mono text-gray-500">Umowa Zlecenie 2026 · PIT-2</span>
                    {gross > 0 && (
                      <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-lime-900/40 border border-lime-500/30 rounded-full text-[10px] font-mono text-lime-400">
                        {f(gross)} → <strong>{f(netto)}</strong> PLN
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${showCalc ? "rotate-180" : ""}`} />
                </button>

                {showCalc && (
                  <div className="px-4 pb-5 pt-3 bg-slate-900/50">
                    {/* Input */}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">Gross (Brutto)</label>
                      <div className="relative">
                        <input
                          type="number" value={calcGross}
                          onChange={(e) => setCalcGross(e.target.value)}
                          min={0} step={0.01} placeholder="5024.00"
                          className="bg-slate-800 border border-lime-500/40 focus:border-lime-400 text-white rounded-xl px-4 py-2 text-base font-mono font-bold focus:outline-none focus:ring-1 focus:ring-lime-500/30 transition-all pr-14 w-44"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-500">PLN</span>
                      </div>
                      <span className="text-[10px] text-gray-600 font-mono">ZUS 11.26% · Health 9% · KUP 20% of Health Base · PIT 12% − 300</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Step table */}
                      <div className="lg:col-span-2 bg-slate-800/60 rounded-xl border border-slate-700 overflow-hidden">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-700 bg-slate-800">
                              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500 w-8">#</th>
                              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Description</th>
                              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500 hidden sm:table-cell">Formula</th>
                              <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-gray-500">Amount (PLN)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700/50">
                            {rows.map((r) => (
                              <tr key={r.step} className={`${r.kind === "gross" ? "bg-slate-800/50" : r.kind === "info" ? "bg-slate-900/30" : ""} hover:bg-slate-700/20 transition-colors`}>
                                <td className="px-3 py-2 text-gray-600 font-mono text-[10px]">{r.step}</td>
                                <td className={`px-3 py-2 font-semibold ${colourAmount(r)}`}>{r.label}</td>
                                <td className="px-3 py-2 text-gray-500 font-mono text-[10px] hidden sm:table-cell">{r.formula}</td>
                                <td className={`px-3 py-2 text-right font-mono font-bold ${colourAmount(r)}`}>
                                  {r.kind === "info" && r.amount >= 0
                                    ? f(r.amount)
                                    : `${prefix(r)}${f(Math.abs(r.amount))}`}
                                </td>
                              </tr>
                            ))}
                            {/* Final netto row */}
                            <tr className="bg-lime-900/20 border-t-2 border-lime-500/40">
                              <td className="px-3 py-3 text-lime-400 font-mono font-bold text-[10px]">13</td>
                              <td className="px-3 py-3 font-bold text-lime-400">Final Netto Payout</td>
                              <td className="px-3 py-3 text-gray-500 font-mono text-[10px] hidden sm:table-cell">
                                Gross − ZUS(5) − Health(7) − PIT(12)
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-black text-lg text-lime-400">{f(netto)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Right panel */}
                      <div className="flex flex-col gap-3">
                        {/* Netto card */}
                        <div className="bg-slate-800/60 rounded-xl border border-lime-500/40 p-5 flex flex-col items-center justify-center text-center flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-lime-400 mb-1">Net in Hand · Netto</p>
                          <p className="text-4xl font-mono font-black text-lime-400 leading-none">{f(netto)}</p>
                          <p className="text-sm text-gray-400 font-mono mt-1">PLN / month</p>
                          {gross > 0 && (
                            <p className="text-[10px] font-mono text-gray-500 mt-2">{((netto / gross) * 100).toFixed(1)}% of gross</p>
                          )}
                        </div>
                        {/* Cost split bar */}
                        {gross > 0 && (
                          <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Cost Split</p>
                            <div className="flex rounded-full overflow-hidden h-2.5 mb-3">
                              <div title={`ZUS ${pct(workerZUS)}`} className="bg-red-500" style={{ width: pct(workerZUS) }} />
                              <div title={`Health ${pct(healthTax)}`} className="bg-orange-400" style={{ width: pct(healthTax) }} />
                              <div title={`PIT ${pct(incomeTax)}`} className="bg-yellow-400" style={{ width: pct(incomeTax) }} />
                              <div title={`Netto ${pct(netto)}`} className="bg-lime-500 flex-1" />
                            </div>
                            <div className="space-y-1 text-[10px] font-mono">
                              {[
                                { label: "ZUS",    val: workerZUS, color: "bg-red-500"    },
                                { label: "Health", val: healthTax, color: "bg-orange-400" },
                                { label: "PIT",    val: incomeTax, color: "bg-yellow-400" },
                                { label: "Netto",  val: netto,     color: "bg-lime-500"   },
                              ].map(({ label, val, color }) => (
                                <div key={label} className="flex items-center justify-between">
                                  <span className="flex items-center gap-1.5 text-gray-400">
                                    <span className={`w-2 h-2 rounded-full ${color} inline-block`} />
                                    {label}
                                  </span>
                                  <span className="text-gray-300">{f(val)} <span className="text-gray-600">({pct(val)})</span></span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Site filter tabs ── */}
          {availableSites.length > 0 && (
            <div className="px-4 py-2.5 border-b border-slate-700 flex items-center gap-2 flex-wrap bg-slate-900/30">
              <Building2 className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              <button
                onClick={() => setSiteFilter("")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold font-mono transition-all whitespace-nowrap ${
                  !siteFilter
                    ? "bg-red-600 text-white shadow-[0_0_10px_rgba(196,30,24,0.4)]"
                    : "bg-slate-700 text-gray-400 hover:bg-slate-600 hover:text-white"
                }`}
              >
                All Sites
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${!siteFilter ? "bg-red-800/60" : "bg-slate-600"}`}>
                  {workers.length}
                </span>
              </button>
              {availableSites.map((site) => (
                <button
                  key={site}
                  onClick={() => setSiteFilter(siteFilter === site ? "" : site)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold font-mono transition-all whitespace-nowrap ${
                    siteFilter === site
                      ? "bg-red-600 text-white shadow-[0_0_10px_rgba(196,30,24,0.4)]"
                      : "bg-slate-700 text-gray-400 hover:bg-slate-600 hover:text-white"
                  }`}
                >
                  {site}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${siteFilter === site ? "bg-red-800/60" : "bg-slate-600"}`}>
                    {siteWorkerCount[site] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="app-table-scroll flex-1 min-h-0" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto', overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            <table className="w-full border-collapse" style={{ minWidth: showZUS && showSplit && isAdmin ? "2050px" : showZUS && isAdmin ? "1650px" : "1060px" }}>
              <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className={`${thCls} text-left`} style={{ minWidth: "180px" }}>Worker</th>
                  <th className={`${thCls} text-left`} style={{ minWidth: "140px" }}>Spec / Site</th>
                  <th className={`${thCls} text-left`} style={{ minWidth: "180px" }}>
                    <span className="text-cyan-400">Bank IBAN ✎</span>
                  </th>
                  <th className={`${thCls} text-right`} style={{ minWidth: "110px" }}>
                    {isAdmin ? "Gross Rate PLN/h" : <span className="text-gray-600">Rate</span>}
                  </th>
                  <th className={`${thCls} text-right`} style={{ minWidth: "100px" }}>
                    <span className="text-yellow-400">Hours ✎</span>
                  </th>
                  <th className={`${thCls} text-right`} style={{ minWidth: "120px" }}>
                    {isAdmin ? "Gross Total" : <span className="text-gray-600">Gross</span>}
                  </th>
                  {!showZUS && isAdmin && (<>
                    <th className={`${thCls} text-right text-green-300`} style={{ minWidth: "100px" }}>Net/h</th>
                    <th className={`${thCls} text-right text-purple-300`} style={{ minWidth: "120px" }}>Final Net</th>
                  </>)}
                  {showZUS && isAdmin && <>
                    <th className={`${thCls} text-right text-purple-400`} style={{ minWidth: "110px" }}>Emp. ZUS</th>
                    <th className={`${thCls} text-right text-purple-400`} style={{ minWidth: "110px" }}>Health Ins.</th>
                    <th className={`${thCls} text-right text-purple-400`} style={{ minWidth: "100px" }}>Est. PIT</th>
                    <th className={`${thCls} text-right text-purple-300`} style={{ minWidth: "120px" }}>Net After Tax</th>
                    <th className={`${thCls} text-right text-green-300`} style={{ minWidth: "100px" }}>Net/h</th>
                    <th className={`${thCls} text-right text-orange-400`} style={{ minWidth: "140px" }}>Total Empl. Cost</th>
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
                    <span className="text-green-400">Take-Home</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-700/40">
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <PayrollRowSkeleton key={i} cols={showZUS && isAdmin ? 11 : 7} />
                  ))
                ) : filteredWorkers.length === 0 ? (
                  <tr>
                    <td colSpan={showZUS && isAdmin ? 11 : 7} className="px-5 py-12 text-center text-gray-500 font-mono text-sm">
                      {payrollSearch ? "No workers match your search" : "No workers found"}
                    </td>
                  </tr>
                ) : (
                  filteredWorkers.map((w) => {
                    const wPit2 = pit2Overrides[w.id] ?? true;
                    const zus = isAdmin ? calcZUS(w.grossPayout, w.advance, w.penalties, zusRates, wPit2) : null;
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
                        {/* IBAN */}
                        <td className={tdCls}>
                          {isAdmin
                            ? <IBANCell value={w.iban} workerId={w.id} onSave={handleSaveIBAN} />
                            : w.iban
                              ? <span className="text-xs font-mono text-cyan-300/60">{w.iban.slice(0, 8)}…</span>
                              : <span className="text-xs font-mono text-gray-700">—</span>
                          }
                        </td>
                        {/* Rate */}
                        <td className={`${tdCls} text-right`}>
                          {isAdmin
                            ? <NumCell value={w.hourlyRate} workerId={w.id} field="hourlyRate" onSave={handleSave} accent="text-blue-400" />
                            : <span className="text-sm font-mono text-gray-600 block text-right">{fmt(w.hourlyRate)}</span>}
                        </td>
                        {/* Hours */}
                        <td className={`${tdCls} text-right`} style={{ minWidth: "100px", maxWidth: "100px" }}>
                          <NumCell value={w.monthlyHours} workerId={w.id} field="monthlyHours" onSave={handleSave} accent="text-yellow-400" />
                        </td>
                        {/* Gross */}
                        <td className={`${tdCls} text-right`}>
                          <span className={`text-sm font-mono font-semibold ${isAdmin ? "text-blue-400" : "text-gray-600"}`}>
                            {fmt(w.grossPayout)}
                          </span>
                        </td>
                        {/* Net/h + Final Net in basic view */}
                        {!showZUS && isAdmin && zus && (<>
                          <td className={`${tdCls} text-right`} style={{ minWidth: "100px" }}>
                            <NetHourCell netPerHour={w.monthlyHours > 0 ? zus.netAfterTax / w.monthlyHours : 0} monthlyHours={w.monthlyHours} workerId={w.id} zusRates={zusRates} pit2={wPit2} onSave={handleSave} />
                          </td>
                          <td className={`${tdCls} text-right`}>
                            <span className="text-sm font-mono font-semibold text-purple-300">{fmt(zus.netAfterTax)}</span>
                          </td>
                        </>)}
                        {/* ZUS columns */}
                        {showZUS && isAdmin && zus && <>
                          <td className={`${tdCls} text-right`}>
                            <span className="text-sm font-mono text-purple-400">− {fmt(zus.employeeZUS)}</span>
                          </td>
                          <td className={`${tdCls} text-right`}>
                            <span className="text-sm font-mono text-purple-400">− {fmt(zus.healthInsurance)}</span>
                          </td>
                          <td className={`${tdCls} text-right`}>
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-sm font-mono text-purple-400">− {fmt(zus.estimatedTax)}</span>
                              <button
                                onClick={() => handleTogglePIT2(w.id, !wPit2)}
                                title={wPit2 ? "PIT-2 filed — click to remove" : "PIT-2 not filed — click to apply"}
                                className={`flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-full transition-all ${
                                  wPit2
                                    ? "bg-green-600/30 text-green-400 border border-green-500/40 hover:bg-green-600/50"
                                    : "bg-slate-700 text-gray-600 border border-slate-600 hover:text-gray-400"
                                }`}
                              >
                                PIT-2 {wPit2 ? "✓" : "○"}
                              </button>
                            </div>
                          </td>
                          <td className={`${tdCls} text-right`}>
                            <span className="text-sm font-mono font-semibold text-purple-300">{fmt(zus.netAfterTax)}</span>
                          </td>
                          <td className={`${tdCls} text-right`} style={{ minWidth: "100px" }}>
                            <NetHourCell netPerHour={w.monthlyHours > 0 ? zus.netAfterTax / w.monthlyHours : 0} monthlyHours={w.monthlyHours} workerId={w.id} zusRates={zusRates} pit2={wPit2} onSave={handleSave} />
                          </td>
                          <td className={`${tdCls} text-right`}>
                            <div>
                              <span className="text-sm font-mono font-semibold text-orange-400">{fmt(zus.totalEmployerCost)}</span>
                              <span className="text-[10px] text-gray-600 block font-mono">+{fmt(zus.employerZUS)} ZUS</span>
                            </div>
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
                            <span className={`text-sm font-mono font-bold ${(zus ? zus.takeHome : w.finalNetto) < 0 ? "text-red-400" : "text-green-400"}`}>
                              {fmt(zus ? zus.takeHome : w.finalNetto)}
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
                    <td className={`${tdCls} text-xs font-bold text-gray-300 uppercase tracking-widest`} colSpan={3}>
                      {siteFilter ? `${siteFilter.toUpperCase()} — ` : "TOTALS — "}{filteredWorkers.length}
                      {workers.length !== filteredWorkers.length ? ` of ${workers.length}` : ""} workers
                    </td>
                    <td className={`${tdCls} text-right text-sm font-mono text-gray-500`}>—</td>
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-yellow-400`}>{fmt(totals.hours)}</td>
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-blue-400`}>{fmt(totals.gross)}</td>
                    {showZUS && isAdmin && zusTotal && <>
                      <td className={`${tdCls} text-right text-sm font-mono font-bold text-purple-400`}>− {fmt(zusTotal.zus)}</td>
                      <td className={`${tdCls} text-right text-sm font-mono font-bold text-purple-400`}>− {fmt(zusTotal.health)}</td>
                      <td className={`${tdCls} text-right text-sm font-mono font-bold text-purple-400`}>− {fmt(zusTotal.tax)}</td>
                      <td className={`${tdCls} text-right text-sm font-mono font-bold text-purple-300`}>{fmt(zusTotal.net)}</td>
                      <td className={`${tdCls} text-right`}>
                        <div>
                          <span className="text-sm font-mono font-bold text-orange-400">{fmt(zusTotal.totalEmployerCost)}</span>
                          <span className="text-[10px] text-gray-500 block font-mono">+{fmt(zusTotal.employerZUS)} ZUS</span>
                        </div>
                      </td>
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
                    {/* Net/h + Final Net totals in basic view */}
                    {!showZUS && isAdmin && zusTotal && (<>
                      <td className={`${tdCls} text-right text-sm font-mono text-gray-500`}>—</td>
                      <td className={`${tdCls} text-right text-sm font-mono font-bold text-purple-300`}>{fmt(zusTotal.net)}</td>
                    </>)}
                    {/* Net/h total in ZUS view */}
                    {showZUS && isAdmin && (
                      <td className={`${tdCls} text-right text-sm font-mono text-gray-500`}>—</td>
                    )}
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-orange-400`}>{fmt(totals.advances)}</td>
                    <td className={`${tdCls} text-right text-sm font-mono font-bold text-red-400`}>{fmt(totals.penalties)}</td>
                    <td className={`${tdCls} text-right`}>
                      <span className="text-base font-mono font-bold text-green-400">{fmt(zusTotal ? zusTotal.take : totals.netto)}</span>
                      <span className="text-xs text-gray-500 ml-1 font-mono">PLN</span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* ── Close Month (pinned at bottom) ───────────────────────────── */}
        {isAdmin && (
          <div className="flex-shrink-0 border border-red-500/30 bg-red-950/20 rounded-xl p-3 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
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
                <span className="text-gray-300">Final Net Payout:</span>
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
                <span className="text-gray-300">Total Net Paid:</span>
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
