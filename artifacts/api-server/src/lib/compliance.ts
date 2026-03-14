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
  trcExpiry: string | null;
  workPermitExpiry: string | null;
  bhpStatus: string | null;
  contractEndDate: string | null;
  email: string | null;
  phone: string | null;
  complianceStatus: "critical" | "warning" | "compliant" | "non-compliant";
  daysUntilNextExpiry: number | null;
  passportAttachments: Attachment[];
  contractAttachments: Attachment[];
}

function getString(val: unknown): string | null {
  if (typeof val === "string" && val.trim() !== "") return val.trim();
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
  const bhp = worker.bhpStatus?.toLowerCase();

  // Non-compliant if BHP is expired
  if (bhp === "expired") {
    return { status: "non-compliant", daysUntilNextExpiry: null };
  }

  const expiryDays = [
    daysUntil(worker.trcExpiry ?? null),
    daysUntil(worker.workPermitExpiry ?? null),
    daysUntil(worker.contractEndDate ?? null),
  ].filter((d): d is number => d !== null);

  if (expiryDays.length === 0) {
    return { status: "compliant", daysUntilNextExpiry: null };
  }

  const minDays = Math.min(...expiryDays);

  // Already expired
  if (minDays < 0) {
    return { status: "non-compliant", daysUntilNextExpiry: minDays };
  }

  if (minDays < 30) {
    return { status: "critical", daysUntilNextExpiry: minDays };
  }

  if (minDays < 60) {
    return { status: "warning", daysUntilNextExpiry: minDays };
  }

  return { status: "compliant", daysUntilNextExpiry: minDays };
}

// Flexible field mapping — tries multiple common field name patterns
function resolveField(
  fields: Record<string, unknown>,
  candidates: string[]
): unknown {
  for (const key of candidates) {
    if (key in fields) return fields[key];
    // Case-insensitive match
    const lower = key.toLowerCase();
    const match = Object.keys(fields).find((k) => k.toLowerCase() === lower);
    if (match) return fields[match];
  }
  return undefined;
}

export function mapRecordToWorker(record: AirtableRecord): Worker {
  const f = record.fields;

  const name = getString(
    resolveField(f, ["Name", "Full Name", "Worker Name", "Welder Name", "Employee Name"])
  ) ?? "Unknown";

  const specialization = getString(
    resolveField(f, ["Specialization", "Type", "Welding Type", "Skill", "Role"])
  ) ?? "TIG";

  const trcExpiry = getDate(
    resolveField(f, ["TRC Expiry", "TRC_Expiry", "TRCExpiry", "TRC Expiration", "TRC"])
  );

  const workPermitExpiry = getDate(
    resolveField(f, [
      "Work Permit Expiry",
      "Work_Permit_Expiry",
      "WorkPermitExpiry",
      "Work Permit",
      "Permit Expiry",
      "Permit Expiration",
    ])
  );

  const bhpStatus = getString(
    resolveField(f, ["BHP EXPIRY", "BHP Expiry", "BHP_Expiry", "BHPExpiry", "BHP Status", "BHP_Status", "BHPStatus", "BHP", "Safety Status"])
  );

  const contractEndDate = getDate(
    resolveField(f, [
      "Contract End Date",
      "Contract_End_Date",
      "ContractEndDate",
      "Contract End",
      "Contract Expiry",
      "Contract",
    ])
  );

  const email = getString(
    resolveField(f, ["Email", "Email Address", "Contact Email", "Work Email"])
  );

  const phone = getString(
    resolveField(f, ["Phone", "Phone Number", "Mobile", "Contact Number"])
  );

  const passportAttachments = getAttachments(
    resolveField(f, ["Passport", "Passport Attachment", "Passport Document"])
  );

  const contractAttachments = getAttachments(
    resolveField(f, ["Contract", "Contract Attachment", "Contract Document", "Contract File"])
  );

  const partial: Partial<Worker> = {
    trcExpiry,
    workPermitExpiry,
    bhpStatus,
    contractEndDate,
  };

  const { status: complianceStatus, daysUntilNextExpiry } = computeStatus(partial);

  return {
    id: record.id,
    name,
    specialization,
    trcExpiry,
    workPermitExpiry,
    bhpStatus,
    contractEndDate,
    email,
    phone,
    complianceStatus,
    daysUntilNextExpiry,
    passportAttachments,
    contractAttachments,
  };
}

export function filterWorkers(
  workers: Worker[],
  search?: string,
  specialization?: string,
  status?: string
): Worker[] {
  return workers.filter((w) => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (specialization && specialization !== "all" && w.specialization !== specialization) return false;
    if (status && status !== "all" && w.complianceStatus !== status) return false;
    return true;
  });
}
