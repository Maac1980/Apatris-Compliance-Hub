export type Role =
  | "Executive"     // Tier 1: Executive Board & Partners
  | "LegalHead"     // Tier 2: Head of Legal & Compliance
  | "TechOps"       // Tier 3: Key Account & Technical Operations
  | "Coordinator"   // Tier 4: Compliance Coordinator
  | "Professional"; // Tier 5: Deployed Professional

export interface TierConfig {
  role: Role;
  tier: number;
  title: string;
  subtitle: string;
  shortLabel: string;
  canViewFinancials: boolean;
  canViewGlobalDirectory: boolean;
  canApproveDocuments: boolean;
  canViewOwnProfileOnly: boolean;
}

export const TIER_CONFIGS: Record<Role, TierConfig> = {
  Executive: {
    role: "Executive",
    tier: 1,
    title: "Executive Board & Partners",
    subtitle: "Full platform access · Payroll · Financials",
    shortLabel: "Executive",
    canViewFinancials: true,
    canViewGlobalDirectory: true,
    canApproveDocuments: true,
    canViewOwnProfileOnly: false,
  },
  LegalHead: {
    role: "LegalHead",
    tier: 2,
    title: "Head of Legal & Compliance",
    subtitle: "Worker directory · PIP dossiers · Legality alerts",
    shortLabel: "Legal Head",
    canViewFinancials: false,
    canViewGlobalDirectory: true,
    canApproveDocuments: true,
    canViewOwnProfileOnly: false,
  },
  TechOps: {
    role: "TechOps",
    tier: 3,
    title: "Key Account & Technical Operations",
    subtitle: "Add Workers · UDT Verification · Site Deployments",
    shortLabel: "Tech Ops",
    canViewFinancials: false,
    canViewGlobalDirectory: true,
    canApproveDocuments: true,
    canViewOwnProfileOnly: false,
  },
  Coordinator: {
    role: "Coordinator",
    tier: 4,
    title: "Compliance Coordinator",
    subtitle: "Document queue · File processing",
    shortLabel: "Coordinator",
    canViewFinancials: false,
    canViewGlobalDirectory: false,
    canApproveDocuments: true,
    canViewOwnProfileOnly: false,
  },
  Professional: {
    role: "Professional",
    tier: 5,
    title: "Deployed Professional",
    subtitle: "My profile · Submit hours · Upload documents",
    shortLabel: "Professional",
    canViewFinancials: false,
    canViewGlobalDirectory: false,
    canApproveDocuments: false,
    canViewOwnProfileOnly: true,
  },
};

export interface UserSession {
  role: Role | null;
}
