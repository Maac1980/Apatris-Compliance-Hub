import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  Home, Users, Bell, User, FileText, Clock, ClipboardList, MapPin,
  DollarSign, LayoutGrid, Calculator, FileSignature, Navigation, Stamp,
  ClipboardCheck, Receipt, MoreHorizontal, X, Shield, Globe, FileCheck,
  Upload,
} from "lucide-react";
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

interface ModuleCard {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// ═══ PRIMARY TABS (bottom bar — max 4 + More) ═════════════════════════════

function getPrimaryTabs(role: Role): Tab[] {
  switch (role) {
    case "Executive":
    case "LegalHead":
      return [
        { id: "home",        label: "nav.home",      icon: Home },
        { id: "workers",     label: "nav.directory",  icon: Users },
        { id: "alerts",      label: "nav.alerts",     icon: Bell },
        { id: "immigration", label: "nav.permits",    icon: Stamp },
      ];
    case "TechOps":
      return [
        { id: "home",        label: "nav.directory",  icon: Users },
        { id: "workers",     label: "nav.workspace",  icon: LayoutGrid },
        { id: "sites",       label: "nav.sites",      icon: MapPin },
        { id: "immigration", label: "nav.permits",    icon: Stamp },
      ];
    case "Coordinator":
      return [
        { id: "home",        label: "nav.directory",  icon: Users },
        { id: "workers",     label: "nav.workspace",  icon: LayoutGrid },
        { id: "queue",       label: "nav.docQueue",   icon: ClipboardList },
        { id: "immigration", label: "nav.permits",    icon: Stamp },
      ];
    case "Professional":
      return [
        { id: "home",        label: "nav.home",       icon: Home },
        { id: "docs",        label: "nav.myDocs",     icon: FileText },
        { id: "timesheet",   label: "nav.timesheet",  icon: Clock },
        { id: "gps",         label: "nav.gps",        icon: Navigation },
      ];
  }
}

// ═══ MODULE CARDS (card grid in More sheet — grouped by category) ══════════

interface ModuleGroup {
  title: string;
  modules: ModuleCard[];
}

function getModuleGroups(role: Role): ModuleGroup[] {
  const legal: ModuleCard[] = [
    { id: "legalstatus", label: "Legal Status",  sublabel: "Art. 108 · Risk",     icon: Shield,     iconColor: "#10B981", iconBg: "bg-emerald-500/15" },
    { id: "schengen",    label: "Schengen",       sublabel: "90/180 Calculator",   icon: Globe,      iconColor: "#6366F1", iconBg: "bg-indigo-500/15" },
    { id: "upo",         label: "UPO / MOS",      sublabel: "Filing · Receipts",   icon: FileCheck,  iconColor: "#8B5CF6", iconBg: "bg-violet-500/15" },
    { id: "fines",       label: "Fines Risk",     sublabel: "PIP · Penalties",     icon: Bell,       iconColor: "#EF4444", iconBg: "bg-red-500/15" },
  ];

  const documents: ModuleCard[] = [
    { id: "docs",        label: "Documents",      sublabel: "Expiry · Upload",     icon: FileText,   iconColor: "#3B82F6", iconBg: "bg-blue-500/15" },
    { id: "docupload",   label: "AI Upload",      sublabel: "Scan · Extract",      icon: Upload,     iconColor: "#C41E18", iconBg: "bg-red-500/15" },
    { id: "queue",       label: "Doc Queue",      sublabel: "Review · Approve",    icon: ClipboardList, iconColor: "#F59E0B", iconBg: "bg-amber-500/15" },
  ];

  const finance: ModuleCard[] = [
    { id: "payroll",     label: "Payroll",         sublabel: "ZUS · PIT · Netto",   icon: DollarSign,  iconColor: "#10B981", iconBg: "bg-emerald-500/15" },
    { id: "calculator",  label: "ZUS Calculator",  sublabel: "Brutto → Netto",      icon: Calculator,  iconColor: "#1B2A4A", iconBg: "bg-slate-500/15" },
    { id: "zus",         label: "ZUS Filings",     sublabel: "DRA · Monthly",       icon: Calculator,  iconColor: "#6B7280", iconBg: "bg-slate-500/15" },
    { id: "invoices",    label: "Invoices",        sublabel: "Client · VAT",        icon: Receipt,     iconColor: "#0EA5E9", iconBg: "bg-cyan-500/15" },
  ];

  const operations: ModuleCard[] = [
    { id: "onboarding",  label: "Onboarding",     sublabel: "Checklist · Setup",   icon: ClipboardCheck, iconColor: "#8B5CF6", iconBg: "bg-violet-500/15" },
    { id: "gps",         label: "GPS Check-in",   sublabel: "Location · Sites",    icon: Navigation,  iconColor: "#3B82F6", iconBg: "bg-blue-500/15" },
    { id: "contracts",   label: "Contracts",       sublabel: "Zlecenie · O Pracę",  icon: FileSignature, iconColor: "#EC4899", iconBg: "bg-pink-500/15" },
  ];

  const account: ModuleCard[] = [
    { id: "profile",     label: "Profile",         sublabel: "Settings · Account",  icon: User,        iconColor: "#6B7280", iconBg: "bg-slate-500/15" },
  ];

  switch (role) {
    case "Executive":
      return [
        { title: "Legal & Compliance", modules: legal },
        { title: "Documents", modules: documents },
        { title: "Finance", modules: finance },
        { title: "Operations", modules: operations },
        { title: "Account", modules: account },
      ];
    case "LegalHead":
      return [
        { title: "Legal & Compliance", modules: legal },
        { title: "Documents", modules: documents },
        { title: "Finance", modules: [finance[1], finance[2]] }, // ZUS + Invoices only
        { title: "Operations", modules: [operations[0], operations[2]] }, // Onboarding + Contracts
        { title: "Account", modules: account },
      ];
    case "TechOps":
      return [
        { title: "Documents", modules: [documents[0]] },
        { title: "Finance", modules: [finance[1]] }, // ZUS only
        { title: "Operations", modules: [operations[0]] }, // Onboarding
        { title: "Account", modules: account },
      ];
    case "Coordinator":
      return [
        { title: "Legal & Compliance", modules: legal },
        { title: "Documents", modules: documents }, // All 3: Documents, AI Upload, Doc Queue
        { title: "Finance", modules: [finance[1], finance[2]] }, // ZUS Calculator + ZUS Filings
        { title: "Operations", modules: [operations[0]] }, // Onboarding
        { title: "Account", modules: account },
      ];
    case "Professional":
      return [
        { title: "Permits & Legal", modules: [
          { id: "immigration", label: "Permits",     sublabel: "Work · TRC · Visa",  icon: Stamp,      iconColor: "#6366F1", iconBg: "bg-indigo-500/15" },
        ]},
        { title: "Work", modules: [
          { id: "onboarding", label: "Onboarding",   sublabel: "Checklist · Setup",  icon: ClipboardCheck, iconColor: "#8B5CF6", iconBg: "bg-violet-500/15" },
          { id: "advances",   label: "Advances",     sublabel: "Salary · Request",   icon: DollarSign,  iconColor: "#10B981", iconBg: "bg-emerald-500/15" },
          { id: "leave",      label: "Leave",         sublabel: "Days · Requests",    icon: Clock,       iconColor: "#F59E0B", iconBg: "bg-amber-500/15" },
        ]},
        { title: "Account", modules: account },
      ];
  }
}

// All overflow tab IDs for highlighting the More button
function getAllOverflowIds(role: Role): string[] {
  return getModuleGroups(role).flatMap(g => g.modules.map(m => m.id));
}

// ═══ STYLING ═══════════════════════════════════════════════════════════════

const ACTIVE_COLORS: Record<Role, { text: string; bg: string; glow: string }> = {
  Executive:    { text: "text-indigo-400",  bg: "bg-indigo-500/15",  glow: "" },
  LegalHead:    { text: "text-violet-400",  bg: "bg-violet-500/15",  glow: "" },
  TechOps:      { text: "text-blue-400",    bg: "bg-blue-500/15",    glow: "" },
  Coordinator:  { text: "text-emerald-400", bg: "bg-emerald-500/15", glow: "" },
  Professional: { text: "text-amber-400",   bg: "bg-amber-500/15",   glow: "" },
};

const BADGE_BG: Record<Role, string> = {
  Executive:    "bg-indigo-600",
  LegalHead:    "bg-violet-600",
  TechOps:      "bg-blue-600",
  Coordinator:  "bg-emerald-600",
  Professional: "bg-amber-600",
};

// ═══ COMPONENT ═════════════════════════════════════════════════════════════

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { role } = useAuth();
  const { workers } = useWorkers();
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  if (!role) return null;

  const primary = getPrimaryTabs(role);
  const groups = getModuleGroups(role);
  const overflowIds = getAllOverflowIds(role);
  const activeStyle = ACTIVE_COLORS[role];
  const isOverflowActive = overflowIds.includes(activeTab);

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
      {/* ── More sheet — card grid overlay ──────────────────────────── */}
      {moreOpen && (
        <>
          <div className="absolute inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute bottom-[56px] left-0 right-0 z-[61] bg-[#0c0c0e] border-t border-white/10 rounded-t-2xl max-h-[70vh] overflow-y-auto"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Handle bar */}
            <div className="sticky top-0 bg-[#0c0c0e] pt-3 pb-1 z-10">
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto" />
            </div>

            <div className="px-4 pb-4">
              {groups.map((group) => (
                <div key={group.title} className="mb-4">
                  {/* Group title */}
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 px-1">
                    {group.title}
                  </p>
                  {/* Card grid — 2 columns */}
                  <div className="grid grid-cols-2 gap-2">
                    {group.modules.map((mod) => {
                      const Icon = mod.icon;
                      const isActive = activeTab === mod.id;
                      return (
                        <button
                          key={mod.id}
                          onClick={() => { onTabChange(mod.id); setMoreOpen(false); }}
                          className={cn(
                            "flex flex-col items-start p-3.5 rounded-xl border transition-all duration-150 active:scale-[0.97]",
                            isActive
                              ? cn("border-white/20", activeStyle.bg)
                              : "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]"
                          )}
                        >
                          <div className={cn("w-9 h-9 rounded-[10px] flex items-center justify-center mb-2.5", mod.iconBg)}>
                            <Icon className="w-[18px] h-[18px]" style={{ color: mod.iconColor }} strokeWidth={2} />
                          </div>
                          <p className={cn("text-[13px] font-bold leading-tight", isActive ? "text-white" : "text-white/80")}>
                            {mod.label}
                          </p>
                          <p className="text-[10px] text-white/30 mt-0.5 leading-tight">{mod.sublabel}</p>
                          {isActive && (
                            <div className={cn("w-1.5 h-1.5 rounded-full mt-2", BADGE_BG[role])} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Bottom nav bar ─────────────────────────────────────────── */}
      <div className="shrink-0 premium-nav relative z-50">
        <div className="flex items-center justify-around h-[56px] px-2">
          {primary.map(tab => renderTab(tab, activeTab === tab.id))}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={cn(
              "relative flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 active:scale-90",
              isOverflowActive || moreOpen ? activeStyle.text : "text-white/30 hover:text-white/50"
            )}
          >
            {(isOverflowActive || moreOpen) && (
              <motion.div
                layoutId="navPillMore"
                className={cn("absolute inset-x-2 top-[8px] bottom-[8px] rounded-2xl", activeStyle.bg, activeStyle.glow)}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <div className="relative z-10 flex flex-col items-center gap-0.5">
              {moreOpen
                ? <X className="w-[22px] h-[22px] stroke-[2.5px]" />
                : <MoreHorizontal className={cn("w-[22px] h-[22px] transition-all duration-200", moreOpen || isOverflowActive ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
              }
              <span className={cn("text-[9px] tracking-wider transition-all duration-200 leading-tight text-center uppercase", moreOpen || isOverflowActive ? "font-black" : "font-semibold")}>
                {moreOpen ? "Close" : "More"}
              </span>
            </div>
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </>
  );
}
