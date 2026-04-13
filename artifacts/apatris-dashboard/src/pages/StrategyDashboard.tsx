/**
 * Strategy Dashboard — internal page for founder.
 * Shows all business ideas, implementation status, and next steps.
 * Only visible to Admin/Executive.
 */

import React, { useState } from "react";
import { Target, CheckCircle2, Clock, ArrowRight, Rocket, Users, Building2, Globe, CreditCard, Mail, ExternalLink, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface StrategyItem {
  id: string;
  phase: string;
  title: string;
  description: string;
  status: "done" | "ready" | "next" | "future";
  action?: string;
  link?: string;
}

const STRATEGY: StrategyItem[] = [
  // PHASE 1 — READY TO LAUNCH
  { id: "1", phase: "Launch Now", title: "Share Recruitment Link", description: "Post on Facebook, LinkedIn, WhatsApp. Every application lands in your dashboard with AI passport extraction.", status: "done", link: "/api/public/apply/form" },
  { id: "2", phase: "Launch Now", title: "Send Client Portal Link", description: "Pick your best client. Generate a read-only compliance link. Send it. Watch their reaction.", status: "ready", action: "Go to Recruitment Link page → Client Portal section", link: "/recruitment-link" },
  { id: "3", phase: "Launch Now", title: "Agency Landing Page", description: "Public page explaining Apatris to other staffing agencies. 14-day free trial form.", status: "done", link: "/api/public/agency" },
  { id: "4", phase: "Launch Now", title: "Activate Stripe Billing", description: "Set STRIPE_SECRET_KEY on Fly.io. Webhook endpoint already built. Checkout flow ready.", status: "ready", action: "Run: fly secrets set STRIPE_SECRET_KEY=sk_live_xxx" },

  // PHASE 2 — DOMINATE POLAND
  { id: "5", phase: "Dominate Poland", title: "Sign 5 Clients Using Compliance Portal", description: "Walk into construction companies. Demo the QR verification + client portal. No competitor can show this.", status: "next", action: "Generate client portal links and send to prospects" },
  { id: "6", phase: "Dominate Poland", title: "Grow to 500 Workers", description: "Activate recruitment form across Ukrainian/Belarusian Facebook groups and Telegram channels. Coordinators share the link.", status: "next", action: "Share /api/public/apply/form in worker communities" },
  { id: "7", phase: "Dominate Poland", title: "Hire 2 More Coordinators", description: "They use the app (T4 tier). They share recruitment link. They handle onboarding. The app does compliance for them.", status: "next" },
  { id: "8", phase: "Dominate Poland", title: "Weekly Digest Active", description: "Monday 8am email with expiring docs, SLA breaches, case pipeline. Already running.", status: "done" },
  { id: "9", phase: "Dominate Poland", title: "Auto-Escalation Active", description: "Cases stuck → push (1d) → WhatsApp (3d) → email executive (7d). Already running.", status: "done" },

  // PHASE 3 — SELL THE PLATFORM
  { id: "10", phase: "Sell Platform", title: "First 10 Agency Customers", description: "Find staffing agencies managing foreign workers in Poland. They're using Excel. Show them Apatris. €199-999/month.", status: "future" },
  { id: "11", phase: "Sell Platform", title: "White-Label Option", description: "Agencies can brand Apatris as their own. Built-in white-label support already exists.", status: "future" },
  { id: "12", phase: "Sell Platform", title: "Partner Program", description: "Agencies refer other agencies. 20% revenue share. Network effect.", status: "future" },

  // PHASE 4 — EXPAND COUNTRIES
  { id: "13", phase: "Expand Countries", title: "Ireland (Revenue.ie + PRSI)", description: "Country compliance rules already built. Polish workers go to Ireland for construction. Same pain.", status: "future" },
  { id: "14", phase: "Expand Countries", title: "Germany (Sozialversicherung)", description: "Biggest market for Polish outsourcing. Complex rules. Agencies drowning in paperwork.", status: "future" },
  { id: "15", phase: "Expand Countries", title: "Local Partners per Country", description: "Don't build offices. Find agency partners, give them white-label Apatris, take 20% SaaS revenue.", status: "future" },

  // PHASE 5 — BECOME THE STANDARD
  { id: "16", phase: "Become Standard", title: "API Marketplace", description: "Let payroll providers and accounting software integrate with Apatris API.", status: "future" },
  { id: "17", phase: "Become Standard", title: "Government Integration (MOS API)", description: "When MOS 2.0 has an API, file TRC applications directly from Apatris dashboard.", status: "future" },
  { id: "18", phase: "Become Standard", title: "Apatris Certified Agency Badge", description: "Agencies using Apatris get a compliance certification badge that clients trust.", status: "future" },
];

const STATUS_STYLE = {
  done:   { label: "DONE",    color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle2 },
  ready:  { label: "READY",   color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    icon: Rocket },
  next:   { label: "NEXT",    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   icon: ArrowRight },
  future: { label: "PLANNED", color: "text-slate-500",   bg: "bg-slate-800",      border: "border-slate-700",      icon: Clock },
};

const PHASE_STYLE: Record<string, { color: string; bg: string }> = {
  "Launch Now":       { color: "text-[#C41E18]",   bg: "bg-[#C41E18]/10" },
  "Dominate Poland":  { color: "text-emerald-400",  bg: "bg-emerald-500/10" },
  "Sell Platform":    { color: "text-blue-400",     bg: "bg-blue-500/10" },
  "Expand Countries": { color: "text-violet-400",   bg: "bg-violet-500/10" },
  "Become Standard":  { color: "text-amber-400",    bg: "bg-amber-500/10" },
};

export default function StrategyDashboard() {
  const [filterPhase, setFilterPhase] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const phases = [...new Set(STRATEGY.map(s => s.phase))];
  const filtered = filterPhase ? STRATEGY.filter(s => s.phase === filterPhase) : STRATEGY;

  const counts = {
    done: STRATEGY.filter(s => s.status === "done").length,
    ready: STRATEGY.filter(s => s.status === "ready").length,
    next: STRATEGY.filter(s => s.status === "next").length,
    future: STRATEGY.filter(s => s.status === "future").length,
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Target className="w-7 h-7 text-[#C41E18]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Strategy & Execution</h1>
            <p className="text-sm text-slate-400">Your roadmap from 200 workers to industry standard</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {(["done", "ready", "next", "future"] as const).map(s => {
            const st = STATUS_STYLE[s];
            return (
              <div key={s} className={cn("rounded-xl p-3 text-center border", st.bg, st.border)}>
                <p className={cn("text-2xl font-black", st.color)}>{counts[s]}</p>
                <p className="text-[9px] text-slate-500 font-bold uppercase">{st.label}</p>
              </div>
            );
          })}
        </div>

        {/* Quick links */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2">
            <a href={`${origin}/api/public/agency`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-[#C41E18]/10 border border-[#C41E18]/20 rounded-lg text-xs font-bold text-[#C41E18] hover:bg-[#C41E18]/15">
              <ExternalLink className="w-4 h-4" /> View Agency Landing Page
            </a>
            <a href={`${origin}/api/public/apply/form`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-bold text-emerald-400 hover:bg-emerald-500/15">
              <Users className="w-4 h-4" /> View Recruitment Form
            </a>
            <a href="/recruitment-link"
              className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs font-bold text-blue-400 hover:bg-blue-500/15">
              <Building2 className="w-4 h-4" /> Generate Client Portal Link
            </a>
            <a href="/billing"
              className="flex items-center gap-2 p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg text-xs font-bold text-violet-400 hover:bg-violet-500/15">
              <CreditCard className="w-4 h-4" /> Billing & Pricing
            </a>
          </div>
        </div>

        {/* Phase filter */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button onClick={() => setFilterPhase("")}
            className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
              !filterPhase ? "bg-white/10 border-white/20 text-white" : "border-slate-700 text-slate-500 hover:text-white")}>
            All ({STRATEGY.length})
          </button>
          {phases.map(p => {
            const ps = PHASE_STYLE[p] ?? { color: "text-slate-400", bg: "bg-slate-800" };
            const count = STRATEGY.filter(s => s.phase === p).length;
            return (
              <button key={p} onClick={() => setFilterPhase(filterPhase === p ? "" : p)}
                className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                  filterPhase === p ? cn(ps.bg, "border-current", ps.color) : "border-slate-700 text-slate-500 hover:text-white")}>
                {p} ({count})
              </button>
            );
          })}
        </div>

        {/* Strategy items */}
        <div className="space-y-3">
          {filtered.map(item => {
            const st = STATUS_STYLE[item.status];
            const ps = PHASE_STYLE[item.phase] ?? { color: "text-slate-400", bg: "bg-slate-800" };
            const Icon = st.icon;
            return (
              <div key={item.id} className={cn("border rounded-xl p-4 transition-all", st.border, st.bg)}>
                <div className="flex items-start gap-3">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", st.bg)}>
                    <Icon className={cn("w-4 h-4", st.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-[8px] px-1.5 py-0.5 rounded font-bold", ps.bg, ps.color)}>{item.phase}</span>
                      <span className={cn("text-[8px] px-1.5 py-0.5 rounded font-bold", st.bg, st.color)}>{st.label}</span>
                    </div>
                    <h3 className="text-sm font-bold text-white">{item.title}</h3>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                    {item.action && (
                      <p className="text-[10px] text-amber-400 mt-2 font-bold">→ {item.action}</p>
                    )}
                    {item.link && (
                      <a href={item.link.startsWith("/api") ? `${origin}${item.link}` : item.link} target={item.link.startsWith("/api") ? "_blank" : "_self"} rel="noopener noreferrer"
                        className={cn("inline-flex items-center gap-1 mt-2 text-[10px] font-bold hover:underline", st.color)}>
                        <ExternalLink className="w-3 h-3" /> {item.link.startsWith("/api") ? "Open" : "Go to page"}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
