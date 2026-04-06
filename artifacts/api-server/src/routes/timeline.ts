import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query } from "../lib/db.js";

const router = Router();

interface TimelineEvent {
  date: string;
  type: string;
  category: string;
  description: string;
  source: string;
  status?: string;
}

// Safe query helper — returns empty array on error instead of crashing the whole endpoint
async function safeQuery<T = any>(sql: string, params: unknown[]): Promise<T[]> {
  try {
    return await query<T>(sql, params);
  } catch (err) {
    console.error("[Timeline] Query failed:", sql.slice(0, 60), err instanceof Error ? err.message : err);
    return [];
  }
}

// GET /api/timeline/:workerId — aggregates events from multiple tables
router.get("/timeline/:workerId", requireAuth, async (req, res) => {
  try {
    const wid = req.params.workerId;
    const tid = req.tenantId!;
    const events: TimelineEvent[] = [];

    // 1. Worker created
    const workers = await safeQuery<any>(
      "SELECT full_name, specialization, assigned_site, created_at FROM workers WHERE id = $1 AND tenant_id = $2",
      [wid, tid]
    );
    if (workers[0]) {
      events.push({
        date: workers[0].created_at,
        type: "worker_created",
        category: "worker",
        description: `Worker profile created — ${workers[0].specialization || "General"}, assigned to ${workers[0].assigned_site || "unassigned"}`,
        source: "workers",
      });
    }

    // 2. Contracts (worker_id is UUID)
    for (const c of await safeQuery<any>(
      "SELECT contract_type, status, start_date, created_at FROM contracts WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [wid, tid]
    )) {
      events.push({ date: c.created_at, type: "contract_created", category: "contract",
        description: `${(c.contract_type ?? "Contract").replace(/_/g, " ")} created — status: ${c.status}`, source: "contracts", status: c.status });
    }

    // 3. Generated contracts (worker_id is TEXT — compare as text)
    for (const g of await safeQuery<any>(
      "SELECT contract_type, company_name, status, created_at FROM generated_contracts WHERE worker_id::text = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [wid, tid]
    )) {
      events.push({ date: g.created_at, type: "contract_generated", category: "contract",
        description: `AI contract generated — ${g.contract_type}${g.company_name ? ` for ${g.company_name}` : ""}`, source: "generated_contracts", status: g.status });
    }

    // 4. Document workflows (worker_id is UUID)
    for (const d of await safeQuery<any>(
      "SELECT document_type, status, uploaded_at, reviewed_at, reviewer_name FROM document_workflows WHERE worker_id = $1 AND tenant_id = $2 ORDER BY uploaded_at DESC",
      [wid, tid]
    )) {
      events.push({ date: d.uploaded_at, type: "document_uploaded", category: "document",
        description: `${d.document_type} uploaded`, source: "document_workflows" });
      if (d.reviewed_at && d.status === "approved") {
        events.push({ date: d.reviewed_at, type: "document_approved", category: "document",
          description: `${d.document_type} approved${d.reviewer_name ? ` by ${d.reviewer_name}` : ""}`, source: "document_workflows", status: "approved" });
      }
      if (d.reviewed_at && d.status === "rejected") {
        events.push({ date: d.reviewed_at, type: "document_rejected", category: "document",
          description: `${d.document_type} rejected${d.reviewer_name ? ` by ${d.reviewer_name}` : ""}`, source: "document_workflows", status: "rejected" });
      }
    }

    // 5. Compliance documents
    for (const cd of await safeQuery<any>(
      "SELECT document_type, expiry_date, issue_date, status AS compliance_status, alert_status FROM documents WHERE worker_id::text = $1 AND tenant_id = $2",
      [wid, tid]
    )) {
      // Show every tracked document as an event
      events.push({ date: cd.issue_date ?? cd.expiry_date, type: "compliance_tracked", category: "compliance",
        description: `${cd.document_type} tracked — expires ${cd.expiry_date ? new Date(cd.expiry_date).toLocaleDateString("en-GB") : "N/A"} (${cd.compliance_status})`,
        source: "documents", status: cd.compliance_status });
      if (cd.alert_status === "resolved") {
        events.push({ date: cd.expiry_date, type: "alert_resolved", category: "compliance",
          description: `${cd.document_type} compliance alert resolved`, source: "documents", status: "resolved" });
      }
    }

    // 6. Payroll snapshots (worker_id is TEXT)
    for (const p of await safeQuery<any>(
      "SELECT month, hours, netto, created_at FROM payroll_snapshots WHERE worker_id = $1 ORDER BY month DESC",
      [wid]
    )) {
      events.push({ date: p.created_at ?? `${p.month}-28T00:00:00Z`, type: "payroll_processed", category: "payroll",
        description: `Payroll processed for ${p.month} — ${Number(p.hours ?? 0)}h, ${Number(p.netto ?? 0).toFixed(2)} PLN netto`,
        source: "payroll_snapshots" });
    }

    // 7. A1 certificates (worker_id is UUID)
    for (const a of await safeQuery<any>(
      "SELECT host_country, certificate_number, valid_from, status, created_at FROM a1_certificates WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [wid, tid]
    )) {
      events.push({ date: a.created_at, type: "a1_issued", category: "compliance",
        description: `A1 certificate ${a.certificate_number ?? ""} issued for ${a.host_country} — ${a.status}`,
        source: "a1_certificates", status: a.status });
    }

    // 8. Posting assignments (worker_id is UUID)
    for (const pa of await safeQuery<any>(
      "SELECT host_country, host_city, client_company, status, start_date, created_at FROM posting_assignments WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [wid, tid]
    )) {
      events.push({ date: pa.created_at, type: "posting_assigned", category: "compliance",
        description: `Posted to ${pa.host_city ?? pa.host_country}${pa.client_company ? ` (${pa.client_company})` : ""} — ${pa.status}`,
        source: "posting_assignments", status: pa.status });
    }

    // 9. Onboarding steps (worker_id is UUID)
    for (const o of await safeQuery<any>(
      "SELECT step_name, status, completed_at, created_at FROM onboarding_checklists WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [wid, tid]
    )) {
      events.push({ date: o.completed_at ?? o.created_at, type: o.status === "completed" ? "onboarding_completed" : "onboarding_pending",
        category: "onboarding", description: `Onboarding: ${o.step_name} — ${o.status}`,
        source: "onboarding_checklists", status: o.status });
    }

    // 10. Immigration permits (worker_id is UUID)
    for (const ip of await safeQuery<any>(
      "SELECT permit_type, status, expiry_date, country, created_at FROM immigration_permits WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [wid, tid]
    )) {
      events.push({ date: ip.created_at, type: "permit_recorded", category: "compliance",
        description: `${ip.permit_type} for ${ip.country ?? "PL"} — ${ip.status}${ip.expiry_date ? `, expires ${new Date(ip.expiry_date).toLocaleDateString("en-GB")}` : ""}`,
        source: "immigration_permits", status: ip.status });
    }

    // Filter out events with no valid date, then sort newest first
    const valid = events.filter(e => e.date && !isNaN(new Date(e.date).getTime()));
    valid.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({ events: valid, workerId: wid, count: valid.length });
  } catch (err) {
    console.error("[Timeline] Fatal error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to build timeline" });
  }
});

export default router;
