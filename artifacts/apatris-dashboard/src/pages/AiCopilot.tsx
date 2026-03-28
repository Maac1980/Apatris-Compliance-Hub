import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Send, Loader2, Sparkles, User } from "lucide-react";

const API = "/api";
function authHeaders() {
  const token = localStorage.getItem("apatris_jwt");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface Message { role: "user" | "assistant"; content: string; source?: string }

export default function AiCopilot() {
  const { t } = useTranslation();

  const QUICK_QUESTIONS = [
    t("aiCopilot.q1"),
    t("aiCopilot.q2"),
    t("aiCopilot.q3"),
    t("aiCopilot.q4"),
    t("aiCopilot.q5"),
  ];

  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: t("aiCopilot.welcome"), source: "system" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/analytics/copilot`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.answer ?? data.error ?? "No response", source: data.source }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: t("aiCopilot.error") }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="p-6 pb-3">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-red-500" /> {t("aiCopilot.title")}
        </h1>
        <p className="text-sm text-slate-400 mt-1">{t("aiCopilot.subtitle")}</p>
      </div>

      {/* Quick questions */}
      {messages.length <= 1 && (
        <div className="px-6 pb-4 flex flex-wrap gap-2">
          {QUICK_QUESTIONS.map(q => (
            <button key={q} onClick={() => ask(q)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 border border-slate-700/50 transition-colors">
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-red-900/40 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-red-400" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-red-900/40 text-white rounded-br-sm"
                : "bg-slate-800/80 text-slate-200 border border-slate-700/50 rounded-bl-sm"
            }`}>
              {msg.content}
              {msg.source && msg.role === "assistant" && (
                <div className="text-[9px] text-slate-500 mt-2 uppercase tracking-wider">
                  {msg.source === "ai" ? t("aiCopilot.poweredBy") : msg.source === "rules" ? t("aiCopilot.rulesBased") : ""}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-slate-300" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-900/40 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-red-400" />
            </div>
            <div className="bg-slate-800/80 rounded-2xl px-4 py-3 border border-slate-700/50 rounded-bl-sm">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-700/50">
        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={t("aiCopilot.placeholder")}
            disabled={loading}
            className="flex-1 bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-red-500/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-4 py-3 rounded-xl bg-red-900/60 text-red-400 font-bold disabled:opacity-30 hover:bg-red-900/80 transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
