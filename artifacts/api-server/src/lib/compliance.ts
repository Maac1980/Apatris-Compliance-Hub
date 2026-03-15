import type { AirtableRecord } from "./airtable.js";

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
  hourlyRate: number | null;
  monthlyHours: number | null;
  complianceStatus: "critical" | "warning" | "compliant" | "non-compliant";
  daysUntilNextExpiry: number | null;
  passportAttachments: Attachment[];
  trcAttachments: Attachment[];
  bhpAttachments: Attachment[];
  contractAttachments: Attachment[];
}

function getString(val: unknown): string | null {
  if (typeof val === "string" && val.trim() !== "") return val.trim();
  return null;
}

function getNumber(val: unknown): number | null {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return null;
}

function getDate(val: unknown): string | null {
  if (typeof val === "string" && val.trim() !== "") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return null;
}

function getAttachments(val: unknown): Attachment[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
    .map((a) => ({
      id: String(a.id ?? ""),
      url: String(a.url ?? ""),
      filename: String(a.filename ?? "Attachment"),
      size: typeof a.size === "number" ? a.size : null,
      type: typeof a.type === "string" ? a.type : null,
    }))
    .filter((a) => a.id && a.url);
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

function resolveField(fields: Record<string, unknown>, candidates: string[]): unknown {
  for (const key of candidates) {
    if (key in fields) return fields[key];
    const lower = key.toLowerCase();
    const match = Object.keys(fields).find((k) => k.toLowerCase() === lower);
    if (match) return fields[match];
  }
  return undefined;
}

function getSingleSelectName(val: unknown): string | null {
  if (typeof val === "string" && val.trim()) return val.trim();
  if (typeof val === "object" && val !== null && "name" in val) {
    return getString((val as Record<string, unknown>).name);
  }
  return null;
}

export function mapRecordToWorker(record: AirtableRecord): Worker {
  const f = record.fields;

  const name =
    getString(resolveField(f, ["Full Name", "NAME", "Name", "Worker Name", "Welder Name", "Employee Name", "Welder"])) ??
    "Unknown";

  const specialization =
    getString(resolveField(f, ["SPEC", "QUALIFICATION", "Qualification", "Specialization", "Type", "Welding Type", "Skill", "Role"])) ??
    "";

  const experience = getString(resolveField(f, ["EXPERIENCE", "Experience", "Years Experience", "Work Experience"]));
  const qualification = getString(resolveField(f, ["QUALIFICATION", "Qualification", "SPEC", "Specialization", "Welding Type"]));

  // SITE is a free-text field; ASSIGNED SITE is a legacy singleSelect (read as fallback)
  const assignedSite =
    getString(resolveField(f, ["SITE", "Site"])) ??
    getSingleSelectName(resolveField(f, ["ASSIGNED SITE", "Assigned Site", "AssignedSite", "Factory", "Location"]));

  const trcExpiry = getDate(resolveField(f, ["TRC Expiry", "TRC_EXPIRY", "TRC_Expiry", "TRCExpiry", "TRC Expiration"]));
  const passportExpiry = getDate(resolveField(f, ["PASSPORT_EXPIRY", "Passport Expiry", "Passport_Expiry", "PassportExpiry"]));

  const bhpExpiryRaw = getString(resolveField(f, ["BHP EXPIRY", "BHP_EXPIRY", "BHP Expiry", "BHP_Expiry", "BHPExpiry", "BHP Status", "BHP"]));
  const bhpExpiry = getDate(bhpExpiryRaw) ?? null;

  const workPermitExpiry = getDate(resolveField(f, ["Work Permit Expiry", "Work_Permit_Expiry", "WorkPermitExpiry", "Work Permit", "Permit Expiry"]));
  const contractEndDate = getDate(resolveField(f, ["Contract End Date", "Contract_End_Date", "ContractEndDate", "Contract End", "Contract Expiry"]));

  const email = getString(resolveField(f, ["EMAIL", "Email", "Email Address", "Contact Email"]));
  const phone = getString(resolveField(f, ["PHONE", "Phone", "Phone Number", "Mobile", "Contact Number"]));
  const hourlyRate = getNumber(resolveField(f, ["HOURLY_RATE", "Hourly Rate", "Hourly Netto Rate", "Rate"]));
  const monthlyHours = getNumber(resolveField(f, ["MONTHLY_HOURS", "Monthly Hours", "Total Monthly Hours", "Hours"]));

  const passportAttachments = getAttachments(resolveField(f, ["PASSPORT DOCCUMENT", "PASSPORT", "Passport", "Passport Attachment", "Passport Document"]));
  const trcAttachments = getAttachments(resolveField(f, ["TRC Certificate", "TRC", "TRC Attachment", "TRC Document"]));
  const bhpAttachments = getAttachments(resolveField(f, ["BHP Certificate", "BHP_CERTIFICATE", "BHP Cert", "BHP Attachment"]));
  const contractAttachments = getAttachments(resolveField(f, ["CONTRACT", "Contract", "Contract Attachment", "Contract Document", "Contract File"]));

  const partial: Partial<Worker> = { trcExpiry, passportExpiry, bhpExpiry, workPermitExpiry, contractEndDate };
  const { status: complianceStatus, daysUntilNextExpiry } = computeStatus(partial);

  return {
    id: record.id,
    name,
    specialization,
    experience,
    qualification,
    assignedSite,
    trcExpiry,
    passportExpiry,
    bhpExpiry,
    bhpStatus: bhpExpiryRaw,
    workPermitExpiry,
    contractEndDate,
    email,
    phone,
    hourlyRate,
    monthlyHours,
    complianceStatus,
    daysUntilNextExpiry,
    passportAttachments,
    trcAttachments,
    bhpAttachments,
    contractAttachments,
  };
}

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
