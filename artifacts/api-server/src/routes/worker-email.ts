/**
 * Worker Email System — auto-generate emails, inbound webhook, POA validation, GDPR consent.
 *
 * Features:
 * 1. Auto-generate worker email on creation (firstname.lastname@workers.apatris.pl)
 * 2. Inbound email webhook — receives emails and attaches to worker profile
 * 3. AI processes incoming emails for case updates
 * 4. POA validation checklist — blocks filing if incomplete
 * 5. GDPR multi-language consent (PL + EN + UA)
 * 6. Data retention auto-flag
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();
const LEGAL_ROLES = ["Admin", "Executive", "LegalHead"];
const EMAIL_DOMAIN = "workers.apatris.pl";

// ═══ 1. WORKER EMAIL GENERATION ═════════════════════════════════════════

function generateEmail(firstName: string, lastName: string): string {
  const clean = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  return `${clean(firstName)}.${clean(lastName)}@${EMAIL_DOMAIN}`;
}

// POST /api/v1/worker-email/generate — create email for a worker
router.post("/v1/worker-email/generate", requireAuth, async (req, res) => {
  try {
    const { workerId } = req.body as { workerId?: string };
    if (!workerId) return res.status(400).json({ error: "workerId required" });

    const worker = await queryOne<any>(
      "SELECT first_name, last_name FROM workers WHERE id = $1 AND tenant_id = $2",
      [workerId, req.tenantId!]
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    let email = generateEmail(worker.first_name, worker.last_name);

    // Check for duplicates, add number suffix if needed
    const existing = await queryOne<any>("SELECT id FROM worker_emails WHERE email = $1", [email]);
    if (existing) {
      const count = await queryOne<any>("SELECT COUNT(*)::int AS c FROM worker_emails WHERE email LIKE $1", [`${email.split("@")[0]}%@${EMAIL_DOMAIN}`]);
      email = `${email.split("@")[0]}${(count?.c ?? 0) + 1}@${EMAIL_DOMAIN}`;
    }

    await execute(
      "INSERT INTO worker_emails (worker_id, tenant_id, email) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING",
      [workerId, req.tenantId!, email]
    );

    // Also update worker's email field
    await execute("UPDATE workers SET email = $1 WHERE id = $2 AND tenant_id = $3", [email, workerId, req.tenantId!]);

    res.status(201).json({ email, workerId, domain: EMAIL_DOMAIN });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/worker-email/list — all generated emails
router.get("/v1/worker-email/list", requireAuth, async (req, res) => {
  try {
    const emails = await query<any>(
      `SELECT we.*, w.first_name, w.last_name FROM worker_emails we
       JOIN workers w ON we.worker_id = w.id
       WHERE we.tenant_id = $1 ORDER BY we.created_at DESC`,
      [req.tenantId!]
    );
    res.json({ emails, count: emails.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/v1/worker-email/generate-all — bulk generate emails for all workers without one
router.post("/v1/worker-email/generate-all", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const workers = await query<any>(
      `SELECT w.id, w.first_name, w.last_name FROM workers w
       WHERE w.tenant_id = $1 AND NOT EXISTS (SELECT 1 FROM worker_emails we WHERE we.worker_id = w.id)`,
      [req.tenantId!]
    );

    let generated = 0;
    for (const w of workers) {
      let email = generateEmail(w.first_name, w.last_name);
      const existing = await queryOne<any>("SELECT id FROM worker_emails WHERE email = $1", [email]);
      if (existing) email = `${email.split("@")[0]}${Date.now() % 1000}@${EMAIL_DOMAIN}`;

      await execute(
        "INSERT INTO worker_emails (worker_id, tenant_id, email) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING",
        [w.id, req.tenantId!, email]
      );
      await execute("UPDATE workers SET email = $1 WHERE id = $2", [email, w.id]);
      generated++;
    }

    res.json({ generated, total: workers.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ═══ 2. INBOUND EMAIL WEBHOOK ═══════════════════════════════════════════

// POST /api/public/email/inbound — receives emails (called by email routing service)
// This is PUBLIC — email services send webhooks without auth
router.post("/v1/email/inbound", async (req, res) => {
  try {
    const { from, to, subject, text, html } = req.body as {
      from?: string; to?: string; subject?: string; text?: string; html?: string;
    };
    if (!to) return res.status(400).json({ error: "to address required" });

    // Find worker by email
    const workerEmail = await queryOne<any>(
      "SELECT worker_id, tenant_id FROM worker_emails WHERE email = $1",
      [to.toLowerCase()]
    );

    const workerId = workerEmail?.worker_id ?? null;
    const tenantId = workerEmail?.tenant_id ?? null;

    // Store inbound email
    const bodyText = text || (html ? html.replace(/<[^>]*>/g, " ").slice(0, 5000) : "");

    const emailRecord = await queryOne<any>(
      `INSERT INTO inbound_emails (tenant_id, worker_id, from_address, to_address, subject, body_text)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tenantId, workerId, from ?? "unknown", to, subject ?? "", bodyText]
    );

    // AI extraction if worker matched
    if (workerId && tenantId && bodyText.length > 20) {
      try {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (apiKey) {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const anthropic = new Anthropic({ apiKey });
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6", max_tokens: 512,
            system: "Extract any case-relevant information from this email. Return JSON: { caseUpdate: true/false, updateType: string, details: string, actionRequired: string, deadlineDate: string|null }",
            messages: [{ role: "user", content: `Subject: ${subject}\n\n${bodyText.slice(0, 2000)}` }],
          });
          const aiText = response.content[0]?.type === "text" ? response.content[0].text : "{}";
          let extraction = {};
          try { extraction = JSON.parse(aiText.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { extraction = { raw: aiText }; }

          await execute("UPDATE inbound_emails SET ai_extraction = $1, processed = true WHERE id = $2",
            [JSON.stringify(extraction), emailRecord?.id]);

          // If it's a case update, log in notebook
          if ((extraction as any).caseUpdate) {
            try {
              const activeCase = await queryOne<any>(
                "SELECT id FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 AND status NOT IN ('APPROVED') ORDER BY created_at DESC LIMIT 1",
                [workerId, tenantId]
              );
              if (activeCase) {
                const { addNotebookEntry } = await import("../services/case-notebook.service.js");
                await addNotebookEntry(activeCase.id, tenantId, "auto",
                  `Inbound Email: ${subject ?? "No subject"}`,
                  `From: ${from}. ${(extraction as any).details ?? bodyText.slice(0, 200)}. Action: ${(extraction as any).actionRequired ?? "Review email."}`,
                  { metadata: { emailId: emailRecord?.id, extraction } }
                );
              }
            } catch { /* non-blocking */ }
          }
        }
      } catch { /* AI extraction non-critical */ }
    }

    res.json({ received: true, emailId: emailRecord?.id, workerMatched: !!workerId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/v1/email/inbox/:workerId — get emails for a worker
router.get("/v1/email/inbox/:workerId", requireAuth, async (req, res) => {
  try {
    const emails = await query<any>(
      "SELECT * FROM inbound_emails WHERE worker_id = $1 AND tenant_id = $2 ORDER BY received_at DESC LIMIT 50",
      [req.params.workerId, req.tenantId!]
    );
    res.json({ emails, count: emails.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ═══ 3. POA VALIDATION ══════════════════════════════════════════════════

router.post("/v1/poa/create", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const b = req.body;
    if (!b.workerId || !b.representativeName || !b.scope) {
      return res.status(400).json({ error: "workerId, representativeName, and scope required" });
    }

    // Validate completeness
    const issues: string[] = [];
    if (!b.representativeName) issues.push("Representative name is required");
    if (!b.scope) issues.push("Scope of representation is required");
    if (!b.voivodeship) issues.push("Voivodeship must be specified");
    if (!b.workerPassportNumber) issues.push("Worker passport number is required");
    if (!b.stampDutyPaid) issues.push("17 PLN stamp duty must be paid and attached");
    if (!b.workerSignature) issues.push("Worker signature is required");

    if (issues.length > 0) {
      return res.status(422).json({ valid: false, issues, message: "POA is incomplete — cannot file until all fields are completed" });
    }

    const poa = await queryOne<any>(
      `INSERT INTO poa_registry (worker_id, tenant_id, representative_name, representative_role, worker_passport_number, scope, voivodeship, stamp_duty_paid, stamp_duty_amount, worker_signature, valid_from, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE, 'active') RETURNING *`,
      [b.workerId, req.tenantId!, b.representativeName, b.representativeRole ?? null,
       b.workerPassportNumber, b.scope, b.voivodeship ?? null,
       b.stampDutyPaid ?? false, 17.00, b.workerSignature ?? false]
    );

    res.status(201).json({ poa, valid: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

router.get("/v1/poa/worker/:workerId", requireAuth, async (req, res) => {
  try {
    const poas = await query<any>(
      "SELECT * FROM poa_registry WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
      [req.params.workerId, req.tenantId!]
    );
    res.json({ poas, count: poas.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ═══ 4. GDPR MULTI-LANGUAGE CONSENT ═════════════════════════════════════

const CONSENT_TEMPLATES: Record<string, { type: string; text: string }> = {
  "data_processing_pl": {
    type: "data_processing",
    text: "Wyrażam zgodę na przetwarzanie moich danych osobowych przez Apatris Sp. z o.o. w celu zarządzania moim zatrudnieniem, dokumentami pobytowymi i zgodnością z prawem pracy. Moje dane będą przechowywane do końca ważności pozwolenia + 3 lata. Mam prawo do dostępu, sprostowania, usunięcia i przenoszenia danych. Kontakt z IOD: dpo@apatris.pl. Podstawa prawna: Art. 6 ust. 1 lit. a) RODO.",
  },
  "data_processing_en": {
    type: "data_processing",
    text: "I consent to the processing of my personal data by Apatris Sp. z o.o. for the purpose of managing my employment, residence documents, and labor law compliance. My data will be retained until permit expiry + 3 years. I have the right to access, rectify, erase, and port my data. DPO contact: dpo@apatris.pl. Legal basis: Art. 6(1)(a) GDPR.",
  },
  "data_processing_ua": {
    type: "data_processing",
    text: "Я даю згоду на обробку моїх персональних даних компанією Apatris Sp. z o.o. з метою управління моїм працевлаштуванням, документами на проживання та дотриманням трудового законодавства. Мої дані зберігатимуться до закінчення терміну дії дозволу + 3 роки. Я маю право на доступ, виправлення, видалення та перенесення моїх даних. Контакт DPO: dpo@apatris.pl. Правова основа: ст. 6(1)(a) GDPR.",
  },
};

router.get("/v1/gdpr/consent-templates", requireAuth, async (_req, res) => {
  res.json({ templates: CONSENT_TEMPLATES });
});

router.post("/v1/gdpr/consent", requireAuth, async (req, res) => {
  try {
    const { workerId, consentType, language, ipAddress } = req.body as Record<string, string>;
    if (!workerId || !consentType || !language) {
      return res.status(400).json({ error: "workerId, consentType, and language required" });
    }

    const templateKey = `${consentType}_${language}`;
    const template = CONSENT_TEMPLATES[templateKey];
    if (!template) return res.status(400).json({ error: `No template for ${templateKey}. Available: pl, en, ua` });

    // Calculate retention date (permit expiry + 3 years)
    const worker = await queryOne<any>("SELECT work_permit_expiry, trc_expiry FROM workers WHERE id = $1", [workerId]);
    const permitEnd = worker?.work_permit_expiry ?? worker?.trc_expiry;
    const retentionDate = permitEnd
      ? new Date(new Date(permitEnd).getTime() + 3 * 365 * 86_400_000).toISOString().slice(0, 10)
      : new Date(Date.now() + 6 * 365 * 86_400_000).toISOString().slice(0, 10); // default 6 years

    const record = await queryOne<any>(
      `INSERT INTO gdpr_consent_records (worker_id, tenant_id, consent_type, consent_language, consent_text, signed_at, ip_address, retention_until)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7) RETURNING *`,
      [workerId, req.tenantId!, consentType, language, template.text, ipAddress ?? null, retentionDate]
    );

    res.status(201).json({ consent: record });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ═══ 5. DATA RETENTION AUTO-FLAG ════════════════════════════════════════

router.get("/v1/gdpr/retention-flags", requireAuth, requireRole(...LEGAL_ROLES), async (req, res) => {
  try {
    const flagged = await query<any>(
      `SELECT gc.*, w.first_name, w.last_name
       FROM gdpr_consent_records gc JOIN workers w ON gc.worker_id = w.id
       WHERE gc.tenant_id = $1 AND gc.retention_until < CURRENT_DATE AND gc.status = 'active'
       ORDER BY gc.retention_until ASC`,
      [req.tenantId!]
    );
    res.json({ flagged, count: flagged.length, message: flagged.length > 0 ? `${flagged.length} record(s) past retention date — review for deletion` : "No records past retention date" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
