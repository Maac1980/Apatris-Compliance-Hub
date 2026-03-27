import { useAuth } from "@/lib/auth";
import { Home, Users, Bell, User, FileText, Clock, ClipboardList, MapPin, DollarSign, LayoutGrid, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { Role } from "@/types";
import { useWorkers } from "@/hooks/useWorkers";

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
        { id: "payroll",     label: "Payroll",    icon: DollarSign },
        { id: "alerts",      label: "Alerts",     icon: Bell },
        { id: "calculator",  label: "Calculator", icon: Calculator },
        { id: "profile",     label: "Profile",    icon: User },
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

const ACTIVE_COLORS: Record<Role, string> = {
  Executive:    "text-indigo-600",
  LegalHead:    "text-violet-600",
  TechOps:      "text-blue-600",
  Coordinator:  "text-emerald-600",
  Professional: "text-amber-600",
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
  const activeColor = ACTIVE_COLORS[role];

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
    <div className="shrink-0 bg-white border-t border-border shadow-[0_-4px_24px_rgba(0,0,0,0.02)] relative z-50">
      <div className="flex items-center justify-around h-16 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badge = getBadge(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-200 active:scale-95",
                isActive ? activeColor : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon className={cn("w-6 h-6 transition-all duration-200", isActive ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
                {isActive && (
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current" />
                )}
                {badge > 0 && !isActive && (
                  <span className={cn(
                    "absolute -top-1.5 -right-2 min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center text-[9px] font-black text-white",
                    "bg-red-500"
                  )}>
                    {badge}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-[10px] tracking-wide transition-all duration-200 leading-tight text-center",
                isActive ? "font-bold" : "font-medium"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
