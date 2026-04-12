import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Home, Users, Bell, User, FileText, Clock, ClipboardList, MapPin, DollarSign, LayoutGrid, Calculator, FileSignature, Navigation, Stamp, ClipboardCheck, Briefcase, Receipt, SmilePlus, UserMinus, MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Role } from "@/types";
import { useWorkers } from "@/hooks/useWorkers";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

interface Tab {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// Primary tabs shown in bottom bar (max 5) + overflow in "More" menu
function getTabsForRole(role: Role): { primary: Tab[]; overflow: Tab[] } {
  switch (role) {
    case "Executive":
      return {
        primary: [
          { id: "home",       label: "nav.home",       icon: Home },
          { id: "workers",    label: "nav.directory",  icon: Users },
          { id: "alerts",     label: "nav.alerts",     icon: Bell },
          { id: "immigration", label: "nav.permits",   icon: Stamp },
        ],
        overflow: [
          { id: "payroll",    label: "nav.payroll",    icon: DollarSign },
          { id: "contracts",  label: "nav.contracts",  icon: FileSignature },
          { id: "gps",        label: "nav.gps",        icon: Navigation },
          { id: "onboarding", label: "nav.onboarding", icon: ClipboardCheck },
          { id: "invoices",   label: "nav.invoices",   icon: Receipt },
          { id: "zus",        label: "nav.zus",        icon: Calculator },
          { id: "fines",      label: "nav.fines",      icon: Bell },
          { id: "profile",    label: "nav.profile",    icon: User },
        ],
      };
    case "LegalHead":
      return {
        primary: [
          { id: "home",          label: "nav.home",      icon: Home },
          { id: "workers",       label: "nav.directory", icon: Users },
          { id: "alerts",        label: "nav.alerts",    icon: Bell },
          { id: "immigration",   label: "nav.permits",   icon: Stamp },
        ],
        overflow: [
          { id: "queue",         label: "nav.docQueue",   icon: ClipboardList },
          { id: "onboarding",    label: "nav.onboarding", icon: ClipboardCheck },
          { id: "invoices",      label: "nav.invoices",   icon: Receipt },
          { id: "zus",           label: "nav.zus",        icon: Calculator },
          { id: "contractgen",   label: "nav.contracts",  icon: FileSignature },
          { id: "profile",       label: "nav.profile",    icon: User },
        ],
      };
    case "TechOps":
      return {
        primary: [
          { id: "home",          label: "nav.directory",   icon: Users },
          { id: "workers",       label: "nav.workspace",   icon: LayoutGrid },
          { id: "sites",         label: "nav.sites",       icon: MapPin },
          { id: "immigration",   label: "nav.permits",     icon: Stamp },
        ],
        overflow: [
          { id: "zus",           label: "nav.zus",         icon: Calculator },
          { id: "onboarding",    label: "nav.onboarding",  icon: ClipboardCheck },
          { id: "profile",       label: "nav.profile",     icon: User },
        ],
      };
    case "Coordinator":
      return {
        primary: [
          { id: "home",          label: "nav.directory",   icon: Users },
          { id: "workers",       label: "nav.workspace",   icon: LayoutGrid },
          { id: "queue",         label: "nav.docQueue",    icon: ClipboardList },
          { id: "immigration",   label: "nav.permits",     icon: Stamp },
        ],
        overflow: [
          { id: "zus",           label: "nav.zus",         icon: Calculator },
          { id: "onboarding",    label: "nav.onboarding",  icon: ClipboardCheck },
          { id: "profile",       label: "nav.profile",     icon: User },
        ],
      };
    case "Professional":
      return {
        primary: [
          { id: "home",          label: "nav.home",        icon: Home },
          { id: "docs",          label: "nav.myDocs",      icon: FileText },
          { id: "timesheet",     label: "nav.timesheet",   icon: Clock },
          { id: "gps",           label: "nav.gps",         icon: Navigation },
        ],
        overflow: [
          { id: "immigration",   label: "nav.permits",     icon: Stamp },
          { id: "onboarding",    label: "nav.onboarding",  icon: ClipboardCheck },
          { id: "advances",      label: "nav.advances",    icon: DollarSign },
          { id: "leave",         label: "nav.leave",       icon: Clock },
          { id: "profile",       label: "nav.profile",     icon: User },
        ],
      };
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
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  if (!role) return null;

  const { primary, overflow } = getTabsForRole(role);
  const activeStyle = ACTIVE_COLORS[role];
  const isOverflowActive = overflow.some(tab => tab.id === activeTab);

  const alertCount = workers.filter(
    w => w.status === "Non-Compliant" || w.status === "Missing Docs"
  ).length;
  const docQueueCount = workers.flatMap(w => w.documents).filter(d => d.status === "Under Review").length;

  function getBadge(tabId: string): number {
    if (tabId === "alerts") return alertCount;
    if (tabId === "queue")  return docQueueCount;
    return 0;
  }

  const renderTab = (tab: Tab, isActive: boolean) => {
    const Icon = tab.icon;
    const badge = getBadge(tab.id);
    return (
      <button
        key={tab.id}
        onClick={() => { onTabChange(tab.id); setMoreOpen(false); }}
        className={cn(
          "relative flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 active:scale-90",
          isActive ? activeStyle.text : "text-white/30 hover:text-white/50"
        )}
      >
        {isActive && (
          <motion.div
            layoutId="navPill"
            className={cn("absolute inset-x-2 top-[8px] bottom-[8px] rounded-2xl", activeStyle.bg, activeStyle.glow)}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center gap-0.5">
          <div className="relative">
            <Icon className={cn("w-[22px] h-[22px] transition-all duration-200", isActive ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
            {badge > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-black text-white bg-red-500 shadow-lg shadow-red-500/30">{badge}</span>
            )}
          </div>
          <span className={cn("text-[9px] tracking-wider transition-all duration-200 leading-tight text-center uppercase", isActive ? "font-black" : "font-semibold")}>{t(tab.label)}</span>
        </div>
      </button>
    );
  };

  return (
    <>
      {/* More menu — bottom sheet within app container */}
      {moreOpen && (
        <>
          <div className="absolute inset-0 bg-black/50 z-[60]" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-[68px] left-0 right-0 z-[61] bg-[#0c0c0e] border-t border-white/10 rounded-t-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="px-4 pt-3 pb-2">
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-3" />
              {overflow.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { onTabChange(tab.id); setMoreOpen(false); }}
                    className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors mb-0.5", isActive ? cn(activeStyle.bg, activeStyle.text, "font-bold") : "text-white/60 active:bg-white/5")}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{t(tab.label)}</span>
                    {isActive && <div className={cn("ml-auto w-2 h-2 rounded-full", BADGE_BG[role])} />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Bottom nav bar */}
      <div className="shrink-0 premium-nav relative z-50">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <div className="flex items-center justify-around h-[68px] px-2">
          {primary.map(tab => renderTab(tab, activeTab === tab.id))}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={cn(
              "relative flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 active:scale-90",
              isOverflowActive || moreOpen ? activeStyle.text : "text-white/30 hover:text-white/50"
            )}
          >
            <div className="relative z-10 flex flex-col items-center gap-0.5">
              <MoreHorizontal className={cn("w-[22px] h-[22px] transition-all duration-200", moreOpen ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
              <span className={cn("text-[9px] tracking-wider transition-all duration-200 leading-tight text-center uppercase", moreOpen ? "font-black" : "font-semibold")}>More</span>
            </div>
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </>
  );
}
