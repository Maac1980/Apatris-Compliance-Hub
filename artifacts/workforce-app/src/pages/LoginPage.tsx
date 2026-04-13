/**
 * Login Page — clean email + password login.
 * Admin assigns roles — user just logs in.
 * Calls /api/auth/login (same as dashboard) + /api/auth/mobile-login (fallback for tier PIN).
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Role } from "@/types";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}api` : "/api";

// Map backend role strings to app Role type
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
      // Try email+password login (dashboard auth endpoint)
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.token) {
        const role = ROLE_MAP[data.user?.role] ?? ROLE_MAP[data.role] ?? "Coordinator";
        const name = data.user?.name ?? data.name ?? email.split("@")[0];
        const jwt = data.token;
        login(role, name, jwt);
        setLocation("/dashboard");
        return;
      }

      // If email login fails, show error
      setError(data.error || "Invalid email or password");
    } catch {
      setError("Connection failed. Check your network.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0c0c0e]">
      {/* Top glow */}
      <div className="absolute inset-x-0 top-0 h-48 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(196,30,24,0.12) 0%, transparent 100%)" }} />

      <div className="relative z-10 flex flex-col flex-1 justify-center px-6 max-w-sm mx-auto w-full">

        {/* Logo */}
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 flex items-center justify-center mb-4 shadow-xl">
            <span className="text-[#C41E18] font-black text-3xl leading-none" style={{ fontFamily: "Impact, sans-serif" }}>A</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-[0.15em]">APATRIS</h1>
          <p className="text-[10px] text-white/20 tracking-[0.2em] uppercase mt-1">Workforce Management</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-semibold text-white/30 tracking-[0.12em] uppercase block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(""); }}
              placeholder="your@email.com"
              autoComplete="email"
              autoFocus
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10 transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-white/30 tracking-[0.12em] uppercase block mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="Enter password"
                autoComplete="current-password"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-white/20 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10 transition-all"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={!email.trim() || !password.trim() || loading}
            className={cn(
              "w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all",
              !email.trim() || !password.trim() || loading
                ? "bg-white/[0.05] text-white/20 cursor-not-allowed"
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

        <p className="text-center text-[10px] text-white/15 mt-6">
          Contact your admin for login credentials
        </p>

        {/* Footer */}
        <p className="text-center text-[9px] text-white/8 mt-8 tracking-widest uppercase">
          Powered by Apatris
        </p>
      </div>
    </div>
  );
}
