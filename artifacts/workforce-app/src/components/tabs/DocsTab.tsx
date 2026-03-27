import { useState, useEffect } from "react";
import {
  ShieldCheck, FileText, Wrench, Stethoscope, FileCheck,
  UploadCloud, CheckCircle2, AlertCircle, AlertTriangle,
  Loader2, RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { fetchMyWorkerProfile, type WorkerProfile } from "@/lib/api";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

type DocStatus = "Valid" | "Expiring" | "Expired" | "Missing";

function docStatus(days: number | null): DocStatus {
  if (days === null) return "Missing";
  if (days < 0) return "Expired";
  if (days <= 60) return "Expiring";
  return "Valid";
}

const STATUS_STYLE: Record<DocStatus, { pill: string; icon: string; dot: string; label: string }> = {
  Valid:    { pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", icon: "text-emerald-500", dot: "bg-emerald-400", label: "Valid" },
  Expiring: { pill: "bg-amber-500/10  text-amber-400  border-amber-500/25",    icon: "text-amber-500",   dot: "bg-amber-400",   label: "Expiring" },
  Expired:  { pill: "bg-red-500/10    text-red-400    border-red-500/25",       icon: "text-red-500",     dot: "bg-red-500",     label: "Expired" },
  Missing:  { pill: "bg-white/[0.06]  text-white/40   border-white/[0.08]",     icon: "text-white/30",    dot: "bg-white/20",    label: "Missing" },
};

const STATUS_ICON: Record<DocStatus, React.ElementType> = {
  Valid:    CheckCircle2,
  Expiring: AlertTriangle,
  Expired:  AlertCircle,
  Missing:  AlertCircle,
};

interface DocRow {
  label: string;
  expiry: string | null;
  icon: React.ElementType;
}

function buildDocRows(profile: WorkerProfile): DocRow[] {
  return [
    { label: "TRC Certificate",   expiry: profile.trcExpiry,         icon: ShieldCheck },
    { label: "Badania Lekarskie", expiry: profile.medicalExamExpiry, icon: Stethoscope },
    { label: "BHP Certificate",   expiry: profile.bhpExpiry,         icon: FileCheck },
    { label: "UDT Certificate",   expiry: profile.udtCertExpiry,     icon: Wrench },
    { label: "Passport",          expiry: profile.passportExpiry,    icon: FileText },
    { label: "Work Permit",       expiry: profile.workPermitExpiry,  icon: ShieldCheck },
    { label: "Contract",          expiry: profile.contractEndDate,   icon: FileText },
  ];
}

export function DocsTab() {
  const { user } = useAuth();
  const jwt = user?.jwt ?? "";
  const displayName = user?.name ?? "Professional";

  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const load = () => {
    if (!jwt) return;
    setLoading(true); setError(false);
    fetchMyWorkerProfile(jwt)
      .then(setProfile)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [jwt]);

  const docRows = profile ? buildDocRows(profile) : [];
  const counts = { Valid: 0, Expiring: 0, Expired: 0, Missing: 0 };
  docRows.forEach(d => counts[docStatus(daysUntil(d.expiry))]++);
  const urgent = counts.Expired + counts.Expiring;

  return (
    <div className="px-4 py-5 pb-28 space-y-5">

      {/* Header summary */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-heading font-black text-foreground">My Documents</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Certificate & permit status</p>
        </div>
        <button onClick={load} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center active:scale-90 transition-transform">
          <RefreshCw className={cn("w-3.5 h-3.5 text-white/40", loading && "animate-spin")} />
        </button>
      </div>

      {/* Status summary pills */}
      {!loading && !error && (
        <div className="grid grid-cols-4 gap-2">
          {(["Valid", "Expiring", "Expired", "Missing"] as DocStatus[]).map(s => {
            const st = STATUS_STYLE[s];
            return (
              <div key={s} className={cn("rounded-2xl border py-3 flex flex-col items-center gap-1", st.pill)}>
                <span className="text-lg font-heading font-black">{counts[s]}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider">{s}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Urgent banner */}
      {!loading && urgent > 0 && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-3.5 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-xs text-red-400 font-semibold">
            {urgent} document{urgent > 1 ? "s" : ""} need{urgent === 1 ? "s" : ""} immediate attention. Contact your coordinator.
          </p>
        </div>
      )}

      {/* Document list */}
      <div className="space-y-2">
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground ml-1">Certificate Status</h2>

        {loading ? (
          <div className="premium-card rounded-2xl p-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="premium-card rounded-2xl p-6 text-center">
            <p className="text-sm text-muted-foreground">Could not load document data.</p>
            <button onClick={load} className="mt-3 text-xs font-bold text-blue-600">Retry</button>
          </div>
        ) : docRows.length === 0 ? (
          <div className="premium-card rounded-2xl p-6 text-center text-sm text-muted-foreground">
            No document records found for your profile.
          </div>
        ) : (
          <div className="premium-card rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
            {docRows.map((doc, i) => {
              const days = daysUntil(doc.expiry);
              const ds   = docStatus(days);
              const st   = STATUS_STYLE[ds];
              const DocIcon  = doc.icon;
              const StatIcon = STATUS_ICON[ds];
              return (
                <motion.div
                  key={doc.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="p-3.5 flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                    <DocIcon className={cn("w-4 h-4", st.icon)} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground leading-tight">{doc.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {doc.expiry
                        ? <>
                            {ds === "Expired" ? "Expired " : "Expires "}
                            {new Date(doc.expiry).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            {days !== null && days > 0 && days < 120 && (
                              <span className={cn("ml-1.5 font-bold", days < 30 ? "text-red-600" : days < 60 ? "text-amber-600" : "text-muted-foreground")}>
                                ({days}d)
                              </span>
                            )}
                            {ds === "Expired" && days !== null && (
                              <span className="ml-1.5 font-bold text-red-600">({Math.abs(days)}d ago)</span>
                            )}
                          </>
                        : "Not on record"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatIcon className={cn("w-4 h-4", st.icon)} strokeWidth={2} />
                    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", st.pill)}>
                      {st.label}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload action */}
      <div className="space-y-2">
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground ml-1">Submit Documents</h2>
        <a
          href={`mailto:z.brzezinska@apatris.pl?subject=Document Upload – ${displayName}&body=Hi,%0A%0APlease find my documents attached.%0A%0ABest regards,%0A${displayName}`}
          className="flex items-center gap-4 p-4 premium-card rounded-2xl hover:scale-[1.01] active:scale-[0.98] transition-all"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <UploadCloud className="w-5 h-5 text-blue-600" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-foreground">Upload New Document</div>
            <div className="text-xs text-muted-foreground mt-0.5">Send to your compliance coordinator</div>
          </div>
        </a>
      </div>

    </div>
  );
}
