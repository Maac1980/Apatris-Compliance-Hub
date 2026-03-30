import { useState, useEffect } from "react";
import { Clock, ChevronLeft, ChevronRight, Plus, X, Loader2, Sun, Sunset, Moon, MapPin, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface Shift {
  id: string;
  site: string;
  date: string;
  shiftType: "Morning" | "Afternoon" | "Night";
  startTime: string;
  endTime: string;
  workers: { id: string; name: string }[];
}

const SHIFT_CONFIG: Record<string, { icon: typeof Sun; color: string; bg: string; time: string }> = {
  Morning:   { icon: Sun,     color: "text-yellow-400", bg: "bg-yellow-900/30 border-yellow-500/20", time: "06:00 - 14:00" },
  Afternoon: { icon: Sunset,  color: "text-orange-400", bg: "bg-orange-900/30 border-orange-500/20", time: "14:00 - 22:00" },
  Night:     { icon: Moon,    color: "text-blue-400",   bg: "bg-blue-900/30 border-blue-500/20",     time: "22:00 - 06:00" },
};

const SITES = ["Site Alpha - Warszawa", "Site Beta - Krakow", "Site Gamma - Katowice", "Site Delta - Poznan"];

export default function ShiftSchedule() {
  const { toast } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ site: SITES[0], date: "", shiftType: "Morning" as Shift["shiftType"], workers: "" });

  const getWeekDates = () => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  const weekDates = getWeekDates();
  const weekLabel = `${weekDates[0].toLocaleDateString("en", { day: "numeric", month: "short" })} - ${weekDates[6].toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`;

  const fetchShifts = () => {
    setLoading(true);
    const start = weekDates[0].toISOString().slice(0, 10);
    const end = weekDates[6].toISOString().slice(0, 10);
    fetch(`${API}/shifts?start=${start}&end=${end}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setShifts(d.shifts ?? []))
      .catch(() => {
        setShifts(generateDemoShifts(weekDates));
        toast({ title: "Info", description: "Loaded demo shift data" });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchShifts(); }, [weekOffset]);

  const handleCreate = async () => {
    if (!form.date || !form.site) {
      toast({ title: "Error", description: "Date and site are required", variant: "destructive" });
      return;
    }
    try {
      const workerList = form.workers.split(",").map(w => w.trim()).filter(Boolean);
      await fetch(`${API}/shifts`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ ...form, workers: workerList.map((name, i) => ({ id: `new-${i}`, name })) }),
      });
      toast({ title: "Success", description: "Shift created" });
      setShowCreate(false);
      setForm({ site: SITES[0], date: "", shiftType: "Morning", workers: "" });
      fetchShifts();
    } catch {
      toast({ title: "Error", description: "Failed to create shift", variant: "destructive" });
    }
  };

  const getShiftsForCell = (date: Date, shiftType: string) => {
    const dateStr = date.toISOString().slice(0, 10);
    return shifts.filter(s => s.date === dateStr && s.shiftType === shiftType);
  };

  return (
    <div className="p-4 md:p-6 min-h-screen overflow-y-auto pb-24 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Clock className="w-6 h-6 text-red-500" /> Shift Schedule
          </h1>
          <p className="text-sm text-slate-400 mt-1">Weekly shift management and planning</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> Create Shift
        </button>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-bold text-white">{weekLabel}</h2>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-xs text-red-400 hover:text-red-300 mt-1">Back to this week</button>
          )}
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        </div>
      ) : (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="p-3 text-left text-xs text-slate-400 font-mono uppercase w-28">Shift</th>
                {weekDates.map(d => {
                  const isToday = d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
                  return (
                    <th key={d.toISOString()} className={`p-3 text-center text-xs font-mono uppercase ${isToday ? "text-red-400 bg-red-900/10" : "text-slate-400"}`}>
                      <div>{d.toLocaleDateString("en", { weekday: "short" })}</div>
                      <div className="text-sm font-bold">{d.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(["Morning", "Afternoon", "Night"] as const).map(shiftType => {
                const config = SHIFT_CONFIG[shiftType];
                const Icon = config.icon;
                return (
                  <tr key={shiftType} className="border-b border-slate-700/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${config.color}`} />
                        <div>
                          <p className={`text-sm font-semibold ${config.color}`}>{shiftType}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{config.time}</p>
                        </div>
                      </div>
                    </td>
                    {weekDates.map(d => {
                      const cellShifts = getShiftsForCell(d, shiftType);
                      return (
                        <td key={d.toISOString()} className="p-2 align-top">
                          <div className="space-y-1.5 min-h-[60px]">
                            {cellShifts.map(s => (
                              <div key={s.id} className={`rounded-lg border p-2 text-xs ${config.bg}`}>
                                <div className="flex items-center gap-1 mb-1">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  <span className="font-semibold truncate">{s.site}</span>
                                </div>
                                <div className="flex items-center gap-1 text-slate-400">
                                  <Users className="w-3 h-3" />
                                  <span>{s.workers.length} workers</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Shift Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Create Shift</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide">Site</label>
                <select value={form.site} onChange={e => setForm({ ...form, site: e.target.value })}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none">
                  {SITES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide">Date</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide">Shift Type</label>
                <select value={form.shiftType} onChange={e => setForm({ ...form, shiftType: e.target.value as Shift["shiftType"] })}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none">
                  <option>Morning</option>
                  <option>Afternoon</option>
                  <option>Night</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide">Workers (comma-separated)</label>
                <input value={form.workers} onChange={e => setForm({ ...form, workers: e.target.value })}
                  placeholder="e.g. Oleksandr K., Rajesh S."
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleCreate} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function generateDemoShifts(weekDates: Date[]): Shift[] {
  const sites = ["Alpha - Warszawa", "Beta - Krakow", "Gamma - Katowice"];
  const workers = [
    [{ id: "w1", name: "Oleksandr K." }, { id: "w2", name: "Rajesh S." }, { id: "w3", name: "Giorgi B." }],
    [{ id: "w4", name: "Mohammad R." }, { id: "w5", name: "Dmytro B." }],
    [{ id: "w6", name: "Andriy P." }, { id: "w7", name: "Suresh K." }, { id: "w8", name: "Vitalii M." }, { id: "w9", name: "Igor Z." }],
  ];
  const shifts: Shift[] = [];
  let id = 0;
  weekDates.forEach((d, di) => {
    if (d.getDay() === 0) return; // Sunday off
    const types: Shift["shiftType"][] = ["Morning", "Afternoon", "Night"];
    types.forEach((t, ti) => {
      if (d.getDay() === 6 && t === "Night") return; // No night shift Saturday
      const siteIdx = (di + ti) % sites.length;
      shifts.push({
        id: `demo-${id++}`,
        site: sites[siteIdx],
        date: d.toISOString().slice(0, 10),
        shiftType: t,
        startTime: t === "Morning" ? "06:00" : t === "Afternoon" ? "14:00" : "22:00",
        endTime: t === "Morning" ? "14:00" : t === "Afternoon" ? "22:00" : "06:00",
        workers: workers[(di + ti) % workers.length],
      });
    });
  });
  return shifts;
}
