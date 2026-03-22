import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "wouter";

interface User {
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, pass: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const stored = localStorage.getItem("apatris_auth");
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const login = (email: string, pass: string) => {
    if (email === "admin@apatris.com" && pass === "apatris2024") {
      const mockUser = { email, name: "Admin", role: "Superadmin" };
      setUser(mockUser);
      localStorage.setItem("apatris_auth", JSON.stringify(mockUser));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("apatris_auth");
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
