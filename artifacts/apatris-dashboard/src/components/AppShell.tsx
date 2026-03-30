import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import {
  Users, Calculator, AlertTriangle, History, Settings, LogOut,
  FileSignature, FileCheck, MapPin, BarChart3, Sparkles,
  Shield, Search, CalendarDays, Clock, Award, TrendingUp,
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/",                   labelKey: "nav.workers",    icon: Users },
  { path: "/payroll",            labelKey: "nav.payroll",    icon: Calculator },
  { path: "/compliance-alerts",  labelKey: "nav.alerts",     icon: AlertTriangle },
  { path: "/contracts",          labelKey: "nav.contracts",  icon: FileSignature },
  { path: "/doc-workflow",       labelKey: "nav.documents",  icon: FileCheck },
  { path: "/gps-tracking",      labelKey: "nav.gps",        icon: MapPin },
  { path: "/analytics",         labelKey: "nav.analytics",  icon: BarChart3 },
  { path: "/ai-copilot",        labelKey: "nav.ai",         icon: Sparkles },
  { path: "/regulatory",        labelKey: "nav.regulatory", icon: Shield },
  { path: "/immigration-search",labelKey: "nav.immigration",icon: Search },
  { path: "/trc-service",       labelKey: "nav.trc",        icon: FileCheck },
  { path: "/availability",      labelKey: "nav.availability",icon: CalendarDays },
  { path: "/shift-schedule",    labelKey: "nav.shifts",     icon: Clock },
  { path: "/skills-matrix",     labelKey: "nav.skills",     icon: Award },
  { path: "/salary-benchmark",  labelKey: "nav.benchmark",  icon: TrendingUp },
  { path: "/ai-audit",          labelKey: "nav.aiAudit",    icon: Shield },
  { path: "/history",            labelKey: "nav.history",    icon: History },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();

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

  if (!showShell) return <>{children}</>;

  const isAdmin = user?.role === "Admin";

  const isActive = (path: string) =>
    path === "/" ? location === "/" : location.startsWith(path);

  return (
    <div className="app-shell-root">
      {/* ─── Top Navigation Bar ───────────────────────────────────────── */}
      <header className="app-top-bar">
        {/* Brand — click to go home */}
        <div className="app-top-brand cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setLocation("/")}>
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

        {/* Desktop inline nav tabs */}
        <nav className="app-top-nav">
          {NAV_ITEMS.map(({ path, labelKey, icon: Icon }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={() => setLocation(path)}
                className={`app-top-nav-item ${active ? "app-top-nav-item--active" : ""}`}
                style={{ color: active ? "#C41E18" : "#64748b", borderBottomColor: active ? "#C41E18" : "transparent" }}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden lg:inline">{t(labelKey)}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: admin settings + user chip */}
        <div className="app-top-right">
          {isAdmin && (
            <button
              onClick={() => setLocation("/admin-settings")}
              title="Ustawienia"
              className={`p-1.5 rounded-lg transition-colors ${
                isActive("/admin-settings")
                  ? "text-white bg-slate-700"
                  : "text-slate-500 hover:text-white hover:bg-white/10"
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
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
              className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/10 flex-shrink-0"
              title="Wyloguj"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ─── Page content ─────────────────────────────────────────────── */}
      <div className="app-content-wrapper">
        {children}
      </div>

      {/* ─── Mobile Bottom Bar (scrollable for many tabs) ──────────────── */}
      <nav className="app-bottom-bar">
        {NAV_ITEMS.map(({ path, labelKey, icon: Icon }) => {
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
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
