import { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

export function AppShell({ children }: { children: ReactNode }) {
  const { isReady } = useAuth();

  if (!isReady) return null; // Avoid hydration flash

  return (
    <div className="min-h-screen bg-[#060608] flex items-center justify-center sm:p-6 lg:p-8">
      {/* Subtle ambient glow behind device */}
      <div className="hidden sm:block absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-indigo-500/[0.03] blur-[120px]" />
      </div>
      {/*
        This wrapper creates a mobile-sized viewport on desktop monitors,
        while acting as a normal full-screen app on actual mobile devices.
      */}
      <div className="relative w-full h-[100dvh] sm:h-[844px] max-w-md bg-background sm:rounded-[2.5rem] sm:shadow-[0_0_60px_-10px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col sm:border-[6px] sm:border-[#1c1c26] mx-auto sm:ring-1 sm:ring-white/[0.05]">
        <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar relative bg-background">
          {children}
        </div>
      </div>
    </div>
  );
}
