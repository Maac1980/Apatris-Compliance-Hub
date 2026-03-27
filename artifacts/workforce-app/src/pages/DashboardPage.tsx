import { KnowledgeCenter } from "@/components/KnowledgeCenter";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState } from "react";
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
import { TimesheetTab } from "@/components/tabs/TimesheetTab";
import { DocsTab } from "@/components/tabs/DocsTab";

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

  // Tab history stack — so back button walks through previously visited tabs
  const tabHistoryRef = useRef<string[]>(["home"]);

  // Navigate to a tab, recording it in both our stack and browser history
  const navigateTab = (tab: string) => {
    // Don't push duplicates of the current top
    const history = tabHistoryRef.current;
    if (history[history.length - 1] === tab) return;
    tabHistoryRef.current = [...history, tab];
    setActiveTab(tab);
    // Push a browser history entry so popstate fires on back press
    window.history.pushState({ wfTab: tab }, "");
  };

  // On mount: push an initial guard so the FIRST back press is interceptable
  useEffect(() => {
    window.history.pushState({ wfTab: "home" }, "");

    const handlePopState = () => {
      const stack = tabHistoryRef.current;
      if (stack.length > 1) {
        // Pop the current tab and go back to the previous one
        const next = stack.slice(0, -1);
        tabHistoryRef.current = next;
        const prevTab = next[next.length - 1];
        setActiveTab(prevTab);
        // Re-push a guard so the next back press is also caught
        window.history.pushState({ wfTab: prevTab }, "");
      } else {
        // Already at root (home) — re-push guard to prevent leaving the app
        window.history.pushState({ wfTab: "home" }, "");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (isT1) return <OwnerHome onNavigate={navigateTab} />;
        if (isT2) return <ManagerHome onNavigate={navigateTab} />;
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

      // ── MY DOCS — focused document status view ────────────────────────────
      case "docs":
        return <DocsTab />;

      // ── TIMESHEET — T5 view, also accessible by T1 + T2 ──────────────────
      case "timesheet":
        return <TimesheetTab />;
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

      <BottomNav activeTab={activeTab} onTabChange={navigateTab} />
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
