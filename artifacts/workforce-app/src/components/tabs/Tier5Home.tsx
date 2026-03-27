import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  HardHat, Wrench, ShieldAlert, ShieldCheck,
  FileCheck, UploadCloud, Clock, FileText,
  CheckCircle2, AlertCircle, Stethoscope,
  ChevronRight, Phone, Mail, Wifi,
  CalendarCheck, MapPin, X, Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  fetchMyWorkerProfile, fetchMyHours, submitHours,
  type WorkerProfile, type HoursEntry,
} from "@/lib/api";

const MY_COORDINATORS = [
  {
    id: "coord-t3",
    tier: 3,
    tierLabel: "Tech Ops",
    tierColor: "bg-blue-600",
    name: "Andrzej Kowalczyk",
    role: "Key Account & Technical Operations",
    phone: "+48 601 234 567",
    email: "a.kowalczyk@apatris.pl",
    initials: "AK",
    avatarBg: "bg-blue-500/15",
    avatarText: "text-blue-400",
  },
  {
    id: "coord-t4",
    tier: 4,
    tierLabel: "Coordinator",
    tierColor: "bg-emerald-600",
    name: "Zofia Brzezińska",
    role: "Compliance Coordinator",
    phone: "+48 602 345 678",
    email: "z.brzezinska@apatris.pl",
    initials: "ZB",
    avatarBg: "bg-emerald-500/15",
    avatarText: "text-emerald-400",
  },
];

interface DocRow {
  label: string;
  expiry: string | null;
  icon: React.ElementType;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function docStatus(days: number | null): "Valid" | "Expiring" | "Missing" | "Expired" {
  if (days === null) return "Missing";
  if (days < 0) return "Expired";
  if (days <= 60) return "Expiring";
  return "Valid";
}

const docStatusStyle = {
  Valid:    { pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", icon: "text-emerald-500", dot: "bg-emerald-300" },
  Expiring: { pill: "bg-amber-500/10 text-amber-400 border-amber-500/25",       icon: "text-amber-500",   dot: "bg-amber-300" },
  Missing:  { pill: "bg-white/[0.06] text-white/40 border-white/[0.06]",         icon: "text-white/30",    dot: "bg-gray-300" },
  Expired:  { pill: "bg-red-500/10 text-red-400 border-red-500/25",             icon: "text-red-500",     dot: "bg-red-400" },
};

function complianceGradient(status: string) {
  switch (status) {
    case "compliant":     return "from-emerald-500 to-teal-600";
    case "warning":       return "from-amber-500 to-orange-600";
    case "critical":      return "from-red-500 to-rose-700";
    case "non-compliant": return "from-gray-600 to-gray-800";
    default:              return "from-gray-500 to-gray-700";
  }
}

function complianceLabel(status: string, t: (key: string) => string) {
  switch (status) {
    case "compliant":     return t("tier5.fullyCompliant");
    case "warning":       return t("tier5.renewalPending");
    case "critical":      return t("tier5.actionRequired");
    case "non-compliant": return t("tier5.nonCompliant");
    default:              return t("tier5.unknown");
  }
}

function complianceDot(status: string) {
  switch (status) {
    case "compliant":     return "bg-emerald-300";
    case "warning":       return "bg-amber-300";
    default:              return "bg-red-400";
  }
}

// ── Submit Hours Sheet ─────────────────────────────────────────────────────────
function SubmitHoursSheet({
  jwt,
  onClose,
  onSuccess,
}: { jwt: string; onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = parseFloat(hours);
    if (isNaN(h) || h <= 0) { setError("Enter a valid number of hours."); return; }
    setLoading(true); setError(null);
    try {
      await submitHours(jwt, month, h, note || undefined);
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1600);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit hours.");
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
            <h3 className="text-base font-black text-foreground">{t("tier5.submitHours")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t("tier5.recordHoursDesc")}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div key="ok" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center py-8 gap-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <p className="text-sm font-bold text-emerald-400">{t("tier5.hoursSubmitted")}</p>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">{t("tier5.month")}</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                  className="w-full h-10 border border-border rounded-xl px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">{t("tier5.hoursWorked")}</label>
                <input type="number" min="1" max="744" step="0.5" value={hours}
                  onChange={e => setHours(e.target.value)} placeholder="e.g. 168"
                  className="w-full h-10 border border-border rounded-xl px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">{t("tier5.note")} <span className="text-white/30 font-normal">({t("tier5.optional")})</span></label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Overtime, site change..."
                  className="w-full h-10 border border-border rounded-xl px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
              <button type="submit" disabled={loading || !hours}
                className={cn("w-full h-11 rounded-xl text-sm font-bold transition-all",
                  loading || !hours ? "bg-white/[0.06] text-white/30" : "bg-white text-[#0c0c0e] hover:bg-gray-200"
                )}>
                {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t("tier5.submitting")}</span> : t("tier5.submitHours")}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function Tier5Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const jwt = user?.jwt ?? "";
  const displayName = user?.name ?? "Deployed Professional";

  const [profile, setProfile]   = useState<WorkerProfile | null>(null);
  const [hoursLog, setHoursLog] = useState<HoursEntry[]>([]);
  const [profLoading, setProfLoading] = useState(true);
  const [hoursSheetOpen, setHoursSheetOpen] = useState(false);

  const loadData = () => {
    if (!jwt) return;
    setProfLoading(true);
    fetchMyWorkerProfile(jwt)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setProfLoading(false));
    fetchMyHours(jwt)
      .then(setHoursLog)
      .catch(() => setHoursLog([]));
  };

  useEffect(() => { loadData(); }, [jwt]);

  // Derive document rows from profile
  const docRows: DocRow[] = profile ? [
    { label: "TRC Certificate",   expiry: profile.trcExpiry,         icon: ShieldCheck },
    { label: "Badania Lekarskie", expiry: profile.medicalExamExpiry, icon: Stethoscope },
    { label: "BHP Certificate",   expiry: profile.bhpExpiry,         icon: FileCheck },
    { label: "Passport",          expiry: profile.passportExpiry,    icon: FileText },
    { label: "UDT Certificate",   expiry: profile.udtCertExpiry,     icon: Wrench },
    { label: "Contract",          expiry: profile.contractEndDate,   icon: FileText },
    { label: "Work Permit",       expiry: profile.workPermitExpiry,  icon: ShieldCheck },
  ].filter(d => d.expiry !== null || d.label === "TRC Certificate" || d.label === "Badania Lekarskie") : [];

  const cStatus = profile?.complianceStatus ?? "non-compliant";
  const site    = profile?.assignedSite ?? t("tier5.notAssigned");
  const spec    = profile?.specialization ?? "Welder";

  const validCount    = docRows.filter(d => docStatus(daysUntil(d.expiry)) === "Valid").length;
  const daysToRenewal = docRows
    .map(d => daysUntil(d.expiry))
    .filter((d): d is number => d !== null && d > 0)
    .sort((a, b) => a - b)[0] ?? null;

  const latestHours = hoursLog[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-5 pb-28 relative"
    >
      {/* ── Digital Site Pass ──────────────────────────────────────────────── */}
      <div className={cn("bg-gradient-to-br rounded-2xl shadow-lg p-5 text-white relative overflow-hidden", complianceGradient(cStatus))}>
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-10 translate-x-10" />
        <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-white/10 translate-y-8 -translate-x-6" />

        <div className="relative flex items-start justify-between mb-4">
          <div>
            <div className="text-[9px] font-black text-white/60 uppercase tracking-[0.2em] mb-1">Apatris Sp. z o.o.</div>
            <div className="text-[10px] font-bold text-white/80 uppercase tracking-widest">{t("tier5.digitalSitePass")}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full animate-pulse", complianceDot(cStatus))} />
              <span className="text-[10px] font-black text-white/90 tracking-wider">{complianceLabel(cStatus, t)}</span>
            </div>
            <Wifi className="w-4 h-4 text-white/40" />
          </div>
        </div>

        <div className="relative flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center shrink-0 shadow-inner">
            {profLoading ? <Loader2 className="w-7 h-7 text-white animate-spin" /> : <HardHat className="w-8 h-8 text-white" strokeWidth={1.5} />}
          </div>
          <div>
            <div className="text-xl font-black text-white leading-tight">{displayName}</div>
            <div className="text-xs text-white/80 font-medium">{spec}</div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <MapPin className="w-3 h-3 text-white/70" />
              <span className="text-[11px] text-white/80 font-semibold">{site}</span>
            </div>
          </div>
        </div>

        {docRows.length > 0 && (
          <div className="relative mt-4 pt-4 border-t border-white/20 grid grid-cols-5 gap-1">
            {docRows.slice(0, 5).map(doc => {
              const ds = docStatus(daysUntil(doc.expiry));
              return (
                <div key={doc.label} className="text-center">
                  <div className={cn("w-2 h-2 rounded-full mx-auto mb-0.5", docStatusStyle[ds].dot)} />
                  <div className="text-[7px] text-white/60 font-bold leading-tight text-center truncate">{doc.label.split(" ")[0]}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Stats strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-2xl font-black font-heading text-blue-600">
            {latestHours ? latestHours.hours : profile?.monthlyHours ?? "—"}
          </div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">
            {t("tier5.hours")}<br />{latestHours ? latestHours.month : t("tier5.thisMonth")}
          </div>
        </div>
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-2xl font-black font-heading text-emerald-600">{profLoading ? "…" : validCount}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">{t("tier5.validDocuments")}</div>
        </div>
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-2xl font-black font-heading text-amber-600">{profLoading ? "…" : daysToRenewal ?? "—"}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">{t("tier5.daysToNextRenewal")}</div>
        </div>
      </div>

      {/* ── My Documents ───────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground ml-1">{t("tier5.myDocuments")}</h2>
        {profLoading ? (
          <div className="premium-card rounded-2xl p-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : docRows.length === 0 ? (
          <div className="premium-card rounded-2xl p-5 text-center text-sm text-muted-foreground">
            {t("tier5.noDocRecords")}
          </div>
        ) : (
          <div className="premium-card rounded-2xl divide-y divide-white/[0.05] overflow-hidden">
            {docRows.map((doc) => {
              const days = daysUntil(doc.expiry);
              const ds = docStatus(days);
              const style = docStatusStyle[ds];
              const Icon = doc.icon;
              return (
                <div key={doc.label} className="p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0 border">
                    <Icon className={cn("w-4 h-4", style.icon)} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">{doc.label}</div>
                    {doc.expiry ? (
                      <div className="text-xs text-muted-foreground">
                        {ds === "Expired" ? t("tier5.expired") : t("tier5.expires")} {new Date(doc.expiry).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {days !== null && days > 0 && days < 120 && (
                          <span className={cn("ml-1.5 font-bold", days < 60 ? "text-amber-600" : "text-muted-foreground")}>
                            ({days}d)
                          </span>
                        )}
                      </div>
                    ) : <div className="text-xs text-muted-foreground">{t("tier5.notOnRecord")}</div>}
                  </div>
                  <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap shrink-0", style.pill)}>
                    {ds}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick Actions ───────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground ml-1">{t("tier5.myActions")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setHoursSheetOpen(true)}
            className="premium-card rounded-2xl p-4 hover:scale-[1.02] flex flex-col items-center gap-2 active:scale-95 transition-all hover:shadow-md hover:border-amber-500/25 group"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Clock className="w-6 h-6 text-amber-600" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div className="text-xs font-bold text-foreground leading-tight">{t("tier5.submitHours")}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {latestHours ? `Last: ${latestHours.month}` : t("tier5.recordThisMonth")}
              </div>
            </div>
          </button>

          <a
            href={`mailto:z.brzezinska@apatris.pl?subject=Document Upload – ${displayName}`}
            className="premium-card rounded-2xl p-4 hover:scale-[1.02] flex flex-col items-center gap-2 active:scale-95 transition-all hover:shadow-md hover:border-blue-500/25 group"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:scale-105 transition-transform">
              <UploadCloud className="w-6 h-6 text-blue-600" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div className="text-xs font-bold text-foreground leading-tight">{t("tier5.uploadDocument")}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{t("tier5.emailToCoordinator")}</div>
            </div>
          </a>

          <a
            href={`mailto:z.brzezinska@apatris.pl?subject=Leave Request – ${displayName}`}
            className="premium-card rounded-2xl p-4 hover:scale-[1.02] flex flex-col items-center gap-2 active:scale-95 transition-all hover:shadow-md hover:border-violet-500/25 group"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center group-hover:scale-105 transition-transform">
              <CalendarCheck className="w-6 h-6 text-violet-600" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div className="text-xs font-bold text-foreground leading-tight">{t("tier5.requestLeave")}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{t("tier5.annualSickLeave")}</div>
            </div>
          </a>

          <a
            href={`mailto:a.kowalczyk@apatris.pl?subject=Site Issue Report – ${displayName}`}
            className="premium-card rounded-2xl p-4 hover:scale-[1.02] flex flex-col items-center gap-2 active:scale-95 transition-all hover:shadow-md hover:border-red-500/25 group"
          >
            <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center group-hover:scale-105 transition-transform">
              <ShieldAlert className="w-6 h-6 text-red-600" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div className="text-xs font-bold text-foreground leading-tight">{t("tier5.reportSiteIssue")}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{t("tier5.safetyConcern")}</div>
            </div>
          </a>
        </div>
      </div>

      {/* ── Hours history ───────────────────────────────────────────────────── */}
      {hoursLog.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground ml-1">{t("tier5.hoursHistory")}</h2>
          <div className="premium-card rounded-2xl divide-y divide-white/[0.05] overflow-hidden">
            {hoursLog.map((entry) => (
              <div key={entry.id} className="p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{entry.month}</div>
                  <div className="text-xs text-muted-foreground">{entry.hours} hrs{entry.note ? ` · ${entry.note}` : ""}</div>
                </div>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap shrink-0",
                  entry.status === "approved"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                    : entry.status === "rejected"
                      ? "bg-red-500/10 text-red-400 border-red-500/25"
                      : "bg-blue-500/10 text-blue-400 border-blue-500/25"
                )}>
                  {entry.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Current Assignment ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground ml-1">{t("tier5.currentAssignment")}</h2>
        <div className="premium-card rounded-2xl divide-y divide-white/[0.05] overflow-hidden">
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">{t("tier5.umowaZlecenie")}</div>
              <div className="text-xs text-muted-foreground">
                {profile?.contractEndDate
                  ? `${t("tier5.expires")} ${new Date(profile.contractEndDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                  : t("tier5.active")}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
          </div>
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">{t("tier5.assignedSite")}</div>
              <div className="text-xs text-muted-foreground">{site}</div>
            </div>
          </div>
          {daysToRenewal !== null && (
            <div className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">{t("tier5.nextRenewalDue")}</div>
                <div className="text-xs text-muted-foreground">{daysToRenewal} days</div>
              </div>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-md shrink-0 border border-amber-500/25">
                {daysToRenewal}d
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── My Coordinators ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground ml-1">{t("tier5.myCoordinators")}</h2>
        <p className="text-xs text-muted-foreground ml-1 -mt-2">{t("tier5.coordinatorDesc")}</p>
        <div className="space-y-3">
          {MY_COORDINATORS.map((c) => (
            <div key={c.id} className="premium-card rounded-2xl overflow-hidden">
              <div className="p-4 flex items-center gap-3">
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-base font-black", c.avatarBg, c.avatarText)}>
                  {c.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.role}</div>
                  <span className={cn("inline-block text-[9px] font-black text-white px-1.5 py-0.5 rounded-full mt-1 tracking-wide", c.tierColor)}>
                    TIER {c.tier} · {c.tierLabel.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="border-t border-white/[0.05] divide-y divide-white/[0.05]">
                <a href={`tel:${c.phone}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border flex items-center justify-center shrink-0">
                    <Phone className="w-3.5 h-3.5 text-white/40" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{c.phone}</span>
                  <ChevronRight className="w-4 h-4 text-white/20 ml-auto" />
                </a>
                <a href={`mailto:${c.email}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border flex items-center justify-center shrink-0">
                    <Mail className="w-3.5 h-3.5 text-white/40" />
                  </div>
                  <span className="text-sm font-medium text-foreground truncate">{c.email}</span>
                  <ChevronRight className="w-4 h-4 text-white/20 ml-auto shrink-0" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Submit Hours Sheet ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {hoursSheetOpen && (
          <SubmitHoursSheet
            jwt={jwt}
            onClose={() => setHoursSheetOpen(false)}
            onSuccess={loadData}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
