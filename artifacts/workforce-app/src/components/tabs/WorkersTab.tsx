import { useState } from "react";
import { Search, ChevronRight, MapPin, Clock, AlertTriangle, ShieldX } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MOCK_WORKERS, Worker, WorkerStatus } from "@/data/mockWorkers";
import { useAuth } from "@/lib/auth";
import { WorkerDetail } from "@/components/WorkerDetail";
import { cn } from "@/lib/utils";
import { Role } from "@/types";

function getActivePillColor(role: Role): string {
  switch (role) {
    case "Executive":   return "bg-indigo-600";
    case "LegalHead":   return "bg-violet-600";
    case "TechOps":     return "bg-blue-600";
    default:            return "bg-gray-700";
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

export function WorkersTab() {
  const { role } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | WorkerStatus>("All");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  const pills: ("All" | WorkerStatus)[] = ["All", "Compliant", "Expiring Soon", "Missing Docs", "Non-Compliant"];

  const filtered = MOCK_WORKERS.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || w.status === filter;
    return matchesSearch && matchesFilter;
  });

  const activePill = getActivePillColor(role as Role);

  return (
    <div className="relative flex flex-col h-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="flex flex-col h-full"
      >
        <div className="sticky top-0 z-10 bg-gray-50 pt-4 pb-3 px-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search workers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 bg-white border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {pills.map(p => (
              <button
                key={p}
                onClick={() => setFilter(p)}
                className={cn(
                  "whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors border",
                  filter === p
                    ? `${activePill} text-white border-transparent`
                    : "bg-white text-muted-foreground border-border hover:bg-gray-50"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 mb-2 text-xs font-medium text-muted-foreground">
          Showing {filtered.length} worker{filtered.length !== 1 && "s"}
        </div>

        <div className="px-4 pb-6 space-y-3 flex-1 overflow-y-auto no-scrollbar">
          <AnimatePresence>
            {filtered.map(worker => (
              <motion.div
                key={worker.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                onClick={() => setSelectedWorker(worker)}
                className="bg-white rounded-2xl shadow-sm border p-4 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
              >
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shrink-0", getAvatarColor(worker.status))}>
                  {worker.name.split(" ").map(n => n[0]).join("")}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-sm text-foreground truncate">{worker.name}</h3>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap shrink-0", getStatusColors(worker.status))}>
                      {worker.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <span className="font-medium">{worker.trade}</span>
                    <span>·</span>
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{worker.workplace}</span>
                  </div>

                  {worker.status !== "Compliant" && (
                    <div className="flex items-center gap-1 mt-1 text-[11px] font-medium">
                      {worker.status === "Expiring Soon" && (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-amber-700">TRC expires in {worker.daysUntilExpiry} days</span>
                        </>
                      )}
                      {worker.status === "Missing Docs" && (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                          <span className="text-red-700">TRC certificate missing</span>
                        </>
                      )}
                      {worker.status === "Non-Compliant" && (
                        <>
                          <ShieldX className="w-3.5 h-3.5 text-red-500" />
                          <span className="text-red-700">PESEL unverified · expired docs</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
              </motion.div>
            ))}

            {filtered.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12 text-muted-foreground text-sm"
              >
                No workers found.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedWorker && (
          <WorkerDetail
            key={selectedWorker.id}
            worker={selectedWorker}
            onClose={() => setSelectedWorker(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
