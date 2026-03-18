export type WorkerStatus = "Compliant" | "Expiring Soon" | "Missing Docs" | "Non-Compliant";

export type DocumentStatus = "Approved" | "Under Review" | "Missing" | "Rejected" | "Expired";

export interface WorkerDocument {
  id: string;
  type: "TRC Certificate" | "Medical Certificate" | "PESEL Verification" | "Passport" | "Badania Lekarskie";
  status: DocumentStatus;
  uploadedAt?: string;
  expiresAt?: string;
  fileName?: string;
}

export interface Worker {
  id: string;
  name: string;
  trade: "Welder" | "Steel Fixer" | "Pipe Fitter" | "Scaffolder";
  workplace: string;
  status: WorkerStatus;
  trcExpiry: string;
  medicalExpiry: string;
  peselOk: boolean;
  daysUntilExpiry: number;
  documents: WorkerDocument[];
}

export const MOCK_WORKERS: Worker[] = [
  {
    id: "w1",
    name: "Marek Kowalski",
    trade: "Welder",
    workplace: "Site A – Warsaw North",
    status: "Compliant",
    trcExpiry: "2026-11-20",
    medicalExpiry: "2026-06-15",
    peselOk: true,
    daysUntilExpiry: 180,
    documents: [
      { id: "d1a", type: "TRC Certificate", status: "Approved", uploadedAt: "2024-11-20", expiresAt: "2026-11-20", fileName: "kowalski_trc.pdf" },
      { id: "d1b", type: "Medical Certificate", status: "Approved", uploadedAt: "2024-06-15", expiresAt: "2026-06-15", fileName: "kowalski_medical.pdf" },
      { id: "d1c", type: "PESEL Verification", status: "Approved", uploadedAt: "2024-01-10", fileName: "kowalski_pesel.pdf" },
      { id: "d1d", type: "Passport", status: "Approved", uploadedAt: "2024-01-10", expiresAt: "2030-01-10", fileName: "kowalski_passport.pdf" },
    ],
  },
  {
    id: "w2",
    name: "Tomasz Nowak",
    trade: "Steel Fixer",
    workplace: "Site B – Kraków East",
    status: "Expiring Soon",
    trcExpiry: "2025-04-10",
    medicalExpiry: "2025-05-01",
    peselOk: true,
    daysUntilExpiry: 24,
    documents: [
      { id: "d2a", type: "TRC Certificate", status: "Expired", uploadedAt: "2023-04-10", expiresAt: "2025-04-10", fileName: "nowak_trc.pdf" },
      { id: "d2b", type: "Medical Certificate", status: "Under Review", uploadedAt: "2025-03-01", expiresAt: "2025-05-01", fileName: "nowak_medical_new.pdf" },
      { id: "d2c", type: "PESEL Verification", status: "Approved", uploadedAt: "2023-01-15", fileName: "nowak_pesel.pdf" },
      { id: "d2d", type: "Passport", status: "Approved", uploadedAt: "2023-01-15", expiresAt: "2028-05-20", fileName: "nowak_passport.pdf" },
    ],
  },
  {
    id: "w3",
    name: "Piotr Wiśniewski",
    trade: "Welder",
    workplace: "Site A – Warsaw North",
    status: "Missing Docs",
    trcExpiry: "missing",
    medicalExpiry: "2025-07-20",
    peselOk: true,
    daysUntilExpiry: 0,
    documents: [
      { id: "d3a", type: "TRC Certificate", status: "Missing" },
      { id: "d3b", type: "Medical Certificate", status: "Under Review", uploadedAt: "2025-02-14", expiresAt: "2025-07-20", fileName: "wisniewski_medical.pdf" },
      { id: "d3c", type: "PESEL Verification", status: "Approved", uploadedAt: "2024-03-01", fileName: "wisniewski_pesel.pdf" },
      { id: "d3d", type: "Passport", status: "Under Review", uploadedAt: "2025-01-20", expiresAt: "2029-01-20", fileName: "wisniewski_passport.pdf" },
    ],
  },
  {
    id: "w4",
    name: "Andrzej Zając",
    trade: "Pipe Fitter",
    workplace: "Site C – Gdańsk Port",
    status: "Compliant",
    trcExpiry: "2026-09-05",
    medicalExpiry: "2026-03-10",
    peselOk: true,
    daysUntilExpiry: 200,
    documents: [
      { id: "d4a", type: "TRC Certificate", status: "Approved", uploadedAt: "2024-09-05", expiresAt: "2026-09-05", fileName: "zajac_trc.pdf" },
      { id: "d4b", type: "Medical Certificate", status: "Approved", uploadedAt: "2024-03-10", expiresAt: "2026-03-10", fileName: "zajac_medical.pdf" },
      { id: "d4c", type: "PESEL Verification", status: "Approved", uploadedAt: "2024-01-05", fileName: "zajac_pesel.pdf" },
      { id: "d4d", type: "Passport", status: "Approved", uploadedAt: "2024-01-05", expiresAt: "2031-07-14", fileName: "zajac_passport.pdf" },
    ],
  },
  {
    id: "w5",
    name: "Kamil Wróbel",
    trade: "Scaffolder",
    workplace: "Site B – Kraków East",
    status: "Non-Compliant",
    trcExpiry: "2024-12-01",
    medicalExpiry: "2025-02-28",
    peselOk: false,
    daysUntilExpiry: 0,
    documents: [
      { id: "d5a", type: "TRC Certificate", status: "Expired", uploadedAt: "2022-12-01", expiresAt: "2024-12-01", fileName: "wrobel_trc_expired.pdf" },
      { id: "d5b", type: "Medical Certificate", status: "Rejected", uploadedAt: "2025-01-10", expiresAt: "2025-02-28", fileName: "wrobel_medical.pdf" },
      { id: "d5c", type: "PESEL Verification", status: "Under Review", uploadedAt: "2025-03-01", fileName: "wrobel_pesel_resubmit.pdf" },
      { id: "d5d", type: "Badania Lekarskie", status: "Under Review", uploadedAt: "2025-03-05", fileName: "wrobel_badania.pdf" },
    ],
  },
];
