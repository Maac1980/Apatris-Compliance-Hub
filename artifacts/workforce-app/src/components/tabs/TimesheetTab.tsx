import { useState, useEffect } from "react";
import { Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { fetchMyHours, submitHours, type HoursEntry } from "@/lib/api";
import { X } from "lucide-react";

const statusStyle = {
  submitted: { icon: AlertCircle,  pill: "bg-blue-500/10 text-blue-400 border-blue-500/25",    label: "Submitted" },
  approved:  { icon: CheckCircle2, pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", label: "Approved" },
  rejected:  { icon: XCircle,      pill: "bg-red-500/10 text-red-400 border-red-500/25",        label: "Rejected" },
};

function SubmitSheet({
  jwt,
  onClose,
  onSuccess,
}: { jwt: string; onClose: () => void; onSuccess: () => void }) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth]   = useState(defaultMonth);
  const [hours, setHours]   = useState("");
  const [note, setNote]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [done, setDone]     = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = parseFloat(hours);
    if (isNaN(h) || h <= 0) { setError("Enter a valid number of hours."); return; }
    setLoading(true); setError(null);
    try {
      await submitHours(jwt, month, h, note || undefined);
      setDone(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally { setLoading(false); }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
      />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="absolute inset-x-0 bottom-0 z-50 bg-[#141416] rounded-t-3xl shadow-2xl px-5 pt-5 pb-10"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-black">Submit Hours</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Record your hours for the selected month</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div key="ok" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center py-8 gap-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <p className="text-sm font-bold text-emerald-400">Hours submitted!</p>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Month</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                  className="w-full h-10 border border-white/[0.08] bg-white/[0.04] rounded-xl px-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400/30" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Hours Worked</label>
                <input type="number" min="1" max="744" step="0.5" value={hours}
                  onChange={e => setHours(e.target.value)} placeholder="e.g. 168"
                  className="w-full h-10 border border-white/[0.08] bg-white/[0.04] rounded-xl px-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400/30" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Note <span className="text-white/30 font-normal">(optional)</span>
                </label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Overtime, site change…"
                  className="w-full h-10 border border-white/[0.08] bg-white/[0.04] rounded-xl px-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400/30" />
              </div>
              {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
              <button type="submit" disabled={loading || !hours}
                className={cn("w-full h-11 rounded-xl text-sm font-bold transition-all",
                  loading || !hours ? "bg-white/[0.06] text-white/30" : "bg-amber-500 text-white hover:bg-amber-600"
                )}>
                {loading
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Submitting…</span>
                  : "Submit Hours"}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

export function TimesheetTab() {
  const { user } = useAuth();
  const jwt = user?.jwt ?? "";

  const [entries, setEntries] = useState<HoursEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);

  const load = () => {
    if (!jwt) return;
    setLoading(true);
    fetchMyHours(jwt)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [jwt]);

  const totalHours    = entries.reduce((s, e) => s + e.hours, 0);
  const approvedHours = entries.filter(e => e.status === "approved").reduce((s, e) => s + e.hours, 0);
  const latestMonth   = entries[0]?.month ?? "No submissions yet";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-5 pb-28 relative"
    >
      {/* Header */}
      <div className="flex items-center justify-between ml-1">
        <div>
          <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground">My Timesheets</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading ? "Loading…" : entries.length > 0 ? `Latest: ${latestMonth}` : "No submissions yet"}
          </p>
        </div>
        <button
          onClick={() => setSubmitOpen(true)}
          className="flex items-center gap-1.5 bg-amber-500 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-amber-600 active:scale-95 transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Submit Hours
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-xl font-heading font-black text-amber-400">{loading ? "…" : entries.length}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Months<br/>Submitted</div>
        </div>
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-xl font-heading font-black text-foreground">{loading ? "…" : totalHours}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Total<br/>Hours</div>
        </div>
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-xl font-heading font-black text-emerald-400">{loading ? "…" : approvedHours}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Approved<br/>Hours</div>
        </div>
      </div>

      {/* Entries list */}
      <div className="space-y-3">
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground ml-1">Submission History</h2>

        {loading ? (
          <div className="premium-card rounded-2xl p-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="premium-card rounded-2xl p-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-3">
              <Clock className="w-7 h-7 text-amber-400" />
            </div>
            <p className="text-sm font-bold text-foreground">No hours submitted yet</p>
            <p className="text-xs text-muted-foreground mt-1">Tap "Submit Hours" to log your first month.</p>
            <button
              onClick={() => setSubmitOpen(true)}
              className="mt-4 bg-amber-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-amber-600 active:scale-95 transition-all"
            >
              Submit Now
            </button>
          </div>
        ) : (
          <div className="premium-card rounded-2xl divide-y divide-white/[0.05] overflow-hidden">
            {entries.map((entry) => {
              const style = statusStyle[entry.status as keyof typeof statusStyle] ?? statusStyle.submitted;
              const StatusIcon = style.icon;
              return (
                <div key={entry.id} className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Clock className="w-4.5 h-4.5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-foreground">{entry.month}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.hours} hrs
                      {entry.note ? ` · ${entry.note}` : ""}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {new Date(entry.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap", style.pill)}>
                      {style.label}
                    </span>
                    <StatusIcon className={cn("w-3.5 h-3.5",
                      entry.status === "approved" ? "text-emerald-500" :
                      entry.status === "rejected" ? "text-red-500" : "text-blue-500"
                    )} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit sheet */}
      <AnimatePresence>
        {submitOpen && (
          <SubmitSheet
            jwt={jwt}
            onClose={() => setSubmitOpen(false)}
            onSuccess={load}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
