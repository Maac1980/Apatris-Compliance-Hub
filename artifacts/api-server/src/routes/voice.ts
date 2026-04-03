import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";
import { getDefaultTenantId } from "../lib/tenant.js";

const router = Router();

// POST /api/voice/webhook — Twilio Voice webhook (public, no auth)
// Initial call — greet and gather DTMF input
router.post("/voice/webhook", async (req, res) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="/api/voice/webhook/action" method="POST" timeout="10">
    <Say voice="alice" language="en-US">Welcome to Apatris. Press 1 to check in. Press 2 to check out.</Say>
  </Gather>
  <Say voice="alice" language="en-US">We did not receive any input. Goodbye.</Say>
</Response>`;
  res.type("text/xml").send(twiml);
});

// POST /api/voice/webhook/action — process DTMF digit
router.post("/voice/webhook/action", async (req, res) => {
  try {
    const body = req.body as Record<string, string>;
    const digit = body.Digits || "";
    const from = (body.From || "").replace("+", "").replace("whatsapp:", "");
    const callSid = body.CallSid || "";

    const checkinType = digit === "1" ? "check_in" : digit === "2" ? "check_out" : null;

    if (!checkinType) {
      res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice" language="en-US">Invalid selection. Goodbye.</Say></Response>`);
      return;
    }

    const tenantId = getDefaultTenantId();

    // Match phone to worker
    const worker = await queryOne<Record<string, any>>(
      "SELECT id, full_name, assigned_site FROM workers WHERE phone = $1 OR phone = $2 LIMIT 1",
      [from, `+${from}`]
    );

    const workerName = worker?.full_name || "Unknown";
    const site = worker?.assigned_site || null;
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const typeLabel = checkinType === "check_in" ? "Check in" : "Check out";

    // Save check-in
    await execute(
      `INSERT INTO voice_checkins (tenant_id, worker_id, worker_name, phone_number, checkin_type, site, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, worker?.id ?? null, workerName, from, checkinType, site, worker ? "recorded" : "unknown_caller"]
    );

    // If phone not recognised — alert coordinator
    if (!worker && tenantId) {
      try {
        const coords = await query<Record<string, any>>(
          "SELECT phone, name FROM site_coordinators WHERE tenant_id = $1 LIMIT 1",
          [tenantId]
        );
        for (const coord of coords) {
          if (coord.phone) {
            await sendWhatsAppAlert({
              to: coord.phone,
              workerName: coord.name || "Coordinator",
              workerI: "unknown",
              permitType: `UNKNOWN CALLER: Phone ${from} attempted voice ${typeLabel.toLowerCase()}. Number not matched to any worker.`,
              daysRemaining: 0,
              tenantId,
            });
          }
        }
      } catch { /* non-blocking */ }
    }

    const confirmMsg = worker
      ? `${typeLabel} recorded for ${workerName} at ${timeStr}. Thank you.`
      : `${typeLabel} recorded at ${timeStr}. Your phone number is not registered. Please contact your coordinator. Goodbye.`;

    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice" language="en-US">${confirmMsg}</Say></Response>`);
  } catch (err) {
    console.error("[Voice] Webhook error:", err);
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice" language="en-US">An error occurred. Please try again later.</Say></Response>`);
  }
});

// POST /api/voice/webhook/transcription — Whisper transcription callback
router.post("/voice/webhook/transcription", async (req, res) => {
  try {
    const body = req.body as Record<string, string>;
    const transcription = body.TranscriptionText || body.SpeechResult || "";
    const callSid = body.CallSid || "";
    const from = (body.From || "").replace("+", "");

    if (transcription && from) {
      // Update latest check-in for this phone with transcription
      await execute(
        `UPDATE voice_checkins SET transcription = $1 WHERE phone_number = $2 AND transcription IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [transcription, from]
      );
    }
    res.type("text/xml").send("<Response></Response>");
  } catch {
    res.type("text/xml").send("<Response></Response>");
  }
});

// GET /api/voice/checkins — all check-ins
router.get("/voice/checkins", requireAuth, async (req, res) => {
  try {
    const { date, site } = req.query as Record<string, string>;
    let sql = "SELECT * FROM voice_checkins WHERE tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (date) { params.push(date); sql += ` AND timestamp::date = $${params.length}::date`; }
    if (site) { params.push(site); sql += ` AND site = $${params.length}`; }
    sql += " ORDER BY timestamp DESC LIMIT 200";
    const rows = await query(sql, params);
    res.json({ checkins: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/voice/checkins/worker/:workerId — worker history
router.get("/voice/checkins/worker/:workerId", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM voice_checkins WHERE worker_id = $1 AND tenant_id = $2 ORDER BY timestamp DESC LIMIT 100",
      [req.params.workerId, req.tenantId!]
    );
    res.json({ checkins: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/voice/checkins/today — today's summary
router.get("/voice/checkins/today", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT checkin_type, COUNT(*) AS count
       FROM voice_checkins WHERE tenant_id = $1 AND timestamp::date = CURRENT_DATE
       GROUP BY checkin_type`,
      [req.tenantId!]
    );
    const checkIns = Number((rows as any[]).find(r => (r as any).checkin_type === "check_in")?.count ?? 0);
    const checkOuts = Number((rows as any[]).find(r => (r as any).checkin_type === "check_out")?.count ?? 0);
    const unknown = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS count FROM voice_checkins WHERE tenant_id = $1 AND timestamp::date = CURRENT_DATE AND status = 'unknown_caller'",
      [req.tenantId!]
    );
    res.json({ checkIns, checkOuts, unknownCallers: Number(unknown?.count ?? 0) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
