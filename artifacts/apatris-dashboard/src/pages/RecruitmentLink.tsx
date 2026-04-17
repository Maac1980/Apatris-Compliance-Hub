/**
 * Recruitment Link — shareable apply form URL for Facebook, LinkedIn, WhatsApp.
 * Also shows client portal link generator and QR verification link generator.
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  Link, Copy, CheckCircle2, ExternalLink, Users, Shield, Building2,
  Facebook, MessageCircle, Mail, QrCode,
} from "lucide-react";

export default function RecruitmentLink() {
  const [copied, setCopied] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientLink, setClientLink] = useState("");
  const [verifyWorkerId, setVerifyWorkerId] = useState("");
  const [verifyLink, setVerifyLink] = useState("");

  const origin = window.location.origin;
  const applyFormUrl = `${origin}/api/public/apply/form`;

  // Fetch workers for verification dropdown
  const { data: workersData } = useQuery({
    queryKey: ["workers-for-links"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || "Failed to load data"); }
      const d = await r.json();
      return (d.workers ?? d ?? []) as any[];
    },
  });

  const workers = workersData ?? [];

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  const generateClientLink = async () => {
    if (!clientName.trim()) return;
    try {
      const r = await fetch(`${BASE}api/v1/client-portal/generate`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, tenantId: (window as any).__tenantId }),
      });
      if (r.ok) {
        const d = await r.json();
        setClientLink(`${origin}/api/public/client/${d.token}`);
      }
    } catch { /* ignore */ }
  };

  const generateVerifyLink = async () => {
    if (!verifyWorkerId) return;
    try {
      const r = await fetch(`${BASE}api/v1/verify/generate`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: verifyWorkerId, tenantId: (window as any).__tenantId }),
      });
      if (r.ok) {
        const d = await r.json();
        setVerifyLink(`${origin}/api/public/verify/${d.token}/page`);
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Link className="w-7 h-7 text-[#C41E18]" />
          <div>
            <h1 className="text-2xl font-bold text-white">Shareable Links</h1>
            <p className="text-sm text-slate-400">Recruitment form, client portal, worker verification</p>
          </div>
        </div>

        {/* ── 1. Recruitment Form Link ───────────────────────────────── */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Recruitment Form</h2>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">PUBLIC</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">Share this link on Facebook, LinkedIn, or WhatsApp. Candidates fill the form — applications appear on your Applications page.</p>

          <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-2 mb-3">
            <code className="text-xs text-white flex-1 truncate">{applyFormUrl}</code>
            <button onClick={() => copyToClipboard(applyFormUrl, "apply")}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#C41E18] text-white rounded-lg text-[10px] font-bold hover:bg-[#a81914] shrink-0">
              {copied === "apply" ? <><CheckCircle2 className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <a href={applyFormUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-[10px] font-bold hover:bg-slate-700">
              <ExternalLink className="w-3 h-3" /> Preview
            </a>
            <button onClick={() => copyToClipboard(`🔧 We're hiring! Apply here: ${applyFormUrl}`, "fb")}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg text-[10px] font-bold hover:bg-blue-600/30">
              <Facebook className="w-3 h-3" /> Facebook Post
            </button>
            <button onClick={() => copyToClipboard(`Hiring welders! Apply: ${applyFormUrl}`, "wa")}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg text-[10px] font-bold hover:bg-emerald-600/30">
              <MessageCircle className="w-3 h-3" /> WhatsApp
            </button>
          </div>
        </div>

        {/* ── 2. Client Portal Link ──────────────────────────────────── */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-bold text-white">Client Compliance Portal</h2>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold">READ-ONLY</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">Generate a read-only link for your client. They see their workers' compliance status — no login needed. Expires in 30 days.</p>

          <div className="flex items-center gap-2 mb-3">
            <input value={clientName} onChange={e => setClientName(e.target.value)}
              placeholder="Client company name..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none" />
            <button onClick={generateClientLink} disabled={!clientName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 disabled:opacity-30">
              Generate
            </button>
          </div>

          {clientLink && (
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-2">
              <code className="text-xs text-blue-400 flex-1 truncate">{clientLink}</code>
              <button onClick={() => copyToClipboard(clientLink, "client")}
                className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-[9px] font-bold">
                {copied === "client" ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          )}
        </div>

        {/* ── 3. Worker Verification QR ──────────────────────────────── */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <QrCode className="w-5 h-5 text-violet-400" />
            <h2 className="text-sm font-bold text-white">Worker Verification Link</h2>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-bold">QR CODE</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">Generate a verification link for a worker. Border police or PIP scans QR → sees legal status instantly. Valid 90 days.</p>

          <div className="flex items-center gap-2 mb-3">
            <select value={verifyWorkerId} onChange={e => setVerifyWorkerId(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Select worker...</option>
              {workers.map((w: any) => (
                <option key={w.id} value={w.id}>{w.firstName ?? w.first_name} {w.lastName ?? w.last_name}</option>
              ))}
            </select>
            <button onClick={generateVerifyLink} disabled={!verifyWorkerId}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-bold hover:bg-violet-500 disabled:opacity-30">
              Generate
            </button>
          </div>

          {verifyLink && (
            <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-lg p-2">
              <code className="text-xs text-violet-400 flex-1 truncate">{verifyLink}</code>
              <button onClick={() => copyToClipboard(verifyLink, "verify")}
                className="flex items-center gap-1 px-2 py-1 bg-violet-600 text-white rounded text-[9px] font-bold">
                {copied === "verify" ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
              <a href={verifyLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 bg-slate-700 text-white rounded text-[9px] font-bold">
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
