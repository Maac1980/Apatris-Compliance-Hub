import type { WorkerRow } from "./workers-db.js";
import { maskForRole } from "./encryption.js";

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
  medicalExamExpiry: string | null;
  oswiadczenieExpiry: string | null;
  udtCertExpiry: string | null;
  bhpStatus: string | null;
  contractEndDate: string | null;
  email: string | null;
  phone: string | null;
  hourlyRate: number;
  grossTotal: number | null;
  monthlyHours: number;
  advance: number;
  penalties: number;
  iban: string | null;
  pesel: string | null;
  nip: string | null;
  pit2: boolean;
  complianceStatus: "critical" | "warning" | "compliant" | "non-compliant";
  daysUntilNextExpiry: number | null;
  mosStatus: string | null;
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

/** Mask a sensitive value, showing only the last 4 characters. */
function maskSensitive(value: string | null | undefined): string | null {
  if (!value || value.trim() === "") return null;
  const v = value.trim();
  if (v.length <= 4) return "***" + v;
  return "*".repeat(v.length - 4) + v.slice(-4);
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

/**
 * Project a DB row into a Worker for API response.
 *
 * Overloaded for null-safety:
 * - When caller passes a non-null `WorkerRow`, returns `Worker` (preserves backward compat).
 * - When caller passes `WorkerRow | null` (e.g., from `fetchWorkerById`), returns `Worker | null`;
 *   caller must handle the null case.
 *
 * @param row - The DB row (PII fields should be plaintext post Step A decrypt).
 * @param role - Optional role string (staff role name like "Admin", "Executive", etc., OR
 *               tier string T1-T5). If provided, uses role-aware masking via maskForRole
 *               (staff → plaintext, Professional → masked). If omitted, uses legacy
 *               maskSensitive (always masked) for backward compatibility.
 *               nip is always masked via maskSensitive (Blocker 2 — not encrypted).
 */
export function mapRowToWorker(row: WorkerRow, role?: string): Worker;
export function mapRowToWorker(row: WorkerRow | null, role?: string): Worker | null;
export function mapRowToWorker(row: WorkerRow | null, role?: string): Worker | null {
  if (row == null) return null;
  const trcExpiry = formatDate(row.trc_expiry);
  const passportExpiry = formatDate(row.passport_expiry);
  const bhpExpiry = formatDate(row.bhp_expiry);
  const workPermitExpiry = formatDate(row.work_permit_expiry);
  const contractEndDate = formatDate(row.contract_end_date);

  const partial: Partial<Worker> = { trcExpiry, passportExpiry, bhpExpiry, workPermitExpiry, contractEndDate };
  const { status: complianceStatus, daysUntilNextExpiry } = computeStatus(partial);

  // Role-aware mask for encrypted PII fields. nip is NOT encrypted (Blocker 2)
  // so it always uses maskSensitive regardless of role.
  const maskPii = role
    ? (v: string | null): string | null => maskForRole(v, role)
    : maskSensitive;

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
    medicalExamExpiry: formatDate(row.medical_exam_expiry),
    oswiadczenieExpiry: formatDate(row.oswiadczenie_expiry),
    udtCertExpiry: formatDate(row.udt_cert_expiry),
    contractEndDate,
    email: row.email ?? null,
    phone: row.phone ?? null,
    hourlyRate: Number(row.hourly_rate) || 0,
    grossTotal: row.gross_total != null ? Number(row.gross_total) : null,
    monthlyHours: Number(row.monthly_hours) || 0,
    advance: Number(row.advance) || 0,
    penalties: Number(row.penalties) || 0,
    iban: maskPii(row.iban),
    pesel: maskPii(row.pesel),
    nip: maskSensitive(row.nip),
    pit2: !!row.pit2,
    complianceStatus,
    daysUntilNextExpiry,
    mosStatus: (row as any).mos_status ?? null,
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
