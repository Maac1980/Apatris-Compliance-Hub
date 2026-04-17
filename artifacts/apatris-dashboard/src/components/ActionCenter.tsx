/**
 * ActionCenter — system-driven actions for a worker.
 * Shows what needs to be done, with one-click execution.
 */

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import {
  Zap, FileSignature, Shield, AlertTriangle, CheckCircle2, Loader2,
  Upload, Eye, Package, ChevronRight, Clock, Bot,
} from "lucide-react";

const TYPE_ICON: Record<string, typeof FileSignature> = {
  DOCUMENT: FileSignature, AUTHORITY_PACK: Shield, CASE_UPDATE: Zap, REVIEW: Eye, EVIDENCE: Upload,
};
const PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: "bg-red-500/10", text: "text-red-400" },
  HIGH: { bg: "bg-orange-500/10", text: "text-orange-400" },
  MEDIUM: { bg: "bg-amber-500/10", text: "text-amber-400" },
  LOW: { bg: "bg-slate-700/50", text: "text-slate-400" },
};
const STATUS_ICON: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  READY: { icon: Zap, color: "text-blue-400" },
  BLOCKED: { icon: AlertTriangle, color: "text-slate-500" },
  DONE: { icon: CheckCircle2, color: "text-emerald-400" },
};

interface ActionCenterProps { workerId: string; }

export function ActionCenter({ workerId }: ActionCenterProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["worker-actions", workerId],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/actions/worker/${workerId}`, { headers: authHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!workerId,
  });

  const execMutation = useMutation({
    mutationFn: async ({ actionId }: { actionId: string }) => {
      const res = await fetch(`${BASE}api/v1/actions/execute`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ workerId, actionId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["worker-actions", workerId] });
      toast({ description: r.success ? "Action executed" : r.error });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const pkgMutation = useMutation({
    mutationFn: async ({ packageId }: { packageId: string }) => {
      const res = await fetch(`${BASE}api/v1/actions/package/execute`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ workerId, packageId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Failed"); }
      return res.json();
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["worker-actions", workerId] });
      toast({ description: `Package: ${r.executed} executed, ${r.failed} failed` });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-4"><div className="animate-spin w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full" /></div>;
  if (!data || !data.actions?.length) return null;

  const actions = data.actions ?? [];
  const packages = data.packages ?? [];
  const pending = actions.filter((a: any) => a.status !== "DONE");
  const done = actions.filter((a: any) => a.status === "DONE");

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-blue-500/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">Action Center</span>
          {pending.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">{pending.length}</span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {/* Packages */}
        {packages.filter((p: any) => p.actionsIncluded.length > 0).map((pkg: any) => (
          <div key={pkg.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-bold text-white">{pkg.name}</span>
              </div>
              <button
                onClick={() => pkgMutation.mutate({ packageId: pkg.id })}
                disabled={!pkg.ready || pkgMutation.isPending}
                className="flex items-center gap-1 px-2 py-1 rounded bg-violet-600/20 text-violet-400 text-[10px] font-bold hover:bg-violet-600/30 disabled:opacity-40 transition-colors"
              >
                {pkgMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Execute All
              </button>
            </div>
            <p className="text-[11px] text-slate-400">{pkg.description}</p>
          </div>
        ))}

        {/* Pending actions */}
        {pending.map((a: any) => {
          const Icon = TYPE_ICON[a.type] ?? Zap;
          const ps = PRIORITY_STYLE[a.priority] ?? PRIORITY_STYLE.LOW;
          const ss = STATUS_ICON[a.status] ?? STATUS_ICON.READY;
          const SIcon = ss.icon;
          return (
            <div key={a.id} className="flex items-center gap-2.5 rounded-lg bg-slate-900/40 px-3 py-2">
              <Icon className={`w-3.5 h-3.5 ${ss.color} flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{a.title}</p>
                <p className="text-[10px] text-slate-500 truncate">{a.description}</p>
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ps.bg} ${ps.text}`}>{a.priority}</span>
              {a.autoExecutable && a.status === "READY" ? (
                <button onClick={() => execMutation.mutate({ actionId: a.id })}
                  disabled={execMutation.isPending}
                  className="px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 text-[10px] font-bold hover:bg-blue-600/30 disabled:opacity-50">
                  {execMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Run"}
                </button>
              ) : a.status === "BLOCKED" ? (
                <span className="text-[9px] text-slate-600">Blocked</span>
              ) : (
                <span className="text-[9px] text-slate-500">Manual</span>
              )}
            </div>
          );
        })}

        {/* Done count */}
        {done.length > 0 && (
          <p className="text-[10px] text-emerald-400/60 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{done.length} completed</p>
        )}

        {/* Automation activity */}
        <AutomationActivity workerId={workerId} />
      </div>
    </div>
  );
}

function AutomationActivity({ workerId }: { workerId: string }) {
  const { data } = useQuery({
    queryKey: ["automation-worker", workerId],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/v1/automation/worker/${workerId}`, { headers: authHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || "Failed to load data"); }
      const json = await res.json();
      return json.logs ?? [];
    },
    enabled: !!workerId,
  });

  const logs = (data ?? []).slice(0, 5);
  if (logs.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-slate-700/30">
      <p className="text-[10px] text-slate-500 flex items-center gap-1 mb-1.5"><Bot className="w-3 h-3" /> Automation Activity</p>
      {logs.map((l: any, i: number) => (
        <div key={l.id ?? i} className="flex items-center gap-2 text-[10px] text-slate-400 mb-0.5">
          {l.result === "SUCCESS" ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> :
           l.result === "DRY_RUN" ? <Clock className="w-2.5 h-2.5 text-blue-400" /> :
           <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
          <span className="truncate">{l.action_title}</span>
          <span className="ml-auto text-slate-600 font-mono text-[9px]">{l.result}</span>
        </div>
      ))}
    </div>
  );
}
