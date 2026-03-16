import { Router } from "express";
import { fetchAllRecords, updateRecord } from "../lib/airtable.js";
import { mapRecordToWorker } from "../lib/compliance.js";
import {
  getAllPayrollRecords,
  getPayrollRecordsByWorker,
  appendPayrollRecord,
} from "../lib/payroll-records.js";
import { appendAuditLog } from "../lib/audit-log.js";
import { sendPayslipEmail, isMailConfigured } from "../lib/mailer.js";
import { queryOne, execute } from "../lib/db.js";

const router = Router();

// ─── GET /payroll/current ─────────────────────────────────────────────────────
router.get("/payroll/current", async (_req, res) => {
  try {
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker).map((w) => ({
      id: w.id,
      name: w.name,
      email: w.email ?? null,
      specialization: w.specialization,
      assignedSite: w.assignedSite,
      hourlyRate: w.hourlyRate ?? 0,
      monthlyHours: w.monthlyHours ?? 0,
      advance: w.advance ?? 0,
      penalties: w.penalties ?? 0,
      grossPayout: ((w.hourlyRate ?? 0) * (w.monthlyHours ?? 0)),
      finalNetto: ((w.hourlyRate ?? 0) * (w.monthlyHours ?? 0)) - (w.advance ?? 0) - (w.penalties ?? 0),
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

    if (Object.keys(fields).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    await updateRecord(req.params.id, fields);
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

    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker);

    const snapshots: ReturnType<typeof appendPayrollRecord>[] = [];
    const resetPromises: Promise<unknown>[] = [];

    for (const w of workers) {
      const hourlyRate = w.hourlyRate ?? 0;
      const totalHours = w.monthlyHours ?? 0;
      const advancesDeducted = w.advance ?? 0;
      const penaltiesDeducted = w.penalties ?? 0;
      const grossPayout = hourlyRate * totalHours;
      const finalNettoPayout = grossPayout - advancesDeducted - penaltiesDeducted;

      if (totalHours > 0 || advancesDeducted > 0) {
        const snap = appendPayrollRecord({
          workerId: w.id,
          workerName: w.name,
          monthYear,
          totalHours,
          hourlyRate,
          grossPayout,
          advancesDeducted,
          penaltiesDeducted,
          finalNettoPayout,
          zusBaseSalary: grossPayout,
          committedAt: new Date().toISOString(),
          committedBy,
        });
        snapshots.push(snap);
      }

      resetPromises.push(
        updateRecord(w.id, {
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
          const zus  = snap.grossPayout * 0.1126;
          const hlth = (snap.grossPayout - zus) * 0.09;
          const kup  = snap.grossPayout * 0.20;
          const pit  = Math.max(0, (snap.grossPayout - zus - kup)) * 0.12;
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
    const records = getPayrollRecordsByWorker(req.params.workerId);
    records.sort((a, b) => b.monthYear.localeCompare(a.monthYear));
    res.json({ records });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── GET /payroll/history ─────────────────────────────────────────────────────
router.get("/payroll/history", async (_req, res) => {
  try {
    const records = getAllPayrollRecords();
    records.sort((a, b) => b.committedAt.localeCompare(a.committedAt));
    res.json({ records });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
