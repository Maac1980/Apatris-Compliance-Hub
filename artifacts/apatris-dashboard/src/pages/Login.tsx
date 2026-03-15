import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { Shield, Loader2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.ok) {
      setLocation("/");
    } else {
      setError(result.error || t("login.invalidCredentials"));
    }
  };

  return (
    <div className="h-screen w-full flex bg-background overflow-hidden">

      {/* ── Left: Brand image ───────────────────────────────── */}
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

      {/* ── Right: Login panel ──────────────────────────────── */}
      <div className="w-full lg:w-[460px] flex flex-col justify-center items-center h-full overflow-y-auto relative bg-background border-l border-white/5 px-8 py-10">

        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Card */}
        <div className="relative z-10 w-full max-w-sm">

          {/* Brand mark */}
          <div className="text-center mb-8">
            <div className="w-14 h-1 bg-red-600 mx-auto mb-6 rounded-full" />
            <h1 className="text-4xl font-bold text-white tracking-[0.2em] uppercase leading-none">
              APATRIS
            </h1>
            <p className="text-gray-400 text-sm tracking-wider uppercase mt-3 leading-snug">
              Precision Welding Outsourcing.&nbsp;Your vision, expertly welded.
            </p>
            <div className="flex items-center gap-3 mt-5">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
              <span className="text-gray-500 font-mono text-xs tracking-widest uppercase">
                {t("login.terminal")}
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
            </div>
          </div>

          {/* Form card */}
          <div className="bg-gray-900/80 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="space-y-5">

              {error && (
                <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-400 text-sm text-center">
                  {error}
                </div>
              )}

              {/* Operator ID */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-300 tracking-widest uppercase">
                  {t("login.operatorId")}
                </label>
                <input
                  type="email"
                  required
                  disabled={loading}
                  className="w-full bg-gray-800 border border-gray-500 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all placeholder:text-gray-500 disabled:opacity-50"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {/* Passcode */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-300 tracking-widest uppercase">
                  {t("login.passcode")}
                </label>
                <input
                  type="password"
                  required
                  disabled={loading}
                  className="w-full bg-gray-800 border border-gray-500 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all placeholder:text-gray-500 disabled:opacity-50"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-900/60 disabled:cursor-not-allowed transition-colors rounded-lg px-4 py-3 text-white font-bold uppercase tracking-widest text-sm mt-2 shadow-lg shadow-red-900/30"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>{t("login.submit")}</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs font-mono text-gray-600 mt-5">
            {t("login.unauthorized")}
          </p>
        </div>
      </div>
    </div>
  );
}
