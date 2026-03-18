import {
  HardHat, Wrench, ShieldAlert, ShieldCheck,
  FileCheck, UploadCloud, Clock, FileText,
  CheckCircle2, AlertCircle, Stethoscope,
  ChevronRight, Phone, Mail, User,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DocStatus {
  label: string;
  status: "Valid" | "Expiring" | "Missing";
  expiry?: string;
  icon: React.ElementType;
}

const MY_DOCS: DocStatus[] = [
  { label: "TRC Certificate",      status: "Valid",    expiry: "Nov 20, 2026", icon: ShieldCheck },
  { label: "Badania Lekarskie",    status: "Valid",    expiry: "Jun 15, 2026", icon: Stethoscope },
  { label: "Passport",             status: "Valid",    expiry: "Jan 10, 2030", icon: FileCheck },
];

const docStatusStyle = {
  Valid:    { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "text-emerald-500" },
  Expiring: { pill: "bg-amber-50 text-amber-700 border-amber-200",       icon: "text-amber-500" },
  Missing:  { pill: "bg-red-50 text-red-700 border-red-200",             icon: "text-red-500" },
};

// Assigned coordinator contacts — strictly only T3/T4 persons for this professional
const MY_COORDINATORS = [
  {
    id: "coord-t3",
    tier: 3,
    tierLabel: "Tech Ops",
    tierColor: "bg-blue-600",
    name: "Andrzej Kowalczyk",
    role: "Key Account & Technical Operations",
    phone: "+48 601 234 567",
    email: "a.kowalczyk@apatris.pl",
    initials: "AK",
    avatarBg: "bg-blue-100",
    avatarText: "text-blue-700",
  },
  {
    id: "coord-t4",
    tier: 4,
    tierLabel: "Coordinator",
    tierColor: "bg-emerald-600",
    name: "Zofia Brzezińska",
    role: "Compliance Coordinator",
    phone: "+48 602 345 678",
    email: "z.brzezinska@apatris.pl",
    initials: "ZB",
    avatarBg: "bg-emerald-100",
    avatarText: "text-emerald-700",
  },
];

export function Tier5Home() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-6 pb-6"
    >
      {/* Identity card */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-md p-5 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white/10 -translate-y-6 translate-x-6" />
        <div className="absolute bottom-0 left-0 w-16 h-16 rounded-full bg-white/10 translate-y-6 -translate-x-4" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center shrink-0">
            <HardHat className="w-7 h-7 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <div className="text-xs font-bold text-white/70 uppercase tracking-widest mb-0.5">Deployed Professional</div>
            <div className="text-base font-black text-white leading-tight">Marek Kowalski</div>
            <div className="text-xs text-white/80 font-medium mt-0.5">Welder · Site A – Warsaw North</div>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <span className="text-[11px] text-emerald-200 font-semibold">Active Deployment</span>
            </div>
          </div>
        </div>
      </div>

      {/* My compliance documents — own data only */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">My Compliance Documents</h2>
        <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
          {MY_DOCS.map((doc) => {
            const style = docStatusStyle[doc.status];
            const Icon = doc.icon;
            return (
              <div key={doc.label} className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 border">
                  <Icon className={cn("w-4 h-4", style.icon)} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{doc.label}</div>
                  {doc.expiry && <div className="text-xs text-muted-foreground">Expires {doc.expiry}</div>}
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap shrink-0", style.pill)}>
                  {doc.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">My Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Clock,       label: "Submit Hours",           sub: "142 hrs this month", bg: "bg-amber-50",   col: "text-amber-600",   hov: "hover:border-amber-200 hover:bg-amber-50/20" },
            { icon: UploadCloud, label: "Upload Document",        sub: "Badania / Passport",  bg: "bg-blue-50",    col: "text-blue-600",    hov: "hover:border-blue-200 hover:bg-blue-50/20" },
            { icon: Wrench,      label: "UDT Status",             sub: "Uprawnienia",         bg: "bg-violet-50",  col: "text-violet-600",  hov: "hover:border-violet-200 hover:bg-violet-50/20" },
            { icon: ShieldAlert, label: "Report Site Issue",      sub: "Safety alert",        bg: "bg-emerald-50", col: "text-emerald-600", hov: "hover:border-emerald-200 hover:bg-emerald-50/20" },
          ].map(({ icon: Icon, label, sub, bg, col, hov }) => (
            <button
              key={label}
              className={`bg-white rounded-2xl border shadow-sm p-4 flex flex-col items-center gap-2 active:scale-95 transition-all hover:shadow-md group ${hov}`}
            >
              <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                <Icon className={`w-6 h-6 ${col}`} strokeWidth={2} />
              </div>
              <div className="text-center">
                <div className="text-xs font-bold text-foreground leading-tight">{label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Assigned coordinator contacts — T3 and T4 only, strictly */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">My Assigned Coordinators</h2>
        </div>
        <p className="text-xs text-muted-foreground ml-1 -mt-2">Your designated contacts for site support and compliance queries.</p>

        <div className="space-y-3">
          {MY_COORDINATORS.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="p-4 flex items-center gap-3">
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-base font-black", c.avatarBg, c.avatarText)}>
                  {c.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.role}</div>
                  <span className={cn("inline-block text-[9px] font-black text-white px-1.5 py-0.5 rounded-full mt-1 tracking-wide", c.tierColor)}>
                    TIER {c.tier} · {c.tierLabel.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="border-t border-gray-50 divide-y divide-gray-50">
                <a
                  href={`tel:${c.phone}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-50 border flex items-center justify-center shrink-0">
                    <Phone className="w-3.5 h-3.5 text-gray-500" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{c.phone}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
                </a>
                <a
                  href={`mailto:${c.email}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-50 border flex items-center justify-center shrink-0">
                    <Mail className="w-3.5 h-3.5 text-gray-500" />
                  </div>
                  <span className="text-sm font-medium text-foreground truncate">{c.email}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 ml-auto shrink-0" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current assignment */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Current Assignment</h2>
        <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">Umowa Zlecenie</div>
              <div className="text-xs text-muted-foreground">March 2026 · Active</div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </div>
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">Hours This Month</div>
              <div className="text-xs text-muted-foreground">142 hrs submitted · Approved</div>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md shrink-0 border border-emerald-200">✓</span>
          </div>
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">Next Badania Renewal</div>
              <div className="text-xs text-muted-foreground">Due Jun 15, 2026</div>
            </div>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md shrink-0 border border-amber-200">89 days</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
