import type {
  Worker,
  WorkerDocument,
  WorkerStatus,
  ZUSStatus,
  VisaType,
  Specialization,
} from "@/data/mockWorkers";

const API_BASE = "/api";

function getAuthHeader(jwt?: string): Record<string, string> {
  if (!jwt) return {};
  return { Authorization: `Bearer ${jwt}` };
}

// ── Status mapping ──────────────────────────────────────────────────────────
function mapComplianceStatus(s: string | undefined): WorkerStatus {
  switch (s) {
    case "compliant":     return "Compliant";
    case "warning":       return "Expiring Soon";
    case "critical":      return "Expiring Soon";
    case "non-compliant": return "Non-Compliant";
    default:              return "Missing Docs";
  }
}

function mapZusStatus(s: string | null | undefined): ZUSStatus {
  if (s === "Registered" || s === "Unregistered") return s;
  return "Unknown";
}

function mapVisaType(s: string | null | undefined): VisaType {
  const valid: VisaType[] = [
    "Karta Pobytu - Czasowy",
    "Karta Pobytu - Stały",
    "Karta Pobytu - UE LT",
    "Wiza D",
    "Wiza C",
    "EU Citizen",
    "Other",
  ];
  if (s && valid.includes(s as VisaType)) return s as VisaType;
  return "Other";
}

function mapSpecialization(s: string | null | undefined): Specialization {
  const valid: Specialization[] = ["TIG", "MIG", "MAG", "MMA", "ARC / Electrode", "FCAW", "FABRICATOR"];
  if (s && valid.includes(s as Specialization)) return s as Specialization;
  if (s === "ARC" || s === "ELECTRODE" || s === "Electrode") return "ARC / Electrode";
  return "TIG";
}

// ── Derive documents from expiry fields ────────────────────────────────────
function deriveDocuments(w: ApiWorker): WorkerDocument[] {
  const now = new Date();
  const docs: WorkerDocument[] = [];

  function docStatus(expiryStr: string | null): WorkerDocument["status"] {
    if (!expiryStr) return "Missing";
    const expiry = new Date(expiryStr);
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
    if (daysLeft < 0)  return "Expired";
    if (daysLeft < 30) return "Approved"; // expiring soon but present
    return "Approved";
  }

  if (w.trcExpiry || w.trcAttachments?.length) {
    docs.push({ id: `${w.id}-trc`, type: "TRC Certificate", status: docStatus(w.trcExpiry), expiresAt: w.trcExpiry || undefined });
  } else {
    docs.push({ id: `${w.id}-trc`, type: "TRC Certificate", status: "Missing" });
  }

  if (w.passportExpiry || w.passportAttachments?.length) {
    docs.push({ id: `${w.id}-pass`, type: "Passport", status: docStatus(w.passportExpiry), expiresAt: w.passportExpiry || undefined });
  } else {
    docs.push({ id: `${w.id}-pass`, type: "Passport", status: "Missing" });
  }

  if (w.bhpExpiry || w.bhpAttachments?.length) {
    docs.push({ id: `${w.id}-bhp`, type: "BHP Certificate", status: docStatus(w.bhpExpiry), expiresAt: w.bhpExpiry || undefined });
  } else {
    docs.push({ id: `${w.id}-bhp`, type: "BHP Certificate", status: "Missing" });
  }

  if (w.contractEndDate) {
    docs.push({ id: `${w.id}-contract`, type: "Contract", status: docStatus(w.contractEndDate), expiresAt: w.contractEndDate });
  }

  if (w.medicalExamExpiry) {
    docs.push({ id: `${w.id}-medical`, type: "Badania Lekarskie", status: docStatus(w.medicalExamExpiry), expiresAt: w.medicalExamExpiry });
  }

  if (w.oswiadczenieExpiry) {
    docs.push({ id: `${w.id}-osw`, type: "Oświadczenie", status: docStatus(w.oswiadczenieExpiry), expiresAt: w.oswiadczenieExpiry });
  }

  if (w.udtCertExpiry) {
    docs.push({ id: `${w.id}-udt`, type: "UDT Certificate", status: docStatus(w.udtCertExpiry), expiresAt: w.udtCertExpiry });
  }

  return docs;
}

// ── API worker shape (as returned by the server) ───────────────────────────
interface ApiWorker {
  id: string;
  name: string;
  specialization: string | null;
  experience: string | null;
  assignedSite: string | null;
  workerStatus: string | null;
  trcExpiry: string | null;
  passportExpiry: string | null;
  bhpExpiry: string | null;
  workPermitExpiry: string | null;
  contractEndDate: string | null;
  medicalExamExpiry: string | null;
  oswiadczenieExpiry: string | null;
  udtCertExpiry: string | null;
  email: string | null;
  phone: string | null;
  iban: string | null;
  pesel: string | null;
  nip: string | null;
  visaType: string | null;
  zusStatus: string | null;
  hourlyRate: number | null;
  monthlyHours: number | null;
  advance: number | null;
  penalties: number | null;
  complianceStatus: string;
  daysUntilNextExpiry: number | null;
  passportAttachments: { id: string; url: string; filename: string }[];
  trcAttachments: { id: string; url: string; filename: string }[];
  bhpAttachments: { id: string; url: string; filename: string }[];
  contractAttachments: { id: string; url: string; filename: string }[];
}

// ── Map API worker → mobile Worker ────────────────────────────────────────
export function mapApiWorkerToMobile(w: ApiWorker): Worker {
  return {
    id: w.id,
    name: w.name,
    email: w.email || "",
    phone: w.phone || "",
    trade: "Welder",
    specialization: mapSpecialization(w.specialization),
    workplace: w.assignedSite || "Unassigned",
    status: mapComplianceStatus(w.complianceStatus),
    pesel: w.pesel || "",
    zusStatus: mapZusStatus(w.zusStatus),
    visaType: mapVisaType(w.visaType),
    iban: w.iban || "",
    hourlyRate: w.hourlyRate || 0,
    trcExpiry: w.trcExpiry || "",
    passportExpiry: w.passportExpiry || "",
    bhpExpiry: w.bhpExpiry || "",
    contractEndDate: w.contractEndDate || "",
    medicalExpiry: w.medicalExamExpiry || "",
    peselOk: !!w.pesel,
    daysUntilExpiry: w.daysUntilNextExpiry ?? 999,
    documents: deriveDocuments(w),
    hoursLog: [],
    financeLog: [],
    activityLog: [],
  };
}

// ── Mobile login ───────────────────────────────────────────────────────────
export async function mobileLogin(
  tier: number,
  password: string,
  name?: string          // T1 only: 'akshay' or 'manish'
): Promise<{ role: string; name: string; jwt: string }> {
  const res = await fetch(`${API_BASE}/auth/mobile-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier, password, ...(name ? { name } : {}) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");
  return data as { role: string; name: string; jwt: string };
}

// ── Change PIN ─────────────────────────────────────────────────────────────
export async function changeMobilePin(
  jwt: string,
  currentPin: string,
  newPin: string,
  confirmPin: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/auth/mobile-change-pin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ currentPin, newPin, confirmPin }),
  });
  const data = await res.json() as { success?: boolean; message?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to change PIN");
  return { success: data.success ?? true, message: data.message, error: data.error };
}

// ── Fetch my worker profile (T5 — looks up by JWT name in Airtable) ──────────
export interface WorkerProfile {
  id: string;
  name: string;
  specialization: string | null;
  assignedSite: string | null;
  complianceStatus: "compliant" | "warning" | "critical" | "non-compliant";
  trcExpiry: string | null;
  passportExpiry: string | null;
  bhpExpiry: string | null;
  medicalExamExpiry: string | null;
  udtCertExpiry: string | null;
  contractEndDate: string | null;
  workPermitExpiry: string | null;
  monthlyHours: number | null;
  phone: string | null;
  email: string | null;
}

export async function fetchMyWorkerProfile(jwt: string): Promise<WorkerProfile> {
  const res = await fetch(`${API_BASE}/workers/me`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return await res.json() as WorkerProfile;
}

// ── Hours log ─────────────────────────────────────────────────────────────────
export interface HoursEntry {
  id: number;
  worker_name?: string;
  month: string;
  hours: number;
  note: string | null;
  status: string;
  submitted_at: string;
}

export async function fetchMyHours(jwt: string): Promise<HoursEntry[]> {
  const res = await fetch(`${API_BASE}/hours/my`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { entries: HoursEntry[] };
  return data.entries;
}

export async function fetchAllHours(jwt: string, month?: string): Promise<HoursEntry[]> {
  const url = month ? `${API_BASE}/hours?month=${month}` : `${API_BASE}/hours`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { entries: HoursEntry[] };
  return data.entries;
}

export async function submitHours(
  jwt: string,
  month: string,
  hours: number,
  note?: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/hours`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ month, hours, note }),
  });
  const data = await res.json() as { success?: boolean; message?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to submit hours");
  return { success: true, message: data.message ?? "Submitted" };
}

// ── Create worker in Airtable ─────────────────────────────────────────────────
export async function createWorkerInAirtable(
  jwt: string,
  data: {
    name: string;
    specialization?: string;
    assignedSite?: string;
    phone?: string;
    email?: string;
  }
): Promise<{ id: string; name: string }> {
  const res = await fetch(`${API_BASE}/workers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      name: data.name,
      specialization: data.specialization,
      assignedSite: data.assignedSite,
      phone: data.phone,
      email: data.email,
    }),
  });
  const result = await res.json() as { id?: string; name?: string; error?: string };
  if (!res.ok) throw new Error(result.error ?? "Failed to create worker");
  return { id: result.id ?? "", name: result.name ?? data.name };
}

// ── Fetch workers ──────────────────────────────────────────────────────────
export async function fetchWorkersFromApi(jwt?: string): Promise<Worker[]> {
  const res = await fetch(`${API_BASE}/workers`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(jwt),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  const data = await res.json() as { workers: ApiWorker[] };
  return data.workers.map(mapApiWorkerToMobile);
}
