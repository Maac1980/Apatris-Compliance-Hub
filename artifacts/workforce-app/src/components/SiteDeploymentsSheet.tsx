import { X, MapPin, Users, HardHat, ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Worker } from "@/data/mockWorkers";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workers: Worker[];
}

const statusPill: Record<string, string> = {
  Compliant:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Expiring Soon": "bg-amber-50 text-amber-700 border-amber-200",
  "Non-Compliant": "bg-red-50 text-red-700 border-red-200",
  "Missing Docs":  "bg-gray-100 text-gray-600 border-gray-200",
};

export function SiteDeploymentsSheet({ isOpen, onClose, workers }: Props) {
  const [expandedSite, setExpandedSite] = useState<string | null>(null);

  // Group workers by site
  const bysite: Record<string, Worker[]> = {};
  for (const w of workers) {
    const site = w.workplace ?? "Unassigned";
    if (!bysite[site]) bysite[site] = [];
    bysite[site].push(w);
  }
  const sites = Object.entries(bysite).sort((a, b) => b[1].length - a[1].length);

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
                <h3 className="text-base font-black text-foreground">Site Deployments</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sites.length} active sites · {workers.length} total workers
                </p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stats strip */}
            <div className="px-5 pb-3 grid grid-cols-3 gap-2 shrink-0">
              <div className="bg-gray-50 rounded-xl p-2.5 text-center border">
                <div className="text-lg font-black text-foreground">{sites.length}</div>
                <div className="text-[10px] text-muted-foreground font-medium">Sites</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-2.5 text-center border border-blue-100">
                <div className="text-lg font-black text-blue-700">{workers.length}</div>
                <div className="text-[10px] text-blue-700/70 font-medium">Workers</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-2.5 text-center border border-emerald-100">
                <div className="text-lg font-black text-emerald-700">
                  {workers.filter(w => w.status === "Compliant").length}
                </div>
                <div className="text-[10px] text-emerald-700/70 font-medium">Compliant</div>
              </div>
            </div>

            {/* Site list */}
            <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-2">
              {sites.length === 0 ? (
                <div className="text-center py-10">
                  <MapPin className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-muted-foreground">No sites found</p>
                </div>
              ) : sites.map(([site, siteWorkers]) => {
                const isExpanded = expandedSite === site;
                return (
                  <div key={site} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                    <button
                      onClick={() => setExpandedSite(isExpanded ? null : site)}
                      className="w-full p-3.5 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                        <MapPin className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-foreground leading-tight truncate">{site}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Users className="w-3 h-3" />
                          {siteWorkers.length} workers
                          {siteWorkers.some(w => w.status !== "Compliant") && (
                            <span className="text-amber-600 font-semibold">
                              · {siteWorkers.filter(w => w.status !== "Compliant").length} action needed
                            </span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-gray-50 divide-y divide-gray-50 overflow-hidden"
                        >
                          {siteWorkers.map(w => (
                            <div key={w.id} className="p-3 flex items-center gap-3 pl-5">
                              <div className="w-8 h-8 rounded-lg bg-gray-50 border flex items-center justify-center shrink-0">
                                <HardHat className="w-3.5 h-3.5 text-gray-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-foreground truncate">{w.name}</div>
                                <div className="text-xs text-muted-foreground">{w.trade}</div>
                              </div>
                              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap shrink-0",
                                statusPill[w.status] ?? statusPill["Missing Docs"]
                              )}>
                                {w.status}
                              </span>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
