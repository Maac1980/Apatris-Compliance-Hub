import {
  FileCheck, FileX, FileQuestion, Clock,
  UserPlus, MapPin, Stethoscope, Users,
  AlertCircle, ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { MOCK_WORKERS } from "@/data/mockWorkers";

interface OpModule {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  iconBg: string;
  iconColor: string;
  border: string;
}

const OPERATIONAL_MODULES: OpModule[] = [
  {
    icon: UserPlus,
    label: "Add Professional",
    sublabel: "Register & onboard",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    border: "hover:border-emerald-200 hover:bg-emerald-50/20",
  },
  {
    icon: Clock,
    label: "Timesheets & Hours",
    sublabel: "142 hrs logged",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    border: "hover:border-amber-200 hover:bg-amber-50/20",
  },
  {
    icon: Stethoscope,
    label: "UDT & Badania Lekarskie",
    sublabel: "Next: Jun 2026",
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    border: "hover:border-teal-200 hover:bg-teal-50/20",
  },
  {
    icon: MapPin,
    label: "Site Deployments",
    sublabel: "3 active sites",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    border: "hover:border-blue-200 hover:bg-blue-50/20",
  },
];

export function Tier4Home() {
  const underReviewDocs = MOCK_WORKERS.flatMap(w =>
    w.documents
      .filter(d => d.status === "Under Review")
      .map(d => ({ worker: w, doc: d }))
  );

  const missingCount  = MOCK_WORKERS.flatMap(w => w.documents).filter(d => d.status === "Missing").length;
  const approvedCount = MOCK_WORKERS.flatMap(w => w.documents).filter(d => d.status === "Approved").length;
  const rejectedDocs  = MOCK_WORKERS.flatMap(w =>
    w.documents
      .filter(d => d.status === "Rejected")
      .map(d => ({ worker: w, doc: d }))
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-6"
    >
      {/* Shared workspace badge */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-emerald-700" />
        </div>
        <div>
          <div className="text-xs font-bold text-emerald-900">Shared Operational Workspace</div>
          <div className="text-[11px] text-emerald-700/80 font-medium">
            Full read/write access to Deployed Professional profiles &amp; document queues — shared with Tech Ops.
          </div>
        </div>
      </div>

      {/* Shared operational modules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Operational Modules</h2>
          <span className="text-[9px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full tracking-wide">T3 · T4 ACCESS</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {OPERATIONAL_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.label}
                className={`bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3 text-left active:scale-[0.97] transition-all duration-150 hover:shadow-md group ${mod.border}`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${mod.iconBg}`}>
                  <Icon className={`w-5 h-5 ${mod.iconColor}`} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-foreground leading-tight">{mod.label}</div>
                  <div className="text-[11px] text-muted-foreground font-medium mt-0.5">{mod.sublabel}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Document queue — primary Coordinator function */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Document Queue</h2>
          <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{underReviewDocs.length} pending</span>
        </div>
        <p className="text-xs text-muted-foreground ml-1 -mt-2">Documents awaiting review and processing</p>

        {/* Queue summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl border p-3 text-center">
            <div className="text-xl font-black text-amber-600">{underReviewDocs.length}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Under<br/>Review</div>
          </div>
          <div className="bg-white rounded-xl border p-3 text-center">
            <div className="text-xl font-black text-red-600">{missingCount}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Missing<br/>Docs</div>
          </div>
          <div className="bg-white rounded-xl border p-3 text-center">
            <div className="text-xl font-black text-emerald-600">{approvedCount}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">Approved</div>
          </div>
        </div>

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

      {/* Rejected — need re-upload */}
      {rejectedDocs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 ml-1">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Re-upload Required</h2>
            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">{rejectedDocs.length}</span>
          </div>
          <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
            {rejectedDocs.map(({ worker, doc }) => (
              <div key={doc.id} className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <FileX className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{doc.type}</div>
                  <div className="text-xs text-muted-foreground">{worker.name} · {worker.trade}</div>
                </div>
                <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-1 rounded-md border border-red-200 shrink-0">
                  Re-upload
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Urgent pending actions */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Compliance Alerts</h2>
        <div className="space-y-2">
          <div className="bg-white rounded-xl border border-l-4 border-l-red-500 p-3.5 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">PESEL Unverified — Kamil Wróbel</div>
              <div className="text-xs text-muted-foreground">Site B · Action required before next site visit</div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </div>
          <div className="bg-white rounded-xl border border-l-4 border-l-amber-400 p-3.5 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">TRC Expiring — Tomasz Nowak</div>
              <div className="text-xs text-muted-foreground">Site B · 24 days remaining</div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
