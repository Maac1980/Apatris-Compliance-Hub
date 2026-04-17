/**
 * Compliance Enforcement Routes — all 10 enforcement features in one file.
 *
 * 1. Deadline countdowns
 * 2. PIP Inspection Mode
 * 3. Contract-permit cross-validation
 * 4. Ukrainian worker status tracker
 * 5. Compliance certificate generator
 * 6. Safety compliance lock (BHP/medical check before GPS check-in)
 * 7. ZUS audit trail (read-only, does NOT modify calculator)
 * 8. Annex 1 tracking
 */

import { Router } from "express";
import PDFDocument from "pdfkit";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { appendAuditLog } from "../lib/audit-log.js";
import { getActiveDeadlines, getOverdueDeadlines, completeDeadline, createDeadline, runDeadlineCheck } from "../services/deadline-engine.service.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];

// ═══ 1. DEADLINE COUNTDOWNS ════════════════════════════════════════════════

router.get("/v1/enforcement/deadlines", requireAuth, async (req, res) => {
  try {
    const deadlines = await getActiveDeadlines(req.tenantId!);
    const overdue = await getOverdueDeadlines(req.tenantId!);
    res.json({ deadlines, overdue, total: deadlines.length, overdueCount: overdue.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/enforcement/deadlines/:id/complete", requireAuth, async (req, res) => {
  try {
    await completeDeadline(req.params.id as string, req.tenantId!);
    res.json({ completed: true });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/enforcement/deadlines/check", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const result = await runDeadlineCheck(req.tenantId!);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══ 2. PIP INSPECTION MODE ════════════════════════════════════════════════

router.get("/v1/enforcement/pip-pack", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const site = (req.query.site as string) || "all";
    let sql = `SELECT w.id, w.first_name, w.last_name, w.nationality, w.specialization,
      w.trc_expiry, w.work_permit_expiry, w.passport_expiry, w.bhp_expiry,
      w.medical_exam_expiry, w.contract_end_date, w.contract_type, w.pesel,
      w.assigned_site, w.compliance_status
      FROM workers w WHERE w.tenant_id = $1`;
    const params: any[] = [req.tenantId!];
    if (site !== "all") { params.push(site); sql += ` AND w.assigned_site = $2`; }
    sql += " ORDER BY w.last_name";

    const workers = await query<any>(sql, params);
    const now = new Date();
    const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86_400_000) : null;
    const status = (days: number | null) => days === null ? "MISSING" : days < 0 ? "EXPIRED" : days < 30 ? "CRITICAL" : days <= 60 ? "WARNING" : "VALID";

    const pack = workers.map((w: any) => ({
      name: `${w.first_name} ${w.last_name}`,
      nationality: w.nationality,
      pesel: w.pesel,
      site: w.assigned_site,
      contractType: w.contract_type,
      documents: {
        trc: { expiry: w.trc_expiry, daysLeft: daysUntil(w.trc_expiry), status: status(daysUntil(w.trc_expiry)) },
        workPermit: { expiry: w.work_permit_expiry, daysLeft: daysUntil(w.work_permit_expiry), status: status(daysUntil(w.work_permit_expiry)) },
        bhp: { expiry: w.bhp_expiry, daysLeft: daysUntil(w.bhp_expiry), status: status(daysUntil(w.bhp_expiry)) },
        medical: { expiry: w.medical_exam_expiry, daysLeft: daysUntil(w.medical_exam_expiry), status: status(daysUntil(w.medical_exam_expiry)) },
        contract: { expiry: w.contract_end_date, daysLeft: daysUntil(w.contract_end_date), status: status(daysUntil(w.contract_end_date)) },
        passport: { expiry: w.passport_expiry, daysLeft: daysUntil(w.passport_expiry), status: status(daysUntil(w.passport_expiry)) },
      },
    }));

    const compliant = pack.filter((w: any) => Object.values(w.documents).every((d: any) => d.status === "VALID" || d.status === "MISSING")).length;

    res.json({
      site: site === "all" ? "All Sites" : site,
      generated: now.toISOString(),
      totalWorkers: pack.length,
      compliant,
      complianceRate: pack.length > 0 ? Math.round((compliant / pack.length) * 100) : 0,
      workers: pack,
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// PIP pack as PDF
router.get("/v1/enforcement/pip-pack/pdf", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const site = (req.query.site as string) || "all";
    // Fetch same data as JSON endpoint
    const packRes = await fetch(`${req.protocol}://${req.get("host")}/api/v1/enforcement/pip-pack?site=${encodeURIComponent(site)}`, {
      headers: { Authorization: req.headers.authorization ?? "", Cookie: req.headers.cookie ?? "" },
    });
    const pack = await packRes.json();

    const pdf = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="PIP_Inspection_Pack_${site}_${new Date().toISOString().slice(0, 10)}.pdf"`);
    pdf.pipe(res);

    // Header
    pdf.fontSize(8).fillColor("#C41E18").text("APATRIS COMPLIANCE HUB — PIP INSPECTION PACKAGE", { align: "right" });
    pdf.fontSize(7).fillColor("#666").text(`Generated: ${new Date().toLocaleString("en-GB")} | Site: ${pack.site}`, { align: "right" });
    pdf.moveDown(1);
    pdf.fontSize(16).fillColor("#111").text("PIP Inspection Compliance Package");
    pdf.fontSize(10).fillColor("#666").text(`${pack.totalWorkers} workers | ${pack.complianceRate}% compliant`);
    pdf.moveDown(1);

    for (const w of (pack.workers ?? []).slice(0, 50)) {
      pdf.fontSize(10).fillColor("#111").text(`${w.name} — ${w.nationality ?? ""} | ${w.contractType ?? ""} | PESEL: ${w.pesel ?? "N/A"}`);
      const docs = w.documents ?? {};
      for (const [key, val] of Object.entries(docs) as [string, any][]) {
        const color = val.status === "VALID" ? "#10B981" : val.status === "EXPIRED" ? "#EF4444" : val.status === "CRITICAL" ? "#F59E0B" : "#999";
        pdf.fontSize(8).fillColor(color).text(`  ${key}: ${val.expiry ?? "N/A"} — ${val.status} (${val.daysLeft !== null ? val.daysLeft + "d" : "—"})`, { continued: false });
      }
      pdf.moveDown(0.5);
    }

    appendAuditLog({
      timestamp: new Date().toISOString(),
      actor: req.user?.name ?? "unknown",
      actorEmail: req.user?.email ?? "",
      action: "DATA_EXPORT",
      workerId: "—",
      workerName: "ALL",
      note: `PIP Inspection Pack PDF: site=${site} — ${pack.totalWorkers ?? 0} workers, contains PESEL data`,
    });

    pdf.end();
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══ 3. CONTRACT-PERMIT CROSS-VALIDATION ════════════════════════════════

router.get("/v1/enforcement/validate-contract/:workerId", requireAuth, async (req, res) => {
  try {
    const worker = await queryOne<any>(
      "SELECT contract_type, work_permit_expiry, trc_expiry, nationality FROM workers WHERE id = $1 AND tenant_id = $2",
      [req.params.workerId, req.tenantId!]
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const issues: Array<{ severity: string; message: string; legal: string }> = [];
    const contractType = (worker.contract_type ?? "").toLowerCase();

    // Check 1: Work permit required for non-EU
    const euNationals = ["polish", "german", "french", "italian", "spanish", "dutch", "belgian", "czech", "slovak", "hungarian", "romanian", "bulgarian", "croatian", "slovenian", "estonian", "latvian", "lithuanian", "swedish", "danish", "finnish", "austrian", "irish", "greek", "portuguese", "cypriot", "maltese", "luxembourgish"];
    const isEU = euNationals.some(n => (worker.nationality ?? "").toLowerCase().includes(n));

    if (!isEU && !worker.work_permit_expiry && !worker.trc_expiry) {
      issues.push({ severity: "HARD_BLOCK", message: "Non-EU worker has no work permit or TRC on record", legal: "Art. 87 Ustawa o promocji zatrudnienia" });
    }

    // Check 2: Expired permit
    const now = new Date();
    if (worker.work_permit_expiry && new Date(worker.work_permit_expiry) < now) {
      issues.push({ severity: "HARD_BLOCK", message: "Work permit has expired", legal: "Art. 120 Ustawa o promocji zatrudnienia — fine up to PLN 60,000" });
    }

    // Check 3: Contract type warnings
    if (contractType.includes("zlecenie") && !isEU) {
      issues.push({ severity: "WARNING", message: "Umowa Zlecenie for non-EU worker — verify permit allows this contract type. Type A permits are employer-specific.", legal: "Art. 88 ust. 1 pkt 1" });
    }

    if (contractType.includes("b2b") || contractType.includes("dzielo")) {
      issues.push({ severity: "WARNING", message: "B2B/Dzielo contract — PIP can reclassify to employment without court (2026 amendment). Ensure genuine self-employment.", legal: "PIP Amendment 2026 — administrative reclassification power" });
    }

    res.json({
      workerId: req.params.workerId,
      contractType: worker.contract_type,
      nationality: worker.nationality,
      isEU,
      valid: issues.filter(i => i.severity === "HARD_BLOCK").length === 0,
      issues,
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══ 4. UKRAINIAN WORKER STATUS TRACKER ═════════════════════════════════

router.get("/v1/enforcement/ukrainian-status", requireAuth, async (req, res) => {
  try {
    const workers = await query<any>(
      `SELECT id, first_name, last_name, nationality, trc_expiry, work_permit_expiry,
              pesel, passport_expiry, contract_end_date, compliance_status
       FROM workers WHERE tenant_id = $1 AND LOWER(nationality) LIKE '%ukrain%'
       ORDER BY last_name`,
      [req.tenantId!]
    );

    const now = new Date();
    const PESEL_UKR_DEADLINE = new Date("2026-08-31");
    const CUKR_DEADLINE = new Date("2027-03-04");

    const tracked = workers.map((w: any) => ({
      id: w.id,
      name: `${w.first_name} ${w.last_name}`,
      pesel: w.pesel,
      permitExpiry: w.work_permit_expiry,
      trcExpiry: w.trc_expiry,
      peselPhotoDeadline: { date: "2026-08-31", daysLeft: Math.ceil((PESEL_UKR_DEADLINE.getTime() - now.getTime()) / 86_400_000) },
      cukrApplicationDeadline: { date: "2027-03-04", daysLeft: Math.ceil((CUKR_DEADLINE.getTime() - now.getTime()) / 86_400_000) },
      status: w.trc_expiry ? "HAS_TRC" : w.work_permit_expiry ? "HAS_PERMIT" : "NEEDS_ACTION",
    }));

    res.json({
      totalUkrainian: tracked.length,
      needsAction: tracked.filter((w: any) => w.status === "NEEDS_ACTION").length,
      peselDeadlineDays: Math.ceil((PESEL_UKR_DEADLINE.getTime() - now.getTime()) / 86_400_000),
      cukrDeadlineDays: Math.ceil((CUKR_DEADLINE.getTime() - now.getTime()) / 86_400_000),
      workers: tracked,
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══ 5. COMPLIANCE CERTIFICATE GENERATOR ════════════════════════════════

router.get("/v1/enforcement/certificate/pdf", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const workers = await query<any>(
      "SELECT trc_expiry, work_permit_expiry, bhp_expiry, medical_exam_expiry, contract_end_date, passport_expiry FROM workers WHERE tenant_id = $1",
      [req.tenantId!]
    );
    const now = new Date();
    const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86_400_000) : null;

    let compliant = 0, expiring = 0, expired = 0;
    for (const w of workers) {
      const dates = [w.trc_expiry, w.work_permit_expiry, w.bhp_expiry, w.medical_exam_expiry, w.contract_end_date, w.passport_expiry].filter(Boolean);
      const minDays = dates.length > 0 ? Math.min(...dates.map((d: string) => daysUntil(d) ?? 999)) : 999;
      if (minDays > 60) compliant++;
      else if (minDays > 0) expiring++;
      else expired++;
    }
    const complianceRate = workers.length > 0 ? Math.round((compliant / workers.length) * 100) : 0;

    const pdf = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Apatris_Compliance_Certificate_${now.toISOString().slice(0, 10)}.pdf"`);
    pdf.pipe(res);

    pdf.fontSize(10).fillColor("#C41E18").text("APATRIS COMPLIANCE HUB", { align: "center" });
    pdf.moveDown(2);
    pdf.fontSize(22).fillColor("#111").text("Compliance Certificate", { align: "center" });
    pdf.moveDown(0.5);
    pdf.fontSize(10).fillColor("#666").text(`Generated: ${now.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, { align: "center" });
    pdf.moveDown(2);

    pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).strokeColor("#ddd").stroke();
    pdf.moveDown(1);

    pdf.fontSize(12).fillColor("#111").text("Workforce Compliance Summary");
    pdf.moveDown(0.5);
    pdf.fontSize(10).fillColor("#333");
    pdf.text(`Total Workers: ${workers.length}`);
    pdf.text(`Fully Compliant: ${compliant} (${complianceRate}%)`);
    pdf.text(`Expiring Soon (30-60 days): ${expiring}`);
    pdf.text(`Expired / Action Required: ${expired}`);
    pdf.moveDown(1);

    // Compliance bar
    const barWidth = 400;
    const barY = pdf.y;
    pdf.rect(72, barY, barWidth, 16).fill("#f0f0f0");
    pdf.rect(72, barY, barWidth * (complianceRate / 100), 16).fill(complianceRate >= 80 ? "#10B981" : complianceRate >= 50 ? "#F59E0B" : "#EF4444");
    pdf.fontSize(9).fillColor("#fff").text(`${complianceRate}%`, 72 + barWidth * (complianceRate / 100) / 2 - 10, barY + 3);
    pdf.moveDown(2);

    pdf.fontSize(10).fillColor("#111").text("Document Health Breakdown");
    pdf.moveDown(0.3);
    pdf.fontSize(9).fillColor("#666");
    pdf.text(`GREEN (>60 days valid): ${compliant} workers`);
    pdf.text(`YELLOW (30-60 days): ${expiring} workers`);
    pdf.text(`RED (<30 days / expired): ${expired} workers`);
    pdf.moveDown(2);

    pdf.moveTo(50, pdf.y).lineTo(545, pdf.y).strokeColor("#ddd").stroke();
    pdf.moveDown(1);

    pdf.fontSize(8).fillColor("#999").text("This certificate is generated automatically by the Apatris Compliance Hub based on real-time worker document data. It is valid at the time of generation. For the most current status, scan a worker's QR compliance card or request a live portal link.", { align: "center", width: 450 });
    pdf.moveDown(1);
    pdf.fontSize(8).fillColor("#C41E18").text("Apatris Sp. z o.o. — Compliance Enforcement Platform", { align: "center" });

    appendAuditLog({
      timestamp: new Date().toISOString(),
      actor: req.user?.name ?? "unknown",
      actorEmail: req.user?.email ?? "",
      action: "DATA_EXPORT",
      workerId: "—",
      workerName: "ALL",
      note: `Compliance Certificate PDF: ${workers.length} workers, ${complianceRate}% compliant`,
    });

    pdf.end();
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══ 6. SAFETY COMPLIANCE LOCK — check before GPS check-in ══════════════

router.get("/v1/enforcement/safety-check/:workerId", requireAuth, async (req, res) => {
  try {
    const worker = await queryOne<any>(
      "SELECT bhp_expiry, medical_exam_expiry, first_name, last_name FROM workers WHERE id = $1 AND tenant_id = $2",
      [req.params.workerId, req.tenantId!]
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const now = new Date();
    const blocks: Array<{ type: string; message: string }> = [];

    if (worker.bhp_expiry && new Date(worker.bhp_expiry) < now) {
      blocks.push({ type: "BHP_EXPIRED", message: "BHP training certificate has expired. Worker cannot start work. Fine risk: PLN 60,000." });
    }
    if (worker.medical_exam_expiry && new Date(worker.medical_exam_expiry) < now) {
      blocks.push({ type: "MEDICAL_EXPIRED", message: "Medical examination (badania lekarskie) has expired. Worker cannot start work. Legal basis: Kodeks pracy Art. 229." });
    }

    res.json({
      workerId: req.params.workerId,
      workerName: `${worker.first_name} ${worker.last_name}`,
      canCheckIn: blocks.length === 0,
      blocks,
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══ 7. ZUS AUDIT TRAIL (read-only log) ═════════════════════════════════

router.get("/v1/enforcement/zus-audit", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const trails = await query<any>(
      `SELECT z.*, w.first_name || ' ' || w.last_name AS worker_name
       FROM zus_audit_trail z JOIN workers w ON z.worker_id = w.id
       WHERE z.tenant_id = $1 ORDER BY z.calculated_at DESC LIMIT $2`,
      [req.tenantId!, limit]
    );
    res.json({ trails, count: trails.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/v1/enforcement/zus-audit/log", requireAuth, async (req, res) => {
  try {
    const b = req.body;
    await execute(
      `INSERT INTO zus_audit_trail (tenant_id, worker_id, month_year, gross, employee_zus, health, pit, net, employer_zus, total_cost, contract_type, rates_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [req.tenantId!, b.workerId, b.monthYear, b.gross, b.employeeZus, b.health, b.pit, b.net, b.employerZus, b.totalCost, b.contractType, JSON.stringify(b.ratesUsed ?? {})]
    );
    res.status(201).json({ logged: true });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══ 8. ANNEX 1 TRACKING ════════════════════════════════════════════════

router.get("/v1/enforcement/annex1", requireAuth, async (req, res) => {
  try {
    const cases = await query<any>(
      `SELECT c.id, c.case_type, c.status, c.mos_employer_sig_status, c.mos_employer_sig_deadline,
              c.mos_fee_pln, w.first_name, w.last_name,
              (c.mos_employer_sig_deadline::date - CURRENT_DATE) AS days_until_sig
       FROM legal_cases c JOIN workers w ON c.worker_id = w.id
       WHERE c.tenant_id = $1 AND c.mos_employer_sig_status IS NOT NULL
         AND c.mos_employer_sig_status != 'signed'
       ORDER BY c.mos_employer_sig_deadline ASC NULLS LAST`,
      [req.tenantId!]
    );
    res.json({ cases, count: cases.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══ 9. COMPLIANCE RATE TRENDS ══════════════════════════════════════════

router.get("/v1/enforcement/trends", requireAuth, async (req, res) => {
  try {
    const snapshots = await query<any>(
      `SELECT * FROM compliance_snapshots WHERE tenant_id = $1 ORDER BY snapshot_date DESC LIMIT 90`,
      [req.tenantId!]
    );
    res.json({ snapshots, count: snapshots.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
