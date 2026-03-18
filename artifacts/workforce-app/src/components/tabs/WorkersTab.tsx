import { useState } from "react";
import { Search, ChevronRight, MapPin, Clock, AlertTriangle, ShieldX } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MOCK_WORKERS, WorkerStatus } from "@/data/mockWorkers";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function WorkersTab() {
  const { role } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | WorkerStatus>("All");

  const pills: ("All" | WorkerStatus)[] = ["All", "Compliant", "Expiring Soon", "Missing Docs"];

  const filteredWorkers = MOCK_WORKERS.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || w.status === filter;
    return matchesSearch && matchesFilter;
  });

  const getStatusColors = (status: WorkerStatus) => {
    switch (status) {
      case "Compliant":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Expiring Soon":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Missing Docs":
      case "Non-Compliant":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const getAvatarColors = (status: WorkerStatus) => {
    switch (status) {
      case "Compliant":
        return "bg-indigo-100 text-indigo-700";
      case "Expiring Soon":
        return "bg-amber-100 text-amber-700";
      case "Missing Docs":
      case "Non-Compliant":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const activePillColor = role === "Owner" ? "bg-indigo-600" : "bg-blue-600";

  return (
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

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {pills.map(p => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={cn(
                "whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border",
                filter === p
                  ? `${activePillColor} text-white border-transparent`
                  : "bg-white text-muted-foreground border-border hover:bg-gray-50"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 text-xs font-medium text-muted-foreground mb-3">
        Showing {filteredWorkers.length} worker{filteredWorkers.length !== 1 && 's'}
      </div>

      <div className="px-4 pb-6 space-y-3 flex-1">
        <AnimatePresence>
          {filteredWorkers.map(worker => (
            <motion.div
              key={worker.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-sm border p-4 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className={cn("w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shrink-0", getAvatarColors(worker.status))}>
                {worker.name.split(' ').map(n => n[0]).join('')}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="font-bold text-sm text-foreground truncate">{worker.name}</h3>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap", getStatusColors(worker.status))}>
                    {worker.status}
                  </span>
                </div>
                
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <span className="font-medium">{worker.trade}</span>
                  <span>•</span>
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
                        <span className="text-red-700">PESEL unverified</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
            </motion.div>
          ))}
          {filteredWorkers.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No workers found.
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}