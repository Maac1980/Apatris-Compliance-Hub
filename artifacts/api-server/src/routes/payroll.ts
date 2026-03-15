import { Router } from "express";
import { fetchAllRecords, updateRecord } from "../lib/airtable.js";
import { mapRecordToWorker } from "../lib/compliance.js";
import {
  getAllPayrollRecords,
  getPayrollRecordsByWorker,
  appendPayrollRecord,
} from "../lib/payroll-records.js";
import { appendAuditLog } from "../lib/audit-log.js";

const router = Router();

// ─── GET /payroll/current ─────────────────────────────────────────────────────
// Returns all workers with their current payroll fields
router.get("/payroll/current", async (_req, res) => {
  try {
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker).map((w) => ({
      id: w.id,
      name: w.name,
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
// Update payroll fields for a single worker (inline grid edits)
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
// Close month: snapshot all workers → payroll-records.json, then reset fields
router.post("/payroll/commit", async (req, res) => {
  try {
    const body = req.body as { monthYear?: string; committedBy?: string };
    const monthYear = body.monthYear || new Date().toISOString().slice(0, 7); // "YYYY-MM"
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

      // Only snapshot workers who had hours this month
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

      // Reset hours, advances, penalties to 0 for next month
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

    try {
      const actor = (req as any).user;
      appendAuditLog({
        timestamp: new Date().toISOString(),
        actor: actor?.name || committedBy,
        actorEmail: actor?.email || "unknown",
        action: "PAYROLL_COMMIT",
        workerId: "—",
        workerName: "ALL",
        note: `Month ${monthYear} closed. ${snapshots.length} workers snapshotted.`,
      });
    } catch { /* non-blocking */ }

    res.json({
      success: true,
      monthYear,
      workersProcessed: workers.length,
      snapshotsSaved: snapshots.length,
      totalNettoPayout: snapshots.reduce((s, r) => s + r.finalNettoPayout, 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── GET /payroll/history/:workerId ──────────────────────────────────────────
// All payroll records for a specific worker
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
// All payroll records (for admin overview)
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
