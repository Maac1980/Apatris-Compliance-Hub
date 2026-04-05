import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Send, X, ChevronRight } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Thread { id: string; participant_names: any; last_message: string | null; last_message_at: string; }
interface Message { id: string; sender_name: string; sender_id: string; message: string; read_at: string | null; created_at: string; }

export default function Messaging() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [newMsg, setNewMsg] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newTo, setNewTo] = useState("");
  const [newToName, setNewToName] = useState("");
  const [newText, setNewText] = useState("");

  const { data: threadsData } = useQuery({
    queryKey: ["msg-threads"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/messages/threads`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ threads: Thread[] }>;
    },
  });

  const { data: unread } = useQuery({
    queryKey: ["msg-unread"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/messages/unread`, { headers: authHeaders() });
      if (!res.ok) return { unread: 0 };
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: msgData } = useQuery({
    queryKey: ["msg-thread", selectedThread],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/messages/thread/${selectedThread}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ messages: Message[] }>;
    },
    enabled: !!selectedThread,
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/messages/send`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { setNewMsg(""); setNewText(""); setShowNew(false); queryClient.invalidateQueries({ queryKey: ["msg-threads", "msg-thread", "msg-unread"] }); },
  });

  const threads = threadsData?.threads ?? [];
  const messages = msgData?.messages ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <MessageSquare className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Messages</h1>
          {(unread?.unread ?? 0) > 0 && <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">{unread.unread}</span>}
        </div>
        <p className="text-gray-400">Encrypted in-app messaging — worker and coordinator communication</p>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914]">
          <Send className="w-4 h-4" />New Message
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Thread list */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-white mb-2">Conversations</h3>
          {threads.length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">No conversations yet</p>
          ) : threads.map(t => {
            const names = typeof t.participant_names === "string" ? JSON.parse(t.participant_names) : (t.participant_names || []);
            return (
              <button key={t.id} onClick={() => setSelectedThread(t.id)}
                className={`w-full text-left bg-slate-900 border rounded-xl p-3 transition-colors ${selectedThread === t.id ? "border-[#C41E18]/30 bg-[#C41E18]/5" : "border-slate-700 hover:bg-slate-800/60"}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-white truncate">{names.join(", ")}</p>
                  <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                </div>
                {t.last_message && <p className="text-xs text-slate-400 truncate">{t.last_message}</p>}
                <p className="text-[9px] text-slate-600 font-mono mt-1">{new Date(t.last_message_at).toLocaleString("en-GB")}</p>
              </button>
            );
          })}
        </div>

        {/* Chat view */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col" style={{ minHeight: 400 }}>
          {!selectedThread ? (
            <div className="flex-1 flex items-center justify-center text-slate-500"><p className="text-sm">Select a conversation</p></div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.map(m => (
                  <div key={m.id} className={`max-w-[80%] ${m.sender_name === "You" ? "ml-auto" : ""}`}>
                    <div className={`rounded-2xl px-3 py-2 ${m.sender_id === (window as any).__user ? "bg-[#C41E18] text-white" : "bg-slate-800 text-white"}`}>
                      <p className="text-[10px] font-bold opacity-60 mb-0.5">{m.sender_name}</p>
                      <p className="text-xs">{m.message}</p>
                    </div>
                    <p className="text-[8px] text-slate-600 font-mono mt-0.5">{new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-700 p-3 flex gap-2">
                <input value={newMsg} onChange={e => setNewMsg(e.target.value)} placeholder="Type a message..."
                  onKeyDown={e => { if (e.key === "Enter" && newMsg.trim()) { const thread = threads.find(t => t.id === selectedThread); const names = typeof thread?.participant_names === "string" ? JSON.parse(thread.participant_names) : (thread?.participant_names || []); sendMutation.mutate({ receiverId: names[1] || "unknown", message: newMsg }); } }}
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
                <button onClick={() => { if (newMsg.trim()) { const thread = threads.find(t => t.id === selectedThread); const names = typeof thread?.participant_names === "string" ? JSON.parse(thread.participant_names) : (thread?.participant_names || []); sendMutation.mutate({ receiverId: names[1] || "unknown", message: newMsg }); } }}
                  className="px-3 py-2 bg-[#C41E18] text-white rounded-lg"><Send className="w-4 h-4" /></button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New message dialog */}
      {showNew && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50" onClick={() => setShowNew(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">New Message</h3>
            <input placeholder="Recipient email or name" value={newTo} onChange={e => setNewTo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 mb-3 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
            <textarea placeholder="Message" value={newText} onChange={e => setNewText(e.target.value)} rows={4}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 resize-none mb-3 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-bold">Cancel</button>
              <button onClick={() => sendMutation.mutate({ receiverId: newTo, receiverName: newToName || newTo, message: newText })} disabled={!newTo || !newText}
                className="flex-1 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
