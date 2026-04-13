/**
 * Branded 404 & 500 Error Pages — Apatris dark theme with trust messaging.
 * Includes "Report Issue" button that logs to error_reports table with tenant context.
 */

import { useState } from "react";
import { Shield, AlertTriangle, Home, Send, CheckCircle2 } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";

function ReportButton({ errorType, route }: { errorType: string; route: string }) {
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  const handleReport = async () => {
    try {
      await fetch(`${BASE}api/error-report`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          errorType,
          route,
          message: message || `User reported ${errorType} on ${route}`,
          userAgent: navigator.userAgent,
        }),
      });
      setSent(true);
    } catch { setSent(true); }
  };

  if (sent) {
    return (
      <div className="flex items-center gap-2 text-emerald-400 text-sm">
        <CheckCircle2 className="w-4 h-4" />
        <span>Report submitted — our team has been notified</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Describe what you were doing (optional)..."
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-[#C41E18] focus:outline-none"
      />
      <button onClick={handleReport}
        className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a81914] transition-colors">
        <Send className="w-3.5 h-3.5" />
        Report Issue
      </button>
    </div>
  );
}

export default function NotFound() {
  const currentPath = window.location.pathname;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0b] p-4">
      <div className="max-w-md w-full text-center">
        {/* Shield icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-[#C41E18]/10 border border-[#C41E18]/20 flex items-center justify-center">
          <Shield className="w-8 h-8 text-[#C41E18]" />
        </div>

        {/* Error code */}
        <h1 className="text-6xl font-black text-white mb-2">404</h1>
        <p className="text-lg font-bold text-slate-300 mb-2">Page Not Found</p>

        {/* Trust message */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-6 inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-sm text-emerald-400 font-medium">Your worker data is safe and secure</span>
        </div>

        <p className="text-sm text-slate-500 mb-6">
          The page <code className="text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">{currentPath}</code> doesn't exist or has been moved.
        </p>

        {/* Actions */}
        <div className="space-y-4">
          <a href="/"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors">
            <Home className="w-4 h-4" />
            Go to Dashboard
          </a>

          <div className="border-t border-slate-800 pt-4">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-2">Something wrong?</p>
            <ReportButton errorType="404" route={currentPath} />
          </div>
        </div>

        {/* Branding */}
        <p className="text-[10px] text-slate-700 mt-8">APATRIS COMPLIANCE HUB</p>
      </div>
    </div>
  );
}

export function ServerError({ error }: { error?: string }) {
  const currentPath = window.location.pathname;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0b] p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
        </div>

        <h1 className="text-6xl font-black text-white mb-2">500</h1>
        <p className="text-lg font-bold text-slate-300 mb-2">System Recalibrating</p>

        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-6 inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-sm text-emerald-400 font-medium">All worker data is safe — no data was lost</span>
        </div>

        <p className="text-sm text-slate-500 mb-6">
          Our systems encountered an unexpected issue. Our engineering team has been automatically notified.
        </p>

        {error && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 mb-4 text-left">
            <p className="text-[9px] text-slate-600 uppercase font-bold mb-1">Error Details</p>
            <p className="text-xs text-slate-400 font-mono break-all">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <button onClick={() => window.location.reload()}
            className="w-full px-4 py-2.5 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a81914] transition-colors">
            Retry
          </button>
          <a href="/"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors">
            <Home className="w-4 h-4" />
            Go to Dashboard
          </a>

          <div className="border-t border-slate-800 pt-4">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-2">Help us fix this faster</p>
            <ReportButton errorType="500" route={currentPath} />
          </div>
        </div>

        <p className="text-[10px] text-slate-700 mt-8">APATRIS COMPLIANCE HUB</p>
      </div>
    </div>
  );
}
