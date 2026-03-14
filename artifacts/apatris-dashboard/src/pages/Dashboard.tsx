import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useGetWorkers, useGetWorkerStats } from "@workspace/api-client-react";
import { 
  Users, AlertTriangle, ShieldAlert, Clock, 
  Search, Filter, LogOut, FileText, Bell, RefreshCcw, Eye, Zap, Pencil
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";

import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkerProfilePanel } from "@/components/WorkerProfilePanel";
import { NotifyDialog, RenewDialog } from "@/components/ActionDialogs";
import { ComplianceReportModal } from "@/components/ComplianceReportModal";
import { BulkUploadModal } from "@/components/BulkUploadModal";
import { NotificationBell } from "@/components/NotificationBell";

function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith("pl") ? "pl" : "en";

  const toggle = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-1">
      <button
        onClick={() => toggle("en")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
          current === "en"
            ? "bg-primary text-white shadow-[0_0_12px_rgba(196,30,24,0.5)]"
            : "text-muted-foreground hover:text-white"
        }`}
        title="English"
      >
        <span className="text-sm leading-none">🇬🇧</span>
        <span>EN</span>
      </button>
      <button
        onClick={() => toggle("pl")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
          current === "pl"
            ? "bg-primary text-white shadow-[0_0_12px_rgba(196,30,24,0.5)]"
            : "text-muted-foreground hover:text-white"
        }`}
        title="Polski"
      >
        <span className="text-sm leading-none">🇵🇱</span>
        <span>PL</span>
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  
  const [search, setSearch] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [status, setStatus] = useState("");

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [panelEditMode, setPanelEditMode] = useState(false);
  const [actionWorker, setActionWorker] = useState<any | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  const { data: workersData, isLoading: isLoadingWorkers } = useGetWorkers({ 
    search: search || undefined, 
    specialization: specialization || undefined, 
    status: status || undefined 
  });
  
  const { data: stats } = useGetWorkerStats();

  const handleNotify = (e: React.MouseEvent, worker: any) => {
    e.stopPropagation();
    setActionWorker(worker);
    setNotifyOpen(true);
  };

  const handleRenew = (e: React.MouseEvent, worker: any) => {
    e.stopPropagation();
    setActionWorker(worker);
    setRenewOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-foreground flex flex-col relative">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/8 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[30%] bg-destructive/3 blur-[160px] rounded-full" />
      </div>

      {/* Header */}
      <header
        className="h-16 border-b border-slate-700 bg-slate-900/95 backdrop-blur-xl sticky top-0 z-30 px-6 flex items-center justify-between"
        style={{ boxShadow: "0 1px 0 rgba(196,30,24,0.08), 0 4px 20px rgba(0,0,0,0.3)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full bg-white flex-shrink-0 flex items-center justify-center"
            style={{ boxShadow: "0 0 0 2px rgba(196,30,24,0.35), 0 0 12px rgba(196,30,24,0.2)" }}
            aria-label="Apatris Logo"
          >
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M19 2 L33 8.5 L33 21 Q33 30 19 36 Q5 30 5 21 L5 8.5 Z"
                fill="#fef2f2"
                stroke="#C41E18"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <text
                x="19"
                y="28"
                textAnchor="middle"
                fontSize="19"
                fontWeight="900"
                fontFamily="Arial Black, Arial, sans-serif"
                fill="#C41E18"
                letterSpacing="-0.5"
              >
                A
              </text>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-[0.15em] uppercase leading-none text-white">
              {t("header.title")}
            </h1>
            <p
              className="text-[9px] text-red-500 font-bold font-mono tracking-[0.2em] uppercase leading-none mt-0.5"
              style={{ textShadow: "0 0 8px rgba(239,68,68,0.7)" }}
            >
              OUTSOURCING · CERTIFIED WELDERS
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* ⚡ AI Smart Upload */}
          <button
            onClick={() => setBulkUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border border-red-600/70 text-red-400 hover:bg-red-600 hover:text-white rounded-lg text-sm font-mono font-bold uppercase tracking-wide transition-all hover:shadow-[0_0_15px_rgba(196,30,24,0.4)]"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">AI Smart Upload</span>
          </button>

          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border border-red-600/70 text-red-400 hover:bg-red-600 hover:text-white rounded-lg text-sm font-mono font-bold uppercase tracking-wide transition-all hover:shadow-[0_0_15px_rgba(196,30,24,0.4)]"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">{t("header.generateReport")}</span>
          </button>

          {/* Notification Bell */}
          <NotificationBell onSelectWorker={(id) => setSelectedWorkerId(id)} />

          <LanguageToggle />
          
          <div className="w-px h-6 bg-white/10" />
          
          <div className="flex items-center gap-3">
            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-white leading-tight">{user?.name}</p>
              <p className="text-xs text-primary font-mono">{user?.role}</p>
            </div>
            <button onClick={logout} title={t("header.logout")} className="p-2 text-muted-foreground hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 lg:p-8 z-10 max-w-[1600px] mx-auto w-full space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title={t("stats.totalWorkforce")} value={stats?.total || "0"} icon={Users} />
          <StatCard title={t("stats.critical")} value={stats?.critical || "0"} icon={ShieldAlert} variant="critical" />
          <StatCard title={t("stats.upcomingRenewals")} value={stats?.warning || "0"} icon={Clock} variant="warning" />
          <StatCard title={t("stats.nonCompliant")} value={stats?.nonCompliant || "0"} icon={AlertTriangle} variant="critical" />
        </div>

        {/* Command Bar */}
        <div className="glass-panel p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between mt-8">
          <div className="flex-1 w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder={t("table.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-primary/60 transition-colors placeholder:text-gray-500"
            />
          </div>
          
          <div className="flex gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:w-48">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select 
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/60 transition-colors"
              >
                <option value="">{t("table.allSpecs")}</option>
                <option value="TIG">{t("table.tigWelders")}</option>
                <option value="MIG">{t("table.migWelders")}</option>
                <option value="ARC">{t("table.arcWelders")}</option>
              </select>
            </div>
            <div className="relative flex-1 md:w-48">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select 
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-500 rounded-lg text-sm font-mono text-white appearance-none focus:outline-none focus:border-primary/60 transition-colors"
              >
                <option value="">{t("table.allStatuses")}</option>
                <option value="compliant">{t("table.compliant")}</option>
                <option value="warning">{t("table.warning")}</option>
                <option value="critical">{t("table.critical")}</option>
                <option value="non-compliant">{t("table.nonCompliant")}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="glass-panel rounded-xl overflow-hidden tech-border">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-700/60 border-b border-slate-600">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-700/95 px-6 py-4 text-xs font-display font-bold uppercase tracking-widest text-white border-r border-white/5">{t("table.operator")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">{t("table.spec")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">{t("table.trcExpiry")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">Passport Exp.</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">{t("table.bhp")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">Docs</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white">{t("table.status")}</th>
                  <th className="px-4 py-4 text-xs font-display font-bold uppercase tracking-widest text-white text-right">{t("table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-sm">
                {isLoadingWorkers ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-6 py-6">
                        <div className="h-4 bg-white/5 rounded animate-pulse w-full" />
                      </td>
                    </tr>
                  ))
                ) : workersData?.workers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground font-sans">
                      {t("table.noResults")}
                    </td>
                  </tr>
                ) : (
                  workersData?.workers.map((worker) => (
                    <tr 
                      key={worker.id} 
                      onClick={() => setSelectedWorkerId(worker.id)}
                      className="hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      <td className="sticky left-0 z-10 bg-slate-900/95 group-hover:bg-slate-800/95 px-6 py-4 border-r border-white/5 transition-colors">
                        <div className="font-sans font-medium text-white">{worker.name}</div>
                        <div className="text-xs text-muted-foreground">{worker.email || worker.phone || '—'}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2 py-1 rounded bg-white/10 border border-white/20 text-xs font-bold text-white">
                          {worker.specialization || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-white font-mono text-sm">
                        {worker.trcExpiry ? format(parseISO(worker.trcExpiry), 'MMM d, yy') : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-4 text-white font-mono text-sm">
                        {(worker as any).passportExpiry ? format(parseISO((worker as any).passportExpiry), 'MMM d, yy') : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-4 font-mono text-sm">
                        {(() => {
                          const v = worker.bhpStatus;
                          if (!v) return <span className="text-gray-500">—</span>;
                          const d = new Date(v);
                          if (!isNaN(d.getTime()) && v.includes('-')) {
                            const expired = d < new Date();
                            return <span className={expired ? 'text-destructive font-bold' : 'text-success font-bold'}>{format(parseISO(v), 'MMM d, yy')}</span>;
                          }
                          const lower = v.toLowerCase();
                          return <span className={lower === 'active' ? 'text-success font-bold' : 'text-destructive font-bold'}>{v}</span>;
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          {(worker as any).passportAttachments?.length > 0 && (
                            <span title="Passport" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">PP</span>
                          )}
                          {(worker as any).trcAttachments?.length > 0 && (
                            <span title="TRC" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-300 border border-green-500/30">TRC</span>
                          )}
                          {(worker as any).bhpAttachments?.length > 0 && (
                            <span title="BHP Certificate" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">BHP</span>
                          )}
                          {(worker as any).contractAttachments?.length > 0 && (
                            <span title="Contract" className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">CON</span>
                          )}
                          {!(worker as any).passportAttachments?.length && !(worker as any).trcAttachments?.length && !(worker as any).bhpAttachments?.length && !(worker as any).contractAttachments?.length && (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={worker.complianceStatus} />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setPanelEditMode(false); setSelectedWorkerId(worker.id); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 hover:border-blue-400/60 text-xs font-bold uppercase tracking-wide transition-all"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setPanelEditMode(true); setSelectedWorkerId(worker.id); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-500/30 hover:border-amber-400/60 text-xs font-bold uppercase tracking-wide transition-all"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => handleNotify(e, worker)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                              title={t("table.notifyWorker")}
                            >
                              <Bell className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={(e) => handleRenew(e, worker)}
                              className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
                              title={t("table.renewDocument")}
                            >
                              <RefreshCcw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <WorkerProfilePanel 
        workerId={selectedWorkerId}
        initialEditMode={panelEditMode}
        onClose={() => { setSelectedWorkerId(null); setPanelEditMode(false); }} 
        onRenew={(w) => { setSelectedWorkerId(null); setPanelEditMode(false); setActionWorker(w); setRenewOpen(true); }}
        onNotify={(w) => { setSelectedWorkerId(null); setPanelEditMode(false); setActionWorker(w); setNotifyOpen(true); }}
      />
      
      {actionWorker && (
        <>
          <NotifyDialog worker={actionWorker} isOpen={notifyOpen} onClose={() => setNotifyOpen(false)} />
          <RenewDialog worker={actionWorker} isOpen={renewOpen} onClose={() => setRenewOpen(false)} />
        </>
      )}

      <ComplianceReportModal isOpen={reportOpen} onClose={() => setReportOpen(false)} />
      <BulkUploadModal isOpen={bulkUploadOpen} onClose={() => setBulkUploadOpen(false)} />
    </div>
  );
}
