import { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

export function AppShell({ children }: { children: ReactNode }) {
  const { isReady } = useAuth();
  if (!isReady) return null;

  // AppShell is a simple pass-through. All layout (phone frame, scroll, nav)
  // is handled by DashboardPage and LoginPage directly. No extra wrappers.
  return <>{children}</>;
}
