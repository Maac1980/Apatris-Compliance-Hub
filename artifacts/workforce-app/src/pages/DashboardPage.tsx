import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Role, TIER_CONFIGS } from "@/types";
import { OwnerHome } from "@/components/tabs/OwnerHome";
import { ManagerHome } from "@/components/tabs/ManagerHome";
import { Tier3Home } from "@/components/tabs/Tier3Home";
import { Tier4Home } from "@/components/tabs/Tier4Home";
import { Tier5Home } from "@/components/tabs/Tier5Home";
import { PayrollModule } from "@/components/tabs/PayrollModule";
import { AlertsModule } from "@/components/tabs/AlertsModule";
import { SitesModule } from "@/components/tabs/SitesModule";
import { WorkersTab } from "@/components/tabs/WorkersTab";
import { ProfileTab } from "@/components/tabs/ProfileTab";
import { BottomNav } from "@/components/BottomNav";

const ROLE_BADGE_COLORS: Record<Role, string> = {
  Executive:    "bg-indigo-100 text-indigo-700 border-indigo-200",
  LegalHead:    "bg-violet-100 text-violet-700 border-violet-200",
  TechOps:      "bg-blue-100 text-blue-700 border-blue-200",
  Coordinator:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  Professional: "bg-amber-100 text-amber-700 border-amber-200",
};

export function DashboardPage() {
  const { role, logout, isReady } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("home");

  useEffect(() => {
    if (isReady && !role) setLocation("/");
  }, [role, isReady, setLocation]);

  if (!role) return null;

  const tierConfig = TIER_CONFIGS[role];
  const badgeColor = ROLE_BADGE_COLORS[role];

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  // T1 and T2 can access every tab — no restrictions on navigation
  const isT1 = role === "Executive";
  const isT2 = role === "LegalHead";

  const renderContent = () => {
    switch (activeTab) {

      // ── HOME ──────────────────────────────────────────────────────────────
      case "home":
        if (isT1) return <OwnerHome onNavigate={setActiveTab} />;
        if (isT2) return <ManagerHome onNavigate={setActiveTab} />;
        if (role === "TechOps")      return <WorkersTab />;
        if (role === "Coordinator")  return <WorkersTab />;
        if (role === "Professional") return <Tier5Home />;
        return null;

      // ── DIRECTORY (workers) ───────────────────────────────────────────────
      // T1 / T2 → Professional Directory
      // T3 → Operational Workspace
      // T4 → Operational Workspace
      case "workers":
        if (role === "TechOps")     return <Tier3Home />;
        if (role === "Coordinator") return <Tier4Home />;
        return <WorkersTab />;

      // ── PAYROLL (T1 only) ─────────────────────────────────────────────────
      case "payroll":
        if (!tierConfig.canViewFinancials) {
          return <AccessDenied title="Financial Firewall" message="ZUS & Payroll ledgers are restricted to Tier 1 (Executive Board & Partners) only." label="TIER 1 ACCESS ONLY" />;
        }
        return <PayrollModule />;

      // ── ALERTS (T1 + T2, and inherited by both) ───────────────────────────
      case "alerts":
        return <AlertsModule />;

      // ── WORKSPACE — T3 view, now also accessible by T1 + T2 ──────────────
      case "workspace":
        return <Tier3Home />;

      // ── SITES — T3 view, also accessible by T1 + T2 ──────────────────────
      case "sites":
        return <SitesModule />;

      // ── DOC QUEUE — T4 view, also accessible by T1 + T2 ──────────────────
      case "queue":
        return <Tier4Home />;

      // ── MY DOCS — T5 view, also accessible by T1 + T2 ────────────────────
      case "docs":
        return <Tier5Home />;

      // ── TIMESHEET — T5 view, also accessible by T1 + T2 ──────────────────
      case "timesheet":
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 py-5 space-y-5 pb-6"
          >
            <div className="flex items-center gap-2 ml-1">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Timesheet — March 2026</h2>
              <span className="text-[9px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap">OPEN</span>
            </div>
            <div className="bg-white rounded-2xl border shadow-sm p-5">
              <div className="text-3xl font-black text-amber-600 leading-none">142 hrs</div>
              <div className="text-xs text-muted-foreground font-medium mt-1">Submitted this month</div>
              <div className="h-2 w-full bg-gray-100 rounded-full mt-3 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "71%" }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                  className="h-full bg-amber-400 rounded-full"
                />
              </div>
              <div className="text-[11px] text-muted-foreground mt-1.5">142 / 200 expected hours</div>
            </div>
            <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
              {[
                { week: "Week 1 (Mar 1–7)",   hours: 38, status: "Approved" },
                { week: "Week 2 (Mar 8–14)",  hours: 40, status: "Approved" },
                { week: "Week 3 (Mar 15–21)", hours: 36, status: "Approved" },
                { week: "Week 4 (Mar 22–28)", hours: 28, status: "Pending" },
              ].map(row => (
                <div key={row.week} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{row.week}</div>
                    <div className="text-xs text-muted-foreground">{row.hours} hours submitted</div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap",
                    row.status === "Approved"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  )}>
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        );

      // ── PROFILE ───────────────────────────────────────────────────────────
      case "profile":
        return <ProfileTab onLogout={handleLogout} />;

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <header className="h-14 bg-white border-b border-border shadow-sm px-4 flex items-center justify-between shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-black text-lg tracking-tight text-foreground shrink-0">APATRIS</span>
          <div className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-black border tracking-wide whitespace-nowrap shrink-0",
            badgeColor
          )}>
            {tierConfig.shortLabel}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-gray-100 active:scale-95 transition-all shrink-0"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" strokeWidth={2} />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto no-scrollbar bg-gray-50 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.14 }}
            className="h-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

// ── Shared access-denied wall ─────────────────────────────────────────────────
function AccessDenied({ title, message, label }: { title: string; message: string; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[300px]"
    >
      <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border-2 border-red-100">
        <LockSvg className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-base font-bold text-red-700 mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-[220px]">{message}</p>
      <div className="mt-4 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700">
        {label}
      </div>
    </motion.div>
  );
}

function LockSvg({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
