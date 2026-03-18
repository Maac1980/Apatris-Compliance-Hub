import { AlertCircle, AlertTriangle, ShieldX, CheckCircle2, Lock } from "lucide-react";
import { motion } from "framer-motion";

export function ManagerHome() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-6"
    >
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <div className="text-xs font-bold text-violet-800">Financial Firewall Active</div>
          <div className="text-[11px] text-violet-600/80 font-medium">Payroll ledgers and ZUS calculators are restricted to Tier 1 only.</div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Legality Alerts</h2>
          <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">3</span>
        </div>
        <p className="text-xs text-muted-foreground ml-1 -mt-3">Workers requiring immediate attention</p>

        <div className="space-y-3">
          <div className="bg-white rounded-2xl border-l-4 border-l-amber-400 border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span className="font-bold text-sm text-foreground">TRC Expiring Soon</span>
              </div>
              <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-md">1 worker</span>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <div>
                <div className="text-sm font-semibold">Tomasz Nowak</div>
                <div className="text-xs text-muted-foreground">Steel Fixer · Site B – Kraków East</div>
              </div>
              <div className="text-sm font-bold text-amber-600">24 days</div>
            </div>
            <button className="text-amber-600 text-xs font-semibold mt-2 hover:underline active:opacity-70 transition-opacity">
              View Worker →
            </button>
          </div>

          <div className="bg-white rounded-2xl border-l-4 border-l-red-500 border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="font-bold text-sm text-foreground">Missing TRC Certificate</span>
              </div>
              <span className="bg-red-50 text-red-700 text-[10px] font-bold px-2 py-1 rounded-md">1 worker</span>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <div>
                <div className="text-sm font-semibold">Piotr Wiśniewski</div>
                <div className="text-xs text-muted-foreground">Welder · Site A – Warsaw North</div>
              </div>
              <div className="text-sm font-bold text-red-600">Overdue</div>
            </div>
            <button className="text-red-600 text-xs font-semibold mt-2 hover:underline active:opacity-70 transition-opacity">
              View Worker →
            </button>
          </div>

          <div className="bg-white rounded-2xl border-l-4 border-l-red-500 border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldX className="w-4 h-4 text-red-500" />
                <span className="font-bold text-sm text-foreground">PESEL Verification Failed</span>
              </div>
              <span className="bg-red-50 text-red-700 text-[10px] font-bold px-2 py-1 rounded-md">1 worker</span>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-gray-100">
              <div>
                <div className="text-sm font-semibold">Kamil Wróbel</div>
                <div className="text-xs text-muted-foreground">Scaffolder · Site B – Kraków East</div>
              </div>
              <div className="text-sm font-bold text-red-600">Verify Now</div>
            </div>
            <button className="text-red-600 text-xs font-semibold mt-2 hover:underline active:opacity-70 transition-opacity">
              View Worker →
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-2 ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">All Clear</h2>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div>
              <div className="text-sm font-bold text-emerald-900">Medical Certificates</div>
              <div className="text-xs text-emerald-700/80 font-medium">All valid — no action needed</div>
            </div>
          </div>
          <div className="text-[10px] text-emerald-700 font-semibold bg-emerald-100/60 px-2 py-1 rounded-md">
            Next: Jun 2026
          </div>
        </div>
      </div>
    </motion.div>
  );
}
