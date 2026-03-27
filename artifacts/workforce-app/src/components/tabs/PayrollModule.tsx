import React from "react";
import { useTranslation } from "react-i18next";
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
  const pension = Math.round(gross * 0.0976 * 100) / 100;
  const disability = Math.round(gross * 0.015 * 100) / 100;
  const zus = pension + disability;
  const health = Math.round(gross * 0.079866 * 100) / 100;
  const healthBase = gross - zus;
  const kup = Math.round(healthBase * 0.20 * 100) / 100;
  const taxBase = Math.round(healthBase - kup);
  const pit = Math.max(0, Math.round(taxBase * 0.12) - 300);
  const netto = Math.round((gross - zus - health - pit) * 100) / 100;
  return { gross, zus, pit, netto };
}

export function PayrollModule() {
  const { t } = useTranslation();
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
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground">{t("payroll.zusPayrollLedger")}</h2>
        <span className="text-[9px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full tracking-wide">{t("payroll.march2026")}</span>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-base font-heading font-black text-indigo-600">PLN {(totalGross / 1000).toFixed(1)}K</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5">{t("payroll.grossTotal")}</div>
        </div>
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-base font-heading font-black text-emerald-600">PLN {(totalNetto / 1000).toFixed(1)}K</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5">{t("payroll.nettoTotal")}</div>
        </div>
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-base font-heading font-black text-amber-600">PLN {(totalZus / 1000).toFixed(1)}K</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5">{t("payroll.zusTotal")}</div>
        </div>
      </div>

      {/* Per-worker ledger */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground ml-1">{t("payroll.umowaBreakdown")}</h3>
        <div className="premium-card rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
          {rows.map(({ worker, gross, zus, pit, netto }) => (
            <div key={worker.id} className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-indigo-500/15 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-indigo-400">
                    {worker.name.split(" ").map(n => n[0]).join("")}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{worker.name}</div>
                  <div className="text-[11px] text-muted-foreground">{worker.trade} · {worker.workplace.split("–")[0].trim()}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-emerald-600">PLN {netto.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">{t("payroll.netto")}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-1 pl-11">
                <div className="bg-white/[0.04] rounded-lg px-2 py-1 text-center">
                  <div className="text-[10px] font-bold text-foreground">{gross.toLocaleString()}</div>
                  <div className="text-[9px] text-muted-foreground">{t("payroll.gross")}</div>
                </div>
                <div className="bg-white/[0.04] rounded-lg px-2 py-1 text-center">
                  <div className="text-[10px] font-bold text-amber-400">{zus.toLocaleString()}</div>
                  <div className="text-[9px] text-muted-foreground">{t("payroll.zus")}</div>
                </div>
                <div className="bg-white/[0.04] rounded-lg px-2 py-1 text-center">
                  <div className="text-[10px] font-bold text-red-600">{pit.toLocaleString()}</div>
                  <div className="text-[9px] text-muted-foreground">{t("payroll.pit")}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground ml-1">{t("payroll.actions")}</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Download, label: t("modules.exportCsv"), sub: t("modules.fullPayrollLedger"), bg: "bg-indigo-500/10", col: "text-indigo-600", border: "hover:border-indigo-500/25" },
            { icon: Calculator, label: t("modules.zusCalculator"), sub: t("modules.manualEntry"), bg: "bg-blue-500/10", col: "text-blue-600", border: "hover:border-blue-500/25" },
            { icon: BookOpen, label: t("modules.umowyZlecenie"), sub: t("modules.contractsActive"), bg: "bg-emerald-500/10", col: "text-emerald-600", border: "hover:border-emerald-500/25" },
            { icon: CreditCard, label: t("modules.b2bContracts"), sub: "2 active", bg: "bg-teal-500/10", col: "text-teal-600", border: "hover:border-teal-500/25" },
          ].map(({ icon: Icon, label, sub, bg, col, border }) => (
            <button key={label} className={`premium-card rounded-2xl p-4 flex flex-col gap-2 active:scale-95 transition-all hover:scale-[1.01] ${border}`}>
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

    </>
  );
}
