/**
 * System Hardening — Stage 9
 * Safety guards, retry logic, field validation, AI output validation.
 *
 * MANDATORY RULES:
 * - No AI output can directly trigger deployment
 * - No deployment without APPROVED_FOR_DEPLOYMENT
 * - No worker/case mutation from regulatory system
 * - All failures logged, not silent
 */

// ═══ AI OUTPUT VALIDATION ═══════════════════════════════════════════════════

export interface ValidatedAIResponse {
  content: string;
  confidenceScore: number;
  sourceReferencePresent: boolean;
  requiresHumanReview: boolean;
  valid: boolean;
  reason?: string;
}

export function validateAIResponse(raw: string, context?: string): ValidatedAIResponse {
  if (!raw || raw.length < 5) {
    return { content: "", confidenceScore: 0, sourceReferencePresent: false, requiresHumanReview: true, valid: false, reason: "Empty AI response" };
  }

  // Check for error markers
  if (raw.startsWith("[AI") || raw.startsWith("[Error") || raw.startsWith("[Perplexity")) {
    return { content: raw, confidenceScore: 0, sourceReferencePresent: false, requiresHumanReview: true, valid: false, reason: "AI provider error" };
  }

  // Extract confidence if present in JSON
  let confidenceScore = 50;
  const confMatch = raw.match(/"confidence"\s*:\s*(\d+(?:\.\d+)?)/);
  if (confMatch) confidenceScore = Math.min(100, Number(confMatch[1]) > 1 ? Number(confMatch[1]) : Number(confMatch[1]) * 100);

  // Check for source references
  const sourceReferencePresent = /Art\.\s*\d+|ustaw|KPA|GDPR|RODO|Dz\.U\./i.test(raw);

  // Low confidence or no sources → requires review
  const requiresHumanReview = confidenceScore < 60 || !sourceReferencePresent;

  return { content: raw, confidenceScore, sourceReferencePresent, requiresHumanReview, valid: true };
}

// ═══ RETRY WITH TIMEOUT ═════════════════════════════════════════════════════

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
  timeoutMs = 15000,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) return res;

      // Don't retry 4xx errors (client errors)
      if (res.status >= 400 && res.status < 500) return res;

      lastError = new Error(`HTTP ${res.status}`);
      console.warn(`[RegIntel][Retry] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${url} → ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Unknown fetch error");
      if (attempt < maxRetries) {
        console.warn(`[RegIntel][Retry] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${url} → ${lastError.message}`);
        await sleep(1000 * (attempt + 1)); // Exponential-ish backoff
      }
    }
  }

  throw lastError ?? new Error("All retries failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══ FIELD VALIDATION ═══════════════════════════════════════════════════════

export function validateUpdateFields(data: Record<string, any>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data.title && !data.raw_text) errors.push("title or raw_text required");
  if (data.severity && !["CRITICAL", "HIGH", "MEDIUM", "LOW", "NO_IMPACT", "info", "warning", "critical"].includes(data.severity)) {
    errors.push(`Invalid severity: ${data.severity}`);
  }
  if (data.status && !["NEW", "INGESTED", "UNDER_REVIEW", "REVIEWED", "APPROVED_FOR_DEPLOYMENT", "DEPLOYED", "REJECTED", "ARCHIVED", "DUPLICATE"].includes(data.status)) {
    errors.push(`Invalid status: ${data.status}`);
  }
  return { valid: errors.length === 0, errors };
}

export function validateDeploymentPrerequisites(status: string, role: string): { allowed: boolean; reason?: string } {
  if (status !== "APPROVED_FOR_DEPLOYMENT") {
    return { allowed: false, reason: `Status must be APPROVED_FOR_DEPLOYMENT, got: ${status}` };
  }
  if (!["Admin", "Executive"].includes(role)) {
    return { allowed: false, reason: `Only Admin/Executive can execute deployments, got: ${role}` };
  }
  return { allowed: true };
}

// ═══ SYSTEM HEALTH ══════════════════════════════════════════════════════════

export async function getSystemHealth(): Promise<{ status: string; checks: Array<{ name: string; status: string; detail: string }> }> {
  const checks: Array<{ name: string; status: string; detail: string }> = [];

  // DB
  try {
    const { queryOne: qo } = await import("../lib/db.js");
    await qo("SELECT 1 as ok");
    checks.push({ name: "Database", status: "ok", detail: "Connected" });
  } catch (err) {
    checks.push({ name: "Database", status: "fail", detail: err instanceof Error ? err.message : "Failed" });
  }

  // Claude
  checks.push({ name: "Claude API", status: process.env.ANTHROPIC_API_KEY ? "ok" : "fail", detail: process.env.ANTHROPIC_API_KEY ? "Key configured" : "ANTHROPIC_API_KEY missing" });

  // Perplexity
  checks.push({ name: "Perplexity API", status: process.env.PPLX_API_KEY ? "ok" : "warn", detail: process.env.PPLX_API_KEY ? "Key configured" : "PPLX_API_KEY missing (research degraded)" });

  // R2/S3
  const storageOk = process.env.FILE_STORAGE === "s3" && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID;
  checks.push({ name: "File Storage", status: storageOk ? "ok" : "warn", detail: storageOk ? `R2: ${process.env.S3_BUCKET}` : "S3/R2 not fully configured" });

  const overallStatus = checks.some(c => c.status === "fail") ? "fail" : checks.some(c => c.status === "warn") ? "degraded" : "ok";
  return { status: overallStatus, checks };
}
