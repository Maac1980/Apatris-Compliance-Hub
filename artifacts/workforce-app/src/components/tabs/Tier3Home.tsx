import { UserPlus, ShieldCheck, MapPin, Lock, Wrench, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export function Tier3Home() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-6"
    >
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <div className="text-xs font-bold text-blue-800">Financial Firewall Active</div>
          <div className="text-[11px] text-blue-600/80 font-medium">Payroll and ZUS data is restricted to Tier 1 only.</div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Quick Actions</h2>

        <div className="grid grid-cols-2 gap-3">
          <button className="bg-white rounded-2xl border shadow-sm p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform hover:border-blue-200 hover:bg-blue-50/30">
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-xs font-bold text-foreground text-center leading-tight">Add Worker</span>
          </button>

          <button className="bg-white rounded-2xl border shadow-sm p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform hover:border-indigo-200 hover:bg-indigo-50/30">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
            </div>
            <span className="text-xs font-bold text-foreground text-center leading-tight">UDT Verification</span>
          </button>

          <button className="bg-white rounded-2xl border shadow-sm p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform hover:border-emerald-200 hover:bg-emerald-50/30">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-xs font-bold text-foreground text-center leading-tight">Site Deployments</span>
          </button>

          <button className="bg-white rounded-2xl border shadow-sm p-4 flex flex-col items-center gap-2 active:scale-95 transition-transform hover:border-amber-200 hover:bg-amber-50/30">
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-xs font-bold text-foreground text-center leading-tight">Resolve TRC Issues</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Pending Actions</h2>

        <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50">
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">TRC Certificate Missing</div>
              <div className="text-xs text-muted-foreground">Piotr Wiśniewski · Site A</div>
            </div>
            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-md shrink-0">Urgent</span>
          </div>

          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">TRC Renewal Needed</div>
              <div className="text-xs text-muted-foreground">Tomasz Nowak · Site B</div>
            </div>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md shrink-0">24 days</span>
          </div>

          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">UDT Revalidation</div>
              <div className="text-xs text-muted-foreground">Kamil Wróbel · Site B</div>
            </div>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md shrink-0">Pending</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
