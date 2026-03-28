import { Router } from "express";
import PDFDocument from "pdfkit";
import { fetchAllWorkers, updateWorker } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";
import { appendAuditLog } from "../lib/audit-log.js";
import { sendPayslipEmail, isMailConfigured } from "../lib/mailer.js";
import { query, queryOne, execute } from "../lib/db.js";
import { calculateNet } from "../lib/payroll.js";



// ─── Polish ZUS/PIT Net Calculation ──────────────────────────────────────────

const router = Router();

// ─── GET /payroll/current ─────────────────────────────────────────────────────
router.get("/payroll/current", async (_req, res) => {
  try {
    const rows = await fetchAllWorkers();
    const workers = rows.map(mapRowToWorker).map((w) => ({
      id: w.id,
      name: w.name,
      email: w.email ?? null,
      iban: w.iban ?? null,
      pit2: w.pit2 ?? false,
      specialization: w.specialization,
      assignedSite: w.assignedSite,
      hourlyRate: w.hourlyRate ?? 0,
      monthlyHours: w.monthlyHours ?? 0,
      advance: w.advance ?? 0,
      penalties: w.penalties ?? 0,
      grossPayout: ((w.hourlyRate ?? 0) * (w.monthlyHours ?? 0)),
      finalNetto: calculateNet((w.hourlyRate ?? 0) * (w.monthlyHours ?? 0)).net - (w.advance ?? 0) - (w.penalties ?? 0),
      complianceStatus: w.complianceStatus,
    }));
    res.json({ workers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── PATCH /payroll/workers/:id ───────────────────────────────────────────────
router.patch("/payroll/workers/:id", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fields: Record<string, unknown> = {};

    if (body.hourlyRate !== undefined)
      fields["HOURLY_RATE"] = body.hourlyRate === "" ? null : Number(body.hourlyRate);
    if (body.monthlyHours !== undefined)
      fields["MONTHLY_HOURS"] = body.monthlyHours === "" ? null : Number(body.monthlyHours);
    if (body.advance !== undefined)
      fields["Advance"] = body.advance === "" ? null : Number(body.advance);
    if (body.penalties !== undefined)
      fields["Penalties"] = body.penalties === "" ? null : Number(body.penalties);
    if (body.iban !== undefined)
      fields["IBAN"] = body.iban === "" ? null : String(body.iban);

    if (Object.keys(fields).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    await updateWorker(req.params.id, fields);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── POST /payroll/commit ─────────────────────────────────────────────────────
router.post("/payroll/commit", async (req, res) => {
  try {
    const body = req.body as { monthYear?: string; committedBy?: string };
    const monthYear = body.monthYear || new Date().toISOString().slice(0, 7);
    const committedBy = body.committedBy || "Unknown";

    const rows = await fetchAllWorkers();
    const workers = rows.map(mapRowToWorker);

    interface PayrollSnap {
      workerId: string; workerName: string; monthYear: string;
      totalHours: number; hourlyRate: number; grossPayout: number;
      advancesDeducted: number; penaltiesDeducted: number; finalNettoPayout: number;
    }
    const snapshots: PayrollSnap[] = [];
    const resetPromises: Promise<unknown>[] = [];

    for (const w of workers) {
      const hourlyRate = w.hourlyRate ?? 0;
      const totalHours = w.monthlyHours ?? 0;
      const advancesDeducted = w.advance ?? 0;
      const penaltiesDeducted = w.penalties ?? 0;
      const grossPayout = hourlyRate * totalHours;
      const finalNettoPayout = calculateNet(grossPayout).net - advancesDeducted - penaltiesDeducted;

      if (totalHours > 0 || advancesDeducted > 0) {
        snapshots.push({
          workerId: w.id, workerName: w.name, monthYear,
          totalHours, hourlyRate, grossPayout,
          advancesDeducted, penaltiesDeducted, finalNettoPayout,
        });
      }

      resetPromises.push(
        updateWorker(w.id, {
          "MONTHLY_HOURS": 0,
          "Advance": 0,
          "Penalties": 0,
        }).catch((e) =>
          console.warn(`[payroll/commit] Reset failed for ${w.name}:`, e instanceof Error ? e.message : e)
        )
      );
    }

    await Promise.all(resetPromises);

    // ── Calculate totals ──────────────────────────────────────────────────────
    const totalGross = snapshots.reduce((s, r) => s + r.grossPayout, 0);
    const totalNetto = snapshots.reduce((s, r) => s + r.finalNettoPayout, 0);

    // ── Send payslip emails to workers who have email + hours ─────────────────
    let payslipsSent = 0;
    const workerEmailMap = new Map(workers.map((w) => [w.id, w.email ?? null]));
    const workerSiteMap  = new Map(workers.map((w) => [w.id, w.assignedSite ?? ""]));
    const workerRateMap  = new Map(workers.map((w) => [w.id, w.hourlyRate ?? 0]));

    if (isMailConfigured() && snapshots.length > 0) {
      const emailPromises = snapshots.map(async (snap) => {
        const email = workerEmailMap.get(snap.workerId);
        if (!email) return;
        try {
          await sendPayslipEmail({
            workerName: snap.workerName,
            workerEmail: email,
            monthYear: snap.monthYear,
            site: workerSiteMap.get(snap.workerId) ?? "",
            totalHours: snap.totalHours,
            hourlyRate: workerRateMap.get(snap.workerId) ?? snap.hourlyRate,
            grossPayout: snap.grossPayout,
            advancesDeducted: snap.advancesDeducted,
            penaltiesDeducted: snap.penaltiesDeducted,
            finalNettoPayout: snap.finalNettoPayout,
          });
          payslipsSent++;
          // Log payslip send to notification_log
          execute(
            `INSERT INTO notification_log (channel, worker_id, worker_name, sent_by, recipient, message_preview, status)
             VALUES ('payslip',$1,$2,$3,$4,$5,'sent')`,
            [snap.workerId, snap.workerName, committedBy, email,
             `Payslip for ${snap.monthYear} — gross ${snap.grossPayout.toFixed(2)} PLN`]
          ).catch(() => {});
        } catch (e) {
          console.error(`[payroll/commit] Payslip email failed for ${snap.workerName}:`, e instanceof Error ? e.message : e);
        }
      });
      await Promise.allSettled(emailPromises);
    }

    // ── Persist commit to PostgreSQL ──────────────────────────────────────────
    try {
      const commitRow = await queryOne<{ id: number }>(
        `INSERT INTO payroll_commits (committed_at, committed_by, month, worker_count, total_gross, total_netto, payslips_sent)
         VALUES (NOW(),$1,$2,$3,$4,$5,$6) RETURNING id`,
        [committedBy, monthYear, snapshots.length, totalGross, totalNetto, payslipsSent]
      );
      const commitId = commitRow?.id;

      if (commitId) {
        const snapshotValues = snapshots.map((snap) => {
          const zus       = snap.grossPayout * 0.1126; // 9.76 + 1.5 — no chorobowe (2026 standard)
          const hlthBase  = snap.grossPayout - zus;
          const hlth      = hlthBase * 0.09;
          const txBase    = Math.max(0, Math.round(hlthBase * 0.80)); // KUP 20% of health base, rounded
          const pit       = Math.max(0, Math.round(txBase * 0.12 - 300)); // PIT-2 applied, rounded
          return [
            commitId, monthYear, snap.workerId, snap.workerName,
            workerSiteMap.get(snap.workerId) ?? "",
            snap.totalHours, snap.hourlyRate, snap.grossPayout,
            zus, hlth, pit, snap.advancesDeducted, snap.penaltiesDeducted, snap.finalNettoPayout
          ];
        });
        for (const sv of snapshotValues) {
          await execute(
            `INSERT INTO payroll_snapshots
             (commit_id,month,worker_id,worker_name,site,hours,hourly_rate,gross,employee_zus,health_ins,est_pit,advance,penalties,netto)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            sv
          );
        }
      }
    } catch (dbErr) {
      console.error("[payroll/commit] DB persist failed:", (dbErr as Error).message);
    }

    appendAuditLog({
      timestamp: new Date().toISOString(),
      actor: committedBy,
      actorEmail: "system",
      action: "PAYROLL_COMMIT",
      workerId: "—",
      workerName: "ALL",
      note: `Month ${monthYear} closed. ${snapshots.length} workers. Gross ${totalGross.toFixed(2)} PLN. ${payslipsSent} payslips sent.`,
    });

    res.json({
      success: true,
      monthYear,
      workersProcessed: workers.length,
      snapshotsSaved: snapshots.length,
      totalNettoPayout: totalNetto,
      payslipsSent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── GET /payroll/history/:workerId ──────────────────────────────────────────
router.get("/payroll/history/:workerId", async (req, res) => {
  try {
    const records = await query(
      `SELECT * FROM payroll_snapshots WHERE worker_id = $1 ORDER BY month DESC`,
      [req.params.workerId]
    );
    res.json({ records });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── GET /payroll/history ─────────────────────────────────────────────────────
router.get("/payroll/history", async (_req, res) => {
  try {
    const records = await query(
      `SELECT * FROM payroll_snapshots ORDER BY month DESC, worker_name ASC LIMIT 500`
    );
    res.json({ records });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── GET /payroll/export/bank-csv ────────────────────────────────────────────
router.get("/payroll/export/bank-csv", async (req, res) => {
  try {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    const [year, mon] = month.split("-");
    const monthNames: Record<string, string> = {
      "01": "Styczen", "02": "Luty", "03": "Marzec", "04": "Kwiecien",
      "05": "Maj", "06": "Czerwiec", "07": "Lipiec", "08": "Sierpien",
      "09": "Wrzesien", "10": "Pazdziernik", "11": "Listopad", "12": "Grudzien",
    };
    const periodPL = `${monthNames[mon] ?? mon} ${year}`;

    const dbRows = await fetchAllWorkers();
    const workers = dbRows.map(mapRowToWorker);

    const headers = ["Imie i Nazwisko", "Miejscowosc / Budowa", "Kwota Netto (PLN)", "Tytul Przelewu", "IBAN"];
    const csvRows = workers
      .filter((w) => (w.hourlyRate ?? 0) * (w.monthlyHours ?? 0) - (w.advance ?? 0) - (w.penalties ?? 0) > 0)
      .map((w) => {
        const gross = (w.hourlyRate ?? 0) * (w.monthlyHours ?? 0);
        const netto = gross - (w.advance ?? 0) - (w.penalties ?? 0);
        return [
          w.name,
          w.assignedSite || "—",
          netto.toFixed(2).replace(".", ","),
          `Wynagrodzenie za ${periodPL}`,
          w.iban ?? "",
        ];
      });

    const csvContent = [headers, ...csvRows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");

    const filename = `apatris-bank-transfers-${month}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.send("\uFEFF" + csvContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── GET /payroll/export/accounting-csv ──────────────────────────────────────
router.get("/payroll/export/accounting-csv", async (req, res) => {
  try {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);

    // Default ZUS/PIT rates (2026 Poland Umowa Zlecenie)
    const EMP_ZUS_RATE   = 0.1126; // 9.76 + 1.5 (no chorobowe — voluntary, not included per 2026 standard)
    const HEALTH_RATE    = 0.09;   // applied on (gross - empZUS)
    const KUP_RATE       = 0.20;   // cost of obtaining income
    const PIT_RATE       = 0.12;
    const PIT2_REDUCTION = 300;    // PLN if PIT-2 filed
    // Employer ZUS
    const EMPL_ZUS_RATE  = 0.2048; // 9.76+6.5+1.67+2.45+0.10

    const dbRows2 = await fetchAllWorkers();
    const workers = dbRows2.map(mapRowToWorker);

    const headers = [
      "Worker Name", "PESEL", "NIP", "Site",
      "Hours", "Rate (PLN/h)", "Gross (PLN)",
      "Employee ZUS (PLN)", "Health Ins. (PLN)", "KUP (PLN)", "Tax Base (PLN)",
      "PIT-2", "Est. PIT (PLN)", "Net After Tax (PLN)",
      "Advance (PLN)", "Penalties (PLN)", "Net Pay (PLN)",
      "Employer ZUS (PLN)", "Total Employer Cost (PLN)"
    ];

    const acctRows = workers.map((w) => {
      const rate     = w.hourlyRate ?? 0;
      const hours    = w.monthlyHours ?? 0;
      const advance  = w.advance ?? 0;
      const penalties = w.penalties ?? 0;
      const gross    = rate * hours;

      const empZUS     = gross * EMP_ZUS_RATE;
      const healthBase = gross - empZUS;
      const health     = healthBase * HEALTH_RATE;
      // KUP applied on Health Base, tax base rounded to integer (2026 Umowa Zlecenie rules)
      const taxBase    = Math.max(0, Math.round(healthBase * (1 - KUP_RATE)));
      const grossTax   = taxBase * PIT_RATE;
      const pit        = Math.max(0, Math.round(grossTax - (w.pit2 ? PIT2_REDUCTION : 0)));
      const netAfterTax = Math.max(0, gross - empZUS - health - pit);
      const kup        = healthBase * KUP_RATE;
      const netPay     = netAfterTax - advance - penalties;

      const emplZUS    = gross * EMPL_ZUS_RATE;
      const totalCost  = gross + emplZUS;

      const n2 = (v: number) => v.toFixed(2).replace(".", ",");
      return [
        w.name,
        w.pesel ?? "",
        w.nip ?? "",
        w.assignedSite ?? "",
        hours.toString(),
        n2(rate),
        n2(gross),
        n2(empZUS),
        n2(health),
        n2(kup),
        n2(taxBase),
        w.pit2 ? "TAK" : "NIE",
        n2(pit),
        n2(netAfterTax),
        n2(advance),
        n2(penalties),
        n2(netPay),
        n2(emplZUS),
        n2(totalCost),
      ];
    });

    const csvContent = [headers, ...acctRows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");

    const filename = `apatris-accounting-${month}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.send("\uFEFF" + csvContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── GET /payroll/export/pdf ──────────────────────────────────────────────────
router.get("/payroll/export/pdf", async (req, res) => {
  try {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    const now = new Date();

    const dbRows3 = await fetchAllWorkers();
    const workers = dbRows3.map(mapRowToWorker);

    const fmtPLN = (n: number) =>
      n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const pdfRows = workers.map((w) => {
      const rate = w.hourlyRate ?? 0;
      const hours = w.monthlyHours ?? 0;
      const advance = w.advance ?? 0;
      const penalties = w.penalties ?? 0;
      const gross = rate * hours;
      const netto = gross - advance - penalties;
      return { name: w.name, spec: w.specialization || "—", site: w.assignedSite || "—", rate, hours, gross, advance, penalties, netto };
    });

    const totalHours  = pdfRows.reduce((s, r) => s + r.hours, 0);
    const totalGross  = pdfRows.reduce((s, r) => s + r.gross, 0);
    const totalAdv    = pdfRows.reduce((s, r) => s + r.advance, 0);
    const totalPen    = pdfRows.reduce((s, r) => s + r.penalties, 0);
    const totalNetto  = pdfRows.reduce((s, r) => s + r.netto, 0);

    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const filename = `apatris-payroll-${month}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    doc.pipe(res);

    // Header
    doc.fontSize(18).fillColor("#C41E18").text("APATRIS SP. Z O.O. — PAYROLL SUMMARY", 40, 35);
    doc.fontSize(9).fillColor("#666666")
      .text(`Period: ${month}   |   Generated: ${now.toLocaleDateString("pl-PL")} ${now.toLocaleTimeString("pl-PL")}`, 40, 62)
      .text("ul. Chłodna 51, 00-867 Warszawa  ·  NIP: 5252828706  ·  KRS: 0000849614", 40, 75);

    // Table header
    const cols = [200, 70, 90, 55, 70, 70, 70, 70, 90];
    const headers2 = ["Worker", "Spec", "Site", "Rate", "Hours", "Gross (PLN)", "Advance", "Penalties", "Netto (PLN)"];
    let y = 100;
    doc.rect(40, y, 762, 18).fill("#C41E18");
    doc.fontSize(8).fillColor("#ffffff");
    let x = 40;
    headers2.forEach((h, i) => { doc.text(h, x + 3, y + 5, { width: cols[i], align: i >= 3 ? "right" : "left" }); x += cols[i]; });

    y += 18;
    pdfRows.forEach((r, idx) => {
      if (y > 530) { doc.addPage(); y = 40; }
      doc.rect(40, y, 762, 16).fill(idx % 2 === 0 ? "#f8fafc" : "#ffffff");
      doc.fontSize(8).fillColor("#1e293b");
      x = 40;
      const cells = [r.name, r.spec, r.site, fmtPLN(r.rate), String(r.hours), fmtPLN(r.gross), fmtPLN(r.advance), fmtPLN(r.penalties), fmtPLN(r.netto)];
      cells.forEach((c, i) => { doc.text(c, x + 3, y + 4, { width: cols[i] - 3, align: i >= 3 ? "right" : "left" }); x += cols[i]; });
      y += 16;
    });

    // Totals row
    doc.rect(40, y, 762, 18).fill("#1e293b");
    doc.fontSize(8).fillColor("#ffffff");
    x = 40;
    const totCells = ["TOTALS", "", "", "", String(totalHours), fmtPLN(totalGross), fmtPLN(totalAdv), fmtPLN(totalPen), fmtPLN(totalNetto)];
    totCells.forEach((c, i) => { doc.text(c, x + 3, y + 5, { width: cols[i] - 3, align: i >= 3 ? "right" : "left" }); x += cols[i]; });

    doc.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (!res.headersSent) res.status(500).json({ error: message });
  }
});

export default router;
