export type WorkerStatus = "Compliant" | "Expiring Soon" | "Missing Docs" | "Non-Compliant";
export type DocumentStatus = "Approved" | "Under Review" | "Missing" | "Rejected" | "Expired";
export type DocumentUploader = "Tech Ops" | "Coordinator" | "Professional" | null;
export type ZUSStatus = "Registered" | "Unregistered" | "Unknown";
export type VisaType = "Karta Pobytu - Czasowy" | "Karta Pobytu - Stały" | "Karta Pobytu - UE LT" | "Wiza D" | "Wiza C" | "EU Citizen" | "Other";
export type Specialization = "TIG" | "MIG" | "MAG" | "MMA" | "ARC / Electrode" | "FCAW" | "FABRICATOR";

export interface WorkerDocument {
  id: string;
  type: "TRC Certificate" | "Medical Certificate" | "PESEL Verification" | "Passport" | "Badania Lekarskie" | "BHP Certificate" | "UDT Certificate" | "Oświadczenie" | "Contract";
  status: DocumentStatus;
  uploadedAt?: string;
  expiresAt?: string;
  fileName?: string;
  uploadedBy?: DocumentUploader;
}

export interface HoursEntry {
  week: string;
  hours: number;
  status: "Approved" | "Pending" | "Rejected";
}

export interface AdvanceEntry {
  id: string;
  date: string;
  type: "Advance" | "Penalty" | "Deduction";
  amount: number;
  note: string;
  status: "Settled" | "Pending";
}

export interface ActivityEntry {
  id: string;
  date: string;
  time: string;
  action: string;
  by: string;
  byTier: "T1" | "T2" | "T3" | "T4";
  byColor: string;
  detail?: string;
  type: "document" | "hours" | "profile" | "finance" | "compliance";
}

export interface Worker {
  id: string;
  name: string;
  email: string;
  phone: string;
  trade: "Welder" | "Steel Fixer" | "Pipe Fitter" | "Scaffolder";
  specialization: Specialization;
  workplace: string;
  status: WorkerStatus;
  pesel: string;
  zusStatus: ZUSStatus;
  visaType: VisaType;
  iban: string;
  hourlyRate: number;
  trcExpiry: string;
  passportExpiry: string;
  medicalExpiry: string;
  bhpExpiry?: string;
  udtExpiry?: string;
  contractEndDate?: string;
  oswiadczenieExpiry?: string;
  peselOk: boolean;
  daysUntilExpiry: number;
  documents: WorkerDocument[];
  hoursLog: HoursEntry[];
  financeLog: AdvanceEntry[];
  activityLog: ActivityEntry[];
}

export const SITES = [
  "Site A – Warsaw North",
  "Site B – Kraków East",
  "Site C – Gdańsk Port",
  "Site D – Wrocław South",
] as const;

export const MOCK_WORKERS: Worker[] = [
  // ── W1: Marek Kowalski — Compliant ──────────────────────────────────────────
  {
    id: "w1",
    name: "Marek Kowalski",
    email: "m.kowalski@worker.pl",
    phone: "+48 600 111 222",
    trade: "Welder",
    specialization: "TIG",
    workplace: "Site A – Warsaw North",
    status: "Compliant",
    pesel: "85041234567",
    zusStatus: "Registered",
    visaType: "EU Citizen",
    iban: "PL61109010140000071219812874",
    hourlyRate: 32,
    trcExpiry: "2026-11-20",
    passportExpiry: "2030-01-10",
    medicalExpiry: "2026-06-15",
    bhpExpiry: "2026-09-01",
    udtExpiry: "2027-01-15",
    contractEndDate: "2026-12-31",
    oswiadczenieExpiry: "2026-06-30",
    peselOk: true,
    daysUntilExpiry: 247,
    documents: [
      { id: "d1a", type: "TRC Certificate",    status: "Approved", uploadedAt: "2024-11-20", expiresAt: "2026-11-20", fileName: "kowalski_trc.pdf",      uploadedBy: "Tech Ops" },
      { id: "d1b", type: "Medical Certificate", status: "Approved", uploadedAt: "2024-06-15", expiresAt: "2026-06-15", fileName: "kowalski_medical.pdf",   uploadedBy: "Coordinator" },
      { id: "d1c", type: "PESEL Verification",  status: "Approved", uploadedAt: "2024-01-10",                         fileName: "kowalski_pesel.pdf",    uploadedBy: "Coordinator" },
      { id: "d1d", type: "Passport",             status: "Approved", uploadedAt: "2024-01-10", expiresAt: "2030-01-10", fileName: "kowalski_passport.pdf",  uploadedBy: "Tech Ops" },
      { id: "d1e", type: "BHP Certificate",      status: "Approved", uploadedAt: "2024-09-01", expiresAt: "2026-09-01", fileName: "kowalski_bhp.pdf",       uploadedBy: "Tech Ops" },
      { id: "d1f", type: "UDT Certificate",      status: "Approved", uploadedAt: "2024-01-15", expiresAt: "2027-01-15", fileName: "kowalski_udt.pdf",       uploadedBy: "Tech Ops" },
      { id: "d1g", type: "Contract",             status: "Approved", uploadedAt: "2024-01-01", expiresAt: "2026-12-31", fileName: "kowalski_contract.pdf",  uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 40, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 40, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 38, status: "Approved" },
      { week: "Week 4 (Mar 22–28)", hours: 32, status: "Pending" },
    ],
    financeLog: [
      { id: "f1a", date: "2026-02-01", type: "Advance", amount: 500,  note: "February advance", status: "Settled" },
      { id: "f1b", date: "2026-03-01", type: "Advance", amount: 500,  note: "March advance",    status: "Pending" },
    ],
    activityLog: [
      { id: "a1a", date: "2026-03-15", time: "09:14", action: "Hours Approved", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "Week 3 hours (38h) approved", type: "hours" },
      { id: "a1b", date: "2026-03-01", time: "11:30", action: "Advance Logged", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "+500 PLN March advance", type: "finance" },
      { id: "a1c", date: "2026-02-20", time: "14:05", action: "Profile Updated", by: "Z. Brzezińska", byTier: "T4", byColor: "bg-emerald-600", detail: "Contract end date updated", type: "profile" },
      { id: "a1d", date: "2026-01-15", time: "10:00", action: "BHP Approved", by: "A. Kowalczyk", byTier: "T3", byColor: "bg-blue-600", detail: "BHP Certificate renewed and approved", type: "document" },
    ],
  },

  // ── W2: Tomasz Nowak — Expiring Soon ────────────────────────────────────────
  {
    id: "w2",
    name: "Tomasz Nowak",
    email: "t.nowak@worker.pl",
    phone: "+48 601 222 333",
    trade: "Steel Fixer",
    specialization: "MAG",
    workplace: "Site B – Kraków East",
    status: "Expiring Soon",
    pesel: "90071534567",
    zusStatus: "Registered",
    visaType: "Karta Pobytu - Czasowy",
    iban: "PL83109024020000000201235677",
    hourlyRate: 28,
    trcExpiry: "2026-04-11",
    passportExpiry: "2028-05-20",
    medicalExpiry: "2026-05-01",
    bhpExpiry: "2026-01-20",
    contractEndDate: "2026-06-30",
    oswiadczenieExpiry: "2026-06-30",
    peselOk: true,
    daysUntilExpiry: 24,
    documents: [
      { id: "d2a", type: "TRC Certificate",    status: "Expired",       uploadedAt: "2023-04-10", expiresAt: "2026-04-11", fileName: "nowak_trc.pdf",           uploadedBy: "Tech Ops" },
      { id: "d2b", type: "Medical Certificate", status: "Under Review",  uploadedAt: "2026-03-01", expiresAt: "2026-05-01", fileName: "nowak_medical_new.pdf",   uploadedBy: "Professional" },
      { id: "d2c", type: "PESEL Verification",  status: "Approved",      uploadedAt: "2023-01-15",                         fileName: "nowak_pesel.pdf",         uploadedBy: "Coordinator" },
      { id: "d2d", type: "Passport",             status: "Approved",      uploadedAt: "2023-01-15", expiresAt: "2028-05-20", fileName: "nowak_passport.pdf",      uploadedBy: "Tech Ops" },
      { id: "d2e", type: "BHP Certificate",      status: "Approved",      uploadedAt: "2024-01-20", expiresAt: "2026-01-20", fileName: "nowak_bhp.pdf",           uploadedBy: "Tech Ops" },
      { id: "d2f", type: "Contract",             status: "Approved",      uploadedAt: "2024-07-01", expiresAt: "2026-06-30", fileName: "nowak_contract.pdf",      uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 38, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 40, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 36, status: "Approved" },
      { week: "Week 4 (Mar 22–28)", hours: 20, status: "Pending" },
    ],
    financeLog: [
      { id: "f2a", date: "2026-01-15", type: "Advance",  amount: 400,  note: "January advance",  status: "Settled" },
      { id: "f2b", date: "2026-02-10", type: "Penalty",  amount: -150, note: "Late arrival ×3",  status: "Settled" },
      { id: "f2c", date: "2026-03-01", type: "Advance",  amount: 400,  note: "March advance",    status: "Pending" },
    ],
    activityLog: [
      { id: "a2a", date: "2026-03-14", time: "08:45", action: "Compliance Alert Raised", by: "System", byTier: "T2", byColor: "bg-violet-600", detail: "TRC expires in 24 days — renewal required", type: "compliance" },
      { id: "a2b", date: "2026-03-01", time: "13:20", action: "Medical Doc Uploaded", by: "T. Nowak", byTier: "T3", byColor: "bg-blue-600", detail: "Badania Lekarskie submitted for review", type: "document" },
      { id: "a2c", date: "2026-02-10", time: "16:00", action: "Penalty Logged", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "-150 PLN late arrival penalty", type: "finance" },
    ],
  },

  // ── W3: Piotr Wiśniewski — Missing Docs ─────────────────────────────────────
  {
    id: "w3",
    name: "Piotr Wiśniewski",
    email: "p.wisniewski@worker.pl",
    phone: "+48 602 333 444",
    trade: "Welder",
    specialization: "MIG",
    workplace: "Site A – Warsaw North",
    status: "Missing Docs",
    pesel: "88120345678",
    zusStatus: "Registered",
    visaType: "Wiza D",
    iban: "PL27114020040000300201355387",
    hourlyRate: 30,
    trcExpiry: "",
    passportExpiry: "2029-01-20",
    medicalExpiry: "2026-07-20",
    contractEndDate: "2026-09-30",
    peselOk: true,
    daysUntilExpiry: 0,
    documents: [
      { id: "d3a", type: "TRC Certificate",    status: "Missing",       uploadedBy: null },
      { id: "d3b", type: "Medical Certificate", status: "Under Review",  uploadedAt: "2026-02-14", expiresAt: "2026-07-20", fileName: "wisniewski_medical.pdf",  uploadedBy: "Coordinator" },
      { id: "d3c", type: "PESEL Verification",  status: "Approved",      uploadedAt: "2024-03-01",                         fileName: "wisniewski_pesel.pdf",   uploadedBy: "Coordinator" },
      { id: "d3d", type: "Passport",             status: "Under Review",  uploadedAt: "2026-01-20", expiresAt: "2029-01-20", fileName: "wisniewski_passport.pdf", uploadedBy: "Professional" },
      { id: "d3e", type: "Contract",             status: "Approved",      uploadedAt: "2024-10-01", expiresAt: "2026-09-30", fileName: "wisniewski_contract.pdf", uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 40, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 36, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 38, status: "Pending" },
      { week: "Week 4 (Mar 22–28)", hours: 0,  status: "Pending" },
    ],
    financeLog: [
      { id: "f3a", date: "2026-03-01", type: "Advance", amount: 350, note: "March advance", status: "Pending" },
    ],
    activityLog: [
      { id: "a3a", date: "2026-03-10", time: "10:30", action: "TRC Flagged Missing", by: "A. Kowalczyk", byTier: "T3", byColor: "bg-blue-600", detail: "TRC Certificate not on file — urgent action required", type: "compliance" },
      { id: "a3b", date: "2026-02-14", time: "09:00", action: "Medical Doc Submitted", by: "Z. Brzezińska", byTier: "T4", byColor: "bg-emerald-600", detail: "Badania Lekarskie under review", type: "document" },
      { id: "a3c", date: "2026-01-20", time: "11:15", action: "Passport Submitted", by: "P. Wiśniewski", byTier: "T3", byColor: "bg-blue-600", detail: "Passport copy uploaded for review", type: "document" },
    ],
  },

  // ── W4: Andrzej Zając — Compliant ───────────────────────────────────────────
  {
    id: "w4",
    name: "Andrzej Zając",
    email: "a.zajac@worker.pl",
    phone: "+48 603 444 555",
    trade: "Pipe Fitter",
    specialization: "TIG",
    workplace: "Site C – Gdańsk Port",
    status: "Compliant",
    pesel: "91030567890",
    zusStatus: "Registered",
    visaType: "EU Citizen",
    iban: "PL81154011270001002400310312",
    hourlyRate: 35,
    trcExpiry: "2026-09-05",
    passportExpiry: "2031-07-14",
    medicalExpiry: "2026-08-10",
    bhpExpiry: "2026-05-01",
    udtExpiry: "2027-03-20",
    contractEndDate: "2027-01-31",
    oswiadczenieExpiry: "2026-09-30",
    peselOk: true,
    daysUntilExpiry: 200,
    documents: [
      { id: "d4a", type: "TRC Certificate",    status: "Approved", uploadedAt: "2024-09-05", expiresAt: "2026-09-05", fileName: "zajac_trc.pdf",      uploadedBy: "Tech Ops" },
      { id: "d4b", type: "Medical Certificate", status: "Approved", uploadedAt: "2024-08-10", expiresAt: "2026-08-10", fileName: "zajac_medical.pdf",   uploadedBy: "Coordinator" },
      { id: "d4c", type: "PESEL Verification",  status: "Approved", uploadedAt: "2024-01-05",                         fileName: "zajac_pesel.pdf",    uploadedBy: "Coordinator" },
      { id: "d4d", type: "Passport",             status: "Approved", uploadedAt: "2024-01-05", expiresAt: "2031-07-14", fileName: "zajac_passport.pdf",  uploadedBy: "Tech Ops" },
      { id: "d4e", type: "BHP Certificate",      status: "Approved", uploadedAt: "2024-05-01", expiresAt: "2026-05-01", fileName: "zajac_bhp.pdf",       uploadedBy: "Tech Ops" },
      { id: "d4f", type: "UDT Certificate",      status: "Approved", uploadedAt: "2024-03-20", expiresAt: "2027-03-20", fileName: "zajac_udt.pdf",       uploadedBy: "Tech Ops" },
      { id: "d4g", type: "Contract",             status: "Approved", uploadedAt: "2024-02-01", expiresAt: "2027-01-31", fileName: "zajac_contract.pdf",  uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 40, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 40, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 40, status: "Approved" },
      { week: "Week 4 (Mar 22–28)", hours: 36, status: "Pending" },
    ],
    financeLog: [
      { id: "f4a", date: "2026-01-01", type: "Advance", amount: 600, note: "January advance",  status: "Settled" },
      { id: "f4b", date: "2026-02-01", type: "Advance", amount: 600, note: "February advance", status: "Settled" },
      { id: "f4c", date: "2026-03-01", type: "Advance", amount: 600, note: "March advance",    status: "Pending" },
    ],
    activityLog: [
      { id: "a4a", date: "2026-03-15", time: "09:00", action: "Hours Approved", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "Week 3 (40h) approved", type: "hours" },
      { id: "a4b", date: "2026-03-01", time: "10:00", action: "Advance Logged", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "+600 PLN March advance", type: "finance" },
      { id: "a4c", date: "2024-08-10", time: "14:00", action: "Medical Approved", by: "Z. Brzezińska", byTier: "T4", byColor: "bg-emerald-600", detail: "Badania Lekarskie valid until Aug 2026", type: "document" },
    ],
  },

  // ── W5: Kamil Wróbel — Non-Compliant ────────────────────────────────────────
  {
    id: "w5",
    name: "Kamil Wróbel",
    email: "k.wrobel@worker.pl",
    phone: "+48 604 555 666",
    trade: "Scaffolder",
    specialization: "MMA",
    workplace: "Site B – Kraków East",
    status: "Non-Compliant",
    pesel: "",
    zusStatus: "Unregistered",
    visaType: "Wiza C",
    iban: "",
    hourlyRate: 25,
    trcExpiry: "2024-12-01",
    passportExpiry: "2026-03-15",
    medicalExpiry: "2025-02-28",
    contractEndDate: "2025-12-31",
    peselOk: false,
    daysUntilExpiry: 0,
    documents: [
      { id: "d5a", type: "TRC Certificate",    status: "Expired",      uploadedAt: "2022-12-01", expiresAt: "2024-12-01", fileName: "wrobel_trc_expired.pdf",    uploadedBy: "Tech Ops" },
      { id: "d5b", type: "Medical Certificate", status: "Rejected",     uploadedAt: "2026-01-10", expiresAt: "2025-02-28", fileName: "wrobel_medical.pdf",         uploadedBy: "Professional" },
      { id: "d5c", type: "PESEL Verification",  status: "Under Review", uploadedAt: "2026-03-01",                         fileName: "wrobel_pesel_resubmit.pdf", uploadedBy: "Coordinator" },
      { id: "d5d", type: "Badania Lekarskie",   status: "Under Review", uploadedAt: "2026-03-05",                         fileName: "wrobel_badania.pdf",         uploadedBy: "Tech Ops" },
      { id: "d5e", type: "Passport",             status: "Approved",     uploadedAt: "2024-03-15", expiresAt: "2026-03-15", fileName: "wrobel_passport.pdf",        uploadedBy: "Tech Ops" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 32, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 28, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 0,  status: "Rejected" },
      { week: "Week 4 (Mar 22–28)", hours: 0,  status: "Pending" },
    ],
    financeLog: [
      { id: "f5a", date: "2026-02-15", type: "Penalty",   amount: -200, note: "No-show ×2",       status: "Settled" },
      { id: "f5b", date: "2026-02-20", type: "Deduction", amount: -100, note: "Equipment damage", status: "Settled" },
      { id: "f5c", date: "2026-03-10", type: "Penalty",   amount: -150, note: "Safety violation", status: "Pending" },
    ],
    activityLog: [
      { id: "a5a", date: "2026-03-10", time: "08:30", action: "Safety Penalty Logged", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "-150 PLN safety violation", type: "finance" },
      { id: "a5b", date: "2026-03-05", time: "09:15", action: "PESEL Resubmitted", by: "Z. Brzezińska", byTier: "T4", byColor: "bg-emerald-600", detail: "PESEL verification under review", type: "document" },
      { id: "a5c", date: "2026-03-01", time: "11:00", action: "Hours Rejected", by: "A. Kowalczyk", byTier: "T3", byColor: "bg-blue-600", detail: "Week 3 hours rejected — site no-show", type: "hours" },
      { id: "a5d", date: "2026-02-20", time: "14:00", action: "Equipment Deduction", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "-100 PLN equipment damage deduction", type: "finance" },
      { id: "a5e", date: "2026-01-10", time: "10:00", action: "Medical Rejected", by: "A. Kowalczyk", byTier: "T3", byColor: "bg-blue-600", detail: "Medical cert rejected — illegible scan", type: "document" },
    ],
  },

  // ── W6: Dmitro Kovalenko — Compliant ────────────────────────────────────────
  {
    id: "w6",
    name: "Dmitro Kovalenko",
    email: "d.kovalenko@worker.pl",
    phone: "+48 605 666 777",
    trade: "Welder",
    specialization: "TIG",
    workplace: "Site D – Wrocław South",
    status: "Compliant",
    pesel: "93021578901",
    zusStatus: "Registered",
    visaType: "Karta Pobytu - Czasowy",
    iban: "PL52109013620000000201456789",
    hourlyRate: 30,
    trcExpiry: "2027-02-10",
    passportExpiry: "2029-08-15",
    medicalExpiry: "2026-09-20",
    bhpExpiry: "2026-07-10",
    udtExpiry: "2027-06-01",
    contractEndDate: "2026-12-31",
    oswiadczenieExpiry: "2026-08-01",
    peselOk: true,
    daysUntilExpiry: 320,
    documents: [
      { id: "d6a", type: "TRC Certificate",    status: "Approved", uploadedAt: "2025-02-10", expiresAt: "2027-02-10", fileName: "kovalenko_trc.pdf",      uploadedBy: "Tech Ops" },
      { id: "d6b", type: "Medical Certificate", status: "Approved", uploadedAt: "2024-09-20", expiresAt: "2026-09-20", fileName: "kovalenko_medical.pdf",   uploadedBy: "Coordinator" },
      { id: "d6c", type: "PESEL Verification",  status: "Approved", uploadedAt: "2024-03-01",                         fileName: "kovalenko_pesel.pdf",    uploadedBy: "Coordinator" },
      { id: "d6d", type: "Passport",             status: "Approved", uploadedAt: "2024-03-01", expiresAt: "2029-08-15", fileName: "kovalenko_passport.pdf",  uploadedBy: "Tech Ops" },
      { id: "d6e", type: "BHP Certificate",      status: "Approved", uploadedAt: "2024-07-10", expiresAt: "2026-07-10", fileName: "kovalenko_bhp.pdf",       uploadedBy: "Tech Ops" },
      { id: "d6f", type: "UDT Certificate",      status: "Approved", uploadedAt: "2025-06-01", expiresAt: "2027-06-01", fileName: "kovalenko_udt.pdf",       uploadedBy: "Tech Ops" },
      { id: "d6g", type: "Contract",             status: "Approved", uploadedAt: "2024-01-01", expiresAt: "2026-12-31", fileName: "kovalenko_contract.pdf",  uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 40, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 38, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 40, status: "Approved" },
      { week: "Week 4 (Mar 22–28)", hours: 34, status: "Pending" },
    ],
    financeLog: [
      { id: "f6a", date: "2026-02-01", type: "Advance", amount: 450, note: "February advance", status: "Settled" },
      { id: "f6b", date: "2026-03-01", type: "Advance", amount: 450, note: "March advance",    status: "Pending" },
    ],
    activityLog: [
      { id: "a6a", date: "2026-03-15", time: "09:30", action: "Hours Approved", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "Week 3 (40h) approved", type: "hours" },
      { id: "a6b", date: "2026-03-01", time: "10:00", action: "Advance Logged", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "+450 PLN March advance", type: "finance" },
      { id: "a6c", date: "2025-02-10", time: "11:00", action: "TRC Approved", by: "A. Kowalczyk", byTier: "T3", byColor: "bg-blue-600", detail: "TRC Certificate valid until Feb 2027", type: "document" },
    ],
  },

  // ── W7: Vasyl Petrenko — Compliant ──────────────────────────────────────────
  {
    id: "w7",
    name: "Vasyl Petrenko",
    email: "v.petrenko@worker.pl",
    phone: "+48 606 777 888",
    trade: "Welder",
    specialization: "MAG",
    workplace: "Site A – Warsaw North",
    status: "Compliant",
    pesel: "94061289012",
    zusStatus: "Registered",
    visaType: "Karta Pobytu - Stały",
    iban: "PL44109025590000000201567890",
    hourlyRate: 28,
    trcExpiry: "2026-10-15",
    passportExpiry: "2030-03-20",
    medicalExpiry: "2026-11-01",
    bhpExpiry: "2026-08-15",
    udtExpiry: "2027-04-10",
    contractEndDate: "2026-12-31",
    oswiadczenieExpiry: "2026-10-01",
    peselOk: true,
    daysUntilExpiry: 210,
    documents: [
      { id: "d7a", type: "TRC Certificate",    status: "Approved", uploadedAt: "2024-10-15", expiresAt: "2026-10-15", fileName: "petrenko_trc.pdf",      uploadedBy: "Tech Ops" },
      { id: "d7b", type: "Medical Certificate", status: "Approved", uploadedAt: "2024-11-01", expiresAt: "2026-11-01", fileName: "petrenko_medical.pdf",   uploadedBy: "Coordinator" },
      { id: "d7c", type: "PESEL Verification",  status: "Approved", uploadedAt: "2024-02-01",                         fileName: "petrenko_pesel.pdf",    uploadedBy: "Coordinator" },
      { id: "d7d", type: "Passport",             status: "Approved", uploadedAt: "2024-02-01", expiresAt: "2030-03-20", fileName: "petrenko_passport.pdf",  uploadedBy: "Tech Ops" },
      { id: "d7e", type: "BHP Certificate",      status: "Approved", uploadedAt: "2024-08-15", expiresAt: "2026-08-15", fileName: "petrenko_bhp.pdf",       uploadedBy: "Tech Ops" },
      { id: "d7f", type: "UDT Certificate",      status: "Approved", uploadedAt: "2025-04-10", expiresAt: "2027-04-10", fileName: "petrenko_udt.pdf",       uploadedBy: "Tech Ops" },
      { id: "d7g", type: "Contract",             status: "Approved", uploadedAt: "2024-01-01", expiresAt: "2026-12-31", fileName: "petrenko_contract.pdf",  uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 40, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 40, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 36, status: "Approved" },
      { week: "Week 4 (Mar 22–28)", hours: 28, status: "Pending" },
    ],
    financeLog: [
      { id: "f7a", date: "2026-02-01", type: "Advance", amount: 400, note: "February advance", status: "Settled" },
      { id: "f7b", date: "2026-03-01", type: "Advance", amount: 400, note: "March advance",    status: "Pending" },
    ],
    activityLog: [
      { id: "a7a", date: "2026-03-15", time: "09:45", action: "Hours Approved", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "Week 3 (36h) approved", type: "hours" },
      { id: "a7b", date: "2026-03-01", time: "10:15", action: "Advance Logged", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "+400 PLN March advance", type: "finance" },
      { id: "a7c", date: "2025-04-10", time: "11:00", action: "UDT Approved", by: "A. Kowalczyk", byTier: "T3", byColor: "bg-blue-600", detail: "UDT Certificate valid until Apr 2027", type: "document" },
    ],
  },

  // ── W8: Bogdan Szymański — Expiring Soon ────────────────────────────────────
  {
    id: "w8",
    name: "Bogdan Szymański",
    email: "b.szymanski@worker.pl",
    phone: "+48 607 888 999",
    trade: "Steel Fixer",
    specialization: "FCAW",
    workplace: "Site C – Gdańsk Port",
    status: "Expiring Soon",
    pesel: "87090234567",
    zusStatus: "Registered",
    visaType: "EU Citizen",
    iban: "PL73109016340000000201678901",
    hourlyRate: 29,
    trcExpiry: "2026-04-22",
    passportExpiry: "2028-11-10",
    medicalExpiry: "2026-07-01",
    bhpExpiry: "2026-06-20",
    contractEndDate: "2026-09-30",
    peselOk: true,
    daysUntilExpiry: 35,
    documents: [
      { id: "d8a", type: "TRC Certificate",    status: "Expired",      uploadedAt: "2024-04-22", expiresAt: "2026-04-22", fileName: "szymanski_trc.pdf",      uploadedBy: "Tech Ops" },
      { id: "d8b", type: "Medical Certificate", status: "Approved",     uploadedAt: "2024-07-01", expiresAt: "2026-07-01", fileName: "szymanski_medical.pdf",   uploadedBy: "Coordinator" },
      { id: "d8c", type: "PESEL Verification",  status: "Approved",     uploadedAt: "2024-01-10",                         fileName: "szymanski_pesel.pdf",    uploadedBy: "Coordinator" },
      { id: "d8d", type: "Passport",             status: "Approved",     uploadedAt: "2024-01-10", expiresAt: "2028-11-10", fileName: "szymanski_passport.pdf",  uploadedBy: "Tech Ops" },
      { id: "d8e", type: "BHP Certificate",      status: "Approved",     uploadedAt: "2024-06-20", expiresAt: "2026-06-20", fileName: "szymanski_bhp.pdf",       uploadedBy: "Tech Ops" },
      { id: "d8f", type: "Contract",             status: "Approved",     uploadedAt: "2024-10-01", expiresAt: "2026-09-30", fileName: "szymanski_contract.pdf",  uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 38, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 40, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 38, status: "Approved" },
      { week: "Week 4 (Mar 22–28)", hours: 30, status: "Pending" },
    ],
    financeLog: [
      { id: "f8a", date: "2026-03-01", type: "Advance", amount: 420, note: "March advance", status: "Pending" },
    ],
    activityLog: [
      { id: "a8a", date: "2026-03-16", time: "08:00", action: "Alert: TRC Expiring", by: "System", byTier: "T2", byColor: "bg-violet-600", detail: "TRC expires in 35 days — action required", type: "compliance" },
      { id: "a8b", date: "2026-03-15", time: "09:00", action: "Hours Approved", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "Week 3 (38h) approved", type: "hours" },
    ],
  },

  // ── W9: Rafał Lewandowski — Missing Docs ────────────────────────────────────
  {
    id: "w9",
    name: "Rafał Lewandowski",
    email: "r.lewandowski@worker.pl",
    phone: "+48 608 999 000",
    trade: "Pipe Fitter",
    specialization: "MIG",
    workplace: "Site D – Wrocław South",
    status: "Missing Docs",
    pesel: "92040489012",
    zusStatus: "Registered",
    visaType: "EU Citizen",
    iban: "PL19109019760000000201789012",
    hourlyRate: 33,
    trcExpiry: "2026-08-10",
    passportExpiry: "2030-05-15",
    medicalExpiry: "2026-06-30",
    bhpExpiry: "2026-04-15",
    contractEndDate: "2026-11-30",
    peselOk: true,
    daysUntilExpiry: 0,
    documents: [
      { id: "d9a", type: "TRC Certificate",    status: "Approved",     uploadedAt: "2024-08-10", expiresAt: "2026-08-10", fileName: "lewandowski_trc.pdf",      uploadedBy: "Tech Ops" },
      { id: "d9b", type: "Medical Certificate", status: "Approved",     uploadedAt: "2024-06-30", expiresAt: "2026-06-30", fileName: "lewandowski_medical.pdf",   uploadedBy: "Coordinator" },
      { id: "d9c", type: "UDT Certificate",     status: "Missing",      uploadedBy: null },
      { id: "d9d", type: "PESEL Verification",  status: "Approved",     uploadedAt: "2024-01-20",                         fileName: "lewandowski_pesel.pdf",    uploadedBy: "Coordinator" },
      { id: "d9e", type: "Passport",             status: "Approved",     uploadedAt: "2024-01-20", expiresAt: "2030-05-15", fileName: "lewandowski_passport.pdf",  uploadedBy: "Tech Ops" },
      { id: "d9f", type: "BHP Certificate",      status: "Under Review", uploadedAt: "2026-03-10", expiresAt: "2026-04-15", fileName: "lewandowski_bhp_new.pdf",   uploadedBy: "Professional" },
      { id: "d9g", type: "Contract",             status: "Approved",     uploadedAt: "2024-12-01", expiresAt: "2026-11-30", fileName: "lewandowski_contract.pdf",  uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 40, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 38, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 40, status: "Approved" },
      { week: "Week 4 (Mar 22–28)", hours: 32, status: "Pending" },
    ],
    financeLog: [
      { id: "f9a", date: "2026-02-01", type: "Advance", amount: 500, note: "February advance", status: "Settled" },
      { id: "f9b", date: "2026-03-01", type: "Advance", amount: 500, note: "March advance",    status: "Pending" },
    ],
    activityLog: [
      { id: "a9a", date: "2026-03-12", time: "10:00", action: "UDT Flagged Missing", by: "A. Kowalczyk", byTier: "T3", byColor: "bg-blue-600", detail: "UDT Certificate not on file", type: "compliance" },
      { id: "a9b", date: "2026-03-10", time: "14:00", action: "BHP Resubmitted", by: "R. Lewandowski", byTier: "T3", byColor: "bg-blue-600", detail: "New BHP cert submitted for review", type: "document" },
    ],
  },

  // ── W10: Oleksandr Bondar — Compliant ───────────────────────────────────────
  {
    id: "w10",
    name: "Oleksandr Bondar",
    email: "o.bondar@worker.pl",
    phone: "+48 609 000 111",
    trade: "Scaffolder",
    specialization: "FABRICATOR",
    workplace: "Site B – Kraków East",
    status: "Compliant",
    pesel: "95071356789",
    zusStatus: "Registered",
    visaType: "Karta Pobytu - Stały",
    iban: "PL35109022980000000201890123",
    hourlyRate: 26,
    trcExpiry: "2027-01-05",
    passportExpiry: "2031-02-28",
    medicalExpiry: "2026-10-15",
    bhpExpiry: "2026-09-20",
    contractEndDate: "2027-01-31",
    oswiadczenieExpiry: "2026-12-01",
    peselOk: true,
    daysUntilExpiry: 293,
    documents: [
      { id: "d10a", type: "TRC Certificate",    status: "Approved", uploadedAt: "2025-01-05", expiresAt: "2027-01-05", fileName: "bondar_trc.pdf",      uploadedBy: "Tech Ops" },
      { id: "d10b", type: "Medical Certificate", status: "Approved", uploadedAt: "2024-10-15", expiresAt: "2026-10-15", fileName: "bondar_medical.pdf",   uploadedBy: "Coordinator" },
      { id: "d10c", type: "PESEL Verification",  status: "Approved", uploadedAt: "2024-05-01",                         fileName: "bondar_pesel.pdf",    uploadedBy: "Coordinator" },
      { id: "d10d", type: "Passport",             status: "Approved", uploadedAt: "2024-05-01", expiresAt: "2031-02-28", fileName: "bondar_passport.pdf",  uploadedBy: "Tech Ops" },
      { id: "d10e", type: "BHP Certificate",      status: "Approved", uploadedAt: "2024-09-20", expiresAt: "2026-09-20", fileName: "bondar_bhp.pdf",       uploadedBy: "Tech Ops" },
      { id: "d10f", type: "Contract",             status: "Approved", uploadedAt: "2025-02-01", expiresAt: "2027-01-31", fileName: "bondar_contract.pdf",  uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 40, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 36, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 40, status: "Approved" },
      { week: "Week 4 (Mar 22–28)", hours: 38, status: "Pending" },
    ],
    financeLog: [
      { id: "f10a", date: "2026-03-01", type: "Advance", amount: 380, note: "March advance", status: "Pending" },
    ],
    activityLog: [
      { id: "a10a", date: "2026-03-15", time: "10:00", action: "Hours Approved", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "Week 3 (40h) approved", type: "hours" },
      { id: "a10b", date: "2025-01-05", time: "09:00", action: "TRC Approved", by: "A. Kowalczyk", byTier: "T3", byColor: "bg-blue-600", detail: "TRC Certificate valid until Jan 2027", type: "document" },
    ],
  },

  // ── W11: Jan Kowalczyk — Expiring Soon ──────────────────────────────────────
  {
    id: "w11",
    name: "Jan Kowalczyk",
    email: "j.kowalczyk@worker.pl",
    phone: "+48 610 111 222",
    trade: "Welder",
    specialization: "ARC / Electrode",
    workplace: "Site A – Warsaw North",
    status: "Expiring Soon",
    pesel: "86050167890",
    zusStatus: "Registered",
    visaType: "EU Citizen",
    iban: "PL58109028620000000201901234",
    hourlyRate: 27,
    trcExpiry: "2026-07-20",
    passportExpiry: "2026-04-07",
    medicalExpiry: "2026-05-15",
    bhpExpiry: "2026-06-01",
    contractEndDate: "2026-08-31",
    peselOk: true,
    daysUntilExpiry: 20,
    documents: [
      { id: "d11a", type: "TRC Certificate",    status: "Approved",     uploadedAt: "2024-07-20", expiresAt: "2026-07-20", fileName: "jkowalczyk_trc.pdf",      uploadedBy: "Tech Ops" },
      { id: "d11b", type: "Medical Certificate", status: "Approved",     uploadedAt: "2024-05-15", expiresAt: "2026-05-15", fileName: "jkowalczyk_medical.pdf",   uploadedBy: "Coordinator" },
      { id: "d11c", type: "PESEL Verification",  status: "Approved",     uploadedAt: "2024-01-10",                         fileName: "jkowalczyk_pesel.pdf",    uploadedBy: "Coordinator" },
      { id: "d11d", type: "Passport",             status: "Under Review", uploadedAt: "2026-03-10", expiresAt: "2026-04-07", fileName: "jkowalczyk_passport_new.pdf", uploadedBy: "Professional" },
      { id: "d11e", type: "BHP Certificate",      status: "Approved",     uploadedAt: "2024-06-01", expiresAt: "2026-06-01", fileName: "jkowalczyk_bhp.pdf",       uploadedBy: "Tech Ops" },
      { id: "d11f", type: "Contract",             status: "Approved",     uploadedAt: "2024-09-01", expiresAt: "2026-08-31", fileName: "jkowalczyk_contract.pdf",  uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 36, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 38, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 36, status: "Approved" },
      { week: "Week 4 (Mar 22–28)", hours: 24, status: "Pending" },
    ],
    financeLog: [
      { id: "f11a", date: "2026-02-01", type: "Advance", amount: 380, note: "February advance", status: "Settled" },
      { id: "f11b", date: "2026-03-01", type: "Advance", amount: 380, note: "March advance",    status: "Pending" },
    ],
    activityLog: [
      { id: "a11a", date: "2026-03-14", time: "08:00", action: "Alert: Passport Expiring", by: "System", byTier: "T2", byColor: "bg-violet-600", detail: "Passport expires in 20 days — renewal urgent", type: "compliance" },
      { id: "a11b", date: "2026-03-10", time: "11:00", action: "New Passport Submitted", by: "J. Kowalczyk", byTier: "T3", byColor: "bg-blue-600", detail: "Passport renewal submitted for review", type: "document" },
    ],
  },

  // ── W12: Serhiy Melnyk — Non-Compliant ──────────────────────────────────────
  {
    id: "w12",
    name: "Serhiy Melnyk",
    email: "s.melnyk@worker.pl",
    phone: "+48 611 222 333",
    trade: "Steel Fixer",
    specialization: "MAG",
    workplace: "Site D – Wrocław South",
    status: "Non-Compliant",
    pesel: "",
    zusStatus: "Unregistered",
    visaType: "Wiza D",
    iban: "",
    hourlyRate: 24,
    trcExpiry: "2025-10-01",
    passportExpiry: "2027-06-30",
    medicalExpiry: "2025-08-15",
    contractEndDate: "2026-06-30",
    peselOk: false,
    daysUntilExpiry: 0,
    documents: [
      { id: "d12a", type: "TRC Certificate",    status: "Expired",      uploadedAt: "2023-10-01", expiresAt: "2025-10-01", fileName: "melnyk_trc_expired.pdf", uploadedBy: "Tech Ops" },
      { id: "d12b", type: "Medical Certificate", status: "Expired",      uploadedAt: "2023-08-15", expiresAt: "2025-08-15", fileName: "melnyk_medical.pdf",      uploadedBy: "Coordinator" },
      { id: "d12c", type: "PESEL Verification",  status: "Missing",      uploadedBy: null },
      { id: "d12d", type: "Passport",             status: "Approved",     uploadedAt: "2024-06-30", expiresAt: "2027-06-30", fileName: "melnyk_passport.pdf",     uploadedBy: "Tech Ops" },
      { id: "d12e", type: "Contract",             status: "Approved",     uploadedAt: "2024-07-01", expiresAt: "2026-06-30", fileName: "melnyk_contract.pdf",     uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 24, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 20, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 0,  status: "Rejected" },
      { week: "Week 4 (Mar 22–28)", hours: 0,  status: "Pending" },
    ],
    financeLog: [
      { id: "f12a", date: "2026-02-20", type: "Penalty",   amount: -300, note: "Unauthorized site absence",  status: "Settled" },
      { id: "f12b", date: "2026-03-05", type: "Deduction", amount: -200, note: "Missing PPE replacement",    status: "Pending" },
    ],
    activityLog: [
      { id: "a12a", date: "2026-03-05", time: "09:00", action: "PPE Deduction Logged", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "-200 PLN PPE replacement", type: "finance" },
      { id: "a12b", date: "2026-03-03", time: "08:00", action: "Hours Rejected", by: "A. Kowalczyk", byTier: "T3", byColor: "bg-blue-600", detail: "Week 3 hours rejected — site absence", type: "hours" },
      { id: "a12c", date: "2026-02-20", time: "14:00", action: "Absence Penalty", by: "Akshay M.", byTier: "T1", byColor: "bg-indigo-600", detail: "-300 PLN unauthorized absence", type: "finance" },
      { id: "a12d", date: "2026-02-01", time: "10:00", action: "TRC Expired Alert", by: "System", byTier: "T2", byColor: "bg-violet-600", detail: "TRC expired Oct 2025 — not renewed", type: "compliance" },
    ],
  },
];
