/**
 * Expiry Calendar — visual calendar showing document expirations by date.
 * Color-coded: GREEN (>60d), YELLOW (30-60d), RED (<30d), BLACK (expired).
 * Click a date to see which workers/documents expire on that day.
 */

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authHeaders, BASE } from "@/lib/api";
import {
  Calendar as CalIcon, ChevronLeft, ChevronRight, AlertTriangle,
  Shield, Clock, X, FileText, ArrowLeft,
} from "lucide-react";
import { QuickDocUpload } from "@/components/QuickDocUpload";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

interface Worker {
  id: string;
  firstName: string;
  lastName: string;
  trcExpiry?: string;
  passportExpiry?: string;
  workPermitExpiry?: string;
  bhpExpiry?: string;
  medicalExamExpiry?: string;
  contractEndDate?: string;
  oswiadczenieExpiry?: string;
  udtExpiry?: string;
}

interface ExpiryEvent {
  workerId: string;
  workerName: string;
  docType: string;
  date: string;
  daysUntil: number;
  zone: "green" | "yellow" | "red" | "expired";
}

const DOC_FIELDS: Array<{ key: keyof Worker; label: string }> = [
  { key: "trcExpiry", label: "TRC" },
  { key: "passportExpiry", label: "Passport" },
  { key: "workPermitExpiry", label: "Work Permit" },
  { key: "bhpExpiry", label: "BHP" },
  { key: "medicalExamExpiry", label: "Medical Exam" },
  { key: "contractEndDate", label: "Contract" },
  { key: "oswiadczenieExpiry", label: "Oświadczenie" },
  { key: "udtExpiry", label: "UDT" },
];

function getZone(daysUntil: number): ExpiryEvent["zone"] {
  if (daysUntil < 0) return "expired";
  if (daysUntil < 30) return "red";
  if (daysUntil <= 60) return "yellow";
  return "green";
}

const ZONE_COLORS = {
  expired: { bg: "bg-slate-600", text: "text-slate-300", dot: "bg-slate-400", label: "EXPIRED" },
  red: { bg: "bg-red-500/20", text: "text-red-400", dot: "bg-red-400", label: "<30d" },
  yellow: { bg: "bg-amber-500/20", text: "text-amber-400", dot: "bg-amber-400", label: "30-60d" },
  green: { bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-400", label: ">60d" },
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ═══ COMPONENT ══════════════════════════════════════════════════════════════

export default function ExpiryCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterZone, setFilterZone] = useState<string>("");

  const { data: workersData, isLoading } = useQuery({
    queryKey: ["workers-expiry-calendar"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/workers`, { headers: authHeaders() });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.workers ?? data ?? []) as Worker[];
    },
  });

  const workers = workersData ?? [];

  // Build all expiry events
  const events = useMemo(() => {
    const result: ExpiryEvent[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const w of workers) {
      const name = `${w.firstName ?? ""} ${w.lastName ?? ""}`.trim() || w.id.slice(0, 8);
      for (const field of DOC_FIELDS) {
        const dateStr = w[field.key] as string | undefined;
        if (!dateStr) continue;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) continue;
        const daysUntil = Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
        // Only show events within -30 to +90 days range
        if (daysUntil < -30 || daysUntil > 90) continue;
        result.push({
          workerId: w.id,
          workerName: name,
          docType: field.label,
          date: dateStr.slice(0, 10),
          daysUntil,
          zone: getZone(daysUntil),
        });
      }
    }
    return result;
  }, [workers]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, ExpiryEvent[]> = {};
    for (const e of events) {
      if (filterZone && e.zone !== filterZone) continue;
      (map[e.date] ??= []).push(e);
    }
    return map;
  }, [events, filterZone]);

  // Calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = lastDay.getDate();

  const cells: Array<{ day: number | null; dateStr: string }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: null, dateStr: "" });
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateStr: ds });
  }

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  // Zone summary counts
  const zoneCounts = useMemo(() => {
    const c = { expired: 0, red: 0, yellow: 0, green: 0 };
    for (const e of events) c[e.zone]++;
    return c;
  }, [events]);

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <a href="/compliance-alerts" className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </a>
        <CalIcon className="w-7 h-7 text-[#C41E18]" />
        <div>
          <h1 className="text-2xl font-bold text-white">Expiry Calendar</h1>
          <p className="text-sm text-slate-400">Document expirations across all workers — visual timeline</p>
        </div>
      </div>

      {/* Quick upload */}
      <QuickDocUpload label="Upload Document — AI extracts expiry dates" />

      {/* Zone summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(["expired", "red", "yellow", "green"] as const).map(z => {
          const cfg = ZONE_COLORS[z];
          return (
            <button key={z} onClick={() => setFilterZone(filterZone === z ? "" : z)}
              className={`rounded-xl p-3 border transition-all ${
                filterZone === z ? `${cfg.bg} border-current ${cfg.text}` : "border-slate-700 hover:border-slate-600"
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="text-[10px] text-slate-400 font-mono uppercase">{cfg.label}</span>
              </div>
              <p className={`text-xl font-bold ${cfg.text}`}>{zoneCounts[z]}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-lg font-bold text-white">{MONTHS[month]} {year}</h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-500 uppercase py-1">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            {isLoading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin w-8 h-8 border-2 border-[#C41E18] border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell, i) => {
                  if (cell.day === null) return <div key={`empty-${i}`} className="h-16" />;
                  const dayEvents = eventsByDate[cell.dateStr] ?? [];
                  const isToday = cell.dateStr === now.toISOString().slice(0, 10);
                  const isSelected = cell.dateStr === selectedDate;
                  const hasExpired = dayEvents.some(e => e.zone === "expired");
                  const hasRed = dayEvents.some(e => e.zone === "red");
                  const hasYellow = dayEvents.some(e => e.zone === "yellow");

                  return (
                    <button
                      key={cell.dateStr}
                      onClick={() => setSelectedDate(isSelected ? null : cell.dateStr)}
                      className={`h-16 rounded-lg border text-left p-1.5 transition-all relative ${
                        isSelected
                          ? "border-[#C41E18] bg-[#C41E18]/10"
                          : isToday
                            ? "border-blue-500/50 bg-blue-500/5"
                            : dayEvents.length > 0
                              ? "border-slate-600 hover:border-slate-500 bg-slate-800/50"
                              : "border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <span className={`text-xs font-mono ${isToday ? "text-blue-400 font-bold" : "text-slate-400"}`}>
                        {cell.day}
                      </span>
                      {dayEvents.length > 0 && (
                        <div className="flex gap-0.5 mt-1 flex-wrap">
                          {dayEvents.slice(0, 3).map((e, j) => (
                            <span key={j} className={`w-1.5 h-1.5 rounded-full ${ZONE_COLORS[e.zone].dot}`} />
                          ))}
                          {dayEvents.length > 3 && (
                            <span className="text-[8px] text-slate-500">+{dayEvents.length - 3}</span>
                          )}
                        </div>
                      )}
                      {dayEvents.length > 0 && (
                        <span className="absolute bottom-1 right-1.5 text-[9px] font-bold text-slate-500">
                          {dayEvents.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Selected date detail */}
        <div>
          {selectedDate ? (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-white">
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  <p className="text-[10px] text-slate-500">{selectedEvents.length} document{selectedEvents.length !== 1 ? "s" : ""} expiring</p>
                </div>
                <button onClick={() => setSelectedDate(null)} className="p-1 text-slate-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedEvents.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No expirations on this date</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {selectedEvents.map((e, i) => {
                    const cfg = ZONE_COLORS[e.zone];
                    return (
                      <div key={i} className={`rounded-lg border p-3 ${cfg.bg} border-slate-700`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-white">{e.workerName}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                            {e.zone === "expired" ? "EXPIRED" : `${e.daysUntil}d`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <FileText className={`w-3 h-3 ${cfg.text}`} />
                          <span className="text-[10px] text-slate-300">{e.docType}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="text-center py-12 text-slate-500">
                <CalIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">Select a date</p>
                <p className="text-xs mt-1">Click any date to see expiring documents</p>
              </div>

              {/* Upcoming expirations list */}
              {events.filter(e => e.zone === "red" || e.zone === "expired").length > 0 && (
                <div className="mt-4 border-t border-slate-800 pt-4">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2">Critical Expirations</p>
                  <div className="space-y-1.5">
                    {events
                      .filter(e => e.zone === "red" || e.zone === "expired")
                      .sort((a, b) => a.daysUntil - b.daysUntil)
                      .slice(0, 10)
                      .map((e, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${ZONE_COLORS[e.zone].dot}`} />
                            <span className="text-white">{e.workerName}</span>
                            <span className="text-slate-500">{e.docType}</span>
                          </div>
                          <span className={`font-mono font-bold ${ZONE_COLORS[e.zone].text}`}>
                            {e.daysUntil < 0 ? `${Math.abs(e.daysUntil)}d ago` : `${e.daysUntil}d`}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
