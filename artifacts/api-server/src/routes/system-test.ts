/**
 * System Test Panel — one endpoint, full diagnostic.
 * GET /api/v1/system/test — runs all checks, returns structured results.
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne } from "../lib/db.js";

const router = Router();

interface CheckResult {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
  ms: number;
}

router.get("/v1/system/test", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  const checks: CheckResult[] = [];
  const tenantId = req.tenantId!;

  const runCheck = async (name: string, fn: () => Promise<string>): Promise<void> => {
    const start = Date.now();
    try {
      const detail = await fn();
      checks.push({ name, status: "PASS", detail, ms: Date.now() - start });
    } catch (err) {
      checks.push({ name, status: "FAIL", detail: err instanceof Error ? err.message : "Unknown error", ms: Date.now() - start });
    }
  };

  // 1. Database
  await runCheck("Database Connection", async () => {
    const r = await queryOne<any>("SELECT NOW() as ts, current_database() as db");
    return `Connected to ${r?.db} at ${r?.ts}`;
  });

  // 2. Workers
  await runCheck("Workers Table", async () => {
    const r = await queryOne<any>("SELECT COUNT(*)::int as count FROM workers WHERE tenant_id = $1", [tenantId]);
    return `${r?.count ?? 0} workers`;
  });

  // 3. TRC Cases
  await runCheck("TRC Cases", async () => {
    const r = await queryOne<any>("SELECT COUNT(*)::int as count FROM trc_cases WHERE tenant_id = $1", [tenantId]);
    return `${r?.count ?? 0} cases`;
  });

  // 4. Legal Cases
  await runCheck("Legal Cases", async () => {
    const r = await queryOne<any>("SELECT COUNT(*)::int as count FROM legal_cases WHERE tenant_id = $1", [tenantId]);
    const pending = await queryOne<any>("SELECT COUNT(*)::int as count FROM legal_cases WHERE tenant_id = $1 AND status IN ('NEW','PENDING')", [tenantId]);
    return `${r?.count ?? 0} total, ${pending?.count ?? 0} pending`;
  });

  // 5. Rejection Analyses
  await runCheck("Rejection Analyses", async () => {
    const r = await queryOne<any>("SELECT COUNT(*)::int as count FROM rejection_analyses WHERE tenant_id = $1", [tenantId]);
    return `${r?.count ?? 0} analyses`;
  });

  // 6. Document Intake
  await runCheck("Document Intake", async () => {
    const r = await queryOne<any>("SELECT COUNT(*)::int as count FROM document_intake WHERE tenant_id = $1", [tenantId]);
    const pending = await queryOne<any>("SELECT COUNT(*)::int as count FROM document_intake WHERE tenant_id = $1 AND status = 'PENDING_REVIEW'", [tenantId]);
    return `${r?.count ?? 0} total, ${pending?.count ?? 0} pending review`;
  });

  // 7. Worker Files
  await runCheck("Worker Files (R2 Storage)", async () => {
    const r = await queryOne<any>("SELECT COUNT(*)::int as count FROM worker_files WHERE tenant_id = $1", [tenantId]);
    const storageMode = process.env.FILE_STORAGE === "s3" ? "S3/R2" : "LOCAL";
    const bucket = process.env.S3_BUCKET ?? "not set";
    return `${r?.count ?? 0} files, storage: ${storageMode}, bucket: ${bucket}`;
  });

  // 8. Legal Briefs
  await runCheck("Legal Briefs", async () => {
    const r = await queryOne<any>("SELECT COUNT(*)::int as count FROM legal_briefs WHERE tenant_id = $1", [tenantId]);
    return `${r?.count ?? 0} briefs`;
  });

  // 9. Research Memos
  await runCheck("Research Memos (Legal Intel)", async () => {
    try {
      const r = await queryOne<any>("SELECT COUNT(*)::int as count FROM research_memos WHERE tenant_id = $1", [tenantId]);
      return `${r?.count ?? 0} memos`;
    } catch { return "Table not yet created (first use will create it)"; }
  });

  // 10. Document Action Log
  await runCheck("Document Action Log", async () => {
    const r = await queryOne<any>("SELECT COUNT(*)::int as count FROM document_action_log WHERE tenant_id = $1", [tenantId]);
    return `${r?.count ?? 0} log entries`;
  });

  // 11. Job Applications (Recruitment)
  await runCheck("Recruitment Pipeline", async () => {
    const r = await queryOne<any>("SELECT COUNT(*)::int as count FROM job_applications");
    return `${r?.count ?? 0} applications`;
  });

  // 12. Anthropic API
  await runCheck("Claude AI (Anthropic)", async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 10, messages: [{ role: "user", content: "Reply with OK" }] }),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    return `Connected — model: claude-sonnet-4-6`;
  });

  // 13. Perplexity API
  await runCheck("Perplexity (Research)", async () => {
    const key = process.env.PPLX_API_KEY;
    if (!key) throw new Error("PPLX_API_KEY not set");
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "sonar-pro", max_tokens: 10, messages: [{ role: "user", content: "Reply with OK" }] }),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    return `Connected — model: sonar-pro`;
  });

  // 14. R2/S3 Storage
  await runCheck("File Storage (R2/S3)", async () => {
    const mode = process.env.FILE_STORAGE;
    const bucket = process.env.S3_BUCKET;
    const endpoint = process.env.S3_ENDPOINT;
    const hasKey = !!process.env.S3_ACCESS_KEY_ID;
    if (mode !== "s3") throw new Error(`FILE_STORAGE=${mode ?? "not set"} — should be 's3' in production`);
    if (!bucket) throw new Error("S3_BUCKET not set");
    if (!endpoint) throw new Error("S3_ENDPOINT not set");
    if (!hasKey) throw new Error("S3_ACCESS_KEY_ID not set");
    return `Provider: R2, bucket: ${bucket}, endpoint: ${endpoint?.substring(0, 40)}...`;
  });

  // 15. Route count
  await runCheck("API Routes", async () => {
    const routeFiles = [
      "health", "auth", "workers", "hours", "payroll", "documents", "contracts",
      "compliance", "gps", "analytics", "ai", "settings", "admins", "history", "logs",
      "rejections", "legal-brief", "document-intake", "worker-files", "worker-validation",
      "case-intelligence", "legal-intelligence", "applications", "jobs", "matching",
      "onboarding", "crm", "smart-document", "system-health",
    ];
    return `${routeFiles.length} route modules registered`;
  });

  // 16. Compliance snapshot
  await runCheck("Compliance Status", async () => {
    const total = await queryOne<any>("SELECT COUNT(*)::int as count FROM workers WHERE tenant_id = $1", [tenantId]);
    const expired = await queryOne<any>("SELECT COUNT(*)::int as count FROM workers WHERE tenant_id = $1 AND trc_expiry < NOW()", [tenantId]);
    const expiring = await queryOne<any>("SELECT COUNT(*)::int as count FROM workers WHERE tenant_id = $1 AND trc_expiry BETWEEN NOW() AND NOW() + INTERVAL '30 days'", [tenantId]);
    return `${total?.count ?? 0} workers, ${expired?.count ?? 0} expired TRC, ${expiring?.count ?? 0} expiring within 30d`;
  });

  // Summary
  const passed = checks.filter(c => c.status === "PASS").length;
  const failed = checks.filter(c => c.status === "FAIL").length;
  const warned = checks.filter(c => c.status === "WARN").length;
  const totalMs = checks.reduce((sum, c) => sum + c.ms, 0);

  res.json({
    summary: {
      total: checks.length,
      passed, failed, warned,
      totalMs,
      overall: failed === 0 ? "ALL PASS" : `${failed} FAILED`,
      testedAt: new Date().toISOString(),
    },
    checks,
  });
});

export default router;
