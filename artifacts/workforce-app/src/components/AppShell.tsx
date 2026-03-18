import { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

export function AppShell({ children }: { children: ReactNode }) {
  const { isReady } = useAuth();

  if (!isReady) return null; // Avoid hydration flash

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center sm:p-6 lg:p-8">
      {/* 
        This wrapper creates a mobile-sized viewport on desktop monitors,
        while acting as a normal full-screen app on actual mobile devices.
      */}
      <div className="w-full h-[100dvh] sm:h-[844px] max-w-md bg-background sm:rounded-[2.5rem] sm:shadow-2xl overflow-hidden flex flex-col relative sm:border-[8px] sm:border-gray-900 mx-auto">
        <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar relative bg-background">
          {children}
        </div>
      </div>
    </div>
  );
}
