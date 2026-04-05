import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Languages, Play } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";


interface Lang { code: string; name: string; flag: string; engine: string; }

export default function TranslationEngine() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("pl");
  const [result, setResult] = useState("");

  const { data: langData } = useQuery({
    queryKey: ["translate-languages"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/translate/languages`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ languages: Lang[] }>;
    },
  });

  const translateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/translate`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ text, sourceLang, targetLang }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => { setResult(data.translated); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const languages = langData?.languages ?? [];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Languages className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Translation Engine</h1>
        </div>
        <p className="text-gray-400">DeepL + Claude AI — 7 languages for all worker communications</p>
      </div>

      {/* Supported languages */}
      <div className="flex flex-wrap gap-2 mb-6">
        {languages.map(l => (
          <div key={l.code} className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg">
            <span className="text-lg">{l.flag}</span>
            <div>
              <p className="text-xs font-bold text-white">{l.name}</p>
              <p className="text-[9px] text-slate-500 font-mono">{l.engine}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Translation form */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-6">
        <div className="flex gap-3 mb-3">
          <select value={sourceLang} onChange={e => setSourceLang(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
            {languages.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
          </select>
          <span className="text-slate-500 self-center">→</span>
          <select value={targetLang} onChange={e => setTargetLang(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
            {languages.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
          </select>
          <button onClick={() => translateMutation.mutate()} disabled={!text || translateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold hover:bg-[#a51914] disabled:opacity-50">
            {translateMutation.isPending ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Play className="w-4 h-4" />}
            Translate
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={6} placeholder="Enter text to translate..."
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
          <textarea value={result} readOnly rows={6} placeholder="Translation will appear here..."
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-emerald-400 placeholder:text-slate-600 resize-none" />
        </div>
      </div>

      {/* Worker language preferences info */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">Auto-Translation Features</h3>
        <div className="space-y-2 text-xs text-slate-400">
          <p>• WhatsApp alerts automatically sent in worker's preferred language</p>
          <p>• Payslip emails translated before sending</p>
          <p>• Contract generation supports all 7 languages</p>
          <p>• Notifications arrive in the worker's language</p>
          <p>• Worker language detected from nationality in profile</p>
          <p>• All translations cached to avoid duplicate API calls</p>
        </div>
      </div>
    </div>
  );
}
