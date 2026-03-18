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
}

export const MOCK_WORKERS: Worker[] = [
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
    bhpExpiry: "2026-03-01",
    udtExpiry: "2027-01-15",
    contractEndDate: "2026-12-31",
    oswiadczenieExpiry: "2026-06-30",
    peselOk: true,
    daysUntilExpiry: 180,
    documents: [
      { id: "d1a", type: "TRC Certificate",    status: "Approved",      uploadedAt: "2024-11-20", expiresAt: "2026-11-20", fileName: "kowalski_trc.pdf",      uploadedBy: "Tech Ops" },
      { id: "d1b", type: "Medical Certificate", status: "Approved",      uploadedAt: "2024-06-15", expiresAt: "2026-06-15", fileName: "kowalski_medical.pdf",   uploadedBy: "Coordinator" },
      { id: "d1c", type: "PESEL Verification",  status: "Approved",      uploadedAt: "2024-01-10",                         fileName: "kowalski_pesel.pdf",    uploadedBy: "Coordinator" },
      { id: "d1d", type: "Passport",             status: "Approved",      uploadedAt: "2024-01-10", expiresAt: "2030-01-10", fileName: "kowalski_passport.pdf",  uploadedBy: "Tech Ops" },
      { id: "d1e", type: "BHP Certificate",      status: "Approved",      uploadedAt: "2024-03-01", expiresAt: "2026-03-01", fileName: "kowalski_bhp.pdf",       uploadedBy: "Tech Ops" },
      { id: "d1f", type: "UDT Certificate",      status: "Approved",      uploadedAt: "2024-01-15", expiresAt: "2027-01-15", fileName: "kowalski_udt.pdf",       uploadedBy: "Tech Ops" },
      { id: "d1g", type: "Contract",             status: "Approved",      uploadedAt: "2024-01-01", expiresAt: "2026-12-31", fileName: "kowalski_contract.pdf",  uploadedBy: "Coordinator" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 40, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 40, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 38, status: "Approved" },
      { week: "Week 4 (Mar 22–28)", hours: 32, status: "Pending" },
    ],
    financeLog: [
      { id: "f1a", date: "2026-02-01", type: "Advance",  amount: 500,  note: "February advance", status: "Settled" },
      { id: "f1b", date: "2026-03-01", type: "Advance",  amount: 500,  note: "March advance",    status: "Pending" },
    ],
  },
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
    trcExpiry: "2025-04-10",
    passportExpiry: "2028-05-20",
    medicalExpiry: "2025-05-01",
    bhpExpiry: "2026-01-20",
    contractEndDate: "2026-06-30",
    oswiadczenieExpiry: "2025-06-30",
    peselOk: true,
    daysUntilExpiry: 24,
    documents: [
      { id: "d2a", type: "TRC Certificate",    status: "Expired",      uploadedAt: "2023-04-10", expiresAt: "2025-04-10", fileName: "nowak_trc.pdf",           uploadedBy: "Tech Ops" },
      { id: "d2b", type: "Medical Certificate", status: "Under Review", uploadedAt: "2025-03-01", expiresAt: "2025-05-01", fileName: "nowak_medical_new.pdf",   uploadedBy: "Professional" },
      { id: "d2c", type: "PESEL Verification",  status: "Approved",     uploadedAt: "2023-01-15",                         fileName: "nowak_pesel.pdf",         uploadedBy: "Coordinator" },
      { id: "d2d", type: "Passport",             status: "Approved",     uploadedAt: "2023-01-15", expiresAt: "2028-05-20", fileName: "nowak_passport.pdf",      uploadedBy: "Tech Ops" },
      { id: "d2e", type: "BHP Certificate",      status: "Approved",     uploadedAt: "2024-01-20", expiresAt: "2026-01-20", fileName: "nowak_bhp.pdf",           uploadedBy: "Tech Ops" },
      { id: "d2f", type: "Contract",             status: "Approved",     uploadedAt: "2024-07-01", expiresAt: "2026-06-30", fileName: "nowak_contract.pdf",      uploadedBy: "Coordinator" },
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
  },
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
    medicalExpiry: "2025-07-20",
    contractEndDate: "2026-09-30",
    peselOk: true,
    daysUntilExpiry: 0,
    documents: [
      { id: "d3a", type: "TRC Certificate",    status: "Missing",      uploadedBy: null },
      { id: "d3b", type: "Medical Certificate", status: "Under Review", uploadedAt: "2025-02-14", expiresAt: "2025-07-20", fileName: "wisniewski_medical.pdf",  uploadedBy: "Coordinator" },
      { id: "d3c", type: "PESEL Verification",  status: "Approved",     uploadedAt: "2024-03-01",                         fileName: "wisniewski_pesel.pdf",   uploadedBy: "Coordinator" },
      { id: "d3d", type: "Passport",             status: "Under Review", uploadedAt: "2025-01-20", expiresAt: "2029-01-20", fileName: "wisniewski_passport.pdf", uploadedBy: "Professional" },
      { id: "d3e", type: "Contract",             status: "Approved",     uploadedAt: "2024-10-01", expiresAt: "2026-09-30", fileName: "wisniewski_contract.pdf", uploadedBy: "Coordinator" },
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
  },
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
    medicalExpiry: "2026-03-10",
    bhpExpiry: "2026-05-01",
    udtExpiry: "2027-03-20",
    contractEndDate: "2027-01-31",
    oswiadczenieExpiry: "2026-09-30",
    peselOk: true,
    daysUntilExpiry: 200,
    documents: [
      { id: "d4a", type: "TRC Certificate",    status: "Approved", uploadedAt: "2024-09-05", expiresAt: "2026-09-05", fileName: "zajac_trc.pdf",      uploadedBy: "Tech Ops" },
      { id: "d4b", type: "Medical Certificate", status: "Approved", uploadedAt: "2024-03-10", expiresAt: "2026-03-10", fileName: "zajac_medical.pdf",   uploadedBy: "Coordinator" },
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
      { id: "f4a", date: "2026-01-01", type: "Advance", amount: 600, note: "January advance", status: "Settled" },
      { id: "f4b", date: "2026-02-01", type: "Advance", amount: 600, note: "February advance", status: "Settled" },
      { id: "f4c", date: "2026-03-01", type: "Advance", amount: 600, note: "March advance",    status: "Pending" },
    ],
  },
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
      { id: "d5b", type: "Medical Certificate", status: "Rejected",     uploadedAt: "2025-01-10", expiresAt: "2025-02-28", fileName: "wrobel_medical.pdf",         uploadedBy: "Professional" },
      { id: "d5c", type: "PESEL Verification",  status: "Under Review", uploadedAt: "2025-03-01",                         fileName: "wrobel_pesel_resubmit.pdf", uploadedBy: "Coordinator" },
      { id: "d5d", type: "Badania Lekarskie",   status: "Under Review", uploadedAt: "2025-03-05",                         fileName: "wrobel_badania.pdf",         uploadedBy: "Tech Ops" },
      { id: "d5e", type: "Passport",             status: "Approved",     uploadedAt: "2024-03-15", expiresAt: "2026-03-15", fileName: "wrobel_passport.pdf",        uploadedBy: "Tech Ops" },
    ],
    hoursLog: [
      { week: "Week 1 (Mar 1–7)",   hours: 32, status: "Approved" },
      { week: "Week 2 (Mar 8–14)",  hours: 28, status: "Approved" },
      { week: "Week 3 (Mar 15–21)", hours: 0,  status: "Rejected" },
      { week: "Week 4 (Mar 22–28)", hours: 0,  status: "Pending" },
    ],
    financeLog: [
      { id: "f5a", date: "2026-02-15", type: "Penalty",   amount: -200, note: "No-show ×2",         status: "Settled" },
      { id: "f5b", date: "2026-02-20", type: "Deduction", amount: -100, note: "Equipment damage",   status: "Settled" },
      { id: "f5c", date: "2026-03-10", type: "Penalty",   amount: -150, note: "Safety violation",   status: "Pending" },
    ],
  },
];
