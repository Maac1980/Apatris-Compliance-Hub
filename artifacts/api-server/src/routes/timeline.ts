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

// GET /api/timeline/:workerId — aggregates events from multiple tables
router.get("/timeline/:workerId", requireAuth, async (req, res) => {
  try {
    const wid = req.params.workerId;
    const tid = req.tenantId!;
    const events: TimelineEvent[] = [];

    // 1. Worker created (from workers table)
    const worker = await query<any>(
      "SELECT full_name, specialization, assigned_site, created_at FROM workers WHERE id = $1 AND tenant_id = $2",
      [wid, tid]
    );
    if (worker[0]) {
      events.push({
        date: worker[0].created_at,
        type: "worker_created",
        category: "worker",
        description: `Worker profile created — ${worker[0].specialization || "General"}, assigned to ${worker[0].assigned_site || "unassigned"}`,
        source: "workers",
      });
    }

    // 2. Contracts
    const contracts = await query<any>(
      "SELECT contract_type, status, start_date, created_at FROM contracts WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [wid, tid]
    );
    for (const c of contracts) {
      events.push({
        date: c.created_at,
        type: "contract_created",
        category: "contract",
        description: `${(c.contract_type ?? "Contract").replace(/_/g, " ")} created — status: ${c.status}`,
        source: "contracts",
        status: c.status,
      });
    }

    // 3. Generated contracts
    const genContracts = await query<any>(
      "SELECT contract_type, company_name, status, created_at FROM generated_contracts WHERE worker_id = $1::text AND tenant_id = $2 ORDER BY created_at DESC",
      [wid, tid]
    );
    for (const g of genContracts) {
      events.push({
        date: g.created_at,
        type: "contract_generated",
        category: "contract",
        description: `AI contract generated — ${g.contract_type}${g.company_name ? ` for ${g.company_name}` : ""}`,
        source: "generated_contracts",
        status: g.status,
      });
    }

    // 4. Document workflows
    const docs = await query<any>(
      "SELECT document_type, status, uploaded_at, reviewed_at, reviewer_name FROM document_workflows WHERE worker_id = $1::text AND tenant_id = $2 ORDER BY uploaded_at DESC",
      [wid, tid]
    );
    for (const d of docs) {
      events.push({
        date: d.uploaded_at,
        type: "document_uploaded",
        category: "document",
        description: `${d.document_type} uploaded`,
        source: "document_workflows",
      });
      if (d.reviewed_at && d.status === "approved") {
        events.push({
          date: d.reviewed_at,
          type: "document_approved",
          category: "document",
          description: `${d.document_type} approved${d.reviewer_name ? ` by ${d.reviewer_name}` : ""}`,
          source: "document_workflows",
          status: "approved",
        });
      }
      if (d.reviewed_at && d.status === "rejected") {
        events.push({
          date: d.reviewed_at,
          type: "document_rejected",
          category: "document",
          description: `${d.document_type} rejected${d.reviewer_name ? ` by ${d.reviewer_name}` : ""}`,
          source: "document_workflows",
          status: "rejected",
        });
      }
    }

    // 5. Compliance documents (expiry tracking)
    const compDocs = await query<any>(
      "SELECT document_type, expiry_date, alert_status FROM documents WHERE worker_id = $1 AND tenant_id = $2",
      [wid, tid]
    );
    for (const cd of compDocs) {
      if (cd.alert_status === "resolved") {
        events.push({
          date: cd.expiry_date,
          type: "alert_resolved",
          category: "compliance",
          description: `${cd.document_type} compliance alert resolved`,
          source: "documents",
          status: "resolved",
        });
      }
    }

    // 6. Payroll snapshots
    const payroll = await query<any>(
      "SELECT month, hours, netto, created_at FROM payroll_snapshots WHERE worker_id = $1::text ORDER BY month DESC",
      [wid]
    );
    for (const p of payroll) {
      events.push({
        date: p.created_at ?? `${p.month}-28T00:00:00Z`,
        type: "payroll_processed",
        category: "payroll",
        description: `Payroll processed for ${p.month} — ${Number(p.hours ?? 0)}h, ${Number(p.netto ?? 0).toFixed(2)} PLN netto`,
        source: "payroll_snapshots",
      });
    }

    // 7. A1 certificates
    const a1s = await query<any>(
      "SELECT host_country, certificate_number, valid_from, status, created_at FROM a1_certificates WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [wid, tid]
    );
    for (const a of a1s) {
      events.push({
        date: a.created_at,
        type: "a1_issued",
        category: "compliance",
        description: `A1 certificate ${a.certificate_number ?? ""} issued for ${a.host_country} — ${a.status}`,
        source: "a1_certificates",
        status: a.status,
      });
    }

    // 8. Posting assignments
    const postings = await query<any>(
      "SELECT host_country, host_city, client_company, status, start_date, created_at FROM posting_assignments WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [wid, tid]
    );
    for (const pa of postings) {
      events.push({
        date: pa.created_at,
        type: "posting_assigned",
        category: "compliance",
        description: `Posted to ${pa.host_city ?? pa.host_country}${pa.client_company ? ` (${pa.client_company})` : ""} — ${pa.status}`,
        source: "posting_assignments",
        status: pa.status,
      });
    }

    // 9. Onboarding steps
    const onboarding = await query<any>(
      "SELECT step_name, status, completed_at FROM onboarding_checklists WHERE worker_id = $1::text AND tenant_id = $2 AND status = 'completed' ORDER BY completed_at DESC",
      [wid, tid]
    );
    for (const o of onboarding) {
      if (o.completed_at) {
        events.push({
          date: o.completed_at,
          type: "onboarding_completed",
          category: "onboarding",
          description: `Onboarding step completed: ${o.step_name}`,
          source: "onboarding_checklists",
          status: "completed",
        });
      }
    }

    // Sort newest first
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({ events, workerId: wid, count: events.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to build timeline" });
  }
});

export default router;
