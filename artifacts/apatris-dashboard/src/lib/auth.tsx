import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

interface User {
  id?: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, pass: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  sessionExpired: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [, setLocation] = useLocation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback((expired = false) => {
    setUser(null);
    localStorage.removeItem("apatris_auth");
    if (expired) setSessionExpired(true);
    setLocation("/login");
  }, [setLocation]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => logout(true), SESSION_TIMEOUT_MS);
  }, [logout]);

  useEffect(() => {
    const stored = localStorage.getItem("apatris_auth");
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!user) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, resetTimer]);

  const login = async (email: string, pass: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: (data as any).error || "Invalid credentials" };
      }

      const data: User = await res.json();
      setUser(data);
      setSessionExpired(false);
      localStorage.setItem("apatris_auth", JSON.stringify(data));
      return { ok: true };
    } catch {
      return { ok: false, error: "Connection error — please try again" };
    }
  };

  const logoutPublic = useCallback(() => logout(false), [logout]);

  return (
    <AuthContext.Provider value={{ user, login, logout: logoutPublic, isAuthenticated: !!user, sessionExpired }}>
      {sessionExpired && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Session Expired</h2>
            <p className="text-gray-400 text-sm mb-6">Your session timed out after 30 minutes of inactivity. Please log in again.</p>
            <button
              onClick={() => setSessionExpired(false)}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors text-sm uppercase tracking-wider"
            >
              Log In Again
            </button>
          </div>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
