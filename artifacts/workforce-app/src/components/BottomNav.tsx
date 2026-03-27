import { useAuth } from "@/lib/auth";
import { Home, Users, Bell, User, FileText, Clock, ClipboardList, MapPin, DollarSign, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { Role } from "@/types";
import { useWorkers } from "@/hooks/useWorkers";
import { motion } from "framer-motion";

interface Tab {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

function getTabsForRole(role: Role): Tab[] {
  switch (role) {
    case "Executive":
      return [
        { id: "home",    label: "Home",      icon: Home },
        { id: "workers", label: "Directory", icon: Users },
        { id: "payroll", label: "Payroll",   icon: DollarSign },
        { id: "alerts",  label: "Alerts",    icon: Bell },
        { id: "profile", label: "Profile",   icon: User },
      ];
    case "LegalHead":
      return [
        { id: "home",    label: "Home",      icon: Home },
        { id: "workers", label: "Directory", icon: Users },
        { id: "alerts",  label: "Alerts",    icon: Bell },
        { id: "queue",   label: "Doc Queue", icon: ClipboardList },
        { id: "profile", label: "Profile",   icon: User },
      ];
    case "TechOps":
      return [
        { id: "home",    label: "Directory", icon: Users },
        { id: "workers", label: "Workspace", icon: LayoutGrid },
        { id: "sites",   label: "Sites",     icon: MapPin },
        { id: "profile", label: "Profile",   icon: User },
      ];
    case "Coordinator":
      return [
        { id: "home",    label: "Directory", icon: Users },
        { id: "workers", label: "Workspace", icon: LayoutGrid },
        { id: "queue",   label: "Doc Queue", icon: ClipboardList },
        { id: "profile", label: "Profile",   icon: User },
      ];
    case "Professional":
      return [
        { id: "home",      label: "Home",      icon: Home },
        { id: "docs",      label: "My Docs",   icon: FileText },
        { id: "timesheet", label: "Timesheet", icon: Clock },
        { id: "profile",   label: "Profile",   icon: User },
      ];
  }
}

const ACTIVE_COLORS: Record<Role, { text: string; bg: string; glow: string }> = {
  Executive:    { text: "text-indigo-400",  bg: "bg-indigo-500/15",  glow: "shadow-[0_0_12px_-2px_rgba(99,102,241,0.4)]" },
  LegalHead:    { text: "text-violet-400",  bg: "bg-violet-500/15",  glow: "shadow-[0_0_12px_-2px_rgba(139,92,246,0.4)]" },
  TechOps:      { text: "text-blue-400",    bg: "bg-blue-500/15",    glow: "shadow-[0_0_12px_-2px_rgba(59,130,246,0.4)]" },
  Coordinator:  { text: "text-emerald-400", bg: "bg-emerald-500/15", glow: "shadow-[0_0_12px_-2px_rgba(16,185,129,0.4)]" },
  Professional: { text: "text-amber-400",   bg: "bg-amber-500/15",   glow: "shadow-[0_0_12px_-2px_rgba(245,158,11,0.4)]" },
};

const BADGE_BG: Record<Role, string> = {
  Executive:    "bg-indigo-600",
  LegalHead:    "bg-violet-600",
  TechOps:      "bg-blue-600",
  Coordinator:  "bg-emerald-600",
  Professional: "bg-amber-600",
};

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { role } = useAuth();
  const { workers } = useWorkers();
  if (!role) return null;

  const tabs = getTabsForRole(role);
  const activeStyle = ACTIVE_COLORS[role];

  const alertCount = workers.filter(
    w => w.status === "Non-Compliant" || w.status === "Missing Docs"
  ).length;
  const docQueueCount = workers.flatMap(w => w.documents).filter(d => d.status === "Under Review").length;

  function getBadge(tabId: string): number {
    if (tabId === "alerts") return alertCount;
    if (tabId === "queue")  return docQueueCount;
    return 0;
  }

  return (
    <div className="shrink-0 premium-nav relative z-50">
      {/* Top highlight line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div className="flex items-center justify-around h-[68px] px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = getBadge(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 active:scale-90",
                isActive ? activeStyle.text : "text-white/30 hover:text-white/50"
              )}
            >
              {/* Active pill background */}
              {isActive && (
                <motion.div
                  layoutId="navPill"
                  className={cn("absolute inset-x-2 top-[8px] bottom-[8px] rounded-2xl", activeStyle.bg, activeStyle.glow)}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              <div className="relative z-10 flex flex-col items-center gap-0.5">
                <div className="relative">
                  <Icon className={cn(
                    "w-[22px] h-[22px] transition-all duration-200",
                    isActive ? "stroke-[2.5px]" : "stroke-[1.5px]"
                  )} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-black text-white bg-red-500 shadow-lg shadow-red-500/30">
                      {badge}
                    </span>
                  )}
                </div>
                <span className={cn(
                  "text-[9px] tracking-wider transition-all duration-200 leading-tight text-center uppercase",
                  isActive ? "font-black" : "font-semibold"
                )}>
                  {tab.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {/* Safe area padding for notched devices */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
