import { Loader2, AlertTriangle, RefreshCcw, Plus } from "lucide-react";

interface DataStateProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  onRetry?: () => void;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void };
  children: React.ReactNode;
}

export function DataState({
  loading, error, empty, onRetry,
  emptyIcon, emptyTitle, emptyDescription, emptyAction,
  children,
}: DataStateProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
        <p className="text-sm text-slate-500 font-medium">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <div className="w-12 h-12 rounded-xl bg-red-900/30 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-sm font-semibold text-white">Failed to load data</p>
        <p className="text-xs text-red-400/80 max-w-sm">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 border border-slate-700/50 transition-colors mt-2"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        {emptyIcon || (
          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700/50 flex items-center justify-center">
            <Plus className="w-6 h-6 text-slate-500" />
          </div>
        )}
        <p className="text-sm font-semibold text-white">{emptyTitle || "No data yet"}</p>
        <p className="text-xs text-slate-400 max-w-sm">{emptyDescription || "Data will appear here once created."}</p>
        {emptyAction && (
          <button
            onClick={emptyAction.onClick}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/40 text-red-400 text-xs font-bold hover:bg-red-900/60 transition-colors mt-2"
          >
            <Plus className="w-3.5 h-3.5" />
            {emptyAction.label}
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
