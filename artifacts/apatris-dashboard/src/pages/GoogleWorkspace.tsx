import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Settings, CheckCircle2, X, Link, Calendar, Mail, HardDrive, Video, Plus } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Status { configured: boolean; connected: boolean; email: string | null; connectedAt: string | null; }
interface CalEvent { id: string; summary: string; start: { dateTime?: string; date?: string }; htmlLink: string; hangoutLink?: string; }

export default function GoogleWorkspace() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showEvent, setShowEvent] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: status } = useQuery({
    queryKey: ["google-status"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/google/status`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Status>;
    },
  });

  const { data: eventsData } = useQuery({
    queryKey: ["google-events"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/google/calendar/events`, { headers: authHeaders() });
      if (!res.ok) return { events: [] };
      return res.json() as Promise<{ events: CalEvent[] }>;
    },
    enabled: status?.connected === true,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/google/auth`, { headers: authHeaders() });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => { window.open(data.url, "_blank", "width=500,height=700"); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const createEventMutation = useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/google/calendar/event`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ description: `Event created${data.meetLink ? " with Meet link" : ""}` });
      queryClient.invalidateQueries({ queryKey: ["google-events"] });
      setShowEvent(false); setForm({});
    },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const events = eventsData?.events ?? [];

  const services = [
    { name: "Gmail", icon: Mail, desc: "Send compliance alerts, payslips, contracts", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
    { name: "Calendar", icon: Calendar, desc: "Schedule interviews, renewals, site visits", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    { name: "Drive", icon: HardDrive, desc: "Store contracts, payslips, permits per worker", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
    { name: "Meet", icon: Video, desc: "Generate meeting links for CRM interviews", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  ];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Google Workspace</h1>
        </div>
        <p className="text-gray-400">Connect Gmail, Calendar, Drive, and Meet</p>
      </div>

      {/* Connection status */}
      <div className={`rounded-xl border p-6 mb-6 ${status?.connected ? "bg-emerald-500/10 border-emerald-500/20" : "bg-slate-800 border-slate-700"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {status?.connected ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <Link className="w-6 h-6 text-slate-400" />}
            <div>
              <p className="text-sm font-bold text-white">{status?.connected ? "Connected" : "Not Connected"}</p>
              {status?.email && <p className="text-xs text-slate-400">{status.email}</p>}
              {status?.connectedAt && <p className="text-[10px] text-slate-500 font-mono">Since {new Date(status.connectedAt).toLocaleDateString("en-GB")}</p>}
            </div>
          </div>
          <button onClick={() => connectMutation.mutate()}
            className={`px-4 py-2 rounded-lg text-sm font-bold ${status?.connected ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-[#C41E18] text-white hover:bg-[#a51914]"}`}>
            {status?.connected ? "Reconnect" : "Connect Google"}
          </button>
        </div>
      </div>

      {/* Services grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {services.map(s => (
          <div key={s.name} className={`rounded-xl border p-4 ${s.bg}`}>
            <s.icon className={`w-6 h-6 ${s.color} mb-2`} />
            <p className="text-sm font-bold text-white">{s.name}</p>
            <p className="text-[10px] text-slate-400 mt-1">{s.desc}</p>
            <span className={`inline-block mt-2 text-[9px] font-bold uppercase ${status?.connected ? "text-emerald-400" : "text-slate-500"}`}>
              {status?.connected ? "Active" : "Inactive"}
            </span>
          </div>
        ))}
      </div>

      {/* Calendar events */}
      {status?.connected && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-400" />Upcoming Events</h3>
            <button onClick={() => { setShowEvent(true); setForm({}); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold hover:bg-blue-600/30">
              <Plus className="w-3 h-3" />New Event
            </button>
          </div>
          {events.length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">No upcoming events</p>
          ) : (
            <div className="space-y-2 mb-6">
              {events.slice(0, 10).map(e => (
                <a key={e.id} href={e.htmlLink} target="_blank" rel="noopener"
                  className="block bg-slate-900 border border-slate-700 rounded-xl p-3 hover:bg-slate-800/60 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">{e.summary}</p>
                    {e.hangoutLink && <Video className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    {e.start?.dateTime ? new Date(e.start.dateTime).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : e.start?.date || "—"}
                  </p>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create event dialog */}
      {showEvent && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowEvent(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">New Calendar Event</h3>
            <div className="space-y-3">
              <input placeholder="Event title" value={form.summary || ""} onChange={e => setForm({ ...form, summary: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <input placeholder="Description" value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <div className="grid grid-cols-2 gap-3">
                <input type="datetime-local" value={form.start || ""} onChange={e => setForm({ ...form, start: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
                <input type="datetime-local" value={form.end || ""} onChange={e => setForm({ ...form, end: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              </div>
              <input placeholder="Attendees (comma-separated emails)" value={form.attendees || ""} onChange={e => setForm({ ...form, attendees: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={form.addMeet === "true"} onChange={e => setForm({ ...form, addMeet: e.target.checked ? "true" : "" })}
                  className="rounded border-slate-600" />
                Add Google Meet link
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowEvent(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => createEventMutation.mutate({
                summary: form.summary, description: form.description,
                start: form.start ? new Date(form.start).toISOString() : undefined,
                end: form.end ? new Date(form.end).toISOString() : undefined,
                attendees: form.attendees ? form.attendees.split(",").map(e => e.trim()) : [],
                addMeet: form.addMeet === "true",
              })} disabled={!form.summary || !form.start || !form.end}
                className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
