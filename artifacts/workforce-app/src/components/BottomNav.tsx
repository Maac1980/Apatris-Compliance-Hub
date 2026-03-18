import { useAuth } from "@/lib/auth";
import { Home, Users, Bell, User, FileText, Clock, ClipboardList, MapPin, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { Role } from "@/types";

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
        { id: "home", label: "Home", icon: Home },
        { id: "workers", label: "Workers", icon: Users },
        { id: "payroll", label: "Payroll", icon: DollarSign },
        { id: "profile", label: "Profile", icon: User },
      ];
    case "LegalHead":
      return [
        { id: "home", label: "Home", icon: Home },
        { id: "workers", label: "Workers", icon: Users },
        { id: "alerts", label: "Alerts", icon: Bell },
        { id: "profile", label: "Profile", icon: User },
      ];
    case "TechOps":
      return [
        { id: "home", label: "Home", icon: Home },
        { id: "workers", label: "Workers", icon: Users },
        { id: "sites", label: "Sites", icon: MapPin },
        { id: "profile", label: "Profile", icon: User },
      ];
    case "Coordinator":
      return [
        { id: "home", label: "Home", icon: Home },
        { id: "queue", label: "Queue", icon: ClipboardList },
        { id: "profile", label: "Profile", icon: User },
      ];
    case "Professional":
      return [
        { id: "home", label: "Home", icon: Home },
        { id: "docs", label: "My Docs", icon: FileText },
        { id: "timesheet", label: "Timesheet", icon: Clock },
        { id: "profile", label: "Profile", icon: User },
      ];
  }
}

function getActiveColorForRole(role: Role): string {
  switch (role) {
    case "Executive":   return "text-indigo-600";
    case "LegalHead":   return "text-violet-600";
    case "TechOps":     return "text-blue-600";
    case "Coordinator": return "text-emerald-600";
    case "Professional":return "text-amber-600";
  }
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { role } = useAuth();

  if (!role) return null;

  const tabs = getTabsForRole(role);
  const activeColor = getActiveColorForRole(role);

  return (
    <div className="shrink-0 bg-white border-t border-border shadow-[0_-4px_24px_rgba(0,0,0,0.02)] relative z-50">
      <div className="flex items-center justify-around h-16 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

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
              </div>
              <span className={cn("text-[10px] tracking-wide transition-all duration-200", isActive ? "font-bold" : "font-medium")}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
