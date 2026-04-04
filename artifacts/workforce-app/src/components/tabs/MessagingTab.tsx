import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";

interface Thread { id: string; participant_names: any; last_message: string | null; last_message_at: string; }
interface Message { id: string; sender_name: string; sender_id: string; message: string; created_at: string; }

export function MessagingTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const { data: threadsData } = useQuery({
    queryKey: ["msg-threads"],
    queryFn: async () => { const r = await fetch(`${API}api/messages/threads`, { headers: authHeaders() }); if (!r.ok) return { threads: [] }; return r.json() as Promise<{ threads: Thread[] }>; },
  });

  const { data: msgData } = useQuery({
    queryKey: ["msg-thread", threadId],
    queryFn: async () => { const r = await fetch(`${API}api/messages/thread/${threadId}`, { headers: authHeaders() }); if (!r.ok) return { messages: [] }; return r.json() as Promise<{ messages: Message[] }>; },
    enabled: !!threadId, refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => { const r = await fetch(`${API}api/messages/send`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }); if (!r.ok) throw new Error("Failed"); return r.json(); },
    onSuccess: () => { setMsg(""); queryClient.invalidateQueries({ queryKey: ["msg-threads", "msg-thread"] }); },
  });

  const threads = threadsData?.threads ?? [];
  const messages = msgData?.messages ?? [];

  if (threadId) {
    const thread = threads.find(t => t.id === threadId);
    const names = typeof thread?.participant_names === "string" ? JSON.parse(thread.participant_names) : (thread?.participant_names || []);
    return (
      <div className="flex flex-col h-full bg-[#0c0c0e]">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <button onClick={() => setThreadId(null)} className="p-1.5 rounded-lg bg-white/5"><X className="w-4 h-4 text-white/50" /></button>
          <p className="text-sm font-bold text-white truncate">{names.join(", ")}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-2">
          {messages.map(m => (
            <div key={m.id} className="max-w-[85%]">
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl px-3 py-2">
                <p className="text-[9px] font-bold text-white/30 mb-0.5">{m.sender_name}</p>
                <p className="text-xs text-white">{m.message}</p>
              </div>
              <p className="text-[8px] text-white/20 font-mono mt-0.5">{new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4 pt-2 flex gap-2">
          <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Message..."
            onKeyDown={e => { if (e.key === "Enter" && msg.trim()) sendMutation.mutate({ receiverId: names[1] || "unknown", message: msg }); }}
            className="flex-1 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none" />
          <button onClick={() => { if (msg.trim()) sendMutation.mutate({ receiverId: names[1] || "unknown", message: msg }); }}
            className="p-2 bg-[#C41E18] rounded-xl active:scale-95"><Send className="w-4 h-4 text-white" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Messages</h2>
      </div>

      {threads.length === 0 ? (
        <div className="text-center py-16 text-white/30"><MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm font-semibold">No messages</p></div>
      ) : (
        <div className="space-y-2">
          {threads.map(t => {
            const names = typeof t.participant_names === "string" ? JSON.parse(t.participant_names) : (t.participant_names || []);
            return (
              <button key={t.id} onClick={() => setThreadId(t.id)}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.98] text-left">
                <div className="w-10 h-10 rounded-full bg-[#C41E18]/20 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-4 h-4 text-[#C41E18]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{names.join(", ")}</p>
                  {t.last_message && <p className="text-[10px] text-white/40 truncate">{t.last_message}</p>}
                </div>
                <ChevronRight className="w-4 h-4 text-white/20" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
