/**
 * Services barrel export.
 *
 * Import services from here:
 *   import { calculateFromGross, getCurrentPayroll } from "../services/index.js";
 */

// ZUS/Payroll calculations — single source of truth
export {
  ZUS_RATES,
  calculateFromGross,
  calculateNettoFromBrutto,
  calculateBruttoFromNetto,
  calculateWorkerPayroll,
  generateDraXml,
  type ZUSBreakdown,
  type ZUSOptions,
  type DRAWorker,
} from "./zus.service.js";

// Payroll workflow orchestration
export {
  getCurrentPayroll,
  getWorkerPayrollHistory,
  getAllPayrollHistory,
  sendPayslip,
  logPayrollAction,
  type PayrollWorkerView,
  type PayrollCommitResult,
  type PayrollSnapshot,
} from "./payroll.service.js";

// AI provider
export {
  getAIProvider,
  isAIConfigured,
  type AIProvider,
  type AICompletionOptions,
} from "./ai-provider.js";

// Existing services (re-exported for discoverability)
// These already live in lib/ and follow the service pattern
// Import them from their original locations or from here
