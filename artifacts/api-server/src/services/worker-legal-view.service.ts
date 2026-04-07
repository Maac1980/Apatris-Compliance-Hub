/**
 * Worker Legal View Service — generates safe, simplified legal status
 * for worker-facing display.
 *
 * RULES:
 *  - Never exposes raw legal terms (Art. 108, legalBasis, riskLevel)
 *  - Never shows internal conditions/warnings
 *  - Only approved custom messages are shown
 *  - Deterministic base messages per status (no AI, no hallucination)
 *  - Custom messages require is_approved = true
 */

import { query, queryOne } from "../lib/db.js";
import { getWorkerLegalSnapshot } from "./legal-status.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface WorkerLegalView {
  statusLabel: string;
  statusColor: "green" | "blue" | "amber" | "red" | "gray";
  explanation: string;
  whatHappensNext: string;
  whatYouNeedToDo: string | null;
  contactMessage: string;
  lastUpdated: string;
  customMessage: string | null;
}

// ═══ DETERMINISTIC STATUS MESSAGES ══════════════════════════════════════════

const STATUS_MAP: Record<string, {
  label: string;
  color: "green" | "blue" | "amber" | "red" | "gray";
  explanation: string;
  whatHappensNext: string;
  whatYouNeedToDo: string | null;
}> = {
  VALID: {
    label: "Active",
    color: "green",
    explanation: "Your work authorization is currently valid. You are cleared to work.",
    whatHappensNext: "Your employer will notify you when any action is needed regarding your documents.",
    whatYouNeedToDo: null,
  },
  EXPIRING_SOON: {
    label: "Renewal Needed",
    color: "amber",
    explanation: "Your work authorization is valid but will need to be renewed soon.",
    whatHappensNext: "Your employer is preparing the renewal process. They will contact you with instructions.",
    whatYouNeedToDo: "Please make sure your contact details are up to date so we can reach you about the renewal.",
  },
  PROTECTED_PENDING: {
    label: "Under Review",
    color: "blue",
    explanation: "Your renewal application has been submitted. You can continue working while the decision is pending.",
    whatHappensNext: "The authorities are reviewing your application. This process takes time. Your employer will inform you when there is an update.",
    whatYouNeedToDo: "No action needed from you right now. Continue working as usual.",
  },
  REVIEW_REQUIRED: {
    label: "Under Review",
    color: "amber",
    explanation: "Your documents are being reviewed by our team. We will update you soon.",
    whatHappensNext: "Our compliance team is checking your records. If any documents are needed, your coordinator will contact you.",
    whatYouNeedToDo: "If your coordinator asks for documents, please provide them as soon as possible.",
  },
  EXPIRED_NOT_PROTECTED: {
    label: "Action Required",
    color: "red",
    explanation: "There is an issue with your work authorization that needs attention.",
    whatHappensNext: "Your employer is working on resolving this. Please contact your coordinator for guidance.",
    whatYouNeedToDo: "Please contact your coordinator or the office as soon as possible.",
  },
  NO_PERMIT: {
    label: "Documents Needed",
    color: "red",
    explanation: "We need your work authorization documents on file.",
    whatHappensNext: "Your coordinator will contact you about which documents are needed.",
    whatYouNeedToDo: "Please provide your work permit, visa, or residence card to your coordinator.",
  },
};

const DEFAULT_STATUS = {
  label: "Pending Setup",
  color: "gray" as const,
  explanation: "Your records are being set up in the system.",
  whatHappensNext: "Your coordinator will contact you when everything is ready.",
  whatYouNeedToDo: null,
};

// ═══ SIMPLIFICATION ═════════════════════════════════════════════════════════

export function simplifyForWorker(internalMessage: string): string {
  let msg = internalMessage;

  // Remove legal article references
  msg = msg.replace(/Art\.\s*\d+[a-z]?\s*(ust\.\s*\d+)?\s*(pkt\s*\d+)?/gi, "");
  msg = msg.replace(/Ustawa\s+o\s+cudzoziemcach/gi, "");
  msg = msg.replace(/Specustawa/gi, "");
  msg = msg.replace(/CUKR/gi, "");

  // Remove internal terms
  msg = msg.replace(/PROTECTED_PENDING/g, "under review");
  msg = msg.replace(/EXPIRED_NOT_PROTECTED/g, "needs attention");
  msg = msg.replace(/REVIEW_REQUIRED/g, "being reviewed");
  msg = msg.replace(/NO_LEGAL_BASIS/g, "");
  msg = msg.replace(/ART_108/g, "");
  msg = msg.replace(/PERMIT_VALID/g, "");
  msg = msg.replace(/legalBasis/g, "");
  msg = msg.replace(/riskLevel/g, "");
  msg = msg.replace(/formal\s*defect\s*\(brak\s*formalny\)/gi, "a document issue");
  msg = msg.replace(/brak\s*formalny/gi, "a document issue");
  msg = msg.replace(/PIP\s*fine\s*risk[^.]*\./gi, "");
  msg = msg.replace(/voivodeship/gi, "immigration office");
  msg = msg.replace(/stempel\s*w\s*paszporcie/gi, "passport stamp");

  // Clean up whitespace
  msg = msg.replace(/\s{2,}/g, " ").trim();
  msg = msg.replace(/\s*—\s*/g, " — ");

  return msg || "Your status is being reviewed by our team.";
}

// ═══ CORE ═══════════════════════════════════════════════════════════════════

export async function getWorkerLegalView(workerId: string, tenantId: string): Promise<WorkerLegalView> {
  // Get snapshot
  let status = "UNKNOWN";
  try {
    const snapshot = await getWorkerLegalSnapshot(workerId, tenantId);
    status = snapshot.legalStatus;
  } catch {
    // No snapshot — use default
  }

  const mapped = STATUS_MAP[status] ?? DEFAULT_STATUS;

  // Check for approved custom message
  let customMessage: string | null = null;
  const approved = await queryOne<any>(
    `SELECT resp.response_json
     FROM ai_responses resp
     JOIN ai_requests req ON req.id = resp.ai_request_id
     WHERE req.worker_id = $1 AND req.tenant_id = $2
     AND req.audience_type = 'worker'
     AND resp.is_approved = TRUE
     ORDER BY resp.created_at DESC LIMIT 1`,
    [workerId, tenantId]
  );

  if (approved?.response_json) {
    const rj = typeof approved.response_json === "string"
      ? JSON.parse(approved.response_json)
      : approved.response_json;
    if (rj.explanation) {
      customMessage = simplifyForWorker(rj.explanation);
    }
  }

  return {
    statusLabel: mapped.label,
    statusColor: mapped.color,
    explanation: customMessage ?? mapped.explanation,
    whatHappensNext: mapped.whatHappensNext,
    whatYouNeedToDo: mapped.whatYouNeedToDo,
    contactMessage: "If you have questions, your coordinator will contact you. You can also call the office during working hours.",
    lastUpdated: new Date().toISOString(),
    customMessage,
  };
}
