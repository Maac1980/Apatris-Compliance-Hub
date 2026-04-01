import { useState, useMemo } from "react";

function calcFromGross(grossPerHour: number, hours: number, pit2: boolean) {
  const gross = Math.round(grossPerHour * hours * 100) / 100;
  const pension = Math.round(gross * 0.0976 * 100) / 100;
  const disability = Math.round(gross * 0.015 * 100) / 100;
  const zus = pension + disability;
  const healthBase = gross - zus;
  const health = Math.round(healthBase * 0.09 * 100) / 100;
  const kup = Math.round(healthBase * 0.20 * 100) / 100;
  const taxBase = Math.max(0, Math.round(healthBase - kup));
  const grossTax = Math.round(taxBase * 0.12);
  const pit = Math.max(0, grossTax - (pit2 ? 300 : 0));
  const net = Math.round((gross - zus - health - pit) * 100) / 100;
  const netPerHour = hours > 0 ? Math.round((net / hours) * 100) / 100 : 0;
  const empPension = Math.round(gross * 0.0976 * 100) / 100;
  const empDisability = Math.round(gross * 0.065 * 100) / 100;
  const empFP = Math.round(gross * 0.0245 * 100) / 100;
  const empFGSP = Math.round(gross * 0.001 * 100) / 100;
  const employerZus = empPension + empDisability + empFP + empFGSP;
  const totalCost = Math.round((gross + employerZus) * 100) / 100;
  return { gross, pension, disability, zus, healthBase, health, kup, taxBase, grossTax, pit, net, netPerHour, employerZus, totalCost };
}

// Reverse: estimate gross then walk up by 0.01 until net matches
function calcFromNet(desiredNetPerHour: number, hours: number, pit2: boolean) {
  if (hours <= 0 || desiredNetPerHour <= 0) return { grossRate: 0, ...calcFromGross(0, hours, pit2) };

  const desiredNetMonthly = desiredNetPerHour * hours;

  // Step 1: estimate using effective deduction rate (~19.25% for Zlecenie with PIT-2)
  let grossPerHour = Math.round(((desiredNetMonthly + (pit2 ? 300 : 0)) / 0.807534 / hours) * 100) / 100;

  // Step 2-5: verify with exact forward formula, increase by 0.01 if net too low
  for (let i = 0; i < 200; i++) {
    const r = calcFromGross(grossPerHour, hours, pit2);
    if (r.net >= desiredNetMonthly - 0.005) {
      return { grossRate: grossPerHour, ...r };
    }
    grossPerHour = Math.round((grossPerHour + 0.01) * 100) / 100;
  }

  return { grossRate: grossPerHour, ...calcFromGross(grossPerHour, hours, pit2) };
}

export default function NetPerHour() {
  const [mode, setMode] = useState<"gross" | "net">("gross");
  const [grossStr, setGrossStr] = useState("31.40");
  const [netStr, setNetStr] = useState("24.56");
  const [grossCommitted, setGrossCommitted] = useState(31.40);
  const [netCommitted, setNetCommitted] = useState(24.56);
  const [hours, setHours] = useState(160);
  const [pit2, setPit2] = useState(true);

  const commitGross = () => { const v = parseFloat(grossStr); if (!isNaN(v) && v > 0) setGrossCommitted(v); };
  const commitNet = () => { const v = parseFloat(netStr); if (!isNaN(v) && v > 0) setNetCommitted(v); };

  const r = useMemo(() => {
    if (mode === "gross") return { grossRate: grossCommitted, ...calcFromGross(grossCommitted, hours, pit2) };
    return calcFromNet(netCommitted, hours, pit2);
  }, [mode, grossCommitted, netCommitted, hours, pit2]);

  const sections = [
    { title: "Gross", items: [
      { label: "Gross / Hour", value: `${r.grossRate.toFixed(2)} PLN`, accent: "text-blue-400" },
      { label: "Hours / Month", value: `${hours}h`, accent: "text-slate-400" },
      { label: "Gross Monthly", value: `${r.gross.toFixed(2)} PLN`, accent: "text-blue-400" },
    ]},
    { title: "Employee Deductions", items: [
      { label: "Pension (9.76%)", value: `− ${r.pension.toFixed(2)}`, accent: "text-red-400" },
      { label: "Disability (1.50%)", value: `− ${r.disability.toFixed(2)}`, accent: "text-red-400" },
      { label: "Employee ZUS Total", value: `− ${r.zus.toFixed(2)}`, accent: "text-red-400 font-bold" },
    ]},
    { title: "Health & Tax", items: [
      { label: "Health Base (Gross − ZUS)", value: `${r.healthBase.toFixed(2)}`, accent: "text-slate-300" },
      { label: "Health Insurance (9%)", value: `− ${r.health.toFixed(2)}`, accent: "text-amber-400" },
      { label: "KUP (20% of Health Base)", value: `${r.kup.toFixed(2)}`, accent: "text-slate-400" },
      { label: "Tax Base", value: `${r.taxBase.toFixed(2)}`, accent: "text-slate-400" },
      { label: "Gross Tax (12%)", value: `${r.grossTax.toFixed(2)}`, accent: "text-slate-400" },
      { label: `PIT${pit2 ? " (−300 PIT-2)" : ""}`, value: `− ${r.pit.toFixed(2)}`, accent: "text-amber-400 font-bold" },
    ]},
    { title: "Employer Cost", items: [
      { label: "Employer ZUS", value: `+ ${r.employerZus.toFixed(2)}`, accent: "text-orange-400" },
      { label: "Total Employer Cost", value: `${r.totalCost.toFixed(2)} PLN`, accent: "text-orange-400 font-bold" },
    ]},
  ];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Net Per Hour</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Polish ZUS Calculator · Umowa Zlecenie</p>
          </div>
          <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider">
            Verified 2026
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden border-2 border-slate-700 mb-4">
          <button onClick={() => setMode("gross")}
            className={`flex-1 py-3 text-sm font-bold transition-all ${mode === "gross" ? "bg-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]" : "bg-card text-muted-foreground hover:text-white"}`}>
            Gross → Net
          </button>
          <button onClick={() => setMode("net")}
            className={`flex-1 py-3 text-sm font-bold transition-all ${mode === "net" ? "bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]" : "bg-card text-muted-foreground hover:text-white"}`}>
            Net → Gross
          </button>
        </div>

        {/* Input card */}
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          {mode === "gross" ? (
            <div className="mb-4">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Gross Per Hour (PLN)</label>
              <input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" value={grossStr}
                onChange={(e) => setGrossStr(e.target.value)} onBlur={commitGross}
                onKeyDown={(e) => { if (e.key === "Enter") commitGross(); }}
                className="w-full px-4 py-3 bg-slate-800 border-2 border-blue-500/50 rounded-xl text-2xl font-black text-blue-400 outline-none focus:border-blue-400 transition-colors" />
            </div>
          ) : (
            <div className="mb-4">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Desired Net Per Hour (PLN)</label>
              <input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" value={netStr}
                onChange={(e) => setNetStr(e.target.value)} onBlur={commitNet}
                onKeyDown={(e) => { if (e.key === "Enter") commitNet(); }}
                className="w-full px-4 py-3 bg-slate-800 border-2 border-emerald-500/50 rounded-xl text-2xl font-black text-emerald-400 outline-none focus:border-emerald-400 transition-colors" />
              <div className="mt-2 text-sm font-bold text-blue-400">
                → Need gross: {r.grossRate.toFixed(2)} PLN/h
              </div>
            </div>
          )}
          <div className="mb-3">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Hours / Month</label>
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={360} value={hours} onChange={(e) => setHours(Number(e.target.value))}
                className="flex-1 accent-primary" />
              <input type="number" min={0} max={360} value={hours} onChange={(e) => { const v = Math.max(0, Math.min(360, Number(e.target.value) || 0)); setHours(v); }}
                className="w-16 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-sm font-bold text-white text-center outline-none focus:border-primary" />
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={pit2} onChange={(e) => setPit2(e.target.checked)}
              className="w-5 h-5 rounded accent-emerald-500" />
            <span className="text-sm text-foreground">PIT-2 filed (−300 PLN tax reduction)</span>
          </label>
        </div>

        {/* Big result card */}
        <div className="relative overflow-hidden rounded-xl mb-4 p-6"
          style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute inset-0 opacity-10"
            style={{ background: "radial-gradient(circle at 20% 50%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 50%, #10b981 0%, transparent 50%)" }} />
          <div className="relative flex justify-between items-center">
            <div>
              <div className="text-[10px] uppercase tracking-[2px] text-slate-500 mb-1">Gross / Hour</div>
              <div className="text-3xl font-black text-blue-400">{r.grossRate.toFixed(2)}</div>
              <div className="text-xs text-slate-500 mt-0.5">PLN/h</div>
            </div>
            <div className="text-3xl text-slate-700 font-light">→</div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[2px] text-slate-500 mb-1">Net / Hour</div>
              <div className="text-3xl font-black text-emerald-400">{r.netPerHour.toFixed(2)}</div>
              <div className="text-xs text-slate-500 mt-0.5">PLN/h</div>
            </div>
          </div>
          {/* Net monthly highlight */}
          <div className="relative mt-4 pt-4 border-t border-slate-700/50 flex justify-between items-center">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Net Monthly</span>
            <span className="text-xl font-black text-emerald-400">{r.net.toFixed(2)} PLN</span>
          </div>
        </div>

        {/* Full breakdown sections */}
        {sections.map((section, si) => (
          <div key={si} className="bg-card border border-border rounded-xl p-4 mb-3">
            <div className="text-[10px] font-bold uppercase tracking-[2px] text-primary mb-3">{section.title}</div>
            {section.items.map((item, ii) => (
              <div key={ii} className="flex justify-between items-center py-1.5">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <span className={`text-sm font-mono font-semibold ${item.accent}`}>{item.value}</span>
              </div>
            ))}
          </div>
        ))}

      </div>
    </div>
  );
}
