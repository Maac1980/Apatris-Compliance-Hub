/**
 * Login Page — clean email + password login with Apatris branding.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Role } from "@/types";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}api` : "/api";

const ROLE_MAP: Record<string, Role> = {
  Admin: "Executive",
  Executive: "Executive",
  LegalHead: "LegalHead",
  TechOps: "TechOps",
  Coordinator: "Coordinator",
  Professional: "Professional",
};

export function LoginPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() }),
      });
      const data = await res.json();

      if (res.ok && (data.jwt || data.token)) {
        const jwt = data.jwt || data.token;
        const role = ROLE_MAP[data.role] ?? ROLE_MAP[data.user?.role] ?? "Coordinator";
        const name = data.name ?? data.user?.name ?? email.split("@")[0];
        // Store token for API calls
        localStorage.setItem("apatris_token", jwt);
        localStorage.setItem("apatris_jwt", jwt);
        login(role, name, jwt);
        setLocation("/dashboard");
        return;
      }

      setError(data.error || "Invalid email or password");
    } catch {
      setError("Connection failed. Please check your network.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-screen">
      <div className="app-container">
        <div className="flex-1 flex flex-col justify-center px-6 bg-[#0c0c0e] relative overflow-hidden">
          {/* Top glow */}
          <div className="absolute inset-x-0 top-0 h-48 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(196,30,24,0.15) 0%, transparent 100%)" }} />

          <div className="relative z-10 max-w-xs mx-auto w-full">
            {/* Logo */}
            <div className="flex flex-col items-center text-center mb-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 flex items-center justify-center mb-5 shadow-2xl">
                <span className="text-[#C41E18] font-black text-4xl leading-none" style={{ fontFamily: "Impact, sans-serif" }}>A</span>
              </div>
              <h1 className="text-[28px] font-black text-white tracking-[0.15em]">APATRIS</h1>
              <p className="text-[10px] text-white/25 tracking-[0.2em] uppercase mt-1.5">Workforce Management</p>
            </div>

            {/* Login card */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 shadow-xl">
              {/* Red accent line */}
              <div className="h-[2px] bg-gradient-to-r from-transparent via-[#C41E18] to-transparent -mt-5 mb-5 -mx-5 rounded-t-2xl" />

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-white/30 tracking-[0.12em] uppercase block mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(""); }}
                    placeholder="your@email.com"
                    autoComplete="email"
                    autoFocus
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-[#C41E18]/50 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-white/30 tracking-[0.12em] uppercase block mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(""); }}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-white/20 focus:border-[#C41E18]/50 focus:outline-none transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    <p className="text-red-400 text-xs">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!email.trim() || !password.trim() || loading}
                  className={cn(
                    "w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all",
                    !email.trim() || !password.trim() || loading
                      ? "bg-white/[0.04] text-white/20 cursor-not-allowed"
                      : "bg-[#C41E18] hover:bg-[#a81914] text-white shadow-lg shadow-red-900/30 active:scale-[0.98]"
                  )}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signing in...
                    </span>
                  ) : "Sign In"}
                </button>
              </form>

              <p className="text-center text-[10px] text-white/15 mt-4">
                Contact your admin for login credentials
              </p>
            </div>

            {/* Footer */}
            <p className="text-center text-[9px] text-white/8 mt-8 tracking-widest uppercase">
              Powered by Apatris
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
