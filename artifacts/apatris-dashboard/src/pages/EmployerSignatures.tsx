/**
 * Employer Signatures — track MOS digital signing links with 30-day deadlines.
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  ArrowLeft, FileSignature, CheckCircle2, Clock, AlertTriangle, XOctagon, Loader2,
} from "lucide-react";

export default function EmployerSignatures() {
  const { data: workersData } = useQuery({
    queryKey: ["sig-workers"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.workers ?? j ?? []).map((w: any) => ({
        id: w.id,
        name: w.name ?? w.full_name,
        mosStatus: w.mosStatus ?? w.mos_status ?? "not_started",
        mosLinkReceivedAt: w.mosLinkReceivedAt ?? w.mos_link_received_at,
        mosSignatureDeadline: w.mosSignatureDeadline ?? w.mos_signature_deadline,
        mosPortalLink: w.mosPortalLink ?? w.mos_portal_link,
      }));
    },
  });

  const workers = (workersData ?? []) as any[];
  const now = Date.now();

  // Categorize workers by signature status
  const withDeadline = workers.filter((w: any) => w.mosSignatureDeadline);
  const unsigned = withDeadline.filter((w: any) => {
    const d = new Date(w.mosSignatureDeadline).getTime();
    return d > now && w.mosStatus !== "ready";
  });
  const overdue = withDeadline.filter((w: any) => {
    const d = new Date(w.mosSignatureDeadline).getTime();
    return d <= now && w.mosStatus !== "ready";
  });
  const signed = workers.filter((w: any) => w.mosStatus === "ready");
  const needsFollowUp = unsigned.filter((w: any) => {
    const d = new Date(w.mosSignatureDeadline).getTime();
    const daysLeft = Math.ceil((d - now) / 86_400_000);
    return daysLeft <= 7;
  });

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="flex items-center gap-3 mb-6">
        <a href="/legal-immigration" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </a>
        <FileSignature className="w-7 h-7 text-[#C41E18]" />
        <div>
          <h1 className="text-2xl font-bold text-white">Employer Signatures</h1>
          <p className="text-sm text-slate-400">Track MOS Annex 1 digital signing links — 30-day deadline</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-emerald-400">{signed.length}</p>
          <p className="text-[9px] text-emerald-400/60 uppercase font-bold">Signed</p>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-blue-400">{unsigned.length}</p>
          <p className="text-[9px] text-blue-400/60 uppercase font-bold">Pending</p>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-amber-400">{needsFollowUp.length}</p>
          <p className="text-[9px] text-amber-400/60 uppercase font-bold">Follow-up</p>
        </div>
        <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-red-400">{overdue.length}</p>
          <p className="text-[9px] text-red-400/60 uppercase font-bold">Overdue</p>
        </div>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1"><XOctagon className="w-3 h-3" /> Overdue — Digital Paralysis Risk</p>
          {overdue.map((w: any) => (
            <div key={w.id} className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 mb-1.5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">{w.name}</p>
                <p className="text-[10px] text-red-300/70">Deadline passed: {new Date(w.mosSignatureDeadline).toLocaleDateString("en-GB")}</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">OVERDUE</span>
            </div>
          ))}
        </div>
      )}

      {/* Needs Follow-up */}
      {needsFollowUp.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Needs Follow-up (&le;7 days left)</p>
          {needsFollowUp.map((w: any) => {
            const daysLeft = Math.ceil((new Date(w.mosSignatureDeadline).getTime() - now) / 86_400_000);
            return (
              <div key={w.id} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 mb-1.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{w.name}</p>
                  <p className="text-[10px] text-amber-300/70">Deadline: {new Date(w.mosSignatureDeadline).toLocaleDateString("en-GB")} — {daysLeft}d left</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400">{daysLeft}d LEFT</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Signed */}
      {signed.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Signed ({signed.length})</p>
          {signed.map((w: any) => (
            <div key={w.id} className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 mb-1.5 flex items-center justify-between">
              <p className="text-sm text-white">{w.name}</p>
              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">SIGNED</span>
            </div>
          ))}
        </div>
      )}

      {/* All workers without deadline */}
      {workers.filter((w: any) => !w.mosSignatureDeadline && w.mosStatus !== "ready").length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Not Started ({workers.filter((w: any) => !w.mosSignatureDeadline && w.mosStatus !== "ready").length})</p>
          <p className="text-xs text-slate-600">These workers have no MOS signing link set. Generate MOS packages from Workers Legal tab first.</p>
        </div>
      )}
    </div>
  );
}
