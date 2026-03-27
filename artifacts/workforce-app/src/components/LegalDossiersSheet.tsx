import { useState } from "react";
import {
  X, Scale, ChevronDown, ChevronUp, Loader2,
  AlertCircle, CheckCircle2, FileText, Shield,
  CreditCard, User, Globe, Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Worker, WorkerStatus } from "@/data/mockWorkers";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workers: Worker[];
  loading: boolean;
}

const STATUS_PILL: Record<WorkerStatus, string> = {
  "Compliant":       "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  "Expiring Soon":   "bg-amber-500/10 text-amber-400 border-amber-500/25",
  "Non-Compliant":   "bg-red-500/10 text-red-400 border-red-500/25",
  "Missing Docs":    "bg-white/[0.06] text-white/50 border-white/[0.08]",
};

const STATUS_BORDER: Record<WorkerStatus, string> = {
  "Compliant":       "border-l-emerald-400",
  "Expiring Soon":   "border-l-amber-400",
  "Non-Compliant":   "border-l-red-500",
  "Missing Docs":    "border-l-gray-300",
};

const FILTER_OPTIONS: Array<{ label: string; value: WorkerStatus | "all" }> = [
  { label: "All",           value: "all" },
  { label: "Issues",        value: "Non-Compliant" },
  { label: "Expiring",      value: "Expiring Soon" },
  { label: "Compliant",     value: "Compliant" },
  { label: "Missing Docs",  value: "Missing Docs" },
];

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function expiryBadge(d: string | null | undefined): { label: string; cls: string } | null {
  if (!d) return null;
  const dt = new Date(d);
  const days = Math.ceil((dt.getTime() - Date.now()) / 86400000);
  if (days < 0)   return { label: `${Math.abs(days)}d overdue`, cls: "bg-red-500/10 text-red-400 border-red-500/25" };
  if (days < 30)  return { label: `${days}d left`, cls: "bg-amber-500/10 text-amber-400 border-amber-500/25" };
  if (days < 90)  return { label: `${days}d left`, cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/25" };
  return null;
}

function DocRow({ label, value, badge }: { label: string; value: string; badge?: { label: string; cls: string } | null }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-white/[0.05] last:border-0 gap-2">
      <div className="text-[11px] text-muted-foreground font-medium min-w-0">{label}</div>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="text-[11px] font-semibold text-foreground text-right">{value}</div>
        {badge && (
          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap", badge.cls)}>
            {badge.label}
          </span>
        )}
      </div>
    </div>
  );
}

function DossierCard({ worker }: { worker: Worker }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      "premium-card rounded-2xl border-l-4 overflow-hidden",
      STATUS_BORDER[worker.status]
    )}>
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(x => !x)}
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors"
      >
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
          worker.status === "Compliant" ? "bg-emerald-500/10 border-emerald-500/20" :
          worker.status === "Expiring Soon" ? "bg-amber-500/10 border-amber-500/20" :
          "bg-red-500/10 border-red-500/20"
        )}>
          {worker.status === "Compliant"
            ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            : <AlertCircle className={cn("w-5 h-5", worker.status === "Expiring Soon" ? "text-amber-500" : "text-red-500")} />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-foreground leading-tight truncate">{worker.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {worker.specialization} · {worker.workplace || "No site"}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full border",
            STATUS_PILL[worker.status]
          )}>
            {worker.status}
          </span>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-white/30" />
            : <ChevronDown className="w-4 h-4 text-white/30" />}
        </div>
      </button>

      {/* Expanded dossier */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-white/[0.06] pt-3">

              {/* Identity */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Identity & Legal</span>
                </div>
                <div className="bg-white/[0.04] rounded-xl p-3 space-y-0">
                  <DocRow label="PESEL"      value={worker.pesel  || "—"} />
                  <DocRow label="ZUS Status" value={worker.zusStatus} />
                  <DocRow label="Visa Type"  value={worker.visaType} />
                  <DocRow label="Email"      value={worker.email  || "—"} />
                  <DocRow label="Phone"      value={worker.phone  || "—"} />
                </div>
              </div>

              {/* Financial */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Financial</span>
                </div>
                <div className="bg-white/[0.04] rounded-xl p-3">
                  <DocRow label="IBAN" value={worker.iban || "—"} />
                </div>
              </div>

              {/* Documents & Expiries */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Documents & Expiries</span>
                </div>
                <div className="bg-white/[0.04] rounded-xl p-3 space-y-0">
                  <DocRow label="TRC Certificate"     value={formatDate(worker.trcExpiry)}       badge={expiryBadge(worker.trcExpiry)} />
                  <DocRow label="Passport"            value={formatDate(worker.passportExpiry)}  badge={expiryBadge(worker.passportExpiry)} />
                  <DocRow label="BHP Certificate"     value={formatDate(worker.bhpExpiry)}       badge={expiryBadge(worker.bhpExpiry)} />
                  <DocRow label="Badania Lekarskie"   value={formatDate(worker.medicalExpiry)}   badge={expiryBadge(worker.medicalExpiry)} />
                  <DocRow label="UDT Certificate"     value={formatDate(worker.udtExpiry)}       badge={expiryBadge(worker.udtExpiry)} />
                  <DocRow label="Contract End Date"   value={formatDate(worker.contractEndDate)} badge={expiryBadge(worker.contractEndDate)} />
                </div>
              </div>

              {/* Compliance summary */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Compliance</span>
                </div>
                <div className="bg-white/[0.04] rounded-xl p-3 space-y-0">
                  <DocRow label="Overall Status"     value={worker.status} />
                  <DocRow label="Days Until Expiry"  value={worker.daysUntilExpiry < 9999 ? `${worker.daysUntilExpiry} days` : "—"} />
                  <DocRow label="PESEL Verified"     value={worker.peselOk ? "Yes" : "Pending"} />
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LegalDossiersSheet({ isOpen, onClose, workers, loading }: Props) {
  const [filter, setFilter] = useState<WorkerStatus | "all">("all");

  const filtered = filter === "all"
    ? workers
    : workers.filter(w => w.status === filter);

  const issueCount = workers.filter(w => w.status !== "Compliant").length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
          />
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute inset-x-0 bottom-0 z-50 bg-[#0c0c0e] rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: "92vh" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/10" />
            </div>

            {/* Header */}
            <div className="px-5 py-4 bg-[#141416] border-b border-border shrink-0 rounded-t-3xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                    <Scale className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-black font-heading text-foreground">PIP / Legal Dossiers</h3>
                    <p className="text-xs text-muted-foreground">
                      {loading ? "Loading…" : `${workers.length} professionals · ${issueCount} require attention`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] active:scale-95 transition-all"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Filter pills */}
              <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar pb-0.5">
                {FILTER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilter(opt.value)}
                    className={cn(
                      "text-[10px] font-bold px-3 py-1.5 rounded-full border whitespace-nowrap transition-all",
                      filter === opt.value
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-[#141416] text-muted-foreground border-white/[0.08] hover:border-white/20"
                    )}
                  >
                    {opt.label}
                    {opt.value !== "all" && workers.filter(w => w.status === opt.value).length > 0 && (
                      <span className="ml-1 opacity-70">
                        {workers.filter(w => w.status === opt.value).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
                  <p className="text-sm font-bold text-foreground">No issues in this filter</p>
                  <p className="text-xs text-muted-foreground mt-1">Change the filter to see workers</p>
                </div>
              ) : (
                filtered.map(w => <DossierCard key={w.id} worker={w} />)
              )}
              <div className="h-6" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
