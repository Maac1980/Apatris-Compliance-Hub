import { useState } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function RecruitmentShare() {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const formUrl = `${origin}/api/public/apply/form`;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-[#C41E18]" />
        <span className="text-xs font-bold text-white">Recruitment Link</span>
        <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">PUBLIC</span>
      </div>
      <div className="flex items-center gap-1.5 bg-white/[0.03] rounded-lg p-1.5 mb-2">
        <code className="text-[8px] text-white/40 flex-1 truncate">{formUrl}</code>
        <button onClick={() => copy(formUrl)}
          className={cn("px-2 py-1 rounded text-[8px] font-bold shrink-0 active:scale-95", copied ? "bg-emerald-500/20 text-emerald-400" : "bg-[#C41E18] text-white")}>
          {copied ? "✓" : "Copy"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button onClick={() => copy(`🔧 Hiring! Apply: ${formUrl}`)} className="py-1.5 rounded-lg bg-blue-600/10 text-blue-400 text-[8px] font-bold active:scale-95">Facebook</button>
        <button onClick={() => copy(`Hiring! Apply: ${formUrl}`)} className="py-1.5 rounded-lg bg-emerald-600/10 text-emerald-400 text-[8px] font-bold active:scale-95">WhatsApp</button>
        <button onClick={() => window.open(formUrl, "_blank")} className="py-1.5 rounded-lg bg-white/[0.04] text-white/40 text-[8px] font-bold active:scale-95">Preview</button>
      </div>
    </div>
  );
}
