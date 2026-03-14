import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AlertCircle, CheckCircle2, Clock, XOctagon } from "lucide-react";
import { useTranslation } from "react-i18next";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation();
  const normalizedStatus = status?.toLowerCase() || "unknown";

  let config = {
    label: t("status.unknown"),
    classes: "bg-muted/20 text-muted-foreground border-muted-foreground/30",
    icon: Clock,
  };

  switch (normalizedStatus) {
    case "critical":
      config = {
        label: t("status.critical"),
        classes: "bg-destructive/10 text-destructive border-destructive/30 shadow-[0_0_10px_rgba(255,0,60,0.3)]",
        icon: AlertCircle,
      };
      break;
    case "warning":
      config = {
        label: t("status.warning"),
        classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30 shadow-[0_0_10px_rgba(255,200,0,0.2)]",
        icon: Clock,
      };
      break;
    case "compliant":
      config = {
        label: t("status.compliant"),
        classes: "bg-green-500/10 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(0,255,102,0.2)]",
        icon: CheckCircle2,
      };
      break;
    case "non-compliant":
      config = {
        label: t("status.nonCompliant"),
        classes: "bg-red-900/40 text-red-400 border-red-500/30",
        icon: XOctagon,
      };
      break;
  }

  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border backdrop-blur-sm",
        config.classes,
        className
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </div>
  );
}
