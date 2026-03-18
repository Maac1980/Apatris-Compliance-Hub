import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { LogOut, Bell, User, FileText, Clock, MapPin, DollarSign, ClipboardList } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Role, TIER_CONFIGS } from "@/types";
import { OwnerHome } from "@/components/tabs/OwnerHome";
import { ManagerHome } from "@/components/tabs/ManagerHome";
import { Tier3Home } from "@/components/tabs/Tier3Home";
import { Tier4Home } from "@/components/tabs/Tier4Home";
import { Tier5Home } from "@/components/tabs/Tier5Home";
import { WorkersTab } from "@/components/tabs/WorkersTab";
import { BottomNav } from "@/components/BottomNav";

function Placeholder({ icon: Icon, label, color }: { icon: React.ElementType; label: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[300px]"
    >
      <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4", color)}>
        <Icon className="w-8 h-8 opacity-60" />
      </div>
      <h2 className="text-base font-bold text-foreground mb-1">{label}</h2>
      <p className="text-sm text-muted-foreground">Coming in the next phase.</p>
    </motion.div>
  );
}

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

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        if (role === "Executive") return <OwnerHome />;
        if (role === "LegalHead") return <ManagerHome />;
        if (role === "TechOps") return <Tier3Home />;
        if (role === "Coordinator") return <Tier4Home />;
        if (role === "Professional") return <Tier5Home />;
        return null;

      case "workers":
        if (!tierConfig.canViewGlobalDirectory) {
          return <Placeholder icon={User} label="Access Restricted" color="bg-red-50 text-red-500" />;
        }
        return <WorkersTab />;

      case "payroll":
        if (!tierConfig.canViewFinancials) {
          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[300px]"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-base font-bold text-red-700 mb-2">Financial Firewall</h2>
              <p className="text-sm text-muted-foreground max-w-[220px]">
                Payroll ledgers and ZUS calculators are restricted to Tier 1 (Executive Board) only.
              </p>
            </motion.div>
          );
        }
        return <Placeholder icon={DollarSign} label="Payroll Ledger" color="bg-indigo-50 text-indigo-500" />;

      case "alerts":
        return <Placeholder icon={Bell} label="Alerts" color="bg-amber-50 text-amber-500" />;

      case "sites":
        return <Placeholder icon={MapPin} label="Site Deployments" color="bg-emerald-50 text-emerald-500" />;

      case "queue":
        return <Tier4Home />;

      case "docs":
        return <Placeholder icon={FileText} label="My Documents" color="bg-blue-50 text-blue-500" />;

      case "timesheet":
        return <Placeholder icon={Clock} label="Timesheet" color="bg-emerald-50 text-emerald-500" />;

      case "profile":
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[300px]"
          >
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-base font-bold text-foreground mb-1">Profile</h2>
            <div className={cn("inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border mt-2", badgeColor)}>
              {tierConfig.shortLabel} · Tier {tierConfig.tier}
            </div>
            <p className="text-xs text-muted-foreground mt-3 max-w-[220px]">{tierConfig.title}</p>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="h-14 bg-white border-b border-border shadow-sm px-4 flex items-center justify-between shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <span className="font-black text-lg tracking-tight text-foreground">APATRIS</span>
          <div className={cn("px-2 py-0.5 rounded-full text-[10px] font-black border tracking-wide", badgeColor)}>
            {tierConfig.shortLabel}
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-gray-100 active:scale-95 transition-all"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" strokeWidth={2} />
        </button>
      </header>

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
