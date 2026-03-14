import React from "react";
import { cn } from "./ui/StatusBadge";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  variant?: "default" | "critical" | "warning" | "success";
}

export function StatCard({ title, value, icon: Icon, variant = "default" }: StatCardProps) {
  let colors = "border-slate-700 shadow-lg";
  let iconBg = "bg-primary/10 text-primary border-primary/20";
  let valueColor = "text-white";
  let glowColor = "bg-primary/15";
  let accentLine = "bg-gradient-to-r from-transparent via-primary/60 to-transparent";

  if (variant === "critical") {
    colors = "border-red-500/30 shadow-lg";
    iconBg = "bg-destructive/10 text-destructive border-destructive/20";
    valueColor = "text-white";
    glowColor = "bg-destructive/15";
    accentLine = "bg-gradient-to-r from-transparent via-destructive/60 to-transparent";
  } else if (variant === "warning") {
    colors = "border-yellow-500/30 shadow-lg";
    iconBg = "bg-warning/10 text-warning border-warning/20";
    valueColor = "text-white";
    glowColor = "bg-warning/15";
    accentLine = "bg-gradient-to-r from-transparent via-warning/60 to-transparent";
  } else if (variant === "success") {
    colors = "border-success/25 shadow-[0_0_15px_rgba(34,180,80,0.1)]";
    iconBg = "bg-success/10 text-success border-success/20";
    valueColor = "text-success";
    glowColor = "bg-success/15";
    accentLine = "bg-gradient-to-r from-transparent via-success/60 to-transparent";
  }

  return (
    <div className={cn("glass-panel rounded-2xl p-6 relative overflow-hidden group border", colors)}>
      <div className={cn("absolute top-0 right-0 -mt-6 -mr-6 w-28 h-28 rounded-full blur-2xl opacity-60 group-hover:opacity-100 group-hover:scale-125 transition-all duration-700", glowColor)} />
      <div className={cn("absolute top-0 left-0 right-0 h-px opacity-60", accentLine)} />

      <div className="flex items-start justify-between relative z-10">
        <div className="flex-1">
          <p className="text-xs font-mono font-bold tracking-widest uppercase text-white mb-3">
            {title}
          </p>
          <h3 className={cn("text-4xl font-mono font-bold tracking-tight", valueColor)}>
            {value}
          </h3>
        </div>
        <div className={cn("p-3 rounded-xl border backdrop-blur-md", iconBg)}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
