import React from "react";

// ─── Shimmer animation shell ──────────────────────────────────────────────────
function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded bg-slate-800 ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

// ─── Stat card skeleton (matches StatCard dimensions) ────────────────────────
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-5 flex items-start justify-between gap-4">
      <div className="flex-1 space-y-2">
        <Shimmer className="h-3 w-28" />
        <Shimmer className="h-9 w-16 mt-1" />
        <Shimmer className="h-2.5 w-36" />
      </div>
      <Shimmer className="h-11 w-11 rounded-xl flex-shrink-0" />
    </div>
  );
}

// ─── Worker table row skeleton ────────────────────────────────────────────────
export function WorkerRowSkeleton({ cols = 7 }: { cols?: number }) {
  const widths = ["w-8", "w-32", "w-24", "w-20", "w-20", "w-20", "w-16"];
  return (
    <tr className="border-b border-slate-700/40">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Shimmer className={`h-4 ${widths[i] ?? "w-20"}`} />
        </td>
      ))}
    </tr>
  );
}

// ─── Payroll table row skeleton ───────────────────────────────────────────────
export function PayrollRowSkeleton({ cols = 6 }: { cols?: number }) {
  const widths = ["w-32", "w-24", "w-20", "w-20", "w-20", "w-20"];
  return (
    <tr className="border-b border-slate-700/40">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Shimmer className={`h-4 ${widths[i] ?? "w-20"}`} />
        </td>
      ))}
    </tr>
  );
}

// ─── Site card skeleton ───────────────────────────────────────────────────────
export function SiteCardSkeleton() {
  return (
    <div className="p-3 rounded-xl border border-slate-700/40 bg-slate-800/30 space-y-2">
      <Shimmer className="h-2.5 w-20" />
      <Shimmer className="h-7 w-14" />
      <Shimmer className="h-2 w-28" />
    </div>
  );
}

// ─── Full-page branded loading screen ────────────────────────────────────────
export function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full gap-4 text-center">
      <div className="relative">
        <div
          className="w-14 h-14 rounded-full bg-white flex items-center justify-center"
          style={{ boxShadow: "0 0 0 2px rgba(196,30,24,0.35), 0 0 20px rgba(196,30,24,0.2)" }}
        >
          <svg width="32" height="32" viewBox="0 0 38 38" fill="none">
            <path d="M19 2 L33 8.5 L33 21 Q33 30 19 36 Q5 30 5 21 L5 8.5 Z"
              fill="#fef2f2" stroke="#C41E18" strokeWidth="1.5" strokeLinejoin="round" />
            <text x="19" y="28" textAnchor="middle" fontSize="19" fontWeight="900"
              fontFamily="Arial Black, Arial, sans-serif" fill="#C41E18" letterSpacing="-0.5">A</text>
          </svg>
        </div>
        <div className="absolute -inset-1 rounded-full border-2 border-red-500/30 animate-ping" />
      </div>
      <p className="text-xs font-mono font-bold tracking-[0.2em] uppercase text-slate-500">
        Loading session…
      </p>
    </div>
  );
}
