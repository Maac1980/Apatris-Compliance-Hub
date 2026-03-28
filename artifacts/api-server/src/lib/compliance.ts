import type { WorkerRow } from "./workers-db.js";

export interface Attachment {
  id: string;
  url: string;
  filename: string;
  size?: number | null;
  type?: string | null;
}

export interface Worker {
  id: string;
  name: string;
  specialization: string;
  experience: string | null;
  qualification: string | null;
  assignedSite: string | null;
  trcExpiry: string | null;
  passportExpiry: string | null;
  bhpExpiry: string | null;
  workPermitExpiry: string | null;
  bhpStatus: string | null;
  contractEndDate: string | null;
  email: string | null;
  phone: string | null;
  hourlyRate: number;
  monthlyHours: number;
  advance: number;
  penalties: number;
  iban: string | null;
  pesel: string | null;
  nip: string | null;
  pit2: boolean;
  complianceStatus: "critical" | "warning" | "compliant" | "non-compliant";
  daysUntilNextExpiry: number | null;
  passportAttachments: Attachment[];
  trcAttachments: Attachment[];
  bhpAttachments: Attachment[];
  contractAttachments: Attachment[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(val: string | Date | null | undefined): string | null {
  if (val == null) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().split("T")[0];
  }
  if (typeof val === "string" && val.trim() !== "") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return null;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function computeStatus(worker: Partial<Worker>): {
  status: "critical" | "warning" | "compliant" | "non-compliant";
  daysUntilNextExpiry: number | null;
} {
  const expiryDays = [
    daysUntil(worker.trcExpiry ?? null),
    daysUntil(worker.passportExpiry ?? null),
    daysUntil(worker.bhpExpiry ?? null),
    daysUntil(worker.workPermitExpiry ?? null),
    daysUntil(worker.contractEndDate ?? null),
  ].filter((d): d is number => d !== null);

  if (expiryDays.length === 0) return { status: "compliant", daysUntilNextExpiry: null };

  const minDays = Math.min(...expiryDays);

  if (minDays < 0) return { status: "non-compliant", daysUntilNextExpiry: minDays };
  if (minDays < 30) return { status: "critical", daysUntilNextExpiry: minDays };
  if (minDays < 60) return { status: "warning", daysUntilNextExpiry: minDays };

  return { status: "compliant", daysUntilNextExpiry: minDays };
}

// ---------------------------------------------------------------------------
// Map a PostgreSQL WorkerRow to the Worker interface
// ---------------------------------------------------------------------------

export function mapRowToWorker(row: WorkerRow): Worker {
  const trcExpiry = formatDate(row.trc_expiry);
  const passportExpiry = formatDate(row.passport_expiry);
  const bhpExpiry = formatDate(row.bhp_expiry);
  const workPermitExpiry = formatDate(row.work_permit_expiry);
  const contractEndDate = formatDate(row.contract_end_date);

  const partial: Partial<Worker> = { trcExpiry, passportExpiry, bhpExpiry, workPermitExpiry, contractEndDate };
  const { status: complianceStatus, daysUntilNextExpiry } = computeStatus(partial);

  return {
    id: row.id,
    name: row.full_name ?? "Unknown",
    specialization: row.specialization ?? "",
    experience: row.experience ?? null,
    qualification: row.qualification ?? null,
    assignedSite: row.assigned_site ?? null,
    trcExpiry,
    passportExpiry,
    bhpExpiry,
    bhpStatus: bhpExpiry,
    workPermitExpiry,
    contractEndDate,
    email: row.email ?? null,
    phone: row.phone ?? null,
    hourlyRate: Number(row.hourly_rate) || 0,
    monthlyHours: Number(row.monthly_hours) || 0,
    advance: Number(row.advance) || 0,
    penalties: Number(row.penalties) || 0,
    iban: row.iban ?? null,
    pesel: row.pesel ?? null,
    nip: row.nip ?? null,
    pit2: !!row.pit2,
    complianceStatus,
    daysUntilNextExpiry,
    passportAttachments: [],
    trcAttachments: [],
    bhpAttachments: [],
    contractAttachments: [],
  };
}

/** @deprecated Use mapRowToWorker instead. Kept for backwards compatibility. */
export const mapRecordToWorker = mapRowToWorker as (row: WorkerRow) => Worker;

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export function filterWorkers(
  workers: Worker[],
  search?: string,
  specialization?: string,
  status?: string,
  site?: string
): Worker[] {
  return workers.filter((w) => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (specialization && specialization !== "all" && w.specialization !== specialization) return false;
    if (status && status !== "all" && w.complianceStatus !== status) return false;
    if (site && site !== "all") {
      if (!w.assignedSite || w.assignedSite.toLowerCase() !== site.toLowerCase()) return false;
    }
    return true;
  });
}
