import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Plus, Video, CheckCircle2, Link } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface CalEvent { id: string; summary: string; start: { dateTime?: string; date?: string }; htmlLink: string; hangoutLink?: string; }

export function GoogleCalendarTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: status } = useQuery({
    queryKey: ["google-status"],
    queryFn: async () => {
      const res = await fetch(`${API}api/google/status`, { headers: authHeaders() });
      if (!res.ok) return { connected: false };
      return res.json();
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["google-events"],
    queryFn: async () => {
      const res = await fetch(`${API}api/google/calendar/events`, { headers: authHeaders() });
      if (!res.ok) return { events: [] };
      return res.json() as Promise<{ events: CalEvent[] }>;
    },
    enabled: status?.connected === true,
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = await fetch(`${API}api/google/calendar/event`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ description: `Event created${data.meetLink ? " + Meet" : ""}` });
      queryClient.invalidateQueries({ queryKey: ["google-events"] });
      setShowForm(false); setForm({});
    },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const events = data?.events ?? [];

  if (!status?.connected) {
    return (
      <div className="p-4 min-h-full flex flex-col items-center justify-center pb-24 bg-[#0c0c0e]">
        <Link className="w-12 h-12 text-slate-600 mb-3" />
        <p className="text-sm font-bold text-white mb-1">Google Not Connected</p>
        <p className="text-xs text-white/40 text-center">Connect Google Workspace in dashboard settings.</p>
      </div>
    );
  }

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[#C41E18]" />
          <h2 className="text-lg font-bold text-white">Calendar</h2>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-[#C41E18] text-white rounded-xl text-xs font-bold active:scale-95">
          <Plus className="w-3 h-3 inline mr-1" />Event
        </button>
      </div>

      {showForm && (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 mb-4">
          <input placeholder="Event title" value={form.summary || ""} onChange={e => setForm({ ...form, summary: e.target.value })}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white placeholder:text-white/20 mb-2 focus:outline-none" />
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input type="datetime-local" value={form.start || ""} onChange={e => setForm({ ...form, start: e.target.value })}
              className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white focus:outline-none" />
            <input type="datetime-local" value={form.end || ""} onChange={e => setForm({ ...form, end: e.target.value })}
              className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white focus:outline-none" />
          </div>
          <button onClick={() => createMutation.mutate({
            summary: form.summary, start: form.start ? new Date(form.start).toISOString() : undefined,
            end: form.end ? new Date(form.end).toISOString() : undefined, addMeet: true,
          })} disabled={!form.summary || !form.start || !form.end}
            className="w-full py-2.5 bg-[#C41E18] text-white rounded-xl text-sm font-bold active:scale-[0.98] disabled:opacity-40">
            Create + Meet Link
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-white/30"><Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No upcoming events</p></div>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 15).map(e => (
            <a key={e.id} href={e.htmlLink} target="_blank" rel="noopener"
              className="block bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 active:scale-[0.98] transition-transform">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold text-white truncate">{e.summary}</p>
                {e.hangoutLink && <Video className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
              </div>
              <p className="text-[10px] text-white/40 font-mono">
                {e.start?.dateTime ? new Date(e.start.dateTime).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : e.start?.date || "—"}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
