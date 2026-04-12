/**
 * Compliance Card — digital ID for border police / PIP inspections.
 * Shows all legal, identity, and safety compliance data in one screen.
 */

import {
  Shield, User, FileText, HardHat, Stethoscope, MapPin, Building2,
  CheckCircle2, AlertTriangle, XOctagon, Clock, Stamp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ComplianceCardProps {
  worker: {
    name?: string;
    specialization?: string;
    assignedSite?: string;
    nationality?: string;
    passportNumber?: string;
    passportExpiry?: string;
    pesel?: string;
    trcExpiry?: string;
    workPermitExpiry?: string;
    bhpExpiry?: string;
    medicalExamExpiry?: string;
    udtCertExpiry?: string;
    contractEndDate?: string;
  };
  legalStatus?: {
    legalStatus?: string;
    riskLevel?: string;
    deployability?: string;
    legalBasis?: string;
    trcApplicationSubmitted?: boolean;
    legalProtectionFlag?: boolean;
  };
}

function ExpiryBadge({ date, label }: { date: string | null | undefined; label: string }) {
  if (!date) return (
    <div className="flex items-center justify-between py-2 border-b border-white/5">
      <span className="text-xs text-white/60">{label}</span>
      <span className="text-[10px] text-white/30">Not on file</span>
    </div>
  );

  const exp = new Date(date).getTime();
  const now = Date.now();
  const days = Math.ceil((exp - now) / 86_400_000);
  const dateStr = new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const color = days < 0 ? "text-red-400" : days <= 30 ? "text-amber-400" : "text-emerald-400";
  const bgColor = days < 0 ? "bg-red-500/10" : days <= 30 ? "bg-amber-500/10" : "bg-emerald-500/10";
  const statusText = days < 0 ? `EXPIRED ${Math.abs(days)}d ago` : days <= 30 ? `${days}d left` : "VALID";
  const Icon = days < 0 ? XOctagon : days <= 30 ? AlertTriangle : CheckCircle2;

  return (
    <div className={cn("flex items-center justify-between py-2.5 px-2 rounded-lg -mx-2", bgColor)}>
      <div className="flex items-center gap-2">
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <span className="text-xs text-white font-medium">{label}</span>
      </div>
      <div className="text-right">
        <span className={cn("text-[10px] font-bold", color)}>{statusText}</span>
        <span className="text-[9px] text-white/40 ml-2">{dateStr}</span>
      </div>
    </div>
  );
}

export function ComplianceCard({ worker, legalStatus }: ComplianceCardProps) {
  const status = legalStatus?.legalStatus ?? "UNKNOWN";
  const isValid = status === "VALID" || status === "PROTECTED_PENDING";
  const statusColor = isValid ? "text-emerald-400" : status === "EXPIRING_SOON" ? "text-amber-400" : "text-red-400";
  const statusBg = isValid ? "bg-emerald-500/10 border-emerald-500/20" : status === "EXPIRING_SOON" ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20";
  const statusLabel = status === "VALID" ? "LEGALLY AUTHORIZED" : status === "PROTECTED_PENDING" ? "PROTECTED (Art. 108)" : status === "EXPIRING_SOON" ? "EXPIRING SOON" : status === "EXPIRED_NOT_PROTECTED" ? "EXPIRED" : "REVIEW REQUIRED";

  return (
    <div className="space-y-3">
      {/* Main status banner */}
      <div className={cn("rounded-2xl border p-4", statusBg)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Shield className={cn("w-5 h-5", statusColor)} />
            <span className={cn("text-sm font-black uppercase tracking-wider", statusColor)}>{statusLabel}</span>
          </div>
          <span className="text-[9px] text-white/40 font-mono">{new Date().toLocaleDateString("en-GB")}</span>
        </div>
        {legalStatus?.legalProtectionFlag && (
          <p className="text-[10px] text-emerald-300/80 mt-1">Art. 108 continuity protection active — TRC application filed</p>
        )}
      </div>

      {/* Identity */}
      <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-white/40" />
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Identity</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-xs text-white/60">Full Name</span>
            <span className="text-xs text-white font-bold">{worker.name ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-white/60">Nationality</span>
            <span className="text-xs text-white">{worker.nationality ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-white/60">Passport</span>
            <span className="text-xs text-white font-mono">{worker.passportNumber ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-white/60">PESEL</span>
            <span className="text-xs text-white font-mono">{worker.pesel ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Employer */}
      <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-white/40" />
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Employer</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-xs text-white/60">Company</span>
            <span className="text-xs text-white font-bold">Apatris Sp. z o.o.</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-white/60">NIP</span>
            <span className="text-xs text-white font-mono">5252828706</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-white/60">Address</span>
            <span className="text-xs text-white">ul. Chlodna 51, Warszawa</span>
          </div>
        </div>
      </div>

      {/* Work Assignment */}
      <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-white/40" />
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Assignment</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-xs text-white/60">Site</span>
            <span className="text-xs text-white">{worker.assignedSite ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-white/60">Specialization</span>
            <span className="text-xs text-white font-bold">{worker.specialization ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Documents & Expiry Dates */}
      <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-white/40" />
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Documents & Certificates</span>
        </div>
        <div className="space-y-0.5">
          <ExpiryBadge date={worker.passportExpiry} label="Passport" />
          <ExpiryBadge date={worker.trcExpiry} label="TRC / Karta Pobytu" />
          <ExpiryBadge date={worker.workPermitExpiry} label="Work Permit" />
          <ExpiryBadge date={worker.contractEndDate} label="Employment Contract" />
          <ExpiryBadge date={worker.bhpExpiry} label="BHP Safety Certificate" />
          <ExpiryBadge date={worker.medicalExamExpiry} label="Medical Examination" />
          <ExpiryBadge date={worker.udtCertExpiry} label="UDT Certificate" />
        </div>
      </div>

      {/* Footer */}
      <p className="text-[8px] text-white/20 text-center font-mono">
        Apatris Sp. z o.o. · NIP 5252828706 · Generated {new Date().toLocaleString("en-GB")}
      </p>
    </div>
  );
}
