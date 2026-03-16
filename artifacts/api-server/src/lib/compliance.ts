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
  workerStatus: "Active" | "On Leave" | "Departed" | "Archived" | null;
  // Core expiry dates
  trcExpiry: string | null;
  passportExpiry: string | null;
  bhpExpiry: string | null;
  workPermitExpiry: string | null;
  bhpStatus: string | null;
  contractEndDate: string | null;
  // Polish compliance
  medicalExamExpiry: string | null;
  oswiadczenieExpiry: string | null;
  udtCertExpiry: string | null;
  rodoConsentDate: string | null;
  pupFiledDate: string | null;
  // Identity & Legal
  pesel: string | null;
  nip: string | null;
  visaType: string | null;
  zusStatus: string | null;
  // EN ISO 9606 Welding certification
  weldingProcess: string | null;
  weldingMaterialGroup: string | null;
  weldingThickness: string | null;
  weldingPosition: string | null;
  // Contact & Financial
  email: string | null;
  phone: string | null;
  iban: string | null;
  pit2: boolean;
  hourlyRate: number | null;
  monthlyHours: number | null;
  advance: number | null;
  penalties: number | null;
  // Computed
  complianceStatus: "critical" | "warning" | "compliant" | "non-compliant";
  daysUntilNextExpiry: number | null;
  // Attachments
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
    daysUntil(worker.medicalExamExpiry ?? null),
    daysUntil(worker.oswiadczenieExpiry ?? null),
    daysUntil(worker.udtCertExpiry ?? null),
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
    getString(resolveField(f, ["Full Name", "NAME", "Name", "FULL NAME", "full_name"])) ?? "Unknown";

  const specialization =
    getSingleSelectName(resolveField(f, ["SPEC", "Specialization", "SPECIALIZATION", "QUALIFICATION", "Qualification", "spec"])) ??
    getString(resolveField(f, ["SPEC", "Specialization", "QUALIFICATION", "Qualification"])) ?? "";

  const experience = getString(resolveField(f, ["EXPERIENCE", "Experience", "experience"]));
  const qualification = getString(resolveField(f, ["QUALIFICATION", "Qualification", "qualification"]));

  const assignedSite =
    getSingleSelectName(resolveField(f, ["ASSIGNED SITE", "Assigned Site", "SITE", "Site", "site"])) ??
    getString(resolveField(f, ["ASSIGNED SITE", "Assigned Site", "SITE", "Site"]));

  const trcExpiry = getDate(resolveField(f, ["TRC Expiry", "TRC_EXPIRY", "TRC_Expiry", "TRCExpiry", "TRC Expiration"]));
  const passportExpiry = getDate(resolveField(f, ["PASSPORT_EXPIRY", "Passport Expiry", "Passport_Expiry", "PassportExpiry"]));
  const bhpExpiryRaw = getString(resolveField(f, ["BHP EXPIRY", "BHP_EXPIRY", "BHP Expiry", "BHPExpiry", "BHP Status", "BHP_STATUS"]));
  const bhpExpiry = getDate(bhpExpiryRaw);
  const workPermitExpiry = getDate(resolveField(f, ["Work Permit Expiry", "WORK_PERMIT_EXPIRY", "WorkPermitExpiry"]));
  const contractEndDate = getDate(resolveField(f, ["Contract End Date", "Contract_End_Date", "ContractEndDate", "Contract End", "Contract Expiry"]));

  // Polish compliance
  const medicalExamExpiry = getDate(resolveField(f, ["Medical Exam Expiry", "Medical_Exam_Expiry", "MedicalExamExpiry"]));
  const oswiadczenieExpiry = getDate(resolveField(f, ["Oswiadczenie Expiry", "Oswiadczenie_Expiry", "OswiadczenieExpiry"]));
  const udtCertExpiry = getDate(resolveField(f, ["UDT Cert Expiry", "UDT_Cert_Expiry", "UDTCertExpiry"]));
  const rodoConsentDate = getDate(resolveField(f, ["RODO Consent Date", "RODO_Consent_Date", "RODOConsentDate"]));
  const pupFiledDate = getDate(resolveField(f, ["PUP Filed Date", "PUP_Filed_Date", "PUPFiledDate"]));

  // Identity
  const pesel = getString(resolveField(f, ["PESEL", "pesel"]));
  const nip = getString(resolveField(f, ["NIP", "nip"]));
  const visaType = getString(resolveField(f, ["Visa Type", "VISA_TYPE", "VisaType"]));
  const zusStatus = getSingleSelectName(resolveField(f, ["ZUS Status", "ZUS_STATUS", "ZUSStatus"]));

  // EN ISO 9606
  const weldingProcess = getString(resolveField(f, ["Welding Process", "WELDING_PROCESS", "WeldingProcess"]));
  const weldingMaterialGroup = getString(resolveField(f, ["Welding Material Group", "WELDING_MATERIAL_GROUP", "WeldingMaterialGroup"]));
  const weldingThickness = getString(resolveField(f, ["Welding Thickness", "WELDING_THICKNESS", "WeldingThickness"]));
  const weldingPosition = getString(resolveField(f, ["Welding Position", "WELDING_POSITION", "WeldingPosition"]));

  // Worker status
  const workerStatus = getSingleSelectName(resolveField(f, ["WORKER_STATUS", "Worker Status", "WorkerStatus"])) as Worker["workerStatus"] ?? null;

  // Financial
  const email = getString(resolveField(f, ["EMAIL", "Email", "email"]));
  const phone = getString(resolveField(f, ["PHONE", "Phone", "phone"]));
  const iban = getString(resolveField(f, ["IBAN", "iban", "Bank Account", "BANK_ACCOUNT", "Account Number", "ACCOUNT_NUMBER", "Numer Konta", "numer_konta"]));
  const pit2Raw = resolveField(f, ["PIT2", "PIT-2", "pit2", "Pit2"]);
  const pit2 = pit2Raw === true || pit2Raw === "true" || pit2Raw === 1;
  const hourlyRate = getNumber(resolveField(f, ["HOURLY_RATE", "Hourly Rate", "HourlyRate"]));
  const monthlyHours = getNumber(resolveField(f, ["MONTHLY_HOURS", "Monthly Hours", "MonthlyHours"]));
  const advance = getNumber(resolveField(f, ["Advance", "ADVANCE", "advance"]));
  const penalties = getNumber(resolveField(f, ["Penalties", "PENALTIES", "penalties"]));

  // Attachments
  const passportAttachments = getAttachments(resolveField(f, ["PASSPORT DOCCUMENT", "PASSPORT", "Passport", "Passport Document", "PASSPORT_DOCUMENT"]));
  const trcAttachments = getAttachments(resolveField(f, ["TRC Certificate", "TRC", "TRC Attachment", "TRC Document"]));
  const bhpAttachments = getAttachments(resolveField(f, ["BHP Certificate", "BHP_CERTIFICATE", "BHP Cert", "BHP Attachment"]));
  const contractAttachments = getAttachments(resolveField(f, ["CONTRACT", "Contract", "Contract Attachment", "Contract Document", "Contract File"]));

  const partial: Partial<Worker> = {
    trcExpiry, passportExpiry, bhpExpiry, workPermitExpiry, contractEndDate,
    medicalExamExpiry, oswiadczenieExpiry, udtCertExpiry,
  };
  const { status: complianceStatus, daysUntilNextExpiry } = computeStatus(partial);

  return {
    id: record.id,
    name,
    specialization,
    experience,
    qualification,
    assignedSite,
    workerStatus,
    trcExpiry,
    passportExpiry,
    bhpExpiry,
    bhpStatus: bhpExpiryRaw,
    workPermitExpiry,
    contractEndDate,
    medicalExamExpiry,
    oswiadczenieExpiry,
    udtCertExpiry,
    rodoConsentDate,
    pupFiledDate,
    pesel,
    nip,
    visaType,
    zusStatus,
    weldingProcess,
    weldingMaterialGroup,
    weldingThickness,
    weldingPosition,
    email,
    phone,
    iban,
    pit2,
    hourlyRate,
    monthlyHours,
    advance,
    penalties,
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
  site?: string,
  showArchived?: boolean
): Worker[] {
  return workers.filter((w) => {
    if (!showArchived && (w.workerStatus === "Archived" || w.workerStatus === "Departed")) return false;
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (specialization && specialization !== "all" && w.specialization !== specialization) return false;
    if (status && status !== "all" && w.complianceStatus !== status) return false;
    if (site && site !== "all") {
      if (!w.assignedSite || w.assignedSite.toLowerCase() !== site.toLowerCase()) return false;
    }
    return true;
  });
}
