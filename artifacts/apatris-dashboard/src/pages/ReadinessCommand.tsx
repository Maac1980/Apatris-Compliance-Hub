/**
 * Readiness Command Center — operations control tower.
 * Deep drill-down into workforce, cases, regulatory, approvals, workload.
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import { useLocation } from "wouter";
import { DecisionExplanationCard } from "@/components/DecisionExplanationCard";
import { Zap, Users, FileText, Shield, AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";

export default function ReadinessCommand() {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["command-center"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/command-center`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 60000,
  });

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>;
  if (!data) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Failed to load</div>;

  const { workforce: w, cases: c, regulatory: r, approvals: a, workload: wl, bottlenecks, topActions } = data;

  // Readiness explanation — only fires when there are bottlenecks or critical issues
  const hasCritical = bottlenecks.some((b: any) => b.severity === "CRITICAL") || w.blocked > 0 || c.overdueDeadline > 0;
  const { data: readinessExplanationData } = useQuery({
    queryKey: ["readiness-explanation", data.computedAt],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/decision-explanations/readiness`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ workforce: w, cases: c, regulatory: r, bottlenecks, topActions }),
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: hasCritical,
    staleTime: 60000,
  });
  const readinessExplanation = readinessExplanationData?.explanation ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-y-auto pb-20">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600 flex items-center justify-center"><Zap className="w-5 h-5 text-slate-300" /></div>
          <div><h1 className="text-xl font-bold text-white tracking-tight">Command Center</h1><p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-1">Operations Control Tower</p></div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Decision Explanation — shown when critical issues exist */}
        {readinessExplanation && readinessExplanation.decision !== "PROCEED" && (
          <DecisionExplanationCard explanation={readinessExplanation} compact />
        )}

        {/* Bottlenecks */}
        {bottlenecks.length > 0 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
            <h2 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3">Active Bottlenecks</h2>
            <div className="space-y-2">
              {bottlenecks.map((b: any, i: number) => (
                <button key={i} onClick={() => setLocation(b.link)} className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-slate-900/50 hover:bg-slate-800 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`w-4 h-4 ${b.severity === "CRITICAL" ? "text-red-400" : b.severity === "HIGH" ? "text-orange-400" : "text-amber-400"}`} />
                    <span className="text-xs text-slate-300">{b.issue}</span>
                  </div>
                  <span className="text-xs font-bold text-white">{b.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Workforce + Cases */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Workforce Readiness" icon={<Users className="w-4 h-4" />}>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Total" value={w.total} color="text-white" onClick={() => setLocation("/")} />
              <Stat label="Deployable" value={w.deployable} color="text-emerald-400" />
              <Stat label="Blocked" value={w.blocked} color="text-red-400" onClick={() => setLocation("/?filter=expired")} />
              <Stat label="Expiring Permits" value={w.expiringPermits} color="text-amber-400" />
              <Stat label="Expired Permits" value={w.expiredPermits} color="text-red-400" />
              <Stat label="Expiring Passports" value={w.expiringPassports} color="text-orange-400" />
              <Stat label="Expiring BHP" value={w.expiringBHP} color="text-amber-400" />
              <Stat label="Expiring Contracts" value={w.expiringContracts} color="text-amber-400" />
            </div>
          </Section>

          <Section title="Case Command" icon={<FileText className="w-4 h-4" />}>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Active" value={c.active} color="text-blue-400" onClick={() => setLocation("/legal-intelligence")} />
              <Stat label="Need Action" value={c.needingAction} color="text-amber-400" />
              <Stat label="Rejected" value={c.rejected} color="text-red-400" onClick={() => setLocation("/rejection-intelligence")} />
              <Stat label="Pending Appeals" value={c.pendingAppeals} color="text-purple-400" />
              <Stat label="Deadline Soon" value={c.approachingDeadline} color="text-orange-400" />
              <Stat label="Overdue" value={c.overdueDeadline} color="text-red-400" />
            </div>
          </Section>
        </div>

        {/* Regulatory + Approvals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Regulatory Command" icon={<Shield className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Under Review" value={r.underReview} color="text-amber-400" onClick={() => setLocation("/regulatory/review")} />
              <Stat label="Approved" value={r.approvedForDeploy} color="text-emerald-400" onClick={() => setLocation("/regulatory/deployments")} />
              <Stat label="Deploy Pending" value={r.deploymentsPending} color="text-purple-400" onClick={() => setLocation("/regulatory/deployments")} />
              <Stat label="Critical Changes" value={r.criticalChanges} color="text-red-400" onClick={() => setLocation("/regulatory")} />
            </div>
            {r.affectedWorkersTotal > 0 && <p className="text-[10px] text-slate-500 mt-2">{r.affectedWorkersTotal} workers potentially affected by regulatory changes</p>}
          </Section>

          <Section title="Approval Queue" icon={<CheckCircle2 className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Pending Reviews" value={a.pendingReviewTasks} color="text-blue-400" onClick={() => setLocation("/regulatory/review")} />
              <Stat label="Overdue" value={a.overdueReviewTasks} color="text-red-400" onClick={() => setLocation("/regulatory/review?status=PENDING")} />
              <Stat label="Legal" value={a.byRole?.LEGAL ?? 0} color="text-purple-400" />
              <Stat label="Ops" value={a.byRole?.OPS ?? 0} color="text-blue-400" />
            </div>
          </Section>
        </div>

        {/* Workload + Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Team Workload" icon={<Clock className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Legal Tasks" value={wl.legalTasks} color="text-purple-400" />
              <Stat label="Ops Tasks" value={wl.opsTasks} color="text-blue-400" />
              <Stat label="Admin Approvals" value={wl.adminApprovals} color="text-amber-400" />
              <Stat label="Urgent Actions" value={wl.urgentActions} color="text-red-400" />
            </div>
          </Section>

          <Section title="Priority Actions" icon={<Zap className="w-4 h-4" />}>
            <div className="space-y-1.5">
              {topActions.length === 0 ? <p className="text-xs text-slate-500">No urgent actions</p>
              : topActions.map((a: any, i: number) => (
                <button key={i} onClick={() => setLocation(a.link)} className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-slate-900/60 hover:bg-slate-800 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${a.urgency === "CRITICAL" ? "bg-red-500/20 text-red-400" : a.urgency === "HIGH" ? "bg-orange-500/20 text-orange-400" : "bg-amber-500/20 text-amber-400"}`}>{a.urgency}</span>
                    <span className="text-xs text-slate-300">{a.action}</span>
                  </div>
                  <span className="text-xs font-bold text-white">{a.count}</span>
                </button>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">{icon}{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value, color, onClick }: { label: string; value: number; color: string; onClick?: () => void }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper onClick={onClick} className={`bg-slate-950/50 rounded-lg p-2.5 text-center ${onClick ? "hover:bg-slate-800 cursor-pointer transition-colors" : ""}`}>
      <p className="text-[9px] text-slate-500 uppercase">{label}</p>
      <p className={`text-xl font-black mt-0.5 ${color}`}>{value}</p>
    </Wrapper>
  );
}
