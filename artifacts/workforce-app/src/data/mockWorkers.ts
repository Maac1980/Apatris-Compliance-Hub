export type WorkerStatus = "Compliant" | "Expiring Soon" | "Missing Docs" | "Non-Compliant";

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
  },
];