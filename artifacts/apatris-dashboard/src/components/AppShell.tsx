import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import {
  Users, Calculator, AlertTriangle, History, Settings, LogOut,
  FileSignature, FileCheck, MapPin, BarChart3, Sparkles,
  Shield, Search, CalendarDays, Clock, Award, TrendingUp,
  Globe, Building2, UserPlus, Briefcase, Receipt, FileText, Stamp,
  LayoutGrid, ChevronDown, X, ClipboardCheck, SmilePlus,
} from "lucide-react";

// ── Grouped Navigation ──────────────────────────────────────────────────────

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  id: string;
  label: string;
  color: string;
  hoverBg: string;
  activeBg: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "workforce",
    label: "Workforce",
    color: "text-blue-400",
    hoverBg: "hover:bg-blue-500/10",
    activeBg: "bg-blue-500/15 text-blue-400",
    items: [
      { path: "/",                  label: "Workers",       icon: Users },
      { path: "/hours",             label: "Hours",         icon: Clock },
      { path: "/availability",      label: "Availability",  icon: CalendarDays },
      { path: "/shift-schedule",    label: "Shifts",        icon: Clock },
      { path: "/skills-matrix",     label: "Skills Matrix", icon: Award },
      { path: "/gps-tracking",      label: "GPS Tracking",  icon: MapPin },
      { path: "/voice",             label: "Voice Check-in", icon: Users },
      { path: "/onboarding",        label: "Onboarding",    icon: ClipboardCheck },
      { path: "/bench",             label: "Bench",         icon: Users },
      { path: "/self-service",      label: "Self-Service",  icon: Users },
      { path: "/identity",          label: "Identity",      icon: Users },
      { path: "/housing",           label: "Housing",       icon: Users },
      { path: "/worker-timeline",   label: "Timeline",      icon: Clock },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    color: "text-amber-400",
    hoverBg: "hover:bg-amber-500/10",
    activeBg: "bg-amber-500/15 text-amber-400",
    items: [
      { path: "/pip-readiness",       label: "PIP Readiness",      icon: Shield },
      { path: "/compliance-alerts",  label: "Alerts",             icon: AlertTriangle },
      { path: "/immigration",        label: "Permits",            icon: Stamp },
      { path: "/immigration-search", label: "Immigration Search", icon: Search },
      { path: "/trc-service",        label: "TRC Service",        icon: FileCheck },
      { path: "/authority-packs",   label: "Authority Packs",    icon: Shield },
      { path: "/legal-queue",       label: "Legal Queue",        icon: Shield },
      { path: "/rejection-intelligence", label: "Rejections", icon: AlertTriangle },
      { path: "/legal-alerts",  label: "Legal Alerts", icon: AlertTriangle },
      { path: "/pip-inspection-report", label: "PIP Report", icon: Shield },
      { path: "/linked-cases",  label: "Linked Cases", icon: Shield },
      { path: "/legal-documents", label: "Legal Docs", icon: Shield },
      { path: "/risk-overview", label: "Risk Overview", icon: AlertTriangle },
      { path: "/posted-workers",     label: "Posted Workers",     icon: Globe },
      { path: "/country-compliance", label: "Country Rules",      icon: Globe },
      { path: "/fines",             label: "Fines Prevention",   icon: Shield },
      { path: "/legal",             label: "Legal Monitor",      icon: Shield },
      { path: "/safety",            label: "Site Safety",        icon: Shield },
      { path: "/country-payroll",   label: "Country Payroll",    icon: Globe },
      { path: "/insurance",         label: "Insurance",          icon: Shield },
      { path: "/legal-kb",          label: "Legal KB",           icon: Shield },
      { path: "/posted-notifications", label: "Posted Workers",   icon: Globe },
      { path: "/esspass",              label: "ESSPASS",          icon: Shield },
      { path: "/gdpr",              label: "GDPR",               icon: Shield },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    color: "text-emerald-400",
    hoverBg: "hover:bg-emerald-500/10",
    activeBg: "bg-emerald-500/15 text-emerald-400",
    items: [
      { path: "/payroll",           label: "Payroll",          icon: Calculator },
      { path: "/calculator",        label: "ZUS Calculator",   icon: Calculator },
      { path: "/salary-benchmark",  label: "Salary Benchmark", icon: TrendingUp },
      { path: "/pay-transparency",  label: "Pay Reports",      icon: BarChart3 },
      { path: "/invoices",          label: "Invoices",         icon: Receipt },
      { path: "/zus",               label: "ZUS/DRA Filings",  icon: Calculator },
      { path: "/advances",          label: "Advances",         icon: Calculator },
      { path: "/revenue",           label: "Revenue",          icon: TrendingUp },
      { path: "/margins",           label: "Margins",          icon: BarChart3 },
      { path: "/wellness",          label: "Wellness",         icon: Calculator },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    color: "text-violet-400",
    hoverBg: "hover:bg-violet-500/10",
    activeBg: "bg-violet-500/15 text-violet-400",
    items: [
      { path: "/contracts",      label: "Contracts",     icon: FileSignature },
      { path: "/doc-workflow",   label: "Doc Workflow",  icon: FileCheck },
      { path: "/contract-gen",          label: "AI Contracts",  icon: FileSignature },
      { path: "/certified-signatures", label: "Certified Sigs", icon: FileSignature },
    ],
  },
  {
    id: "business",
    label: "Business",
    color: "text-cyan-400",
    hoverBg: "hover:bg-cyan-500/10",
    activeBg: "bg-cyan-500/15 text-cyan-400",
    items: [
      { path: "/crm",            label: "CRM",           icon: Briefcase },
      { path: "/matching",       label: "Worker Match",  icon: Users },
      { path: "/roi",            label: "ROI Dashboard", icon: Briefcase },
      { path: "/guarantees",     label: "Guarantees",    icon: Briefcase },
      { path: "/frameworks",     label: "Frameworks",    icon: Briefcase },
      { path: "/deploy",         label: "15-Min Deploy", icon: Briefcase },
      { path: "/clients",       label: "Clients",       icon: Building2 },
      { path: "/job-board",     label: "Job Board",     icon: Briefcase },
      { path: "/applications",  label: "Applications",  icon: UserPlus },
      { path: "/screening",     label: "Screening",     icon: Users },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    color: "text-rose-400",
    hoverBg: "hover:bg-rose-500/10",
    activeBg: "bg-rose-500/15 text-rose-400",
    items: [
      { path: "/analytics",    label: "Analytics",     icon: BarChart3 },
      { path: "/ai-copilot",   label: "AI Copilot",    icon: Sparkles },
      { path: "/regulatory",   label: "Regulatory",    icon: Shield },
      { path: "/ai-audit",     label: "AI Audit",      icon: Shield },
      { path: "/mood",         label: "Mood Tracker",  icon: SmilePlus },
      { path: "/trust",        label: "Trust Scores",  icon: Award },
      { path: "/churn",        label: "Churn Predict", icon: Users },
      { path: "/competitors",  label: "Competitors",   icon: Award },
      { path: "/fraud",        label: "Fraud Detect",  icon: Shield },
      { path: "/skills-gap",   label: "Skills Gap",    icon: Award },
      { path: "/careers",      label: "Career Paths",  icon: Award },
      { path: "/geo",          label: "Geo Intel",     icon: Globe },
      { path: "/signals",      label: "Signals",       icon: Award },
      { path: "/intelligence-feed", label: "Intel Feed", icon: Award },
    ],
  },
  {
    id: "system",
    label: "System",
    color: "text-slate-400",
    hoverBg: "hover:bg-slate-500/10",
    activeBg: "bg-slate-500/15 text-slate-300",
    items: [
      { path: "/history",         label: "History",    icon: History },
      { path: "/system-logs",     label: "Logs",       icon: FileText },
      { path: "/google",           label: "Google",     icon: Settings },
      { path: "/translate",        label: "Translate",  icon: Globe },
      { path: "/messages",         label: "Messages",   icon: Users },
      { path: "/whitelabel",       label: "White-Label", icon: Settings },
      { path: "/saas-billing",    label: "Billing",     icon: Settings },
      { path: "/developer",       label: "Developer",   icon: Settings },
      { path: "/admin-settings",  label: "Settings",   icon: Settings },
    ],
  },
];

// Quick-access tabs shown directly in the top bar
const QUICK_TABS: NavItem[] = [
  { path: "/",                  label: "Workers",    icon: Users },
  { path: "/payroll",           label: "Payroll",    icon: Calculator },
  { path: "/compliance-alerts", label: "Alerts",     icon: AlertTriangle },
  { path: "/contracts",         label: "Contracts",  icon: FileSignature },
  { path: "/analytics",         label: "Analytics",  icon: BarChart3 },
  { path: "/immigration",       label: "Permits",    icon: Stamp },
];

// Flat list for mobile bottom bar (top 7 most used)
const MOBILE_TABS: NavItem[] = [
  { path: "/",                  label: "Workers",   icon: Users },
  { path: "/payroll",           label: "Payroll",   icon: Calculator },
  { path: "/compliance-alerts", label: "Alerts",    icon: AlertTriangle },
  { path: "/immigration",       label: "Permits",   icon: Stamp },
  { path: "/contracts",         label: "Contracts", icon: FileSignature },
  { path: "/analytics",         label: "Analytics", icon: BarChart3 },
];

function findActiveGroup(location: string): NavGroup | undefined {
  return NAV_GROUPS.find(g =>
    g.items.some(item =>
      item.path === "/" ? location === "/" : location.startsWith(item.path)
    )
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const menuSearchRef = useRef<HTMLInputElement>(null);

  const isPublicRoute =
    location === "/login" ||
    location.startsWith("/apply") ||
    location.startsWith("/worker-upload") ||
    location === "/pricing";

  const showShell = isAuthenticated && !isPublicRoute;

  useEffect(() => {
    if (showShell) {
      document.body.classList.add("has-app-shell");
    } else {
      document.body.classList.remove("has-app-shell");
    }
    return () => document.body.classList.remove("has-app-shell");
  }, [showShell]);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Close menu on ESC, clear search when closed, focus search when opened
  useEffect(() => {
    if (!menuOpen) { setMenuSearch(""); return; }
    setTimeout(() => menuSearchRef.current?.focus(), 50);
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [menuOpen]);

  if (!showShell) return <>{children}</>;

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  const activeGroup = findActiveGroup(location);

  const navigate = (path: string) => {
    setLocation(path);
    setMenuOpen(false);
  };

  return (
    <div className="app-shell-root">
      {/* ─── Top Navigation Bar ───────────────────────────────────────── */}
      <header className="app-top-bar">
        {/* Brand */}
        <div className="app-top-brand cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate("/")}>
          <div
            className="w-8 h-8 rounded-full bg-white flex-shrink-0 flex items-center justify-center"
            style={{ boxShadow: "0 0 0 2px rgba(196,30,24,0.35), 0 0 10px rgba(196,30,24,0.2)" }}
          >
            <svg width="22" height="22" viewBox="0 0 38 38" fill="none">
              <path d="M19 2 L33 8.5 L33 21 Q33 30 19 36 Q5 30 5 21 L5 8.5 Z"
                fill="#fef2f2" stroke="#C41E18" strokeWidth="1.5" strokeLinejoin="round" />
              <text x="19" y="28" textAnchor="middle" fontSize="19" fontWeight="900"
                fontFamily="Arial Black, Arial, sans-serif" fill="#C41E18" letterSpacing="-0.5">A</text>
            </svg>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold tracking-widest uppercase text-white leading-none">APATRIS</p>
            <p className="text-[9px] text-slate-400 font-mono tracking-widest uppercase leading-none mt-0.5">Outsourcing &amp; Certified Welders</p>
          </div>
        </div>

        {/* Quick-access tabs */}
        <nav className="app-top-nav">
          {QUICK_TABS.map(({ path, label, icon: Icon }) => {
            const active = isActive(path);
            return (
              <button key={path} onClick={() => navigate(path)}
                className={`app-top-nav-item ${active ? "app-top-nav-item--active" : ""}`}>
                <Icon className="w-3 h-3" />
                <span>{label}</span>
              </button>
            );
          })}

          {/* All Modules dropdown trigger */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className={`app-top-nav-item ${menuOpen ? "app-top-nav-item--active" : ""}`}
            >
              <LayoutGrid className="w-3 h-3" />
              <span>All</span>
              <ChevronDown className={`w-2.5 h-2.5 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {/* ─── Mega Menu ───────────────────────────────────────────── */}
            {menuOpen && (
              <div className="app-mega-menu">
                {/* Search + Close */}
                <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-slate-700/50">
                  <div className="flex-1 relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    <input
                      ref={menuSearchRef}
                      type="text"
                      value={menuSearch}
                      onChange={e => setMenuSearch(e.target.value)}
                      placeholder="Search modules…"
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-slate-500"
                    />
                  </div>
                  <button onClick={() => setMenuOpen(false)} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="app-mega-menu-grid">
                  {NAV_GROUPS.map(group => {
                    const q = menuSearch.toLowerCase();
                    const filtered = q ? group.items.filter(i => i.label.toLowerCase().includes(q) || group.label.toLowerCase().includes(q)) : group.items;
                    if (q && filtered.length === 0) return null;
                    return (
                      <div key={group.id} className="app-mega-menu-group">
                        <p className={`text-[10px] font-black uppercase tracking-[0.15em] mb-2 ${group.color}`}>
                          {group.label}
                        </p>
                        <div className="space-y-0.5">
                          {filtered.map(item => {
                            const active = isActive(item.path);
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all ${
                                  active
                                    ? `${group.activeBg} font-bold`
                                    : `text-slate-400 ${group.hoverBg} hover:text-white`
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate">{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Right: current section badge + user chip */}
        <div className="app-top-right">
          {/* Active section indicator */}
          {activeGroup && !QUICK_TABS.some(t => isActive(t.path)) && (
            <span className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono border border-white/10 ${activeGroup.color} bg-white/[0.03]`}>
              {activeGroup.label}
            </span>
          )}

          <div className="flex items-center gap-2 pl-2 border-l border-slate-700/60">
            <div className="w-7 h-7 rounded-full bg-red-900/50 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-bold text-red-400 font-mono">
                {user?.name?.charAt(0)?.toUpperCase() ?? "A"}
              </span>
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-bold text-white leading-none">{user?.name}</p>
              <p className="text-[10px] text-red-400 font-mono leading-none mt-0.5">{user?.role}</p>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 flex-shrink-0"
              title="Wyloguj / Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Page content ─────────────────────────────────────────────── */}
      <div className="app-content-wrapper">
        {children}
      </div>

      {/* ─── Mobile Bottom Bar ──────────────────────────────────────── */}
      <nav className="app-bottom-bar">
        {MOBILE_TABS.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => setLocation(path)}
              className="flex flex-col items-center justify-center gap-0.5 min-w-[60px] px-1 h-full transition-colors flex-shrink-0"
            >
              <div className={`p-1.5 rounded-xl transition-all ${active ? "bg-red-900/40" : ""}`}>
                <Icon className={`w-5 h-5 ${active ? "text-[#C41E18]" : "text-slate-500"}`} />
              </div>
              <span className={`text-[9px] font-mono font-bold uppercase tracking-wide leading-none whitespace-nowrap ${
                active ? "text-[#C41E18]" : "text-slate-600"
              }`}>
                {label}
              </span>
            </button>
          );
        })}
        {/* All modules button on mobile */}
        <button
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[60px] px-1 h-full transition-colors flex-shrink-0"
        >
          <div className={`p-1.5 rounded-xl ${menuOpen ? "bg-red-900/40" : ""}`}>
            <LayoutGrid className={`w-5 h-5 ${menuOpen ? "text-[#C41E18]" : "text-slate-500"}`} />
          </div>
          <span className={`text-[9px] font-mono font-bold uppercase tracking-wide leading-none ${
            menuOpen ? "text-[#C41E18]" : "text-slate-600"
          }`}>More</span>
        </button>
      </nav>

      {/* ─── Mobile mega menu overlay ──────────────────────────────── */}
      {menuOpen && (
        <div className="app-mega-menu-mobile-overlay md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="app-mega-menu-mobile" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-700/50">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">All Modules</p>
              <button onClick={() => setMenuOpen(false)} className="p-1.5 rounded-lg bg-white/5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-5 overflow-y-auto max-h-[70vh]">
              {NAV_GROUPS.map(group => (
                <div key={group.id}>
                  <p className={`text-[10px] font-black uppercase tracking-[0.15em] mb-2 ${group.color}`}>{group.label}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {group.items.map(item => {
                      const active = isActive(item.path);
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.path}
                          onClick={() => navigate(item.path)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs transition-all ${
                            active ? `${group.activeBg} font-bold` : `text-slate-400 active:bg-white/5`
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
