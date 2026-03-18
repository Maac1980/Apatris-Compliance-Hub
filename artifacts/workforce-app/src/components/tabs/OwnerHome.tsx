import { Users, ShieldCheck, AlertTriangle, FileWarning, ShieldX } from "lucide-react";
import { motion } from "framer-motion";

export function OwnerHome() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6"
    >
      <div className="space-y-4">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Overview</h2>
        
        {/* Card 1 — Total Workers */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-indigo-600" />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-bold text-foreground leading-none">5</div>
            <div className="text-xs text-muted-foreground font-medium mt-1">Total Workers</div>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-muted-foreground">4 Active Sites</span>
            </div>
          </div>
        </div>

        {/* Card 2 — Compliance Rate */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-bold text-emerald-600 leading-none">60%</div>
            <div className="text-xs text-muted-foreground font-medium mt-1">Compliance Rate</div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: "60%" }} />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5">3 fully compliant · 2 need attention</div>
          </div>
        </div>

        {/* Card 3 — Missing Documents */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-bold text-red-600 leading-none">2</div>
            <div className="text-xs text-muted-foreground font-medium mt-1">Missing Documents</div>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-[11px] text-red-600 font-medium">Immediate action required</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Quick Stats</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <FileWarning className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-xs font-medium text-foreground leading-tight">1 Expiring<br/>Soon</div>
          </div>
          <div className="bg-white rounded-xl border p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <ShieldX className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-xs font-medium text-foreground leading-tight">1 PESEL<br/>Alert</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}