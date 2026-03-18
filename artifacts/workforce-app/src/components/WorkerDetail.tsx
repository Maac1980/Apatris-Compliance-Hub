import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, XCircle, FileText, MapPin, Clock, AlertTriangle, ShieldX, FileQuestion } from "lucide-react";
import { Worker, WorkerDocument, DocumentStatus, WorkerStatus } from "@/data/mockWorkers";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface WorkerDetailProps {
  worker: Worker;
  onClose: () => void;
}

function getStatusColors(status: WorkerStatus) {
  switch (status) {
    case "Compliant":     return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Expiring Soon": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Missing Docs":
    case "Non-Compliant": return "bg-red-50 text-red-700 border-red-200";
  }
}

function getDocStatusStyle(status: DocumentStatus) {
  switch (status) {
    case "Approved":     return { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> };
    case "Under Review": return { pill: "bg-amber-50 text-amber-700 border-amber-200",       icon: <FileQuestion className="w-4 h-4 text-amber-500 shrink-0" /> };
    case "Missing":      return { pill: "bg-gray-100 text-gray-500 border-gray-200",         icon: <FileText className="w-4 h-4 text-gray-400 shrink-0" /> };
    case "Rejected":     return { pill: "bg-red-50 text-red-700 border-red-200",             icon: <XCircle className="w-4 h-4 text-red-500 shrink-0" /> };
    case "Expired":      return { pill: "bg-red-50 text-red-700 border-red-200",             icon: <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" /> };
    default:             return { pill: "bg-gray-100 text-gray-500 border-gray-200",         icon: <FileText className="w-4 h-4 text-gray-400 shrink-0" /> };
  }
}

// Attribution badge colour per uploader tier
const UPLOADER_STYLE: Record<string, string> = {
  "Tech Ops":    "bg-blue-50 text-blue-700 border-blue-200",
  "Coordinator": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Professional":"bg-amber-50 text-amber-700 border-amber-200",
};

export function WorkerDetail({ worker, onClose }: WorkerDetailProps) {
  const [documents, setDocuments] = useState<WorkerDocument[]>(worker.documents);

  const initials = worker.name.split(" ").map(n => n[0]).join("");

  const avatarColor = {
    "Compliant":     "bg-emerald-100 text-emerald-700",
    "Expiring Soon": "bg-amber-100 text-amber-700",
    "Missing Docs":  "bg-red-100 text-red-700",
    "Non-Compliant": "bg-red-100 text-red-700",
  }[worker.status];

  const handleApprove = (docId: string, docType: string) => {
    setDocuments(prev =>
      prev.map(d => d.id === docId ? { ...d, status: "Approved" as DocumentStatus } : d)
    );
    toast({
      title: "Document Approved",
      description: `${docType} for ${worker.name} has been approved.`,
    });
  };

  const handleReject = (docId: string, docType: string) => {
    setDocuments(prev =>
      prev.map(d => d.id === docId ? { ...d, status: "Rejected" as DocumentStatus } : d)
    );
    toast({
      title: "Re-upload Requested",
      description: `${docType} for ${worker.name} was rejected. Professional notified to re-upload.`,
      variant: "destructive",
    });
  };

  const pendingCount = documents.filter(d => d.status === "Under Review").length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex flex-col bg-gray-50"
    >
      {/* Header */}
      <header className="h-14 bg-white border-b border-border shadow-sm px-4 flex items-center gap-3 shrink-0 sticky top-0 z-10">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-gray-100 active:scale-95 transition-all"
        >
          <X className="w-5 h-5" strokeWidth={2} />
        </button>
        <h1 className="font-bold text-base text-foreground truncate">Professional Dossier</h1>
        {pendingCount > 0 && (
          <span className="ml-auto text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 whitespace-nowrap shrink-0">
            {pendingCount} pending
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
        {/* Professional identity card */}
        <div className="px-4 pt-5 pb-4">
          <div className="bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-4">
            <div className={cn("w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg shrink-0", avatarColor)}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-base text-foreground">{worker.name}</h2>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <span className="font-medium">{worker.trade}</span>
              </div>
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{worker.workplace}</span>
              </div>
            </div>
            <span className={cn("text-[10px] px-2.5 py-1 rounded-full font-bold border whitespace-nowrap self-start shrink-0", getStatusColors(worker.status))}>
              {worker.status}
            </span>
          </div>
        </div>

        {/* Shared access notice for T3/T4 */}
        <div className="px-4 mb-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center shrink-0">
              <span className="text-[8px] font-black text-blue-700">T</span>
            </div>
            <p className="text-[11px] text-blue-700 font-medium leading-tight">
              Shared view — Tech Ops &amp; Coordinators can see and manage all submitted documents.
            </p>
          </div>
        </div>

        {/* Documents */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Compliance Documents</h3>
          </div>

          <div className="space-y-3">
            <AnimatePresence>
              {documents.map((doc) => {
                const style = getDocStatusStyle(doc.status);
                const isUnderReview = doc.status === "Under Review";
                const uploaderStyle = doc.uploadedBy ? UPLOADER_STYLE[doc.uploadedBy] : null;

                return (
                  <motion.div
                    key={doc.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="bg-white rounded-2xl border shadow-sm overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {style.icon}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm text-foreground">{doc.type}</span>
                            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold border whitespace-nowrap shrink-0", style.pill)}>
                              {doc.status}
                            </span>
                          </div>

                          {/* File name */}
                          {doc.fileName && (
                            <div className="flex items-center gap-1 mt-1">
                              <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-[11px] text-muted-foreground font-medium truncate">{doc.fileName}</span>
                            </div>
                          )}

                          {/* Timestamps */}
                          {doc.uploadedAt && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-[11px] text-muted-foreground">
                                Uploaded {doc.uploadedAt}
                                {doc.expiresAt && ` · Expires ${doc.expiresAt}`}
                              </span>
                            </div>
                          )}

                          {/* Uploader attribution badge */}
                          {doc.uploadedBy && uploaderStyle && (
                            <div className="mt-1.5">
                              <span className={cn("inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border", uploaderStyle)}>
                                ↑ {doc.uploadedBy}
                              </span>
                            </div>
                          )}

                          {doc.status === "Missing" && (
                            <p className="text-[11px] text-muted-foreground mt-1">No file submitted yet.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Approve / Reject actions */}
                    {isUnderReview && (
                      <div className="flex border-t border-border">
                        <button
                          onClick={() => handleApprove(doc.id, doc.type)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve
                        </button>
                        <div className="w-px bg-border" />
                        <button
                          onClick={() => handleReject(doc.id, doc.type)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          Request Re-upload
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
