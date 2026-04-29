import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// wf_lang is workforce-app's localStorage convention for language preference. Do not rename — multiple files reference this key directly.

export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;

  const switchLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("wf_lang", lang);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-1">
        <button
          onClick={() => switchLanguage("en")}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
            currentLang === "en"
              ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/25"
              : "text-white/40 hover:text-white"
          )}
          title="English"
        >
          <span className="text-xs leading-none">🇬🇧</span>
          <span>EN</span>
        </button>
        <button
          onClick={() => switchLanguage("pl")}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
            currentLang === "pl"
              ? "bg-red-500/15 text-red-400 border border-red-500/25"
              : "text-white/40 hover:text-white"
          )}
          title="Polski"
        >
          <span className="text-xs leading-none">🇵🇱</span>
          <span>PL</span>
        </button>
      </div>
    );
  }

  return (
    <div className="premium-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2.5">
        <Globe className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{t("profile.language")}</span>
      </div>
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={() => switchLanguage("en")}
          className={cn(
            "flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97]",
            currentLang === "en"
              ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 glow-indigo"
              : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.06]"
          )}
        >
          🇬🇧 {t("profile.english")}
        </button>
        <button
          onClick={() => switchLanguage("pl")}
          className={cn(
            "flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97]",
            currentLang === "pl"
              ? "bg-red-500/15 text-red-400 border border-red-500/25 glow-red"
              : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.06]"
          )}
        >
          🇵🇱 {t("profile.polish")}
        </button>
      </div>
    </div>
  );
}
