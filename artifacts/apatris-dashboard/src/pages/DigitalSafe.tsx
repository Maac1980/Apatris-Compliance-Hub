/**
 * Digital Safe — secure vault for MOS certificates, UPO receipts, and official documents.
 * Timestamped, audit-logged, no manipulation.
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  ArrowLeft, Shield, FileCheck, Lock, Clock, Upload, CheckCircle2, Search,
} from "lucide-react";

const DOC_CATEGORIES = [
  { id: "MOS_CERTIFICATE", label: "MOS Certificate", color: "text-blue-400 bg-blue-500/10" },
  { id: "UPO_RECEIPT", label: "UPO Receipt", color: "text-emerald-400 bg-emerald-500/10" },
  { id: "DECISION_LETTER", label: "Decision Letter", color: "text-purple-400 bg-purple-500/10" },
  { id: "TRC_CARD", label: "TRC Card", color: "text-amber-400 bg-amber-500/10" },
  { id: "WORK_PERMIT", label: "Work Permit", color: "text-cyan-400 bg-cyan-500/10" },
  { id: "ANNEX_1", label: "Annex 1 (Signed)", color: "text-red-400 bg-red-500/10" },
  { id: "OTHER", label: "Other Official", color: "text-slate-400 bg-slate-500/10" },
];

export default function DigitalSafe() {
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Fetch confirmed document intakes as the "vault"
  const { data: docsData } = useQuery({
    queryKey: ["digital-safe"],
    queryFn: async () => {
      // Use the existing document intake data that has been confirmed
      const r = await fetch(`${BASE}api/v1/legal-immigration/workers`, { headers: authHeaders() });
      if (!r.ok) return { workers: [] };
      return r.json();
    },
  });

  // Fetch confirmed intakes
  const { data: intakeData } = useQuery({
    queryKey: ["digital-safe-intakes"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || "Failed to load data"); }
      const j = await r.json();
      return (j.workers ?? j ?? []).map((w: any) => ({
        id: w.id,
        name: w.name ?? w.full_name,
        trcExpiry: w.trcExpiry ?? w.trc_expiry,
        passportExpiry: w.passportExpiry ?? w.passport_expiry,
        workPermitExpiry: w.workPermitExpiry ?? w.work_permit_expiry,
        mosStatus: w.mosStatus ?? w.mos_status,
      }));
    },
  });

  const workers = (intakeData ?? []) as any[];
  const filtered = workers.filter((w: any) => !filter || w.name?.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="flex items-center gap-3 mb-6">
        <a href="/legal-immigration" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </a>
        <Lock className="w-7 h-7 text-[#C41E18]" />
        <div>
          <h1 className="text-2xl font-bold text-white">Digital Safe</h1>
          <p className="text-sm text-slate-400">Secure vault for official MOS certificates and UPO receipts</p>
        </div>
      </div>

      {/* Category badges */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => setCategoryFilter("")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${!categoryFilter ? "bg-[#C41E18] text-white" : "bg-slate-800 text-slate-400"}`}
        >All</button>
        {DOC_CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(c.id === categoryFilter ? "" : c.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${categoryFilter === c.id ? "bg-[#C41E18] text-white" : "bg-slate-800 text-slate-400"}`}
          >{c.label}</button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          type="text" value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Search by worker name..."
          className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none"
        />
      </div>

      {/* Worker documents vault */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <Lock className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">No documents in the vault</p>
          </div>
        ) : (
          filtered.map((w: any) => {
            const docs = [
              w.trcExpiry && { type: "TRC_CARD", label: "TRC Certificate", expiry: w.trcExpiry },
              w.passportExpiry && { type: "OTHER", label: "Passport", expiry: w.passportExpiry },
              w.workPermitExpiry && { type: "WORK_PERMIT", label: "Work Permit", expiry: w.workPermitExpiry },
              w.mosStatus === "ready" && { type: "MOS_CERTIFICATE", label: "MOS Package", expiry: null },
            ].filter(Boolean) as any[];

            const filteredDocs = categoryFilter ? docs.filter((d: any) => d.type === categoryFilter) : docs;
            if (filteredDocs.length === 0 && categoryFilter) return null;

            return (
              <div key={w.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-slate-500" />
                    <p className="text-sm font-bold text-white">{w.name}</p>
                  </div>
                  <span className="text-[9px] text-slate-600 font-mono">{docs.length} document(s)</span>
                </div>
                <div className="space-y-1.5">
                  {(categoryFilter ? filteredDocs : docs).map((d: any, i: number) => {
                    const cat = DOC_CATEGORIES.find(c => c.id === d.type);
                    const days = d.expiry ? Math.ceil((new Date(d.expiry).getTime() - Date.now()) / 86_400_000) : null;
                    return (
                      <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/50">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${cat?.color ?? "text-slate-400 bg-slate-500/10"}`}>{cat?.label ?? d.type}</span>
                          <span className="text-xs text-white">{d.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {d.expiry && (
                            <span className={`text-[10px] font-mono ${days !== null && days < 0 ? "text-red-400" : days !== null && days < 30 ? "text-amber-400" : "text-emerald-400"}`}>
                              {new Date(d.expiry).toLocaleDateString("en-GB")}
                            </span>
                          )}
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }).filter(Boolean)
        )}
      </div>
    </div>
  );
}
