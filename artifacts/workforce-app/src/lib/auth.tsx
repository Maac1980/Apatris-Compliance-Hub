import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Role } from "@/types";

export interface MobileUser {
  name: string;
  jwt: string;
}

interface AuthContextType {
  role: Role | null;
  user: MobileUser | null;
  login: (role: Role, name: string, jwt: string) => void;
  logout: () => void;
  isReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const savedRole = localStorage.getItem("wf_role") as Role | null;
    const savedName = localStorage.getItem("wf_name");
    const savedJwt  = localStorage.getItem("wf_jwt");
    if (savedRole) {
      setRole(savedRole);
      if (savedName && savedJwt) {
        setUser({ name: savedName, jwt: savedJwt });
      }
    }
    setIsReady(true);
  }, []);

  const login = (newRole: Role, name: string, jwt: string) => {
    setRole(newRole);
    setUser({ name, jwt });
    localStorage.setItem("wf_role", newRole);
    localStorage.setItem("wf_name", name);
    localStorage.setItem("wf_jwt", jwt);
  };

  const logout = () => {
    const token = localStorage.getItem("wf_jwt");
    if (token) {
      const API = import.meta.env.VITE_API_URL ?? "";
      fetch(`${API}api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        credentials: "include",
      }).catch(() => {});
    }
    setRole(null);
    setUser(null);
    localStorage.removeItem("wf_role");
    localStorage.removeItem("wf_name");
    localStorage.removeItem("wf_jwt");
    localStorage.removeItem("wf_refreshToken");
  };

  return (
    <AuthContext.Provider value={{ role, user, login, logout, isReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
