import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne } from "../lib/db.js";

const router = Router();

// Average PIP fine ranges per violation type (EUR)
const FINE_RANGES = { minor: 500, moderate: 5000, serious: 15000, critical: 30000 };
const COORDINATOR_HOURLY_RATE = 25; // EUR
const MANUAL_CHECK_HOURS = 2; // hours per worker per month for manual compliance
const INDUSTRY_DEPLOY_DAYS = 2.5; // industry average days to deploy a worker
const APATRIS_DEPLOY_MINUTES = 15;

async function calculateROI(companyId: string, tenantId: string) {
  // Workers assigned to this company
  const deals = await query<Record<string, any>>(
    "SELECT COALESCE(SUM(workers_needed), 0) AS total_workers, COALESCE(SUM(value_eur), 0) AS total_value FROM crm_deals WHERE company_id = $1 AND tenant_id = $2 AND stage = 'Active'",
    [companyId, tenantId]
  );
  const totalWorkers = Number(deals[0]?.total_workers ?? 0);
  const contractValue = Number(deals[0]?.total_value ?? 0);

  // Compliance alerts caught (would have been fines)
  const alertsCaught = await queryOne<Record<string, any>>(
    `SELECT COUNT(*) AS count FROM notification_log WHERE tenant_id = $1 AND channel IN ('email', 'whatsapp') AND status = 'sent' AND created_at >= NOW() - INTERVAL '12 months'`,
    [tenantId]
  );
  const complianceAlerts = Number(alertsCaught?.count ?? 0);

  // Immigration permits tracked
  const permits = await queryOne<Record<string, any>>(
    "SELECT COUNT(*) AS count FROM immigration_permits WHERE tenant_id = $1 AND status = 'active'",
    [tenantId]
  );
  const activePermits = Number(permits?.count ?? 0);

  // Documents processed
  const docs = await queryOne<Record<string, any>>(
    "SELECT COUNT(*) AS count FROM document_workflows WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '12 months'",
    [tenantId]
  );
  const docsProcessed = Number(docs?.count ?? 0);

  // Onboarding completed
  const onboarded = await queryOne<Record<string, any>>(
    `SELECT COUNT(DISTINCT worker_id) AS count FROM onboarding_checklists WHERE tenant_id = $1
     AND worker_id IN (SELECT worker_id FROM onboarding_checklists WHERE tenant_id = $1 GROUP BY worker_id HAVING COUNT(*) = COUNT(*) FILTER (WHERE status = 'completed'))`,
    [tenantId]
  );
  const workersOnboarded = Number(onboarded?.count ?? 0);

  // Calculate metrics
  const finesMinor = Math.floor(complianceAlerts * 0.6) * FINE_RANGES.minor;
  const finesModerate = Math.floor(complianceAlerts * 0.3) * FINE_RANGES.moderate;
  const finesSerious = Math.floor(complianceAlerts * 0.08) * FINE_RANGES.serious;
  const finesCritical = Math.floor(complianceAlerts * 0.02) * FINE_RANGES.critical;
  const totalFinesPrevented = finesMinor + finesModerate + finesSerious + finesCritical;

  const monthsActive = 12;
  const manualHoursSaved = totalWorkers * MANUAL_CHECK_HOURS * monthsActive;
  const hoursSavedValue = manualHoursSaved * COORDINATOR_HOURLY_RATE;

  const deployTimeSaved = totalWorkers * (INDUSTRY_DEPLOY_DAYS * 24 - APATRIS_DEPLOY_MINUTES / 60);
  const costPerCompliantWorker = totalWorkers > 0 ? Math.round(contractValue / totalWorkers) : 0;
  const industryBenchmark = costPerCompliantWorker > 0 ? Math.round(costPerCompliantWorker * 1.4) : 0;

  const totalValueDelivered = totalFinesPrevented + hoursSavedValue;

  return {
    companyId,
    totalWorkers,
    contractValue,
    complianceAlerts,
    activePermits,
    docsProcessed,
    workersOnboarded,
    finesPrevented: {
      total: totalFinesPrevented,
      breakdown: { minor: finesMinor, moderate: finesModerate, serious: finesSerious, critical: finesCritical },
    },
    hoursSaved: { hours: manualHoursSaved, value: hoursSavedValue },
    deploymentSpeed: { industryDays: INDUSTRY_DEPLOY_DAYS, apatrisMinutes: APATRIS_DEPLOY_MINUTES },
    costPerWorker: { apatris: costPerCompliantWorker, industry: industryBenchmark },
    nonComplianceIncidents: 0,
    totalValueDelivered,
  };
}

// GET /api/roi/:companyId
router.get("/roi/:companyId", requireAuth, async (req, res) => {
  try {
    const roi = await calculateROI(req.params.companyId, req.tenantId!);
    const company = await queryOne("SELECT company_name FROM crm_companies WHERE id = $1", [req.params.companyId]);
    res.json({ roi, companyName: (company as any)?.company_name || "Client" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/roi/:companyId/report — generate HTML report + send via email
router.get("/roi/:companyId/report", requireAuth, async (req, res) => {
  try {
    const roi = await calculateROI(req.params.companyId, req.tenantId!);
    const company = await queryOne<Record<string, any>>("SELECT * FROM crm_companies WHERE id = $1", [req.params.companyId]);
    const companyName = company?.company_name || "Client";
    const fmtEur = (n: number) => n.toLocaleString("en", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:Arial;max-width:700px;margin:0 auto;padding:40px;background:#fff;color:#1a1a1a;}
.header{background:linear-gradient(135deg,#C41E18,#8B1512);color:#fff;padding:32px;border-radius:12px;margin-bottom:24px;}
.header h1{margin:0;font-size:24px;} .header p{margin:4px 0 0;opacity:0.8;font-size:13px;}
.metric{display:inline-block;width:48%;vertical-align:top;margin-bottom:16px;padding:20px;background:#f8f8f8;border-radius:8px;border-left:4px solid #C41E18;}
.metric-value{font-size:28px;font-weight:900;color:#C41E18;} .metric-gold{color:#B8860B;}
.metric-label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-top:4px;}
.highlight{background:linear-gradient(135deg,#fef3c7,#fde68a);border-left-color:#B8860B;padding:24px;margin:24px 0;border-radius:8px;}
.highlight .metric-value{font-size:36px;color:#B8860B;}
.footer{text-align:center;color:#999;font-size:10px;margin-top:32px;padding-top:16px;border-top:1px solid #eee;}
</style></head><body>
<div class="header">
  <h1>ROI Report — ${companyName}</h1>
  <p>Apatris Compliance Value Report · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
</div>

<div class="highlight">
  <div class="metric-label">Total Value Delivered This Year</div>
  <div class="metric-value">${fmtEur(roi.totalValueDelivered)}</div>
</div>

<div class="metric"><div class="metric-value metric-gold">${fmtEur(roi.finesPrevented.total)}</div><div class="metric-label">Fines Prevented</div></div>
<div class="metric"><div class="metric-value">${roi.hoursSaved.hours}h</div><div class="metric-label">Hours Saved (${fmtEur(roi.hoursSaved.value)})</div></div>
<div class="metric"><div class="metric-value">${roi.totalWorkers}</div><div class="metric-label">Workers Deployed</div></div>
<div class="metric"><div class="metric-value">${roi.nonComplianceIncidents}</div><div class="metric-label">Non-Compliance Incidents</div></div>
<div class="metric"><div class="metric-value">${roi.complianceAlerts}</div><div class="metric-label">Compliance Alerts Resolved</div></div>
<div class="metric"><div class="metric-value">${roi.activePermits}</div><div class="metric-label">Active Permits Tracked</div></div>
<div class="metric"><div class="metric-value">${roi.deploymentSpeed.apatrisMinutes} min</div><div class="metric-label">Deployment Speed (vs ${roi.deploymentSpeed.industryDays} days industry)</div></div>
<div class="metric"><div class="metric-value">${roi.docsProcessed}</div><div class="metric-label">Documents Processed</div></div>

<div class="footer">
  Apatris Sp. z o.o. · NIP: 5252828706 · ul. Chłodna 51, 00-867 Warszawa · apatris.pl
</div>
</body></html>`;

    // If ?send=true and company has email, send via SMTP
    if (req.query.send === "true" && company?.contact_email) {
      try {
        const { isMailConfigured } = await import("../lib/mailer.js");
        if (isMailConfigured()) {
          const nodemailer = await import("nodemailer");
          const transport = nodemailer.default.createTransport({
            host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
            port: parseInt(process.env.SMTP_PORT || "587"),
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          });
          await transport.sendMail({
            from: `"Apatris" <${process.env.SMTP_USER}>`,
            to: company.contact_email,
            subject: `ROI Report — ${companyName} · Apatris`,
            html,
          });
        }
      } catch { /* non-blocking */ }
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ROI_Report_${companyName.replace(/ /g, "_")}.html"`);
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
