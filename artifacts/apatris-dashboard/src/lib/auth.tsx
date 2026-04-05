import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

// 8 hours — matches construction-site work patterns
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const STORAGE_KEY = "apatris_auth";
const TOKEN_KEY  = "apatris_jwt";
const REFRESH_KEY = "apatris_refresh";

interface User {
  id?: string;
  email: string;
  name: string;
  role: string;
  assignedSite?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, pass: string) => Promise<{ ok: boolean; error?: string; otpRequired?: boolean; session?: string }>;
  verifyOtp: (session: string, otp: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  isRestoring: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [, setLocation] = useLocation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback((expired = false) => {
    // Revoke server-side tokens (best-effort, don't block on failure)
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      fetch(`${import.meta.env.BASE_URL}api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        credentials: "include",
      }).catch(() => {});
    }
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    if (expired) setSessionExpired(true);
    setLocation("/login");
  }, [setLocation]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => logout(true), SESSION_TIMEOUT_MS);
  }, [logout]);

  // ── Restore session on mount ─────────────────────────────────────────────
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser  = localStorage.getItem(STORAGE_KEY);

    if (!storedToken && !storedUser) {
      setIsRestoring(false);
      return;
    }

    if (storedToken) {
      // Validate JWT with server — get fresh user payload
      // Send both cookie (via credentials) and Authorization header for backwards compatibility
      fetch(`${import.meta.env.BASE_URL}api/auth/verify`, {
        headers: { Authorization: `Bearer ${storedToken}` },
        credentials: "include",
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            const { jwt: newToken, ...userData } = data as any;
            setUser(userData as User);
            if (newToken) localStorage.setItem(TOKEN_KEY, newToken);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
          } else {
            // Token expired — try refresh before giving up
            const rt = localStorage.getItem(REFRESH_KEY);
            if (rt) {
              try {
                const refreshRes = await fetch(`${import.meta.env.BASE_URL}api/auth/refresh`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ refreshToken: rt }),
                });
                if (refreshRes.ok) {
                  const refreshData = await refreshRes.json();
                  const { jwt: newJwt, refreshToken: newRt, ...refreshUser } = refreshData as any;
                  setUser(refreshUser as User);
                  if (newJwt) localStorage.setItem(TOKEN_KEY, newJwt);
                  if (newRt) localStorage.setItem(REFRESH_KEY, newRt);
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(refreshUser));
                  return; // restored successfully via refresh
                }
              } catch { /* fall through to clear */ }
            }
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(REFRESH_KEY);
          }
        })
        .catch(() => {
          // Offline — restore from localStorage so app works without network
          if (storedUser) {
            try { setUser(JSON.parse(storedUser)); } catch { /* ignore */ }
          }
        })
        .finally(() => setIsRestoring(false));
    } else if (storedUser) {
      // Legacy session without JWT — restore directly
      try { setUser(JSON.parse(storedUser)); } catch { /* ignore */ }
      setIsRestoring(false);
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

  const login = async (email: string, pass: string): Promise<{ ok: boolean; error?: string; otpRequired?: boolean; session?: string }> => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password: pass }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: (data as any).error || "Invalid credentials" };
      }

      const data = await res.json();

      if (data.otpRequired) {
        return { ok: true, otpRequired: true, session: data.session };
      }

      const { jwt: token, refreshToken: rt, ...userData } = data as any;
      setUser(userData as User);
      setSessionExpired(false);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (rt) localStorage.setItem(REFRESH_KEY, rt);
      return { ok: true };
    } catch {
      return { ok: false, error: "Connection error — please try again" };
    }
  };

  const verifyOtp = async (session: string, otp: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ session, otp }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: (data as any).error || "Invalid code" };
      }

      const data = await res.json();
      const { jwt: token, refreshToken: rt, ...userData } = data as any;
      setUser(userData as User);
      setSessionExpired(false);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (rt) localStorage.setItem(REFRESH_KEY, rt);
      return { ok: true };
    } catch {
      return { ok: false, error: "Connection error — please try again" };
    }
  };

  // ── Auto-refresh access token before it expires (every 12 min) ──────────
  useEffect(() => {
    if (!user) return;
    const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes (token lives 15 min — 5 min safety buffer)

    async function refreshAccessToken() {
      const rt = localStorage.getItem(REFRESH_KEY);
      if (!rt) return;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.jwt) localStorage.setItem(TOKEN_KEY, data.jwt);
          if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
        } else {
          // Refresh failed (revoked/expired) — force re-login
          logout(true);
        }
      } catch {
        // Network error — don't logout, just skip this cycle
      }
    }

    const id = setInterval(refreshAccessToken, REFRESH_INTERVAL_MS);
    // Also refresh once immediately if we're restoring a session that may be close to expiry
    refreshAccessToken();
    return () => clearInterval(id);
  }, [user, logout]);

  const logoutPublic = useCallback(() => logout(false), [logout]);

  return (
    <AuthContext.Provider value={{ user, login, verifyOtp, logout: logoutPublic, isAuthenticated: !!user, sessionExpired, isRestoring }}>
      {sessionExpired && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Session Expired</h2>
            <p className="text-gray-400 text-sm mb-6">Your session timed out after 8 hours of inactivity. Please log in again.</p>
            <button
              onClick={() => { setSessionExpired(false); setLocation("/login"); }}
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
