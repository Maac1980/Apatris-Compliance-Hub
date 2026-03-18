import { X, Stethoscope, AlertCircle, CheckCircle2, Loader2, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Worker } from "@/data/mockWorkers";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workers: Worker[];
  loading: boolean;
}

function daysLeft(d: string | null | undefined): number | null {
  if (!d) return null;
  const dt = new Date(d);
  return Math.ceil((dt.getTime() - Date.now()) / 86400000);
}

function urgencyPill(days: number | null): { label: string; cls: string } {
  if (days === null) return { label: "Missing", cls: "bg-gray-100 text-gray-600 border-gray-200" };
  if (days < 0)      return { label: `${Math.abs(days)}d overdue`, cls: "bg-red-50 text-red-700 border-red-200" };
  if (days < 30)     return { label: `${days}d left`, cls: "bg-red-50 text-red-700 border-red-200" };
  if (days < 90)     return { label: `${days}d left`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: `${days}d`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

function urgencySort(days: number | null) {
  if (days === null) return 9999;
  if (days < 0) return days - 10000;
  return days;
}

interface CertRow {
  workerId: string;
  workerName: string;
  specialization: string;
  workplace: string;
  type: "Badania Lekarskie" | "UDT Certificate";
  expiry: string | null;
  days: number | null;
}

export function UDTSheet({ isOpen, onClose, workers, loading }: Props) {
  const rows: CertRow[] = [];
  for (const w of workers) {
    rows.push({
      workerId: w.id,
      workerName: w.name,
      specialization: w.specialization,
      workplace: w.workplace || "No site",
      type: "Badania Lekarskie",
      expiry: (w as any).medicalExpiry ?? null,
      days: daysLeft((w as any).medicalExpiry),
    });
    if ((w as any).udtExpiry) {
      rows.push({
        workerId: w.id + "-udt",
        workerName: w.name,
        specialization: w.specialization,
        workplace: w.workplace || "No site",
        type: "UDT Certificate",
        expiry: (w as any).udtExpiry,
        days: daysLeft((w as any).udtExpiry),
      });
    }
  }

  const sorted = rows.sort((a, b) => urgencySort(a.days) - urgencySort(b.days));

  const overdueCount = rows.filter(r => r.days !== null && r.days < 0).length;
  const urgentCount  = rows.filter(r => r.days !== null && r.days >= 0 && r.days < 30).length;
  const missingCount = rows.filter(r => r.days === null).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
          />
          <motion.div
            key="sheet"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute inset-x-0 bottom-0 z-50 bg-gray-50 rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: "90vh" }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="px-5 py-4 bg-white border-b border-border shrink-0 rounded-t-3xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                    <Stethoscope className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-foreground">UDT & Badania Lekarskie</h3>
                    <p className="text-xs text-muted-foreground">
                      {loading ? "Loading…" : `${overdueCount + urgentCount} urgent · ${missingCount} missing`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 active:scale-95 transition-all"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Summary strip */}
              {!loading && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="bg-red-50 rounded-xl border border-red-100 p-2.5 text-center">
                    <div className="text-lg font-black text-red-600">{overdueCount}</div>
                    <div className="text-[9px] text-red-700 font-bold leading-tight">Overdue</div>
                  </div>
                  <div className="bg-amber-50 rounded-xl border border-amber-100 p-2.5 text-center">
                    <div className="text-lg font-black text-amber-600">{urgentCount}</div>
                    <div className="text-[9px] text-amber-700 font-bold leading-tight">Urgent (&lt;30d)</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl border p-2.5 text-center">
                    <div className="text-lg font-black text-gray-600">{missingCount}</div>
                    <div className="text-[9px] text-muted-foreground font-bold leading-tight">Missing</div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : sorted.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
                  <p className="text-sm font-bold">All certificates on record</p>
                  <p className="text-xs text-muted-foreground mt-1">No renewals needed at this time</p>
                </div>
              ) : (
                sorted.map(row => {
                  const pill = urgencyPill(row.days);
                  const isUrgent = row.days !== null && row.days < 30;
                  const isMissing = row.days === null;
                  return (
                    <div
                      key={row.workerId + row.type}
                      className={cn(
                        "bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3",
                        isUrgent ? "border-l-4 border-l-red-400" :
                        isMissing ? "border-l-4 border-l-gray-300" : ""
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                        isUrgent ? "bg-red-50 border-red-100" :
                        isMissing ? "bg-gray-50 border-gray-200" : "bg-teal-50 border-teal-100"
                      )}>
                        {row.type === "Badania Lekarskie"
                          ? <Stethoscope className={cn("w-5 h-5", isUrgent ? "text-red-500" : isMissing ? "text-gray-400" : "text-teal-600")} />
                          : <Clock className={cn("w-5 h-5", isUrgent ? "text-red-500" : isMissing ? "text-gray-400" : "text-teal-600")} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-foreground truncate">{row.workerName}</div>
                        <div className="text-xs text-muted-foreground">{row.type}</div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">{row.specialization} · {row.workplace}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap", pill.cls)}>
                          {pill.label}
                        </span>
                        {row.expiry && (
                          <span className="text-[9px] text-muted-foreground/60">
                            {new Date(row.expiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div className="h-6" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
