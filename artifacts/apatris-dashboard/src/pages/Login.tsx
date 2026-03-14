import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { Shield, ChevronRight } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const success = login(email, password);
    if (success) {
      setLocation("/");
    } else {
      setError(t("login.invalidCredentials"));
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <img
          src={`${import.meta.env.BASE_URL}images/brand-bg.png`}
          alt="Apatris Brand"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-background" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/20" />
        <div className="absolute bottom-10 left-10 right-16">
          <p className="text-white/30 font-mono text-xs tracking-widest uppercase">
            APATRIS · SPECIALIST WELDING · EST. WARSAW
          </p>
        </div>
      </div>

      <div className="w-full lg:w-[420px] flex flex-col justify-center px-10 py-12 relative bg-background border-l border-white/5">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative z-10">
          <div className="mb-10 text-center">
            <div className="w-16 h-1 bg-primary mx-auto mb-6 rounded-full" />
            <h1 className="text-4xl font-bold text-white tracking-[0.2em] uppercase mb-1">
              APATRIS
            </h1>
            <p className="text-primary font-bold tracking-[0.2em] text-xs uppercase mb-4">
              OUTSOURCING · CERTIFIED WELDERS
            </p>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-primary/30" />
              <p className="text-muted-foreground font-mono text-xs tracking-widest">{t("login.terminal")}</p>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-primary/30" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded bg-destructive/10 border border-destructive/30 text-destructive text-sm font-mono text-center">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground tracking-widest uppercase">
                {t("login.operatorId")}
              </label>
              <input
                type="email"
                required
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-white/20"
                placeholder="admin@apatris.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground tracking-widest uppercase">
                {t("login.passcode")}
              </label>
              <input
                type="password"
                required
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-white/20"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="w-full relative group overflow-hidden rounded-lg bg-primary/10 border border-primary text-primary px-4 py-3 font-bold uppercase tracking-widest transition-all hover:bg-primary hover:text-black mt-2"
            >
              <div className="flex items-center justify-center gap-2">
                <Shield className="w-4 h-4" />
                <span>{t("login.submit")}</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </form>

          <div className="mt-6 p-3 rounded-lg border border-white/5 bg-white/3 text-center space-y-1">
            <p className="text-xs font-mono text-muted-foreground/70">{t("login.defaultCredentials")}</p>
            <p className="text-xs font-mono text-primary/80">admin@apatris.com &nbsp;/&nbsp; apatris2024</p>
          </div>

          <p className="text-center text-xs font-mono text-muted-foreground mt-4 opacity-40">
            {t("login.unauthorized")}
          </p>
        </div>
      </div>
    </div>
  );
}
