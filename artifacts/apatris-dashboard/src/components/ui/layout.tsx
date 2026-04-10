/**
 * Shared layout primitives for visual consistency.
 *
 * Usage:
 *   import { PageShell, PageHeader, Section, Card, TabBar, btnPrimary, btnSecondary } from "@/components/ui/layout";
 *
 * These are NOT full replacements for existing pages — they are opt-in constants
 * and small components that standardize padding, spacing, typography, and card styles.
 */
import React from "react";

// ═══ CSS CLASS CONSTANTS ════════════════════════════════════════════════════

/** Outer page wrapper — dark bg, scroll, consistent padding */
export const pageShellCls = "min-h-screen bg-slate-950 text-slate-200 overflow-y-auto pb-20";

/** Page content area — centered, max-width, horizontal padding */
export const pageContentCls = "max-w-6xl mx-auto px-6 py-6";

/** Narrow content area — for focused workspaces (calculator, search) */
export const pageContentNarrowCls = "max-w-2xl mx-auto px-4 py-8";

/** Section spacing between blocks */
export const sectionGap = "space-y-6";

// ── Cards ───────────────────────────────────────────────────────────────────

/** Standard card */
export const cardCls = "rounded-xl border border-slate-700 bg-slate-800/50 p-4";

/** Card with emphasis border */
export const cardAccentCls = (color: string) =>
  `rounded-xl border bg-slate-800/50 p-4 border-${color}-500/30`;

/** Compact card (less padding, for dense lists) */
export const cardCompactCls = "rounded-lg border border-slate-700 bg-slate-800/50 p-3";

// ── Typography ──────────────────────────────────────────────────────────────

/** Page title — h1 */
export const pageTitleCls = "text-xl font-bold text-white tracking-tight";

/** Page subtitle */
export const pageSubtitleCls = "text-xs text-slate-500 font-mono uppercase tracking-widest mt-1";

/** Section title — h2/h3 */
export const sectionTitleCls = "text-sm font-bold text-white";

/** Card heading — inside a card */
export const cardTitleCls = "text-xs font-bold uppercase tracking-widest text-gray-400";

/** Body text */
export const bodyCls = "text-sm text-slate-300";

/** Label for form fields */
export const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5";

/** Monospace value */
export const monoCls = "text-sm font-mono text-slate-300";

// ── Form Inputs ─────────────────────────────────────────────────────────────

export const inputCls = "w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/60 placeholder:text-gray-600";

export const selectCls = inputCls;

export const textareaCls = inputCls;

// ── Buttons ─────────────────────────────────────────────────────────────────

/** Primary action button */
export const btnPrimary = "py-2.5 px-4 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50";

/** Secondary action button */
export const btnSecondary = "py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50";

/** Ghost/subtle button */
export const btnGhost = "py-2 px-3 bg-transparent hover:bg-white/5 text-gray-400 hover:text-white border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5";

/** Small inline action button */
export const btnSmall = "px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5";

// ── Tab Bar ─────────────────────────────────────────────────────────────────

/** Tab bar container */
export const tabBarCls = "flex gap-0.5 p-1 bg-slate-800/60 rounded-xl border border-slate-700";

/** Active tab */
export const tabActiveCls = "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-slate-700 text-white shadow transition-all";

/** Inactive tab */
export const tabInactiveCls = "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-all";

// ── Status Badges ───────────────────────────────────────────────────────────

export const badgeCls = (color: "green" | "yellow" | "red" | "blue" | "slate") => {
  const map = {
    green: "bg-green-500/20 text-green-400 border-green-500/30",
    yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    red: "bg-red-500/20 text-red-400 border-red-500/30",
    blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    slate: "bg-slate-600/30 text-slate-400 border-slate-500/30",
  };
  return `px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${map[color]}`;
};

// ── Table ───────────────────────────────────────────────────────────────────

export const tableWrapCls = "rounded-xl border border-slate-700 overflow-x-auto";
export const tableCls = "w-full text-xs";
export const theadCls = "bg-slate-800 border-b border-slate-700";
export const thCls = "px-3 py-2.5 text-left font-bold text-gray-400 uppercase tracking-wider text-[10px]";
export const thRightCls = "px-3 py-2.5 text-right font-bold text-gray-400 uppercase tracking-wider text-[10px]";
export const tbodyCls = "divide-y divide-slate-700/50";
export const trCls = "hover:bg-slate-700/20 transition-colors";
export const tdCls = "px-3 py-2.5 text-slate-300";
export const tdRightCls = "px-3 py-2.5 text-right text-slate-300 font-mono";

// ═══ COMPONENTS ═════════════════════════════════════════════════════════════

/** Standard page shell — wraps entire page */
export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`${pageShellCls} ${className ?? ""}`}>{children}</div>;
}

/** Page header — icon + title + subtitle + optional right actions */
export function PageHeader({ icon: Icon, title, subtitle, children }: {
  icon?: React.ElementType;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center">
              <Icon className="w-5 h-5 text-slate-300" />
            </div>
          )}
          <div>
            <h1 className={pageTitleCls}>{title}</h1>
            {subtitle && <p className={pageSubtitleCls}>{subtitle}</p>}
          </div>
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}

/** Section with optional title */
export function Section({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      {title && <h2 className={`${sectionTitleCls} mb-3`}>{title}</h2>}
      {children}
    </div>
  );
}

/** Standard card component */
export function Card({ children, className, accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  const base = accent ? `rounded-xl border bg-slate-800/50 p-4 border-${accent}-500/30` : cardCls;
  return <div className={`${base} ${className ?? ""}`}>{children}</div>;
}

/** Tab bar component */
export function TabBar<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string; icon?: React.ElementType }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className={tabBarCls}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={active === t.id ? tabActiveCls : tabInactiveCls}
        >
          {t.icon && <t.icon className="w-3.5 h-3.5" />}
          {t.label}
        </button>
      ))}
    </div>
  );
}
