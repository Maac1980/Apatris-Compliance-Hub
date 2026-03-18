import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Home, Users, Bell, User, FileText, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  icon: React.ElementType;
}

export function BottomNav() {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState("home");

  if (!role) return null;

  const isWorker = role === "Worker";

  // Define tabs based on role
  const tabs: Tab[] = isWorker
    ? [
        { id: "home", label: "Home", icon: Home },
        { id: "docs", label: "My Docs", icon: FileText },
        { id: "timesheet", label: "Timesheet", icon: Clock },
        { id: "profile", label: "Profile", icon: User },
      ]
    : [
        { id: "home", label: "Home", icon: Home },
        { id: "workers", label: "Workers", icon: Users },
        { id: "alerts", label: "Alerts", icon: Bell },
        { id: "profile", label: "Profile", icon: User },
      ];

  // Map roles to their specific UI accent colors
  const roleColorClasses: Record<string, string> = {
    Owner: "text-indigo-600",
    Manager: "text-blue-600",
    Office: "text-emerald-600",
    Worker: "text-amber-600",
  };

  const activeColor = roleColorClasses[role] || "text-primary";

  return (
    <div className="shrink-0 bg-white border-t border-border shadow-[0_-4px_24px_rgba(0,0,0,0.02)] pb-safe relative z-50">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-all duration-200 active:scale-95",
                isActive ? activeColor : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    "w-6 h-6 transition-all duration-300",
                    isActive ? "stroke-[2.5px]" : "stroke-[1.5px]"
                  )}
                />
                {isActive && (
                  <span 
                    className={cn(
                      "absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current"
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] tracking-wide transition-all duration-300",
                  isActive ? "font-bold" : "font-medium"
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
