import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, ChevronLeft, ChevronRight, Filter } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}
const BASE = import.meta.env.BASE_URL;

interface LogEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  details: string;
  level: "info" | "warning" | "error";
}

const ACTION_TYPES = ["All", "LOGIN", "CREATE", "UPDATE", "DELETE", "EXPORT", "APPROVE", "REJECT"];
const PAGE_SIZE = 20;

export default function SystemLogs() {
  const { toast } = useToast();
  const [actionFilter, setActionFilter] = useState("All");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ logs: LogEntry[]; total: number }>({
    queryKey: ["system-logs", actionFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (actionFilter !== "All") params.set("action", actionFilter);
      const res = await fetch(`${BASE}api/audit-log?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch logs");
      const json = await res.json();
      if (Array.isArray(json)) return { logs: json, total: json.length };
      return json;
    },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const levelColor = (level: string) => {
    switch (level) {
      case "error": return "text-red-400";
      case "warning": return "text-yellow-400";
      default: return "text-muted-foreground";
    }
  };

  const actionBadge = (action: string) => {
    const colors: Record<string, string> = {
      LOGIN: "bg-blue-900/50 text-blue-300 border-blue-600/50",
      CREATE: "bg-green-900/50 text-green-300 border-green-600/50",
      UPDATE: "bg-yellow-900/50 text-yellow-300 border-yellow-500/50",
      DELETE: "bg-red-900/50 text-red-300 border-red-600/50",
      EXPORT: "bg-purple-900/50 text-purple-300 border-purple-600/50",
      APPROVE: "bg-green-900/50 text-green-300 border-green-600/50",
      REJECT: "bg-red-900/50 text-red-300 border-red-600/50",
    };
    return colors[action] ?? "bg-card text-muted-foreground border-border";
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" /> System Logs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Activity audit trail and system event log</p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {ACTION_TYPES.map((a) => (
            <button
              key={a}
              onClick={() => { setActionFilter(a); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors ${
                actionFilter === a
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No log entries found.</div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Timestamp</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Action</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Actor</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border hover:bg-card/50 transition">
                    <td className={`px-4 py-3 font-mono text-xs ${levelColor(log.level)}`}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase border ${actionBadge(log.action)}`}>{log.action}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{log.actor}</td>
                    <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{total} total entries</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg bg-card border border-border text-muted-foreground disabled:opacity-30 hover:text-foreground transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-foreground font-mono">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-lg bg-card border border-border text-muted-foreground disabled:opacity-30 hover:text-foreground transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
