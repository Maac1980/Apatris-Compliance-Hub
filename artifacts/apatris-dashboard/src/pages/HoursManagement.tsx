import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Clock, Loader2, CheckCircle2, XCircle, User, Calendar,
} from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}
const BASE = import.meta.env.BASE_URL;

interface HourEntry {
  id: string;
  workerName: string;
  workerId: string;
  date: string;
  hours: number;
  overtimeHours: number;
  status: "pending" | "approved" | "rejected";
  note?: string;
}

export default function HoursManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const { data: entries = [], isLoading } = useQuery<HourEntry[]>({
    queryKey: ["hours"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/hours`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch hours");
      return res.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const res = await fetch(`${BASE}api/hours/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["hours"] });
      toast({ title: "Updated", description: `Hours ${vars.status} successfully.` });
    },
    onError: () => toast({ title: "Error", description: "Failed to update status", variant: "destructive" }),
  });

  const filtered = filter === "all" ? entries : entries.filter((e) => e.status === filter);

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const totalOvertime = entries.reduce((s, e) => s + (e.overtimeHours || 0), 0);
  const pendingCount = entries.filter((e) => e.status === "pending").length;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-900/50 text-yellow-300 border border-yellow-500/50",
      approved: "bg-green-900/50 text-green-300 border border-green-600/50",
      rejected: "bg-red-900/50 text-red-300 border border-red-600/50",
    };
    return map[status] ?? "bg-card text-muted-foreground border border-border";
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" /> Hours Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Track and approve worker hour submissions</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Hours</p>
            <p className="text-2xl font-bold text-foreground mt-1">{totalHours.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Overtime Hours</p>
            <p className="text-2xl font-bold text-foreground mt-1">{totalOvertime.toLocaleString()}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending Approval</p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">{pendingCount}</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {(["all", "pending", "approved", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No hour entries found.</div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Worker</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Date</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Hours</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Overtime</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-border hover:bg-card/50 transition">
                    <td className="px-4 py-3 text-foreground flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /> {e.workerName}</td>
                    <td className="px-4 py-3 text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(e.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{e.hours}h</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.overtimeHours || 0}h</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono uppercase ${statusBadge(e.status)}`}>{e.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.status === "pending" && (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => updateStatus.mutate({ id: e.id, status: "approved" })}
                            className="p-1.5 rounded-lg bg-green-900/30 text-green-400 hover:bg-green-900/50 transition"
                            title="Approve"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateStatus.mutate({ id: e.id, status: "rejected" })}
                            className="p-1.5 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
