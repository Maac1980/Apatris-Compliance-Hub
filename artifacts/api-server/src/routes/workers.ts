import { Router, type IRouter } from "express";
import multer from "multer";
// Anthropic SDK loaded dynamically where needed
import { fetchAllWorkers, fetchWorkerById, createWorker, updateWorker } from "../lib/workers-db.js";
import { mapRowToWorker, filterWorkers, type Worker } from "../lib/compliance.js";
import type { Tier } from "../lib/encryption.js";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { sensitiveLimiter, publicLimiter } from "../lib/rate-limit.js";
import { execute, queryOne } from "../lib/db.js";
import { appendAuditLog } from "../lib/audit-log.js";
import { cached, cacheInvalidate } from "../lib/cache.js";
import { validateBody, CreateWorkerSchema, UpdateWorkerSchema } from "../lib/validate.js";

let anthropic: any = null;
import("@anthropic-ai/sdk").then(m => {
  anthropic = new m.default({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
}).catch(() => { console.warn("[workers] @anthropic-ai/sdk not available"); });

interface ScannedPassport {
  type: "passport";
  name: string | null;
  dateOfBirth: string | null;
  passportExpiry: string | null;
  passportNumber: string | null;
  nationality: string | null;
}

interface ScannedContract {
  type: "contract";
  contractEndDate: string | null;
  workerName: string | null;
}

type ScannedData = ScannedPassport | ScannedContract;

async function scanDocument(fileBuffer: Buffer, mimeType: string, docType: "passport" | "contract"): Promise<ScannedData | null> {
  const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!imageTypes.includes(mimeType)) return null;

  try {
    const base64 = fileBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    if (docType === "passport") {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/webp", data: base64 },
              },
              {
                type: "text",
                text: `Extract data from this passport. Return ONLY valid JSON with these fields (use null for any field not found):
{
  "name": "full name exactly as on passport (surname + given names)",
  "dateOfBirth": "YYYY-MM-DD or null",
  "passportExpiry": "YYYY-MM-DD or null",
  "passportNumber": "passport number or null",
  "nationality": "nationality or null"
}`,
              },
            ],
          },
        ],
      });
      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);
      return { type: "passport", ...parsed };
    } else {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/webp", data: base64 },
              },
              {
                type: "text",
                text: `Extract data from this employment contract. Return ONLY valid JSON:
{
  "contractEndDate": "YYYY-MM-DD or null (contract end / expiry date)",
  "workerName": "full name of the worker/employee or null"
}`,
              },
            ],
          },
        ],
      });
      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);
      return { type: "contract", ...parsed };
    }
  } catch (e) {
    console.error("[scanDocument] AI error:", e);
    return null;
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /workers/me — Self-service worker profile (workforce-app PWA Compliance Card)
//
// Default: returns own worker profile with PII masked per role (always masked for
// T5 default code path).
//
// Compliance Card exception: when ?purpose=compliance_card is passed, returns
// PLAINTEXT pesel/iban/passport_number — but ONLY if the requested record is
// the authenticated user's own. Writes immutable audit entry on both success
// (PLAINTEXT_PII_VIEWED) and denied attempts (PLAINTEXT_PII_ACCESS_DENIED).
//
// Defensive design (PC-1, R2): accepts optional ?worker_id=<id> param. If
// provided and doesn't match the resolved worker, the access is denied and
// audited as an attempted cross-record access.
//
// MUST be registered BEFORE GET /workers/:id so Express matches "me" first.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/workers/me", requireAuth, async (req, res) => {
  try {
    const userEmail = (req as any).user?.email as string | undefined;
    const tenantId = req.tenantId;
    if (!userEmail || !tenantId) return res.status(401).json({ error: "Unauthenticated" });

    // Resolve own worker by email
    const lookup = await queryOne<{ id: string }>(
      "SELECT id FROM workers WHERE email = $1 AND tenant_id = $2 LIMIT 1",
      [userEmail, tenantId]
    );
    if (!lookup) return res.status(404).json({ error: "Worker profile not found" });

    // Fetch full row with PII decrypted by workers-db
    const worker = await fetchWorkerById(lookup.id, tenantId);
    if (!worker) return res.status(404).json({ error: "Worker profile not found" });

    const purpose = req.query.purpose;
    const requestedWorkerId = req.query.worker_id;

    // Compliance Card plaintext exception (Apr 18 hybrid masking decision)
    if (purpose === "compliance_card") {
      // Own-record check: if worker_id query param provided AND doesn't match resolved worker, deny
      const ownRecord = !requestedWorkerId || requestedWorkerId === worker.id;
      if (!ownRecord) {
        // R2: log denied access attempt as security signal
        appendAuditLog({
          timestamp: new Date().toISOString(),
          actor: (req as any).user?.name ?? userEmail,
          actorEmail: userEmail,
          action: "PLAINTEXT_PII_ACCESS_DENIED" as any,
          workerId: String(requestedWorkerId),
          workerName: "(denied — own-record check failed)",
          note: `purpose=compliance_card; resolved_user_worker_id=${worker.id}`,
        });
        // Fall back to masked response
        return res.json({ worker: mapRowToWorker(worker, "T5") });
      }

      // Own record + valid flag → return plaintext + audit success
      appendAuditLog({
        timestamp: new Date().toISOString(),
        actor: (req as any).user?.name ?? userEmail,
        actorEmail: userEmail,
        action: "PLAINTEXT_PII_VIEWED" as any,
        workerId: worker.id,
        workerName: worker.full_name,
        note: "purpose=compliance_card",
      });
      // Plaintext response: bypass mapRowToWorker (which would mask), construct directly
      return res.json({
        worker: {
          id: worker.id,
          name: worker.full_name,
          pesel: worker.pesel,
          iban: worker.iban,
          passport_number: worker.passport_number,
          nationality: (worker as any).nationality ?? null,
          assignedSite: worker.assigned_site,
          trcExpiry: worker.trc_expiry,
          passportExpiry: worker.passport_expiry,
        },
      });
    }

    // Addition 5: warn on unexpected purpose value (typo defense — silent fallback would hide bugs)
    if (purpose != null && purpose !== "") {
      console.warn("[workers/me] unexpected purpose value:", purpose, "request:", req.method, req.path);
    }

    // Default: masked response via mapRowToWorker with T5 (always-mask)
    return res.json({ worker: mapRowToWorker(worker, "T5") });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /workers
router.get("/workers", requireAuth, async (req, res) => {
  try {
    const { search, specialization, status, site } = req.query as Record<string, string>;

    // Cache raw DB rows only; role-aware mapping happens per request so each
    // role sees the correct mask. Prior bug (P0-1, fixed 2026-04-20): mapping
    // inside cached() returned whichever role's mask filled the cache first —
    // post-encryption this meant every caller got garbage-masked ciphertext.
    // Cache key suffix `:raw` keeps existing `cacheInvalidate('workers:${t}')`
    // substring match working (workers.ts:537, :567).
    const rawRows = await cached(
      `workers:${req.tenantId}:raw`,
      () => fetchAllWorkers(req.tenantId!),
      15_000 // 15s cache — raw row data doesn't change every second
    );

    const role = (req as any).user?.role as Tier | undefined;
    const allWorkers = rawRows
      .map((r) => mapRowToWorker(r, role))
      .filter((w) => w.name && w.name !== "Unknown" && w.name.trim() !== "");

    const filtered = filterWorkers(allWorkers, search, specialization, status, site);
    res.json({ workers: filtered, total: filtered.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /workers/sites — returns all unique ASSIGNED SITE values
router.get("/workers/sites", requireAuth, async (req, res) => {
  try {
    const rows = await fetchAllWorkers(req.tenantId!);
    const workers = rows.map((r) => mapRowToWorker(r)).filter(
      (w) => w.name && w.name !== "Unknown" && w.name.trim() !== ""
    );
    const sites = Array.from(
      new Set(workers.map((w) => w.assignedSite).filter((s): s is string => !!s && s.trim() !== ""))
    ).sort();
    res.json({ sites });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /workers/stats
router.get("/workers/stats", requireAuth, async (req, res) => {
  try {
    const rows = await fetchAllWorkers(req.tenantId!);
    const workers = rows.map((r) => mapRowToWorker(r)).filter(
      (w) => w.name && w.name !== "Unknown" && w.name.trim() !== ""
    );

    const stats = {
      total: workers.length,
      critical: workers.filter((w) => w.complianceStatus === "critical").length,
      warning: workers.filter((w) => w.complianceStatus === "warning").length,
      compliant: workers.filter((w) => w.complianceStatus === "compliant").length,
      nonCompliant: workers.filter((w) => w.complianceStatus === "non-compliant").length,
    };

    res.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /workers/report
router.get("/workers/report", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const rows = await fetchAllWorkers(req.tenantId!);
    const workers = rows.map((r) => mapRowToWorker(r));

    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    interface ExpiringDocument {
      workerId: string;
      workerName: string;
      specialization: string;
      documentType: string;
      expiryDate: string;
      daysUntilExpiry: number;
      status: string;
    }

    function checkDoc(
      worker: Worker,
      docType: string,
      expiry: string | null
    ): ExpiringDocument | null {
      if (!expiry) return null;
      const expiryDate = new Date(expiry);
      const days = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        workerId: worker.id,
        workerName: worker.name,
        specialization: worker.specialization,
        documentType: docType,
        expiryDate: expiry,
        daysUntilExpiry: days,
        status:
          days < 0
            ? "expired"
            : days < 30
              ? "critical"
              : days < 60
                ? "warning"
                : "safe",
      };
    }

    const allExpiring: ExpiringDocument[] = [];

    for (const worker of workers) {
      const docs = [
        checkDoc(worker, "TRC", worker.trcExpiry),
        checkDoc(worker, "Work Permit", worker.workPermitExpiry),
        checkDoc(worker, "Contract", worker.contractEndDate),
      ];

      for (const doc of docs) {
        if (doc && doc.daysUntilExpiry < 60) {
          allExpiring.push(doc);
        }
      }
    }

    const expiringThisWeek = allExpiring.filter((d) => {
      const expiryDate = new Date(d.expiryDate);
      return expiryDate >= now && expiryDate <= oneWeekFromNow;
    });

    const critical = allExpiring.filter(
      (d) => d.status === "critical" || d.status === "expired"
    );
    const warning = allExpiring.filter((d) => d.status === "warning");

    const summary =
      `As of ${now.toLocaleDateString()}, there are ${workers.length} workers on record. ` +
      `${critical.length} documents are critically expiring within 30 days (or already expired). ` +
      `${warning.length} documents are expiring within 30-60 days. ` +
      `${expiringThisWeek.length} documents expire within the next 7 days. ` +
      `Immediate action is required for ${critical.length} document(s).`;

    res.json({
      generatedAt: now.toISOString(),
      totalWorkers: workers.length,
      expiringThisWeek,
      critical,
      warning,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /workers/bulk-create — AI Smart Bulk Upload: scan docs, create new worker row
const bulkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function scanBulkDocument(
  fileBuffer: Buffer,
  mimeType: string,
  category: "passport" | "bhp" | "certificate" | "contract" | "cv"
): Promise<Record<string, string | null>> {
  const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!imageTypes.includes(mimeType)) return {};

  const prompts: Record<string, string> = {
    passport: `Extract from this passport image. Look for BOTH "Given Name" / "Prénom" AND "Surname" / "Nom" fields separately. Indian passports show Given Name (which may include father's name) and Surname in different areas. Combine them as: givenName + " " + surname = full name. If only one is visible, use what you can read. Return ONLY valid JSON:
{"name":"full name (givenName + surname combined) or given name only if surname not visible, or null only if nothing readable","givenName":"given name field or null","surname":"surname field or null","dateOfBirth":"YYYY-MM-DD or null","passportExpiry":"YYYY-MM-DD or null","nationality":"nationality or null","passportNumber":"passport number or null"}`,
    bhp: `Extract from this BHP/safety certificate. Return ONLY valid JSON:
{"name":"worker full name or null","bhpExpiry":"YYYY-MM-DD or null"}`,
    certificate: `Extract from this TRC/welding certificate. Return ONLY valid JSON:
{"name":"worker full name or null","trcExpiry":"YYYY-MM-DD or null","specialization":"Scan for welding process keywords: TIG, MIG, MAG, MMA, FCAW, ARC, FABRICATOR, electrode. Return the matched keyword exactly as written (e.g. 'TIG' or 'MIG' or 'MAG' or 'FABRICATOR') or null if none found"}`,
    contract: `Extract from this employment contract. Return ONLY valid JSON:
{"name":"worker full name or null","contractEndDate":"YYYY-MM-DD or null"}`,
    cv: `Extract from this CV or resume document. Return ONLY valid JSON:
{"name":"full name or null","experience":"years of experience as a short string e.g. '5 years' or 'Junior' or null","qualification":"main qualifications or certifications as a short string or null"}`,
  };

  try {
    const base64 = fileBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/webp", data: base64 } },
            { type: "text", text: prompts[category] },
          ],
        },
      ],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    return JSON.parse(jsonMatch[0]) as Record<string, string | null>;
  } catch (e) {
    console.error(`[scanBulkDocument] AI error for ${category}:`, e);
    return {};
  }
}

router.post("/workers/bulk-create", requireAuth, requireRole("Admin", "Executive", "TechOps", "Coordinator"), sensitiveLimiter, bulkUpload.fields([
  { name: "passport", maxCount: 1 },
  { name: "bhp", maxCount: 1 },
  { name: "certificate", maxCount: 1 },
  { name: "contract", maxCount: 1 },
]), async (req, res) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    // Scan all uploaded files in parallel
    type ScanResult = Record<string, string | null | undefined>;
    const empty: ScanResult = {};
    const scans = await Promise.all<ScanResult>([
      files?.passport?.[0]
        ? scanBulkDocument(files.passport[0].buffer, files.passport[0].mimetype, "passport")
        : Promise.resolve(empty),
      files?.bhp?.[0]
        ? scanBulkDocument(files.bhp[0].buffer, files.bhp[0].mimetype, "bhp")
        : Promise.resolve(empty),
      files?.certificate?.[0]
        ? scanBulkDocument(files.certificate[0].buffer, files.certificate[0].mimetype, "certificate")
        : Promise.resolve(empty),
      files?.contract?.[0]
        ? scanBulkDocument(files.contract[0].buffer, files.contract[0].mimetype, "contract")
        : Promise.resolve(empty),
    ]);

    const [passportData, bhpData, certData, contractData] = scans;

    // Merge: later keys win, but name priority: passport > certificate > contract > bhp
    const merged = { ...bhpData, ...contractData, ...certData, ...passportData };

    // Build worker fields
    const workerFields: Record<string, unknown> = {};
    const extractedSummary: Record<string, string> = {};

    // Name resolution: AI combined name > givenName+surname > manual fallback
    const manualName = typeof req.body?.workerName === "string" ? req.body.workerName.trim() : "";
    let resolvedName = merged.name?.trim() || null;

    // If AI couldn't combine, try givenName + surname from passport
    if (!resolvedName && passportData.givenName) {
      const given = (passportData.givenName ?? "").trim();
      const surname = (passportData.surname ?? "").trim();
      resolvedName = surname ? `${given} ${surname}` : given;
    }

    // Manual fallback from form field
    if (!resolvedName && manualName) {
      resolvedName = manualName;
    }

    // Validation: name is required
    if (!resolvedName) {
      return res.status(400).json({
        error: "Could not extract worker name from uploaded documents. Please enter the name manually.",
        extracted: { ...passportData, ...certData, ...bhpData, ...contractData },
      });
    }

    workerFields.full_name = resolvedName;
    extractedSummary.name = resolvedName;

    // Store passport number if extracted
    if (passportData.passportNumber) {
      workerFields.passport_number = passportData.passportNumber;
      extractedSummary.passportNumber = passportData.passportNumber;
    }

    if (passportData.passportExpiry) {
      workerFields.passport_expiry = passportData.passportExpiry;
      extractedSummary.passportExpiry = passportData.passportExpiry;
    }
    if (certData.trcExpiry) {
      workerFields.trc_expiry = certData.trcExpiry;
      extractedSummary.trcExpiry = certData.trcExpiry;
    }
    if (bhpData.bhpExpiry) {
      workerFields.bhp_expiry = bhpData.bhpExpiry;
      extractedSummary.bhpExpiry = bhpData.bhpExpiry;
    }

    // QUALIFICATION: manual profession takes priority, then AI cert specialization
    const manualProfession = typeof req.body?.profession === "string" ? req.body.profession.trim() : "";
    const aiSpecialization = typeof certData.specialization === "string" ? certData.specialization.trim() : "";
    const finalSpecialization = manualProfession || aiSpecialization;
    if (finalSpecialization) {
      workerFields.specialization = finalSpecialization;
      extractedSummary.specialization = finalSpecialization;
    }

    // Create the new worker record
    const newRecord = await createWorker(workerFields, req.tenantId!);
    const recordId = newRecord.id;

    // TODO: implement file storage migration (previously Airtable attachments)

    const row = await fetchWorkerById(recordId, req.tenantId!);
    // Role-aware projection: admins who just created the worker see plaintext PII (Apr 18 hybrid masking)
    res.json({ worker: mapRowToWorker(row!, (req as any).user?.role as Tier), extracted: extractedSummary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[bulk-create] Error:", message);
    res.status(500).json({ error: message });
  }
});

// POST /workers — create a single worker from JSON body
router.post("/workers", requireAuth, requireRole("Admin", "Executive", "TechOps", "Coordinator"), validateBody(CreateWorkerSchema), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.name && !body.fullName && !body.full_name) {
      return res.status(400).json({ error: "Worker name is required (send as 'name', 'fullName', or 'full_name')" });
    }
    // Normalise 'name' → 'fullName' so FIELD_MAP picks it up
    if (body.name && !body.fullName) { body.fullName = body.name; delete body.name; }
    const newRecord = await createWorker(body as any, req.tenantId!);
    const row = await fetchWorkerById(newRecord.id, req.tenantId!);
    // Role-aware projection: admin just created — gets plaintext per Hybrid masking
    const mapped = mapRowToWorker(row!, (req as any).user?.role as Tier);
    appendAuditLog({ timestamp: new Date().toISOString(), actor: req.user?.name ?? "unknown", actorEmail: req.user?.email ?? "", action: "CREATE_WORKER", workerId: newRecord.id, workerName: mapped.name, note: `Worker created with fields: ${Object.keys(body).join(", ")}` });
    cacheInvalidate(`workers:${req.tenantId}`);
    res.status(201).json(mapped);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[workers/create] Error:", message);
    res.status(500).json({ error: message });
  }
});

// GET /workers/:id
router.get("/workers/:id", requireAuth, async (req, res) => {
  try {
    const row = await fetchWorkerById(req.params.id, req.tenantId!);
    if (!row) { res.status(404).json({ error: "Worker not found" }); return; }
    // Role-aware projection: full worker detail view — admins see plaintext per Hybrid masking
    res.json(mapRowToWorker(row, (req as any).user?.role as Tier));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// PATCH /workers/:id
router.patch("/workers/:id", requireAuth, requireRole("Admin", "Executive", "LegalHead", "TechOps", "Coordinator"), validateBody(UpdateWorkerSchema), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const updated = await updateWorker(req.params.id, body, req.tenantId!);
    // Role-aware projection: PATCH response — admin sees their just-applied changes in plaintext
    const mapped = mapRowToWorker(updated, (req as any).user?.role as Tier);
    appendAuditLog({ timestamp: new Date().toISOString(), actor: req.user?.name ?? "unknown", actorEmail: req.user?.email ?? "", action: "UPDATE_WORKER", workerId: req.params.id, workerName: mapped.name, note: `Fields updated: ${Object.keys(body).join(", ")}` });
    cacheInvalidate(`workers:${req.tenantId}`);
    res.json(mapped);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /workers/:id/upload
router.post("/workers/:id/upload", requireAuth, requireRole("Admin", "Executive", "TechOps", "Coordinator"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const { docType } = req.body as { docType?: string };
    const validDocTypes = ["passport", "contract", "trc", "bhp"];
    if (!docType || !validDocTypes.includes(docType)) {
      res.status(400).json({ error: "docType must be 'passport', 'contract', 'trc', or 'bhp'" });
      return;
    }

    // 1. Scan document with AI — map trc/bhp to their bulk scan equivalents
    const bulkScanType = docType === "trc" ? "certificate" : docType === "bhp" ? "bhp" : null;
    const scanPromise = bulkScanType
      ? scanBulkDocument(req.file.buffer, req.file.mimetype, bulkScanType as "certificate" | "bhp")
          .then((d) => ({ type: docType as "trc" | "bhp", ...d }))
      : scanDocument(req.file.buffer, req.file.mimetype, docType as "passport" | "contract");

    // TODO: implement file storage (previously Airtable attachments)

    // 3. Wait for AI scan result
    const scanned = await scanPromise;
    let autoFilledFields: Record<string, string> = {};

    if (scanned) {
      const s = scanned as Record<string, string | null>;

      if (s.type === "passport") {
        if (s.name) { autoFilledFields["name"] = s.name; }
        if (s.passportExpiry) { autoFilledFields["passportExpiry"] = s.passportExpiry; }
        if (s.nationality) { autoFilledFields["nationality"] = s.nationality; }
      } else if (s.type === "contract") {
        if (s.contractEndDate) { autoFilledFields["contractEndDate"] = s.contractEndDate; }
        if (s.workerName) { autoFilledFields["name"] = s.workerName; }
      } else if (s.type === "trc") {
        if (s.trcExpiry) { autoFilledFields["trcExpiry"] = s.trcExpiry; }
        if (s.name) { autoFilledFields["name"] = s.name; }
        if (s.specialization) { autoFilledFields["specialization"] = s.specialization; }
      } else if (s.type === "bhp") {
        if (s.bhpExpiry) { autoFilledFields["bhpExpiry"] = s.bhpExpiry; }
        if (s.name) { autoFilledFields["name"] = s.name; }
      }

      if (Object.keys(autoFilledFields).length > 0) {
        try {
          await updateWorker(req.params.id, autoFilledFields, req.tenantId!);
        } catch (updateErr) {
          console.warn("[upload] Auto-fill partial failure:", updateErr instanceof Error ? updateErr.message : updateErr);
        }
      }
    }

    // 4. Return updated worker + what was auto-filled
    const row = await fetchWorkerById(req.params.id, req.tenantId!);
    // Role-aware projection: scan flow — admin needs plaintext to verify auto-fill against documents
    res.json({ worker: mapRowToWorker(row!, (req as any).user?.role as Tier), autoFilled: autoFilledFields, scanned: !!scanned });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /workers/apply — public candidate application form
const applyUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
router.post("/workers/apply", publicLimiter, applyUpload.fields([
  { name: "passport", maxCount: 1 },
  { name: "trc", maxCount: 1 },
  { name: "cv", maxCount: 1 },
]), async (req, res) => {
  try {
    const { name, email, phone } = req.body as { name?: string; email?: string; phone?: string };
    if (!name?.trim()) { res.status(400).json({ error: "Name is required" }); return; }
    if (email && email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: "Invalid email format" }); return;
    }
    if (phone && phone.trim() !== "" && !/^\+?[\d\s()-]{7,20}$/.test(phone.trim())) {
      res.status(400).json({ error: "Invalid phone format — must be 7-20 digits" }); return;
    }

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    type ScanResult = Record<string, string | null | undefined>;
    const emptyScan: ScanResult = {};
    const [passportData, trcData, cvData] = await Promise.all<ScanResult>([
      files?.passport?.[0]
        ? scanBulkDocument(files.passport[0].buffer, files.passport[0].mimetype, "passport")
        : Promise.resolve(emptyScan),
      files?.trc?.[0]
        ? scanBulkDocument(files.trc[0].buffer, files.trc[0].mimetype, "certificate")
        : Promise.resolve(emptyScan),
      files?.cv?.[0]
        ? scanBulkDocument(files.cv[0].buffer, files.cv[0].mimetype, "cv")
        : Promise.resolve(emptyScan),
    ]);

    const workerFields: Record<string, unknown> = {
      full_name: (passportData.name || name).trim(),
    };
    if (email?.trim()) workerFields.email = email.trim();
    if (phone?.trim()) workerFields.phone = phone.trim();
    if (passportData.passportExpiry) workerFields.passport_expiry = passportData.passportExpiry;
    if (trcData.trcExpiry) workerFields.trc_expiry = trcData.trcExpiry;
    if (trcData.specialization) workerFields.specialization = trcData.specialization;
    if (cvData.experience) workerFields.experience = cvData.experience;
    if (cvData.qualification && !workerFields.specialization) workerFields.specialization = cvData.qualification;

    const newWorker = await createWorker(workerFields, req.tenantId!);

    // Insert into job_applications table for ATS tracking
    try {
      const jobId = req.body.job_id ?? null;
      await execute(
        `INSERT INTO job_applications (job_id, worker_id, worker_name, worker_email, stage)
         VALUES ($1, $2, $3, $4, $5)`,
        [jobId, newWorker.id, workerFields.full_name as string, (email?.trim() || null), "New"]
      );
    } catch (appErr) {
      console.warn("[apply] Failed to insert job_application:", appErr instanceof Error ? appErr.message : appErr);
    }

    // TODO: implement file storage migration (previously Airtable attachments)

    res.json({ success: true, message: "Application submitted successfully." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[apply] Error:", message);
    res.status(500).json({ error: message });
  }
});

// POST /workers/:id/notify — send compliance alert via email (or WhatsApp if configured)
router.post("/workers/:id/notify", requireAuth, requireRole("Admin", "Executive", "LegalHead"), sensitiveLimiter, async (req, res) => {
  try {
    const row = await fetchWorkerById(req.params.id, req.tenantId!);
    if (!row) { res.status(404).json({ error: "Worker not found" }); return; }
    // Role-aware projection: another worker-detail read path — admins see plaintext per Hybrid masking
    const worker = mapRowToWorker(row, (req as any).user?.role as Tier);
    const { type, expiryDate, channel } = req.body as { type?: string; expiryDate?: string; channel?: string };

    let sent = false;
    let sentVia = "log";

    // Try email first (most reliable)
    if (worker.email) {
      try {
        const { sendAlertEmail, isMailConfigured } = await import("../lib/mailer.js");
        if (isMailConfigured()) {
          await sendAlertEmail({
            workerName: worker.name,
            documentType: type ?? "Document",
            expiryDate: expiryDate ?? "Unknown",
            daysUntilExpiry: worker.daysUntilNextExpiry ?? 0,
            status: "RED",
            recipients: [{ name: worker.name, email: worker.email }],
          });
          sent = true;
          sentVia = "email";
        }
      } catch (err) {
        console.error("[Notify] Email failed:", err instanceof Error ? err.message : err);
      }
    }

    // Log notification to DB
    await execute(
      `INSERT INTO notification_log (channel, worker_name, message_preview, recipient, status, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [sentVia, worker.name, `${type ?? "Document"} expires ${expiryDate ?? "soon"}`, worker.email ?? "no email", sent ? "sent" : "logged", req.tenantId!]
    ).catch(() => {});

    console.log(`[Notify] ${worker.name} via ${sentVia} — ${sent ? "sent" : "logged only (no SMTP or email)"}`);

    res.json({
      success: true,
      sent,
      sentVia,
      message: sent
        ? `Alert emailed to ${worker.email} about ${type ?? "document"} expiry.`
        : `Notification logged for ${worker.name}. No email address or SMTP not configured.`,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
