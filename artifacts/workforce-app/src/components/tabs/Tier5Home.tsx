import { HardHat, FileText, Clock, UploadCloud, CheckCircle2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export function Tier5Home() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-6"
    >
      <div className="bg-white rounded-2xl shadow-sm border p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <HardHat className="w-7 h-7 text-amber-600" />
        </div>
        <div className="flex-1">
          <div className="text-base font-bold text-foreground">Deployed Professional</div>
          <div className="text-xs text-muted-foreground mt-0.5">Site A – Warsaw North</div>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-emerald-700 font-semibold">Currently Active</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">My Documents</h2>

        <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
          <div className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">TRC Certificate</div>
              <div className="text-xs text-muted-foreground">Expires Nov 20, 2026</div>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 shrink-0">Valid</span>
          </div>

          <div className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">Medical Certificate</div>
              <div className="text-xs text-muted-foreground">Expires Jun 15, 2026</div>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 shrink-0">Valid</span>
          </div>

          <div className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">Passport</div>
              <div className="text-xs text-muted-foreground">Expires Jan 10, 2030</div>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 shrink-0">Valid</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <button className="bg-white rounded-2xl border shadow-sm p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform hover:border-amber-200 hover:bg-amber-50/30">
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-xs font-bold text-foreground text-center leading-tight">Submit Hours</span>
          </button>

          <button className="bg-white rounded-2xl border shadow-sm p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform hover:border-blue-200 hover:bg-blue-50/30">
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
              <UploadCloud className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-xs font-bold text-foreground text-center leading-tight">Upload Badania Lekarskie</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Assignments</h2>
        <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">Umowa Zlecenie</div>
              <div className="text-xs text-muted-foreground">March 2026 · Active</div>
            </div>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md shrink-0">View</span>
          </div>
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">Hours this month</div>
              <div className="text-xs text-muted-foreground">142 hrs submitted</div>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md shrink-0">Approved</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
