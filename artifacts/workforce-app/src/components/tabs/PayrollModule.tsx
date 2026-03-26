import { KnowledgeCenter } from "@/components/KnowledgeCenter";
import { Receipt, TrendingUp, Users, ChevronRight, CreditCard, BookOpen, Download, Calculator } from "lucide-react";
import { motion } from "framer-motion";
import { MOCK_WORKERS } from "@/data/mockWorkers";

const GROSS_RATES: Record<string, number> = {
  w1: 9200,
  w2: 8600,
  w3: 8600,
  w4: 9000,
  w5: 8400,
};

function calcNetto(gross: number) {
  const zus = Math.round(gross * 0.1126);
  const healthBase = gross - zus;
  const healthTax = Math.round(healthBase * 0.09);
  const taxBase = Math.round(healthBase * 0.8);
  const pit = Math.max(0, Math.round(taxBase * 0.12 - 300));
  const netto = gross - zus - healthTax - pit;
  return { gross, zus, pit, netto };
}

export function PayrollModule() {
  const [showCalc, setShowCalc] = React.useState(false);
  const rows = MOCK_WORKERS.map(w => ({
    worker: w,
    ...calcNetto(GROSS_RATES[w.id] ?? 8500),
  }));

  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalNetto = rows.reduce((s, r) => s + r.netto, 0);
  const totalZus = rows.reduce((s, r) => s + r.zus, 0);

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-5 pb-6"
    >
      <div className="flex items-center justify-between ml-1">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">ZUS & Payroll Ledger</h2>
        <span className="text-[9px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full tracking-wide">MARCH 2026</span>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
          <div className="text-base font-black text-indigo-600">PLN {(totalGross / 1000).toFixed(1)}K</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Gross Total</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
          <div className="text-base font-black text-emerald-600">PLN {(totalNetto / 1000).toFixed(1)}K</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Netto Total</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-3 text-center">
          <div className="text-base font-black text-amber-600">PLN {(totalZus / 1000).toFixed(1)}K</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5">ZUS Total</div>
        </div>
      </div>

      {/* Per-worker ledger */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Umowa Zlecenie · Breakdown</h3>
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden divide-y divide-gray-50">
          {rows.map(({ worker, gross, zus, pit, netto }) => (
            <div key={worker.id} className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-indigo-700">
                    {worker.name.split(" ").map(n => n[0]).join("")}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{worker.name}</div>
                  <div className="text-[11px] text-muted-foreground">{worker.trade} · {worker.workplace.split("–")[0].trim()}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-emerald-600">PLN {netto.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">netto</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-1 pl-11">
                <div className="bg-gray-50 rounded-lg px-2 py-1 text-center">
                  <div className="text-[10px] font-bold text-foreground">{gross.toLocaleString()}</div>
                  <div className="text-[9px] text-muted-foreground">Gross</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-2 py-1 text-center">
                  <div className="text-[10px] font-bold text-amber-700">{zus.toLocaleString()}</div>
                  <div className="text-[9px] text-muted-foreground">ZUS</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-2 py-1 text-center">
                  <div className="text-[10px] font-bold text-red-600">{pit.toLocaleString()}</div>
                  <div className="text-[9px] text-muted-foreground">PIT</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Actions</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Download, label: "Export CSV", sub: "Full payroll ledger", bg: "bg-indigo-50", col: "text-indigo-600", border: "hover:border-indigo-200" },
            { icon: Calculator, label: "ZUS Calculator", sub: "Manual entry", bg: "bg-blue-50", col: "text-blue-600", border: "hover:border-blue-200", action: () => setShowCalc(true) },
            { icon: BookOpen, label: "Umowy Zlecenie", sub: "5 contracts active", bg: "bg-emerald-50", col: "text-emerald-600", border: "hover:border-emerald-200" },
            { icon: CreditCard, label: "B2B Contracts", sub: "2 active", bg: "bg-teal-50", col: "text-teal-600", border: "hover:border-teal-200" },
          ].map(({ icon: Icon, label, sub, bg, col, border }) => (
            <button key={label} onClick={(action as any)?.()} className={`bg-white rounded-2xl border shadow-sm p-4 flex flex-col gap-2 active:scale-95 transition-all ${border} hover:shadow-md`}>
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${col}`} />
              </div>
              <div>
                <div className="text-xs font-bold text-foreground leading-tight">{label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
    {showCalc && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, overflowY: "auto" }}>
        <div style={{ background: "#0f172a", minHeight: "100vh", paddingBottom: "80px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>ZUS Calculator</span>
            <button onClick={() => setShowCalc(false)} style={{ color: "#fff", background: "none", border: "none", fontSize: 24, cursor: "pointer" }}>✕</button>
          </div>
          <KnowledgeCenter />
        </div>
      </div>
    )}
    </>
  );
}
