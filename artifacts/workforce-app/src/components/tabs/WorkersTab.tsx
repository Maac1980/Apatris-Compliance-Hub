import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, MapPin, Clock, AlertTriangle, ShieldX, Plus, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Worker, WorkerStatus, SITES } from "@/data/mockWorkers";
import { useWorkers } from "@/hooks/useWorkers";
import { useAuth } from "@/lib/auth";
import { WorkerDetail } from "@/components/WorkerDetail";
import { AddProfessionalSheet } from "@/components/AddProfessionalSheet";
import { cn } from "@/lib/utils";
import { Role } from "@/types";

type SiteFilter = "All Sites" | typeof SITES[number];

function getActivePillColor(role: Role): string {
  switch (role) {
    case "Executive":    return "bg-indigo-600";
    case "LegalHead":    return "bg-violet-600";
    case "TechOps":      return "bg-blue-600";
    case "Coordinator":  return "bg-emerald-600";
    default:             return "bg-gray-700";
  }
}

function getFabColor(role: Role): { bg: string; shadow: string; text: string } {
  switch (role) {
    case "TechOps":     return { bg: "bg-blue-600 hover:bg-blue-700",       shadow: "shadow-blue-900/30", text: "text-white" };
    case "Coordinator": return { bg: "bg-emerald-600 hover:bg-emerald-700", shadow: "shadow-emerald-900/30", text: "text-white" };
    default:            return { bg: "bg-white hover:bg-white/90",          shadow: "shadow-black/30", text: "text-[#0c0c0e]" };
  }
}

function getStatusColors(status: WorkerStatus) {
  switch (status) {
    case "Compliant":     return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
    case "Expiring Soon": return "bg-amber-500/10 text-amber-400 border-amber-500/25";
    case "Missing Docs":
    case "Non-Compliant": return "bg-red-500/10 text-red-400 border-red-500/25";
  }
}

function getAvatarColor(status: WorkerStatus) {
  switch (status) {
    case "Compliant":     return "bg-emerald-500/15 text-emerald-400";
    case "Expiring Soon": return "bg-amber-500/15 text-amber-400";
    case "Missing Docs":
    case "Non-Compliant": return "bg-red-500/15 text-red-400";
  }
}

function getUrgentDetail(worker: Worker): { icon: React.ElementType; text: string; color: string } | null {
  if (worker.status === "Expiring Soon") {
    const missingDocs = worker.documents.filter(d => d.status === "Expired" || d.status === "Missing");
    if (missingDocs.length) return { icon: Clock, text: `${missingDocs[0].type} expiring in ${worker.daysUntilExpiry} days`, color: "text-amber-400" };
    return { icon: Clock, text: `Expiring in ${worker.daysUntilExpiry} days`, color: "text-amber-400" };
  }
  if (worker.status === "Missing Docs") {
    const missing = worker.documents.filter(d => d.status === "Missing");
    return { icon: AlertTriangle, text: missing.length ? `${missing[0].type} missing` : "Documents required", color: "text-red-400" };
  }
  if (worker.status === "Non-Compliant") {
    const issues = [];
    if (!worker.peselOk) issues.push("PESEL unverified");
    if (worker.zusStatus === "Unregistered") issues.push("ZUS unregistered");
    const expired = worker.documents.filter(d => d.status === "Expired");
    if (expired.length) issues.push(`${expired[0].type} expired`);
    return { icon: ShieldX, text: issues.slice(0, 2).join(" · ") || "Non-compliant", color: "text-red-400" };
  }
  return null;
}

export function WorkersTab() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { workers, loading, isLive } = useWorkers();
  const [search, setSearch]             = useState("");
  const [filter, setFilter]             = useState<"All" | WorkerStatus>("All");
  const [siteFilter, setSiteFilter]     = useState<SiteFilter>("All Sites");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [addSheetOpen, setAddSheetOpen]     = useState(false);

  const canAddProfessional = role === "Executive";
  const statusPills: ("All" | WorkerStatus)[] = ["All", "Compliant", "Expiring Soon", "Missing Docs", "Non-Compliant"];
  // SITES imported from mockWorkers for dropdown options
  const activePill = getActivePillColor(role as Role);
  const fab = getFabColor(role as Role);

  const filtered = workers.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase())
      || w.trade.toLowerCase().includes(search.toLowerCase())
      || w.workplace.toLowerCase().includes(search.toLowerCase())
      || w.specialization.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filter === "All" || w.status === filter;
    const matchesSite   = siteFilter === "All Sites" || w.workplace === siteFilter;
    return matchesSearch && matchesStatus && matchesSite;
  });

  const counts = {
    compliant:    workers.filter(w => w.status === "Compliant").length,
    expiring:     workers.filter(w => w.status === "Expiring Soon").length,
    missing:      workers.filter(w => w.status === "Missing Docs").length,
    nonCompliant: workers.filter(w => w.status === "Non-Compliant").length,
  };

  return (
    <div className="relative flex flex-col h-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="flex flex-col h-full"
      >
        {/* Sticky search + filters */}
        <div className="sticky top-0 z-10 bg-[#0c0c0e] pt-4 pb-3 px-4 space-y-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("workers.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:border-white/15 focus:ring-2 focus:ring-primary/20 transition-shadow"
            />
          </div>

          {/* Status pills */}
          <div className="flex flex-wrap gap-1.5">
            {statusPills.map(p => (
              <button
                key={p}
                onClick={() => setFilter(p)}
                className={cn(
                  "whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
                  filter === p
                    ? `${activePill} text-white border-transparent`
                    : "bg-[#141416] text-muted-foreground border-white/[0.08] hover:bg-white/[0.04]"
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Site dropdown */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value as SiteFilter)}
              className="w-full h-9 pl-8 pr-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-xs text-foreground appearance-none focus:outline-none focus:border-white/15 transition-all"
            >
              <option value="All Sites">{t("workers.allSites")}</option>
              {SITES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-4 mb-3 grid grid-cols-4 gap-2">
          {[
            { label: "OK",      count: counts.compliant,    color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25" },
            { label: "Expiring", count: counts.expiring,    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/25" },
            { label: "Missing",  count: counts.missing,     color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/25" },
            { label: "Non-Comp", count: counts.nonCompliant, color: "text-red-400",    bg: "bg-red-500/10",     border: "border-red-500/25" },
          ].map(({ label, count, color, bg, border }) => (
            <div key={label} className={cn("rounded-xl border p-2 text-center", bg, border)}>
              <div className={cn("text-lg font-black leading-none", color)}>{count}</div>
              <div className="text-[9px] font-bold text-muted-foreground mt-0.5 leading-tight">{label}</div>
            </div>
          ))}
        </div>

        {/* Count bar */}
        <div className="px-4 mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {filtered.length} {t("workers.of")} {workers.length} {t("workers.professionals")}{isLive ? ` · ${t("workers.live")}` : ""}
          </span>
          {(filter !== "All" || siteFilter !== "All Sites") && (
            <button
              onClick={() => { setFilter("All"); setSiteFilter("All Sites"); }}
              className="text-[11px] font-semibold text-blue-600 hover:underline"
            >
              {t("workers.clearFilters")}
            </button>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="px-4 pb-4 space-y-2.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="premium-card rounded-2xl p-4 flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-white/10 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-white/10 rounded w-2/3" />
                  <div className="h-3 bg-white/[0.06] rounded w-1/2" />
                </div>
                <div className="w-16 h-6 bg-white/[0.06] rounded-full" />
              </div>
            ))}
          </div>
        )}

        {/* List */}
        <div className="px-4 pb-24 space-y-2.5 flex-1 overflow-y-auto no-scrollbar">
          <AnimatePresence>
            {filtered.map(worker => {
              const urgentDetail = getUrgentDetail(worker);
              const IconUrgent = urgentDetail?.icon;
              return (
                <motion.div
                  key={worker.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.16 }}
                  onClick={() => setSelectedWorker(worker)}
                  className="premium-card rounded-2xl p-4 hover:scale-[1.005] flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  {/* Avatar */}
                  <div className={cn("w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shrink-0", getAvatarColor(worker.status))}>
                    {worker.name.split(" ").map(n => n[0]).join("")}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <h3 className="font-bold text-sm text-foreground truncate">{worker.name}</h3>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap shrink-0", getStatusColors(worker.status))}>
                        {worker.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
                      <span className="font-semibold text-foreground/70">{worker.trade}</span>
                      <span className="opacity-50">·</span>
                      <span className="bg-white/[0.06] text-white/50 px-1.5 py-0.5 rounded text-[10px] font-bold">{worker.specialization}</span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{worker.workplace}</span>
                    </div>

                    {urgentDetail && IconUrgent && (
                      <div className="flex items-center gap-1 mt-1.5 text-[11px] font-semibold">
                        <IconUrgent className={cn("w-3.5 h-3.5 shrink-0", urgentDetail.color)} />
                        <span className={urgentDetail.color}>{urgentDetail.text}</span>
                      </div>
                    )}
                  </div>

                  <ChevronRight className="w-5 h-5 text-white/20 shrink-0" />
                </motion.div>
              );
            })}

            {filtered.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <Search className="w-10 h-10 text-white/15 mx-auto mb-3" />
                <p className="text-sm font-semibold text-muted-foreground">{t("workers.noProfessionalsFound")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("workers.tryAdjustingFilters")}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* FAB — T1 only */}
      {canAddProfessional && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 15, stiffness: 300, delay: 0.3 }}
          onClick={() => setAddSheetOpen(true)}
          className={cn(
            "absolute bottom-5 right-5 z-30 w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform",
            fab.bg, fab.text, `shadow-lg ${fab.shadow}`
          )}
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </motion.button>
      )}

      {/* Worker detail overlay */}
      <AnimatePresence>
        {selectedWorker && (
          <WorkerDetail
            key={selectedWorker.id}
            worker={selectedWorker}
            onClose={() => setSelectedWorker(null)}
          />
        )}
      </AnimatePresence>

      <AddProfessionalSheet
        isOpen={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        accentColor={role === "TechOps" ? "bg-blue-600" : "bg-emerald-600"}
      />
    </div>
  );
}
