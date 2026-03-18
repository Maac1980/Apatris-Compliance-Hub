import {
  HardHat, Wrench, ShieldAlert, ShieldCheck,
  FileCheck, UploadCloud, Clock, FileText,
  CheckCircle2, AlertCircle, Stethoscope,
  ChevronRight, Phone, Mail, QrCode, Wifi,
  CalendarCheck, MapPin,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DocStatus {
  label: string;
  status: "Valid" | "Expiring" | "Missing";
  expiry?: string;
  daysLeft?: number;
  icon: React.ElementType;
}

const MY_DOCS: DocStatus[] = [
  { label: "TRC Certificate",   status: "Valid",    expiry: "Nov 20, 2026", daysLeft: 247, icon: ShieldCheck },
  { label: "Badania Lekarskie", status: "Valid",    expiry: "Jun 15, 2026", daysLeft: 89,  icon: Stethoscope },
  { label: "BHP Certificate",   status: "Valid",    expiry: "Sep 01, 2026", daysLeft: 167, icon: FileCheck },
  { label: "Passport",          status: "Valid",    expiry: "Jan 10, 2030", daysLeft: 1393, icon: FileText },
  { label: "UDT Certificate",   status: "Valid",    expiry: "Jan 15, 2027", daysLeft: 303, icon: Wrench },
];

const docStatusStyle = {
  Valid:    { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "text-emerald-500", dot: "bg-emerald-500" },
  Expiring: { pill: "bg-amber-50 text-amber-700 border-amber-200",       icon: "text-amber-500",   dot: "bg-amber-500" },
  Missing:  { pill: "bg-red-50 text-red-700 border-red-200",             icon: "text-red-500",     dot: "bg-red-500" },
};

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

const overallCompliant = MY_DOCS.every(d => d.status === "Valid");
const complianceColor = overallCompliant ? "from-emerald-500 to-teal-600" : "from-amber-500 to-orange-600";
const complianceLabel = overallCompliant ? "FULLY COMPLIANT" : "REVIEW REQUIRED";
const complianceDot   = overallCompliant ? "bg-emerald-300" : "bg-amber-300";

export function Tier5Home() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-5 pb-8"
    >

      {/* ── Digital Site Pass / Compliance Card ──────────────────────────── */}
      <div className={cn("bg-gradient-to-br rounded-2xl shadow-lg p-5 text-white relative overflow-hidden", complianceColor)}>
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-10 translate-x-10" />
        <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-white/10 translate-y-8 -translate-x-6" />

        {/* Card header */}
        <div className="relative flex items-start justify-between mb-4">
          <div>
            <div className="text-[9px] font-black text-white/60 uppercase tracking-[0.2em] mb-1">Apatris Sp. z o.o.</div>
            <div className="text-[10px] font-bold text-white/80 uppercase tracking-widest">Digital Site Pass</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full animate-pulse", complianceDot)} />
              <span className="text-[10px] font-black text-white/90 tracking-wider">{complianceLabel}</span>
            </div>
            <Wifi className="w-4 h-4 text-white/40" />
          </div>
        </div>

        {/* Worker identity */}
        <div className="relative flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center shrink-0 shadow-inner">
            <HardHat className="w-8 h-8 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <div className="text-xl font-black text-white leading-tight">Marek Kowalski</div>
            <div className="text-xs text-white/80 font-medium">Welder · TIG Specialist</div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <MapPin className="w-3 h-3 text-white/70" />
              <span className="text-[11px] text-white/80 font-semibold">Site A – Warsaw North</span>
            </div>
          </div>
        </div>

        {/* QR-style grid (visual decoration) */}
        <div className="relative flex items-end justify-between">
          <div className="space-y-1">
            <div className="text-[9px] text-white/60 font-mono uppercase tracking-widest">Worker ID</div>
            <div className="font-mono text-sm font-bold text-white/90">APT-W001-MK</div>
            <div className="text-[9px] text-white/60 font-mono">Valid until Dec 31, 2026</div>
          </div>
          {/* Mini QR-style pattern */}
          <div className="grid grid-cols-5 gap-0.5 opacity-30">
            {Array.from({ length: 25 }).map((_, i) => (
              <div
                key={i}
                className={cn("w-2 h-2 rounded-[1px]", [0,2,4,10,12,14,20,22,24,1,5,7,9,15,17,19].includes(i) ? "bg-white" : "bg-white/20")}
              />
            ))}
          </div>
        </div>

        {/* Compliance mini-strip */}
        <div className="relative mt-4 pt-4 border-t border-white/20 grid grid-cols-5 gap-1">
          {MY_DOCS.map(doc => (
            <div key={doc.label} className="text-center">
              <div className={cn("w-2 h-2 rounded-full mx-auto mb-0.5", doc.status === "Valid" ? "bg-emerald-300" : doc.status === "Expiring" ? "bg-amber-300" : "bg-red-400")} />
              <div className="text-[7px] text-white/60 font-bold leading-tight text-center truncate">{doc.label.split(" ")[0]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Month summary strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-2xl border shadow-sm p-3 text-center">
          <div className="text-xl font-black text-blue-600">150</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Hours<br/>This Month</div>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-3 text-center">
          <div className="text-xl font-black text-emerald-600">5</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Valid<br/>Documents</div>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-3 text-center">
          <div className="text-xl font-black text-amber-600">89</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">Days to Next<br/>Renewal</div>
        </div>
      </div>

      {/* ── My Compliance Documents ───────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">My Documents</h2>
        <div className="bg-white rounded-2xl border shadow-sm divide-y divide-gray-50 overflow-hidden">
          {MY_DOCS.map((doc) => {
            const style = docStatusStyle[doc.status];
            const Icon = doc.icon;
            return (
              <div key={doc.label} className="p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 border">
                  <Icon className={cn("w-4 h-4", style.icon)} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{doc.label}</div>
                  {doc.expiry && (
                    <div className="text-xs text-muted-foreground">
                      Expires {doc.expiry}
                      {doc.daysLeft && doc.daysLeft < 120 && (
                        <span className={cn("ml-1.5 font-bold", doc.daysLeft < 60 ? "text-amber-600" : "text-muted-foreground")}>
                          ({doc.daysLeft}d)
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap shrink-0", style.pill)}>
                  {doc.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">My Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Clock,         label: "Submit Hours",      sub: "150 hrs this month",  bg: "bg-amber-50",   col: "text-amber-600",   hov: "hover:border-amber-200" },
            { icon: UploadCloud,   label: "Upload Document",   sub: "Badania / Passport",  bg: "bg-blue-50",    col: "text-blue-600",    hov: "hover:border-blue-200" },
            { icon: CalendarCheck, label: "Request Leave",     sub: "Annual / sick leave", bg: "bg-violet-50",  col: "text-violet-600",  hov: "hover:border-violet-200" },
            { icon: ShieldAlert,   label: "Report Site Issue", sub: "Safety concern",      bg: "bg-red-50",     col: "text-red-600",     hov: "hover:border-red-200" },
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

      {/* ── Current assignment ────────────────────────────────────────────── */}
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
              <div className="text-xs text-muted-foreground">150 hrs submitted · Approved</div>
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

      {/* ── My Coordinators ───────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 ml-1">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">My Coordinators</h2>
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
    </motion.div>
  );
}
