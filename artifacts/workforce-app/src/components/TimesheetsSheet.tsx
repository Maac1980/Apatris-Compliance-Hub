import { useState, useEffect } from "react";
import { X, Clock, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { fetchAllHours, type HoursEntry } from "@/lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const statusStyle = {
  submitted: { icon: AlertCircle, color: "text-blue-500",    pill: "bg-blue-50 text-blue-700 border-blue-200" },
  approved:  { icon: CheckCircle2, color: "text-emerald-500", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected:  { icon: XCircle,      color: "text-red-500",      pill: "bg-red-50 text-red-700 border-red-200" },
};

export function TimesheetsSheet({ isOpen, onClose }: Props) {
  const { user } = useAuth();
  const jwt = user?.jwt ?? "";
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [month, setMonth]     = useState(defaultMonth);
  const [entries, setEntries] = useState<HoursEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = async () => {
    if (!jwt || !isOpen) return;
    setLoading(true); setError(null);
    try {
      const data = await fetchAllHours(jwt, month);
      setEntries(data);
    } catch {
      setError("Failed to load timesheets.");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (isOpen) load(); }, [isOpen, month]);

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const approvedCount = entries.filter(e => e.status === "approved").length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="absolute inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: "88vh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
              <div>
                <h3 className="text-base font-black text-foreground">Timesheets &amp; Hours</h3>
                <p className="text-xs text-muted-foreground mt-0.5">All submitted hours for your deployed professionals</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Month filter */}
            <div className="px-5 pb-3 shrink-0">
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="w-full h-10 border border-border rounded-xl px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>

            {/* Stats */}
            {entries.length > 0 && (
              <div className="px-5 pb-3 grid grid-cols-3 gap-2 shrink-0">
                <div className="bg-gray-50 rounded-xl p-2.5 text-center border">
                  <div className="text-lg font-black text-foreground">{entries.length}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">Submissions</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-2.5 text-center border border-amber-100">
                  <div className="text-lg font-black text-amber-700">{totalHours.toFixed(0)}</div>
                  <div className="text-[10px] text-amber-700/70 font-medium">Total Hours</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-2.5 text-center border border-emerald-100">
                  <div className="text-lg font-black text-emerald-700">{approvedCount}</div>
                  <div className="text-[10px] text-emerald-700/70 font-medium">Approved</div>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-8">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="text-center py-8 text-sm text-red-500">{error}</div>
              ) : entries.length === 0 ? (
                <div className="text-center py-10">
                  <Clock className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-muted-foreground">No submissions for {month}</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
                  {entries.map((entry) => {
                    const style = statusStyle[entry.status as keyof typeof statusStyle] ?? statusStyle.submitted;
                    const StatusIcon = style.icon;
                    return (
                      <div key={entry.id} className="p-3.5 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                          <Clock className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-foreground truncate">{entry.worker_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {entry.hours} hrs{entry.note ? ` · ${entry.note}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap", style.pill)}>
                            {entry.status}
                          </span>
                          <div className="flex items-center gap-1">
                            <StatusIcon className={cn("w-3 h-3", style.color)} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
