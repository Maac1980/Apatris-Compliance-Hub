import { FileCheck, FileX, FileQuestion, Clock, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { MOCK_WORKERS } from "@/data/mockWorkers";

export function Tier4Home() {
  const underReviewDocs = MOCK_WORKERS.flatMap(w =>
    w.documents
      .filter(d => d.status === "Under Review")
      .map(d => ({ worker: w, doc: d }))
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-6"
    >
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <div className="text-xs font-bold text-emerald-800">Financial Firewall Active</div>
          <div className="text-[11px] text-emerald-600/80 font-medium">You have access to document processing only. Payroll is restricted.</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Document Queue</h2>
          <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{underReviewDocs.length} pending</span>
        </div>
        <p className="text-xs text-muted-foreground ml-1 -mt-2">Documents awaiting review and processing</p>

        <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
          {underReviewDocs.map(({ worker, doc }) => (
            <div key={doc.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <FileQuestion className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-foreground truncate">{doc.type}</div>
                <div className="text-xs text-muted-foreground">{worker.name} · {worker.trade}</div>
                {doc.uploadedAt && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Uploaded {doc.uploadedAt}</span>
                  </div>
                )}
              </div>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 shrink-0">
                Review
              </span>
            </div>
          ))}

          {underReviewDocs.length === 0 && (
            <div className="p-8 text-center">
              <FileCheck className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">All documents processed!</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Queue Summary</h2>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl border p-3 text-center">
            <div className="text-xl font-bold text-amber-600">{underReviewDocs.length}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Under Review</div>
          </div>
          <div className="bg-white rounded-xl border p-3 text-center">
            <div className="text-xl font-bold text-red-600">
              {MOCK_WORKERS.flatMap(w => w.documents).filter(d => d.status === "Missing").length}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Missing</div>
          </div>
          <div className="bg-white rounded-xl border p-3 text-center">
            <div className="text-xl font-bold text-emerald-600">
              {MOCK_WORKERS.flatMap(w => w.documents).filter(d => d.status === "Approved").length}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Approved</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Rejected — Action Required</h2>
        <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
          {MOCK_WORKERS.flatMap(w =>
            w.documents
              .filter(d => d.status === "Rejected")
              .map(d => ({ worker: w, doc: d }))
          ).map(({ worker, doc }) => (
            <div key={doc.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <FileX className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-foreground truncate">{doc.type}</div>
                <div className="text-xs text-muted-foreground">{worker.name}</div>
              </div>
              <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-1 rounded-md border border-red-200 shrink-0">
                Re-upload
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
