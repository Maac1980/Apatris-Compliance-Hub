import { Router } from "express";
import PDFDocument from "pdfkit";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// TASK 15: COMPLIANCE HEATMAPS BY SITE
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/analytics/heatmap — compliance status per site
router.get("/analytics/heatmap", requireAuth, async (req, res) => {
  try {
    const rows = await fetchAllWorkers(req.tenantId!);
    const workers = rows.map(mapRowToWorker);

    // Group by site
    const siteMap = new Map<string, { total: number; compliant: number; warning: number; critical: number; nonCompliant: number }>();

    for (const w of workers) {
      const site = w.assignedSite || "Unassigned";
      if (!siteMap.has(site)) siteMap.set(site, { total: 0, compliant: 0, warning: 0, critical: 0, nonCompliant: 0 });
      const s = siteMap.get(site)!;
      s.total++;
      if (w.complianceStatus === "compliant") s.compliant++;
      else if (w.complianceStatus === "warning") s.warning++;
      else if (w.complianceStatus === "critical") s.critical++;
      else s.nonCompliant++;
    }

    const heatmap = Array.from(siteMap.entries()).map(([site, stats]) => ({
      site,
      ...stats,
      complianceRate: stats.total > 0 ? Math.round((stats.compliant / stats.total) * 100) : 0,
      riskLevel: stats.nonCompliant > 0 || stats.critical > 0 ? "high" : stats.warning > 0 ? "medium" : "low",
    })).sort((a, b) => a.complianceRate - b.complianceRate);

    res.json({ heatmap, totalSites: heatmap.length, totalWorkers: workers.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Heatmap generation failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TASK 16: PREDICTIVE ALERTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/analytics/predictive — who becomes non-compliant in next 30/60/90 days
router.get("/analytics/predictive", requireAuth, async (req, res) => {
  try {
    const rows = await fetchAllWorkers(req.tenantId!);
    const workers = rows.map(mapRowToWorker);
    const now = new Date();

    interface PredictiveAlert {
      workerId: string; workerName: string; site: string;
      documentType: string; expiryDate: string; daysUntilExpiry: number;
      urgency: "imminent" | "upcoming" | "future";
    }

    const alerts: PredictiveAlert[] = [];

    for (const w of workers) {
      const docs = [
        { type: "TRC Certificate", expiry: w.trcExpiry },
        { type: "Passport", expiry: w.passportExpiry },
        { type: "BHP Certificate", expiry: w.bhpExpiry },
        { type: "Work Permit", expiry: w.workPermitExpiry },
        { type: "Contract", expiry: w.contractEndDate },
      ];

      for (const doc of docs) {
        if (!doc.expiry) continue;
        const expiry = new Date(doc.expiry);
        const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (days > 0 && days <= 90) {
          alerts.push({
            workerId: w.id,
            workerName: w.name,
            site: w.assignedSite || "Unassigned",
            documentType: doc.type,
            expiryDate: doc.expiry,
            daysUntilExpiry: days,
            urgency: days <= 14 ? "imminent" : days <= 30 ? "upcoming" : "future",
          });
        }
      }
    }

    alerts.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    const summary = {
      imminent: alerts.filter(a => a.urgency === "imminent").length,
      upcoming: alerts.filter(a => a.urgency === "upcoming").length,
      future: alerts.filter(a => a.urgency === "future").length,
      totalAlerts: alerts.length,
      affectedWorkers: new Set(alerts.map(a => a.workerId)).size,
    };

    res.json({ alerts, summary });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Prediction failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TASK 17: AUTOMATED PDF COMPLIANCE REPORT
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/analytics/report/pdf — generate weekly compliance report as PDF
router.get(
  "/analytics/report/pdf",
  requireAuth,
  requireRole("Admin", "Executive", "LegalHead"),
  async (req, res) => {
    try {
      const rows = await fetchAllWorkers(req.tenantId!);
      const workers = rows.map(mapRowToWorker);
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

      const total = workers.length;
      const compliant = workers.filter(w => w.complianceStatus === "compliant").length;
      const warning = workers.filter(w => w.complianceStatus === "warning").length;
      const critical = workers.filter(w => w.complianceStatus === "critical").length;
      const nonCompliant = workers.filter(w => w.complianceStatus === "non-compliant").length;
      const complianceRate = total > 0 ? Math.round((compliant / total) * 100) : 0;

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="compliance-report-${now.toISOString().slice(0, 10)}.pdf"`);
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
      doc.pipe(res);

      // Header
      doc.rect(0, 0, 595, 50).fill("#1e293b");
      doc.fontSize(14).fillColor("#ffffff").font("Helvetica-Bold")
        .text("APATRIS SP. Z O.O. — COMPLIANCE REPORT", 50, 17);
      doc.moveDown(2);

      // Summary
      doc.fontSize(10).fillColor("#333333").font("Helvetica")
        .text(`Report Date: ${dateStr}`)
        .text(`Total Deployed Professionals: ${total}`)
        .moveDown(0.5);

      doc.fontSize(12).font("Helvetica-Bold").text("Compliance Summary");
      doc.moveDown(0.3);

      const stats = [
        { label: "Fully Compliant", value: compliant, color: "#10b981" },
        { label: "Warning (30-60 days)", value: warning, color: "#f59e0b" },
        { label: "Critical (<30 days)", value: critical, color: "#ef4444" },
        { label: "Non-Compliant (expired)", value: nonCompliant, color: "#dc2626" },
      ];

      for (const s of stats) {
        doc.fontSize(10).fillColor(s.color).text(`● ${s.label}: ${s.value}`, { indent: 20 });
      }

      doc.moveDown(0.5);
      doc.fontSize(14).fillColor(complianceRate >= 80 ? "#10b981" : complianceRate >= 60 ? "#f59e0b" : "#ef4444")
        .font("Helvetica-Bold").text(`Overall Compliance Rate: ${complianceRate}%`);
      doc.moveDown(1);

      // Non-compliant workers list
      const issues = workers.filter(w => w.complianceStatus !== "compliant");
      if (issues.length > 0) {
        doc.fontSize(12).fillColor("#333333").font("Helvetica-Bold").text("Workers Requiring Attention");
        doc.moveDown(0.3);

        for (const w of issues.slice(0, 30)) {
          doc.fontSize(9).fillColor("#333333").font("Helvetica-Bold").text(`${w.name}`, { continued: true });
          doc.font("Helvetica").text(` — ${w.assignedSite || "No site"} — ${w.complianceStatus.toUpperCase()}`);
          if (w.daysUntilNextExpiry !== null) {
            doc.fontSize(8).fillColor("#666666").text(`  Next expiry in ${w.daysUntilNextExpiry} days`, { indent: 20 });
          }
        }
      }

      // Footer
      doc.fontSize(7).fillColor("#aaaaaa")
        .text("Generated by Apatris Compliance Hub • Confidential", 50, 780, { width: 495, align: "center" });

      doc.end();
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : "Report generation failed" });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// TASK 18: AI COMPLIANCE COPILOT
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/analytics/copilot — ask natural language compliance questions
router.post(
  "/analytics/copilot",
  requireAuth,
  requireRole("Admin", "Executive", "LegalHead"),
  async (req, res) => {
    try {
      const { question } = req.body as { question?: string };
      if (!question?.trim()) return res.status(400).json({ error: "question is required" });

      // Gather context data
      const rows = await fetchAllWorkers(req.tenantId!);
      const workers = rows.map(mapRowToWorker);
      const now = new Date();

      const total = workers.length;
      const compliant = workers.filter(w => w.complianceStatus === "compliant").length;
      const critical = workers.filter(w => w.complianceStatus === "critical").length;
      const nonCompliant = workers.filter(w => w.complianceStatus === "non-compliant").length;
      const sites = [...new Set(workers.map(w => w.assignedSite).filter(Boolean))];

      // Build context for AI
      const expiringNext30 = workers.filter(w => {
        const days = w.daysUntilNextExpiry;
        return days !== null && days > 0 && days <= 30;
      });

      const context = `You are an AI compliance assistant for Apatris Sp. z o.o., a Polish welding staffing company.

Current data (${now.toISOString().slice(0, 10)}):
- Total workers: ${total}
- Compliant: ${compliant} (${Math.round(compliant/total*100)}%)
- Critical (expiring <30 days): ${critical}
- Non-compliant (expired): ${nonCompliant}
- Active sites: ${sites.join(", ")}
- Workers expiring in next 30 days: ${expiringNext30.map(w => `${w.name} (${w.assignedSite || "no site"}, ${w.daysUntilNextExpiry}d)`).join("; ")}

Answer the following question concisely and professionally. If you need to reference specific workers, use their names. Focus on actionable insights.`;

      // Try OpenAI if configured, otherwise return rule-based response
      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      if (apiKey && apiKey !== "placeholder") {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
          apiKey,
        });
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_completion_tokens: 500,
          messages: [
            { role: "system", content: context },
            { role: "user", content: question },
          ],
        });
        const answer = completion.choices[0]?.message?.content ?? "Unable to generate response.";
        return res.json({ answer, source: "ai", context: { total, compliant, critical, nonCompliant } });
      }

      // Fallback: rule-based response
      const q = question.toLowerCase();
      let answer = "";
      if (q.includes("compliance") && q.includes("rate")) {
        answer = `Current compliance rate is ${Math.round(compliant/total*100)}%. ${compliant} of ${total} workers are fully compliant. ${critical} are in critical status (expiring within 30 days) and ${nonCompliant} have expired documents.`;
      } else if (q.includes("expiring") || q.includes("next month")) {
        answer = `${expiringNext30.length} workers have documents expiring in the next 30 days: ${expiringNext30.slice(0, 5).map(w => w.name).join(", ")}${expiringNext30.length > 5 ? ` and ${expiringNext30.length - 5} more` : ""}.`;
      } else if (q.includes("site") || q.includes("risk")) {
        const siteStats = sites.map(s => {
          const siteWorkers = workers.filter(w => w.assignedSite === s);
          const siteCompliant = siteWorkers.filter(w => w.complianceStatus === "compliant").length;
          return { site: s, total: siteWorkers.length, rate: Math.round(siteCompliant/siteWorkers.length*100) };
        }).sort((a, b) => a.rate - b.rate);
        answer = `Site compliance rates: ${siteStats.map(s => `${s.site}: ${s.rate}% (${s.total} workers)`).join(", ")}. ${siteStats[0]?.site || "No sites"} has the lowest compliance.`;
      } else {
        answer = `Apatris currently manages ${total} workers across ${sites.length} sites. Compliance rate: ${Math.round(compliant/total*100)}%. ${critical + nonCompliant} workers need immediate attention. Ask about specific sites, expiring documents, or compliance rates for more details.`;
      }

      res.json({ answer, source: "rules", context: { total, compliant, critical, nonCompliant } });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Copilot query failed" });
    }
  }
);

export default router;
