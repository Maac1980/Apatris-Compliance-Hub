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
  // Financial firewall — strictly Tier 1 only
  canViewFinancials: boolean;
  // ZUS, Payroll, B2B Contracts, Financial Ledgers
  canViewFinancialModules: boolean;
  // PIP / Sensitive Legal Dossiers — strictly Tier 2 only
  canViewLegalDossiers: boolean;
  // Global Deployed Professional directory
  canViewGlobalDirectory: boolean;
  // Document approval (Approve / Reject buttons)
  canApproveDocuments: boolean;
  // Operational modules: Add Professional, Timesheets, UDT, Site Deployments
  canAccessOperationalModules: boolean;
  // Tier 5 view: show assigned T3/T4 coordinator contact info
  canViewCoordinatorContact: boolean;
  // Strict own-profile only — cannot see any other professional's data
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
    canViewFinancialModules: true,
    canViewLegalDossiers: true,
    canViewGlobalDirectory: true,
    canApproveDocuments: true,
    canAccessOperationalModules: true,
    canViewCoordinatorContact: false,
    canViewOwnProfileOnly: false,
  },
  LegalHead: {
    role: "LegalHead",
    tier: 2,
    title: "Head of Legal & Compliance",
    subtitle: "Professional directory · PIP dossiers · Legality alerts",
    shortLabel: "Legal Head",
    canViewFinancials: false,
    canViewFinancialModules: false,   // ZUS/Payroll/B2B blocked
    canViewLegalDossiers: true,       // PIP dossiers — Tier 2 access
    canViewGlobalDirectory: true,
    canApproveDocuments: true,
    canAccessOperationalModules: false,
    canViewCoordinatorContact: false,
    canViewOwnProfileOnly: false,
  },
  TechOps: {
    role: "TechOps",
    tier: 3,
    title: "Key Account & Technical Operations",
    subtitle: "Add Professionals · UDT Verification · Site Deployments",
    shortLabel: "Tech Ops",
    canViewFinancials: false,
    canViewFinancialModules: false,   // ZUS/Payroll/B2B blocked
    canViewLegalDossiers: false,      // PIP/Legal blocked
    canViewGlobalDirectory: true,     // Full T5 directory read/write
    canApproveDocuments: true,
    canAccessOperationalModules: true, // Shared workspace with T4
    canViewCoordinatorContact: false,
    canViewOwnProfileOnly: false,
  },
  Coordinator: {
    role: "Coordinator",
    tier: 4,
    title: "Compliance Coordinator",
    subtitle: "Deployed Professionals · Document queue · Operational modules",
    shortLabel: "Coordinator",
    canViewFinancials: false,
    canViewFinancialModules: false,   // ZUS/Payroll/B2B blocked
    canViewLegalDossiers: false,      // PIP/Legal blocked
    canViewGlobalDirectory: true,     // Full T5 directory read/write — shared with T3
    canApproveDocuments: true,
    canAccessOperationalModules: true, // Shared workspace with T3
    canViewCoordinatorContact: false,
    canViewOwnProfileOnly: false,
  },
  Professional: {
    role: "Professional",
    tier: 5,
    title: "Deployed Professional",
    subtitle: "My profile · Submit hours · Upload documents",
    shortLabel: "Professional",
    canViewFinancials: false,
    canViewFinancialModules: false,   // ZUS/Payroll/B2B blocked
    canViewLegalDossiers: false,      // PIP/Legal blocked
    canViewGlobalDirectory: false,    // Cannot see other professionals
    canApproveDocuments: false,
    canAccessOperationalModules: false,
    canViewCoordinatorContact: true,  // Can see their assigned T3/T4 contacts
    canViewOwnProfileOnly: true,
  },
};

export interface UserSession {
  role: Role | null;
}
