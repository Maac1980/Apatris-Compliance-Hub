import { useState, useMemo } from "react";

export type ContractType = "zlecenie" | "praca";

export function calculate(hours: number, rate: number, contract: ContractType, applyPit2: boolean, includeSickness: boolean) {
  const gross = Math.round(hours * rate * 100) / 100;

  // Employee ZUS: pension 9.76% + disability 1.50% + optional sickness 2.45%
  const pension = Math.round(gross * 0.0976 * 100) / 100;
  const disability = Math.round(gross * 0.015 * 100) / 100;
  const sickness = includeSickness ? Math.round(gross * 0.0245 * 100) / 100 : 0;
  const employeeZus = pension + disability + sickness;

  // Health base = gross - ZUS
  const healthBase = gross - employeeZus;

  // Health insurance = healthBase × 9%
  const health = Math.round(healthBase * 0.09 * 100) / 100;

  // Tax base
  let taxBase: number;
  if (contract === "zlecenie") {
    const kup = Math.round(healthBase * 0.20 * 100) / 100;
    taxBase = Math.round(healthBase - kup);
  } else {
    taxBase = Math.round(gross - employeeZus - 250);
  }

  // PIT = max(0, round(taxBase × 12%) - 300 if PIT-2)
  const rawPit = Math.round(taxBase * 0.12) - (applyPit2 ? 300 : 0);
  const pit = Math.max(0, rawPit);

  // Net = gross - ZUS - health - PIT
  const net = Math.round((gross - employeeZus - health - pit) * 100) / 100;

  // Net per hour
  const netPerHour = hours > 0 ? Math.round((net / hours) * 100) / 100 : 0;

  // Employer ZUS
  const empPension = Math.round(gross * 0.0976 * 100) / 100;
  const empDisability = Math.round(gross * 0.065 * 100) / 100;
  const empAccident = contract === "praca" ? Math.round(gross * 0.0167 * 100) / 100 : 0;
  const empFP = Math.round(gross * 0.0245 * 100) / 100;
  const empFGSP = Math.round(gross * 0.001 * 100) / 100;
  const employerZus = empPension + empDisability + empAccident + empFP + empFGSP;
  const totalCost = Math.round((gross + employerZus) * 100) / 100;

  return { gross, employeeZus, health, pit, net, netPerHour, employerZus, totalCost, taxBase };
}

// Reverse calculator: given desired net, find gross rate per hour
export function reverseCalculate(hours: number, desiredNet: number, contract: ContractType, applyPit2: boolean, includeSickness: boolean) {
  // Binary search for the gross rate that produces the desired net
  let lo = 0, hi = desiredNet * 3;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const result = calculate(hours, mid, contract, applyPit2, includeSickness);
    const netPerHour = hours > 0 ? result.net / hours : 0;
    if (netPerHour < desiredNet) lo = mid;
    else hi = mid;
    if (Math.abs(netPerHour - desiredNet) < 0.005) break;
  }
  const grossRate = Math.round(((lo + hi) / 2) * 100) / 100;
  return calculate(hours, grossRate, contract, applyPit2, includeSickness);
}

export function KnowledgeCenter() {
  const [hours, setHours] = useState(160);
  const [rate, setRate] = useState(31.40);
  const [contract, setContract] = useState<ContractType>("zlecenie");
  const [applyPit2, setApplyPit2] = useState(true);
  const [includeSickness, setIncludeSickness] = useState(false);
  const [mode, setMode] = useState<"gross" | "net">("gross");
  const [desiredNetRate, setDesiredNetRate] = useState(25.00);

  const r = useMemo(() =>
    mode === "gross"
      ? calculate(hours, rate, contract, applyPit2, includeSickness)
      : reverseCalculate(hours, desiredNetRate, contract, applyPit2, includeSickness),
    [hours, rate, desiredNetRate, contract, applyPit2, includeSickness, mode]
  );

  const grossRate = mode === "net" && hours > 0 ? Math.round((r.gross / hours) * 100) / 100 : rate;

  return (
    <div className="tab-page" style={{ background: "#0f172a", padding: 0 }}>
    <div className="p-4 text-slate-200 pb-24">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-bold text-white">ZUS Calculator</h1>

        {/* Contract Toggle */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          <button onClick={() => setContract("zlecenie")} className={`flex-1 py-2 text-sm font-bold transition-colors ${contract === "zlecenie" ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400"}`}>
            Umowa Zlecenie
          </button>
          <button onClick={() => setContract("praca")} className={`flex-1 py-2 text-sm font-bold transition-colors ${contract === "praca" ? "bg-green-600 text-white" : "bg-slate-900 text-slate-400"}`}>
            Umowa o Prace
          </button>
        </div>

        {/* Mode Toggle: Gross→Net or Net→Gross */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          <button onClick={() => setMode("gross")} className={`flex-1 py-2 text-xs font-bold transition-colors ${mode === "gross" ? "bg-blue-500 text-white" : "bg-slate-900 text-slate-400"}`}>
            Gross → Net
          </button>
          <button onClick={() => setMode("net")} className={`flex-1 py-2 text-xs font-bold transition-colors ${mode === "net" ? "bg-green-500 text-white" : "bg-slate-900 text-slate-400"}`}>
            Net → Gross (Reverse)
          </button>
        </div>

        {/* Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Hours</span><span className="text-blue-400 font-bold">{hours}h</span>
            </div>
            <input type="range" min={1} max={300} value={hours} onChange={e => setHours(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>

          {mode === "gross" ? (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Gross Hourly Rate (PLN)</label>
              <input type="number" step="0.10" value={rate} onChange={e => setRate(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none" />
              {/* Net per hour display */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500">Net per hour:</span>
                <span className="text-sm font-black text-green-400">{r.netPerHour.toFixed(2)} PLN/h</span>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Desired Net Hourly Rate (PLN)</label>
              <input type="number" step="0.10" value={desiredNetRate} onChange={e => setDesiredNetRate(Number(e.target.value))} className="w-full bg-slate-950 border border-green-700 rounded-lg px-3 py-2 text-green-300 text-sm outline-none" />
              {/* Gross per hour needed */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500">Gross rate needed:</span>
                <span className="text-sm font-black text-blue-400">{grossRate.toFixed(2)} PLN/h</span>
              </div>
            </div>
          )}

          <div className="flex gap-4 pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={applyPit2} onChange={e => setApplyPit2(e.target.checked)} className="accent-blue-500" />
              PIT-2 (300 PLN)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={includeSickness} onChange={e => setIncludeSickness(e.target.checked)} className="accent-blue-500" />
              Sickness (2.45%)
            </label>
          </div>
        </div>

        {/* Per-hour summary card */}
        <div className="bg-gradient-to-r from-blue-900/50 to-green-900/50 border border-slate-700 rounded-xl p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-slate-400 uppercase">Gross / Hour</p>
              <p className="text-lg font-black text-blue-400">{grossRate.toFixed(2)} PLN</p>
            </div>
            <div className="text-2xl text-slate-600">→</div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase">Net / Hour</p>
              <p className="text-lg font-black text-green-400">{r.netPerHour.toFixed(2)} PLN</p>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">Gross Monthly</p>
            <p className="text-xl font-black text-blue-400">{r.gross.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">Net Take-Home</p>
            <p className="text-xl font-black text-green-400">{r.net.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">Employee ZUS</p>
            <p className="text-xl font-black text-red-400">-{r.employeeZus.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">Health</p>
            <p className="text-xl font-black text-red-400">-{r.health.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">PIT Tax</p>
            <p className="text-xl font-black text-amber-400">-{r.pit.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 uppercase mb-1">Total Employer Cost</p>
            <p className="text-xl font-black text-rose-400">{r.totalCost.toFixed(2)}</p>
            <p className="text-xs text-slate-500">PLN</p>
          </div>
        </div>

        {/* Tax Base Info */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-400">
          <div className="flex justify-between"><span>Tax Base (Podstawa)</span><span className="text-white">{r.taxBase.toFixed(2)} PLN</span></div>
          <div className="flex justify-between mt-1"><span>Employer ZUS</span><span className="text-white">{r.employerZus.toFixed(2)} PLN</span></div>
          <div className="flex justify-between mt-1"><span>Net per Hour</span><span className="text-green-400 font-bold">{r.netPerHour.toFixed(2)} PLN/h</span></div>
          <div className="flex justify-between mt-1"><span>Contract Type</span><span className="text-white">{contract === "zlecenie" ? "Umowa Zlecenie" : "Umowa o Prace"}</span></div>
          <div className="flex justify-between mt-1"><span>Mode</span><span className="text-white">{mode === "gross" ? "Gross → Net" : "Net → Gross (Reverse)"}</span></div>
        </div>
      </div>
    </div>
    </div>
  );
}
