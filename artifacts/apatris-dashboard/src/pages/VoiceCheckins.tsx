import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, LogIn, LogOut, AlertTriangle, Search } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Checkin {
  id: string; worker_name: string | null; phone_number: string; checkin_type: string;
  site: string | null; timestamp: string; status: string; transcription: string | null;
}

export default function VoiceCheckins() {
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));

  const { data: todayData } = useQuery({
    queryKey: ["voice-today"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/voice/checkins/today`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ checkIns: number; checkOuts: number; unknownCallers: number }>;
    },
    refetchInterval: 30000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["voice-checkins", dateFilter],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/voice/checkins?date=${dateFilter}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ checkins: Checkin[] }>;
    },
    refetchInterval: 30000,
  });

  const checkins = data?.checkins ?? [];
  const today = todayData ?? { checkIns: 0, checkOuts: 0, unknownCallers: 0 };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Phone className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Voice Check-ins</h1>
        </div>
        <p className="text-gray-400">Workers call to check in/out — auto-refreshes every 30s</p>
      </div>

      {/* Today summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Check-ins Today</p>
          <p className="text-2xl font-bold text-emerald-400 flex items-center gap-2"><LogIn className="w-5 h-5" />{today.checkIns}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Check-outs Today</p>
          <p className="text-2xl font-bold text-blue-400 flex items-center gap-2"><LogOut className="w-5 h-5" />{today.checkOuts}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-mono uppercase mb-1">Unknown Callers</p>
          <p className="text-2xl font-bold text-red-400 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{today.unknownCallers}</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
        <span className="text-sm text-slate-400 font-mono">{checkins.length} entries</span>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-auto" />
        <span className="text-xs text-slate-500">Live</span>
      </div>

      {/* Check-in log */}
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : checkins.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No check-ins for this date</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Time</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Worker</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Site</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {checkins.map(c => (
                <tr key={c.id} className="border-b border-slate-800 hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono text-xs text-white">{new Date(c.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-3">
                    {c.checkin_type === "check_in" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <LogIn className="w-2.5 h-2.5" />IN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <LogOut className="w-2.5 h-2.5" />OUT
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{c.worker_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{c.phone_number}</td>
                  <td className="px-4 py-3 text-slate-400">{c.site || "—"}</td>
                  <td className="px-4 py-3">
                    {c.status === "unknown_caller" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400">
                        <AlertTriangle className="w-2.5 h-2.5" />Unknown
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-400">Recorded</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
