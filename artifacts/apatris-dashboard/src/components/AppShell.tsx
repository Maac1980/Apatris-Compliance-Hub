import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Users, Calculator, AlertTriangle, History, Settings, LogOut,
} from "lucide-react";

const SIDEBAR_NAV = [
  {
    path: "/", label: "Workers", icon: Users,
    color: "text-red-400", activeBg: "bg-red-900/30", activeBorder: "border-red-500/40",
  },
  {
    path: "/payroll", label: "Payroll Ledger", icon: Calculator,
    color: "text-green-400", activeBg: "bg-green-900/30", activeBorder: "border-green-500/40",
  },
  {
    path: "/compliance-alerts", label: "Compliance Alerts", icon: AlertTriangle,
    color: "text-orange-400", activeBg: "bg-orange-900/30", activeBorder: "border-orange-500/40",
  },
  {
    path: "/history", label: "History & Analytics", icon: History,
    color: "text-purple-400", activeBg: "bg-purple-900/30", activeBorder: "border-purple-500/40",
  },
];

const ADMIN_NAV = [
  {
    path: "/admin-settings", label: "Admin Settings", icon: Settings,
    color: "text-slate-300", activeBg: "bg-slate-700/50", activeBorder: "border-slate-500/40",
  },
];

const BOTTOM_NAV = [
  { path: "/",                   label: "Workers", icon: Users },
  { path: "/payroll",            label: "Ledger",  icon: Calculator },
  { path: "/compliance-alerts",  label: "Alerts",  icon: AlertTriangle },
  { path: "/history",            label: "History", icon: History },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  const isPublicRoute =
    location === "/login" ||
    location.startsWith("/apply") ||
    location.startsWith("/worker-upload");

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
    <>
      {/* ─── Desktop Sidebar ──────────────────────────────────────────── */}
      <aside className="app-sidebar">
        {/* Brand */}
        <div className="px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full bg-white flex-shrink-0 flex items-center justify-center"
              style={{ boxShadow: "0 0 0 2px rgba(196,30,24,0.35), 0 0 12px rgba(196,30,24,0.2)" }}
            >
              <svg width="28" height="28" viewBox="0 0 38 38" fill="none">
                <path d="M19 2 L33 8.5 L33 21 Q33 30 19 36 Q5 30 5 21 L5 8.5 Z"
                  fill="#fef2f2" stroke="#C41E18" strokeWidth="1.5" strokeLinejoin="round" />
                <text x="19" y="28" textAnchor="middle" fontSize="19" fontWeight="900"
                  fontFamily="Arial Black, Arial, sans-serif" fill="#C41E18" letterSpacing="-0.5">A</text>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold tracking-widest uppercase text-white leading-none">APATRIS</p>
              <p className="text-[9px] text-red-500 font-mono tracking-widest uppercase mt-0.5">Compliance Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 px-3 mb-3">Navigation</p>
          {SIDEBAR_NAV.map(({ path, label, icon: Icon, color, activeBg, activeBorder }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={() => setLocation(path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-mono font-medium transition-all border ${
                  active
                    ? `${activeBg} ${activeBorder} ${color}`
                    : "border-transparent text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0`} />
                <span className="truncate">{label}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 opacity-70" />}
              </button>
            );
          })}

          {isAdmin && (
            <>
              <div className="my-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 px-3 mb-3">Admin</p>
              {ADMIN_NAV.map(({ path, label, icon: Icon, color, activeBg, activeBorder }) => {
                const active = isActive(path);
                return (
                  <button
                    key={path}
                    onClick={() => setLocation(path)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-mono font-medium transition-all border ${
                      active
                        ? `${activeBg} ${activeBorder} ${color}`
                        : "border-transparent text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{label}</span>
                    {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 opacity-70" />}
                  </button>
                );
              })}
            </>
          )}
        </nav>

        {/* User + Logout */}
        <div className="px-3 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="w-8 h-8 rounded-full bg-red-900/50 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-red-400 font-mono">
                {user?.name?.charAt(0)?.toUpperCase() ?? "A"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate leading-tight">{user?.name}</p>
              <p className="text-[10px] text-red-400 font-mono leading-tight">{user?.role}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/10 flex-shrink-0"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Page content ─────────────────────────────────────────────── */}
      {children}

      {/* ─── Mobile Bottom Bar ────────────────────────────────────────── */}
      <nav className="app-bottom-bar">
        {BOTTOM_NAV.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => setLocation(path)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${active ? "bg-red-900/40" : ""}`}>
                <Icon className={`w-5 h-5 ${active ? "text-[#C41E18]" : "text-slate-500"}`} />
              </div>
              <span className={`text-[10px] font-mono font-bold uppercase tracking-wide leading-none ${
                active ? "text-[#C41E18]" : "text-slate-600"
              }`}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
