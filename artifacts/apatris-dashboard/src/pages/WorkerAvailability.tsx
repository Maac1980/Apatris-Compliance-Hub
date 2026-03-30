import { useState, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Users, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface DayAvailability {
  date: string;
  workers: { id: string; name: string; role: string; site: string }[];
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WorkerAvailability() {
  const { toast } = useToast();
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(3);
  const [data, setData] = useState<DayAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayAvailability | null>(null);

  const fetchData = () => {
    setLoading(true);
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    fetch(`${API}/availability?month=${monthStr}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setData(d.days ?? []))
      .catch(() => {
        setData(generateDemoData(year, month));
        toast({ title: "Info", description: "Loaded demo availability data" });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [year, month]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday=0

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });

  const getDay = (day: number): DayAvailability | undefined => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return data.find(d => d.date === dateStr);
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayData = data.find(d => d.date === todayStr);
  const todayCount = todayData?.workers.length ?? 0;

  return (
    <div className="p-4 md:p-6 min-h-screen overflow-y-auto pb-24 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-red-500" /> Worker Availability
          </h1>
          <p className="text-sm text-slate-400 mt-1">Monthly calendar view of available workers</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Available Today</span>
          <p className="text-xl font-bold text-emerald-400">{todayCount} <span className="text-xs text-slate-400">workers</span></p>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-white">{monthName} {year}</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        </div>
      ) : (
        <>
          {/* Calendar Grid */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-slate-700/50">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="px-2 py-2 text-center text-xs font-mono text-slate-400 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {/* Empty cells for offset */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="border-b border-r border-slate-700/30 min-h-[80px] bg-slate-900/30" />
              ))}
              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayData = getDay(day);
                const count = dayData?.workers.length ?? 0;
                const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isToday = dateStr === todayStr;
                const isWeekend = ((firstDayOfWeek + i) % 7) >= 5;
                return (
                  <div
                    key={day}
                    onClick={() => dayData && setSelectedDay(dayData)}
                    className={`border-b border-r border-slate-700/30 min-h-[80px] p-2 transition-colors cursor-pointer hover:bg-slate-700/30 ${
                      isToday ? "bg-red-900/20 border-red-500/30" : isWeekend ? "bg-slate-900/40" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-mono ${isToday ? "text-red-400 font-bold" : "text-slate-400"}`}>{day}</span>
                    </div>
                    {count > 0 && (
                      <div className="mt-1 flex items-center gap-1">
                        <Users className={`w-3 h-3 ${count > 10 ? "text-emerald-400" : count > 5 ? "text-yellow-400" : "text-slate-400"}`} />
                        <span className={`text-xs font-bold ${count > 10 ? "text-emerald-400" : count > 5 ? "text-yellow-400" : "text-slate-400"}`}>
                          {count}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Day Detail Modal */}
      {selectedDay && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedDay(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">
                Available Workers &mdash; {new Date(selectedDay.date).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" })}
              </h2>
              <button onClick={() => setSelectedDay(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-400 mb-3">{selectedDay.workers.length} workers available</p>
            <div className="space-y-2">
              {selectedDay.workers.map(w => (
                <div key={w.id} className="flex items-center justify-between bg-slate-900/50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm text-white font-medium">{w.name}</p>
                    <p className="text-xs text-slate-400">{w.role}</p>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">{w.site}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function generateDemoData(year: number, month: number): DayAvailability[] {
  const workers = [
    { id: "w1", name: "Oleksandr K.", role: "TIG Welder", site: "Site A" },
    { id: "w2", name: "Rajesh S.", role: "MIG Welder", site: "Site B" },
    { id: "w3", name: "Giorgi B.", role: "Fitter", site: "Site A" },
    { id: "w4", name: "Mohammad R.", role: "ARC Welder", site: "Site C" },
    { id: "w5", name: "Dmytro B.", role: "Foreman", site: "Site B" },
    { id: "w6", name: "Andriy P.", role: "TIG Welder", site: "Site A" },
    { id: "w7", name: "Suresh K.", role: "Helper", site: "Site C" },
    { id: "w8", name: "Vitalii M.", role: "MIG Welder", site: "Site B" },
    { id: "w9", name: "Igor Z.", role: "Fitter", site: "Site A" },
    { id: "w10", name: "Aman G.", role: "ARC Welder", site: "Site C" },
    { id: "w11", name: "Taras H.", role: "TIG Welder", site: "Site A" },
    { id: "w12", name: "Bikram T.", role: "Helper", site: "Site B" },
  ];
  const days: DayAvailability[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0) continue; // Sunday off
    const seed = (d * 7 + month * 3) % 13;
    const count = dow === 6 ? Math.floor(seed / 2) : 4 + (seed % 9);
    const available = workers.slice(0, Math.min(count, workers.length));
    days.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      workers: available,
    });
  }
  return days;
}
