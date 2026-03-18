import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Role } from "@/types";

interface AuthContextType {
  role: Role | null;
  login: (role: Role) => void;
  logout: () => void;
  isReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Rehydrate session from localStorage on mount
    const savedRole = localStorage.getItem("wf_role") as Role | null;
    if (savedRole) {
      setRole(savedRole);
    }
    setIsReady(true);
  }, []);

  const login = (newRole: Role) => {
    setRole(newRole);
    localStorage.setItem("wf_role", newRole);
  };

  const logout = () => {
    setRole(null);
    localStorage.removeItem("wf_role");
  };

  return (
    <AuthContext.Provider value={{ role, login, logout, isReady }}>
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
