/**
 * ApprovalBadge — reusable approval indicator and action button.
 * Shows approval status and allows authorized users to approve legal outputs.
 */

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { authHeaders, BASE } from "@/lib/api";
import { CheckCircle2, AlertTriangle, ThumbsUp, Loader2, ShieldAlert } from "lucide-react";

interface ApprovalBadgeProps {
  entityType: "authority_pack" | "ai_response" | "rejection_analysis";
  entityId: string;
  isApproved?: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  showAction?: boolean;
  size?: "sm" | "md";
  onApproved?: () => void;
  /** Query keys to invalidate after approval */
  invalidateKeys?: string[][];
}

export function ApprovalBadge({
  entityType,
  entityId,
  isApproved = false,
  approvedBy,
  approvedAt,
  showAction = true,
  size = "sm",
  onApproved,
  invalidateKeys,
}: ApprovalBadgeProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/legal/approve`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ entityType, entityId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Approval failed");
      }
      return res.json();
    },
    onSuccess: () => {
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      onApproved?.();
      toast({ description: "Approved" });
    },
    onError: (err) => toast({ description: (err as Error).message, variant: "destructive" }),
  });

  const isSm = size === "sm";

  if (isApproved) {
    return (
      <div className={`inline-flex items-center gap-1 ${isSm ? "text-[10px]" : "text-xs"}`}>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-400 ${isSm ? "" : "border border-emerald-500/20"}`}>
          <CheckCircle2 className={isSm ? "w-2.5 h-2.5" : "w-3 h-3"} />
          Approved
        </span>
        {approvedBy && (
          <span className="text-slate-500">by {approvedBy}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${isSm ? "text-[10px]" : "text-xs"}`}>
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold bg-amber-500/10 text-amber-400 ${isSm ? "" : "border border-amber-500/20"}`}>
        <ShieldAlert className={isSm ? "w-2.5 h-2.5" : "w-3 h-3"} />
        Not Approved
      </span>
      {showAction && (
        <button
          onClick={(e) => { e.stopPropagation(); approveMutation.mutate(); }}
          disabled={approveMutation.isPending}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors disabled:opacity-50 ${isSm ? "" : "border border-emerald-500/30"}`}
        >
          {approveMutation.isPending ? (
            <Loader2 className={`animate-spin ${isSm ? "w-2.5 h-2.5" : "w-3 h-3"}`} />
          ) : (
            <ThumbsUp className={isSm ? "w-2.5 h-2.5" : "w-3 h-3"} />
          )}
          Approve
        </button>
      )}
    </div>
  );
}

/** Safety label shown on all unapproved outputs */
export function UnapprovedWarning({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] text-amber-500/70 ${className ?? ""}`}>
      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
      This output is for internal review only and has not been approved.
    </div>
  );
}
