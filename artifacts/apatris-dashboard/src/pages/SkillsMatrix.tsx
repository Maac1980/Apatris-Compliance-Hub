import { useState, useEffect } from "react";
import { Award, Loader2, Filter, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

interface WorkerSkill {
  workerId: string;
  workerName: string;
  role: string;
  skills: Record<string, number>; // category -> rating 1-5
}

const SKILL_CATEGORIES = ["TIG Welding", "MIG Welding", "ARC Welding", "Pipe Fitting", "Blueprint Reading", "Safety Compliance", "Polish Language", "Forklift Operation"];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= rating ? "text-yellow-400 fill-yellow-400" : "text-slate-700"}`}
        />
      ))}
    </div>
  );
}

export default function SkillsMatrix() {
  const { toast } = useToast();
  const [data, setData] = useState<WorkerSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("All");

  useEffect(() => {
    fetch(`${API}/skills/matrix`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setData(d.workers ?? []))
      .catch(() => {
        setData(demoSkills());
        toast({ title: "Info", description: "Loaded demo skills data" });
      })
      .finally(() => setLoading(false));
  }, []);

  const visibleCategories = filterCategory === "All"
    ? SKILL_CATEGORIES
    : SKILL_CATEGORIES.filter(c => c === filterCategory);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 min-h-screen overflow-y-auto pb-24 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Award className="w-6 h-6 text-red-500" /> Skills Matrix
          </h1>
          <p className="text-sm text-slate-400 mt-1">Worker competencies and skill ratings overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none"
          >
            <option>All</option>
            {SKILL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="p-3 text-left text-xs text-slate-400 font-mono uppercase tracking-wide sticky left-0 bg-slate-800/90 z-10">Worker</th>
              <th className="p-3 text-left text-xs text-slate-400 font-mono uppercase tracking-wide">Role</th>
              {visibleCategories.map(c => (
                <th key={c} className="p-3 text-center text-xs text-slate-400 font-mono uppercase tracking-wide whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(w => (
              <tr key={w.workerId} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                <td className="p-3 sticky left-0 bg-slate-800/90 z-10">
                  <span className="text-sm text-white font-medium">{w.workerName}</span>
                </td>
                <td className="p-3">
                  <span className="text-xs text-slate-400 font-mono">{w.role}</span>
                </td>
                {visibleCategories.map(c => (
                  <td key={c} className="p-3 text-center">
                    {w.skills[c] !== undefined ? (
                      <div className="flex justify-center">
                        <StarRating rating={w.skills[c]} />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">--</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6 text-xs text-slate-400">
        <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> 5 = Expert</span>
        <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> 3 = Competent</span>
        <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400 fill-yellow-400" /> 1 = Beginner</span>
        <span>-- = Not assessed</span>
      </div>
    </div>
  );
}

function demoSkills(): WorkerSkill[] {
  return [
    { workerId: "w1", workerName: "Oleksandr Kovalenko", role: "TIG Welder", skills: { "TIG Welding": 5, "MIG Welding": 3, "ARC Welding": 4, "Pipe Fitting": 4, "Blueprint Reading": 3, "Safety Compliance": 5, "Polish Language": 2, "Forklift Operation": 1 } },
    { workerId: "w2", workerName: "Rajesh Sharma", role: "MIG Welder", skills: { "TIG Welding": 2, "MIG Welding": 5, "ARC Welding": 3, "Pipe Fitting": 2, "Blueprint Reading": 2, "Safety Compliance": 4, "Polish Language": 1 } },
    { workerId: "w3", workerName: "Giorgi Beridze", role: "Fitter", skills: { "TIG Welding": 1, "MIG Welding": 2, "Pipe Fitting": 5, "Blueprint Reading": 5, "Safety Compliance": 4, "Polish Language": 3, "Forklift Operation": 4 } },
    { workerId: "w4", workerName: "Mohammad Rahman", role: "ARC Welder", skills: { "ARC Welding": 5, "MIG Welding": 3, "TIG Welding": 2, "Pipe Fitting": 3, "Blueprint Reading": 2, "Safety Compliance": 3, "Polish Language": 1 } },
    { workerId: "w5", workerName: "Dmytro Bondarenko", role: "Foreman", skills: { "TIG Welding": 4, "MIG Welding": 4, "ARC Welding": 4, "Pipe Fitting": 3, "Blueprint Reading": 5, "Safety Compliance": 5, "Polish Language": 4, "Forklift Operation": 3 } },
    { workerId: "w6", workerName: "Andriy Petrenko", role: "TIG Welder", skills: { "TIG Welding": 4, "MIG Welding": 2, "ARC Welding": 3, "Pipe Fitting": 3, "Blueprint Reading": 3, "Safety Compliance": 4, "Polish Language": 3 } },
    { workerId: "w7", workerName: "Suresh Kumar", role: "Helper", skills: { "Safety Compliance": 3, "Polish Language": 1, "Forklift Operation": 2 } },
    { workerId: "w8", workerName: "Vitalii Moroz", role: "MIG Welder", skills: { "TIG Welding": 3, "MIG Welding": 5, "ARC Welding": 4, "Pipe Fitting": 3, "Blueprint Reading": 4, "Safety Compliance": 5, "Polish Language": 5, "Forklift Operation": 2 } },
  ];
}
