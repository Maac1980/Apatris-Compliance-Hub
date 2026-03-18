import { useState } from "react";
import { Search, ChevronRight, MapPin, Clock, AlertTriangle, ShieldX, Plus, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MOCK_WORKERS, Worker, WorkerStatus, SITES } from "@/data/mockWorkers";
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

function getFabColor(role: Role): { bg: string; shadow: string } {
  switch (role) {
    case "TechOps":     return { bg: "bg-blue-600 hover:bg-blue-700",       shadow: "shadow-blue-300" };
    case "Coordinator": return { bg: "bg-emerald-600 hover:bg-emerald-700", shadow: "shadow-emerald-300" };
    default:            return { bg: "bg-gray-700 hover:bg-gray-800",       shadow: "shadow-gray-300" };
  }
}

function getStatusColors(status: WorkerStatus) {
  switch (status) {
    case "Compliant":     return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Expiring Soon": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Missing Docs":
    case "Non-Compliant": return "bg-red-50 text-red-700 border-red-200";
  }
}

function getAvatarColor(status: WorkerStatus) {
  switch (status) {
    case "Compliant":     return "bg-emerald-100 text-emerald-700";
    case "Expiring Soon": return "bg-amber-100 text-amber-700";
    case "Missing Docs":
    case "Non-Compliant": return "bg-red-100 text-red-700";
  }
}

function getUrgentDetail(worker: Worker): { icon: React.ElementType; text: string; color: string } | null {
  if (worker.status === "Expiring Soon") {
    const missingDocs = worker.documents.filter(d => d.status === "Expired" || d.status === "Missing");
    if (missingDocs.length) return { icon: Clock, text: `${missingDocs[0].type} expiring in ${worker.daysUntilExpiry} days`, color: "text-amber-700" };
    return { icon: Clock, text: `Expiring in ${worker.daysUntilExpiry} days`, color: "text-amber-700" };
  }
  if (worker.status === "Missing Docs") {
    const missing = worker.documents.filter(d => d.status === "Missing");
    return { icon: AlertTriangle, text: missing.length ? `${missing[0].type} missing` : "Documents required", color: "text-red-700" };
  }
  if (worker.status === "Non-Compliant") {
    const issues = [];
    if (!worker.peselOk) issues.push("PESEL unverified");
    if (worker.zusStatus === "Unregistered") issues.push("ZUS unregistered");
    const expired = worker.documents.filter(d => d.status === "Expired");
    if (expired.length) issues.push(`${expired[0].type} expired`);
    return { icon: ShieldX, text: issues.slice(0, 2).join(" · ") || "Non-compliant", color: "text-red-700" };
  }
  return null;
}

export function WorkersTab() {
  const { role } = useAuth();
  const [search, setSearch]             = useState("");
  const [filter, setFilter]             = useState<"All" | WorkerStatus>("All");
  const [siteFilter, setSiteFilter]     = useState<SiteFilter>("All Sites");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [addSheetOpen, setAddSheetOpen]     = useState(false);

  const canAddProfessional = role === "Executive";
  const statusPills: ("All" | WorkerStatus)[] = ["All", "Compliant", "Expiring Soon", "Missing Docs", "Non-Compliant"];
  const sitePills: SiteFilter[] = ["All Sites", ...SITES];
  const activePill = getActivePillColor(role as Role);
  const fab = getFabColor(role as Role);

  const filtered = MOCK_WORKERS.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase())
      || w.trade.toLowerCase().includes(search.toLowerCase())
      || w.workplace.toLowerCase().includes(search.toLowerCase())
      || w.specialization.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filter === "All" || w.status === filter;
    const matchesSite   = siteFilter === "All Sites" || w.workplace === siteFilter;
    return matchesSearch && matchesStatus && matchesSite;
  });

  const counts = {
    compliant:    MOCK_WORKERS.filter(w => w.status === "Compliant").length,
    expiring:     MOCK_WORKERS.filter(w => w.status === "Expiring Soon").length,
    missing:      MOCK_WORKERS.filter(w => w.status === "Missing Docs").length,
    nonCompliant: MOCK_WORKERS.filter(w => w.status === "Non-Compliant").length,
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
        <div className="sticky top-0 z-10 bg-gray-50 pt-4 pb-3 px-4 space-y-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, trade, specialization…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 bg-white border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
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
                    : "bg-white text-muted-foreground border-border hover:bg-gray-50"
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Site pills */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <div className="flex items-center shrink-0">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            {sitePills.map(s => (
              <button
                key={s}
                onClick={() => setSiteFilter(s)}
                className={cn(
                  "whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-semibold transition-colors border shrink-0",
                  siteFilter === s
                    ? "bg-gray-800 text-white border-transparent"
                    : "bg-white text-muted-foreground border-border hover:bg-gray-50"
                )}
              >
                {s === "All Sites" ? "All Sites" : s.split("–")[1]?.trim() ?? s}
              </button>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-4 mb-3 grid grid-cols-4 gap-2">
          {[
            { label: "OK",      count: counts.compliant,    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
            { label: "Expiring", count: counts.expiring,    color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200" },
            { label: "Missing",  count: counts.missing,     color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200" },
            { label: "Non-Comp", count: counts.nonCompliant, color: "text-red-700",    bg: "bg-red-50",     border: "border-red-200" },
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
            {filtered.length} of {MOCK_WORKERS.length} professionals
          </span>
          {(filter !== "All" || siteFilter !== "All Sites") && (
            <button
              onClick={() => { setFilter("All"); setSiteFilter("All Sites"); }}
              className="text-[11px] font-semibold text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

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
                  className="bg-white rounded-2xl shadow-sm border p-4 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
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
                      <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{worker.specialization}</span>
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

                  <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
                </motion.div>
              );
            })}

            {filtered.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-muted-foreground">No professionals found</p>
                <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters</p>
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
            "absolute bottom-5 right-5 z-30 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform",
            fab.bg, `shadow-lg ${fab.shadow}`
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
