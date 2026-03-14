import { Router, type IRouter } from "express";
import multer from "multer";
import OpenAI from "openai";
import { fetchAllRecords, fetchRecord, updateRecord, uploadAttachmentToRecord, createRecord } from "../lib/airtable.js";
import { mapRecordToWorker, filterWorkers, type Worker } from "../lib/compliance.js";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "placeholder",
});

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
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        max_completion_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
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
      const text = response.choices[0]?.message?.content ?? "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);
      return { type: "passport", ...parsed };
    } else {
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        max_completion_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
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
      const text = response.choices[0]?.message?.content ?? "";
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

// GET /workers
router.get("/workers", async (req, res) => {
  try {
    const { search, specialization, status } = req.query as Record<string, string>;
    const records = await fetchAllRecords();
    const allWorkers = records.map(mapRecordToWorker).filter(
      (w) => w.name && w.name !== "Unknown" && w.name.trim() !== ""
    );
    const filtered = filterWorkers(allWorkers, search, specialization, status);
    res.json({ workers: filtered, total: filtered.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// GET /workers/stats
router.get("/workers/stats", async (_req, res) => {
  try {
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker);

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
router.get("/workers/report", async (_req, res) => {
  try {
    const records = await fetchAllRecords();
    const workers = records.map(mapRecordToWorker);

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
  category: "passport" | "bhp" | "certificate" | "contract"
): Promise<Record<string, string | null>> {
  const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!imageTypes.includes(mimeType)) return {};

  const prompts: Record<string, string> = {
    passport: `Extract from this passport image. Return ONLY valid JSON:
{"name":"full name or null","dateOfBirth":"YYYY-MM-DD or null","passportExpiry":"YYYY-MM-DD or null","nationality":"nationality or null"}`,
    bhp: `Extract from this BHP/safety certificate. Return ONLY valid JSON:
{"name":"worker full name or null","bhpExpiry":"YYYY-MM-DD or null"}`,
    certificate: `Extract from this TRC/welding certificate. Return ONLY valid JSON:
{"name":"worker full name or null","trcExpiry":"YYYY-MM-DD or null","specialization":"Look for keywords MIG, TIG, ARC, FCAW, MMA, electrode. Return the matched keyword exactly (e.g. 'MIG' or 'TIG') or null if not found"}`,
    contract: `Extract from this employment contract. Return ONLY valid JSON:
{"name":"worker full name or null","contractEndDate":"YYYY-MM-DD or null"}`,
  };

  try {
    const base64 = fileBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            { type: "text", text: prompts[category] },
          ],
        },
      ],
    });
    const text = response.choices[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    return JSON.parse(jsonMatch[0]) as Record<string, string | null>;
  } catch (e) {
    console.error(`[scanBulkDocument] AI error for ${category}:`, e);
    return {};
  }
}

router.post("/workers/bulk-create", bulkUpload.fields([
  { name: "passport", maxCount: 1 },
  { name: "bhp", maxCount: 1 },
  { name: "certificate", maxCount: 1 },
  { name: "contract", maxCount: 1 },
]), async (req, res) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    // Scan all uploaded files in parallel
    const scans = await Promise.all([
      files?.passport?.[0]
        ? scanBulkDocument(files.passport[0].buffer, files.passport[0].mimetype, "passport")
        : Promise.resolve({}),
      files?.bhp?.[0]
        ? scanBulkDocument(files.bhp[0].buffer, files.bhp[0].mimetype, "bhp")
        : Promise.resolve({}),
      files?.certificate?.[0]
        ? scanBulkDocument(files.certificate[0].buffer, files.certificate[0].mimetype, "certificate")
        : Promise.resolve({}),
      files?.contract?.[0]
        ? scanBulkDocument(files.contract[0].buffer, files.contract[0].mimetype, "contract")
        : Promise.resolve({}),
    ]);

    const [passportData, bhpData, certData, contractData] = scans;

    // Merge: later keys win, but name priority: passport > certificate > contract > bhp
    const merged = { ...bhpData, ...contractData, ...certData, ...passportData };

    // Build Airtable fields
    const airtableFields: Record<string, unknown> = {};
    const extractedSummary: Record<string, string> = {};

    const name = merged.name;
    if (name) {
      airtableFields["Name"] = name;
      extractedSummary.name = name;
    }
    if (passportData.dateOfBirth) {
      airtableFields["Date of Birth"] = passportData.dateOfBirth;
    }
    if (passportData.nationality) {
      airtableFields["Nationality"] = passportData.nationality;
    }
    if (passportData.passportExpiry) {
      airtableFields["Passport Expiry"] = passportData.passportExpiry;
    }
    if (certData.trcExpiry) {
      airtableFields["TRC Expiry"] = certData.trcExpiry;
      extractedSummary.trcExpiry = certData.trcExpiry;
    }
    if (bhpData.bhpExpiry) {
      airtableFields["BHP EXPIRY"] = bhpData.bhpExpiry;
      extractedSummary.bhpExpiry = bhpData.bhpExpiry;
    }
    if (contractData.contractEndDate) {
      airtableFields["Contract End Date"] = contractData.contractEndDate;
      extractedSummary.contractEndDate = contractData.contractEndDate;
    }

    // Specialization: manual profession from form takes priority, then AI-extracted from certificate
    const manualProfession = typeof req.body?.profession === "string" ? req.body.profession.trim() : "";
    const aiSpecialization = typeof certData.specialization === "string" ? certData.specialization.trim() : "";
    const finalSpecialization = manualProfession || aiSpecialization;
    if (finalSpecialization) {
      airtableFields["Specialization"] = finalSpecialization;
      extractedSummary.specialization = finalSpecialization;
    }

    // Create the new Airtable record
    const newRecord = await createRecord(airtableFields);
    const recordId = newRecord.id;

    // Upload all attachments in parallel
    const uploadTasks: Promise<void>[] = [];
    const attachmentMap: Record<string, string> = {
      passport: "Passport",
      bhp: "BHP Certificate",
      certificate: "Certificate",
      contract: "Contract",
    };

    for (const [category, fieldName] of Object.entries(attachmentMap)) {
      const file = files?.[category]?.[0];
      if (file) {
        uploadTasks.push(
          uploadAttachmentToRecord(recordId, fieldName, file.buffer, file.originalname, file.mimetype)
            .catch((e) => console.warn(`[bulk-create] Attachment upload failed for ${fieldName}:`, e))
        );
      }
    }

    await Promise.all(uploadTasks);

    const finalRecord = await fetchRecord(recordId);
    res.json({ worker: mapRecordToWorker(finalRecord), extracted: extractedSummary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[bulk-create] Error:", message);
    res.status(500).json({ error: message });
  }
});

// GET /workers/:id
router.get("/workers/:id", async (req, res) => {
  try {
    const record = await fetchRecord(req.params.id);
    res.json(mapRecordToWorker(record));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("404") || message.includes("NOT_FOUND")) {
      res.status(404).json({ error: "Worker not found" });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// PATCH /workers/:id
router.patch("/workers/:id", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;

    // Map our schema field names to Airtable field names
    const airtableFields: Record<string, unknown> = {};

    if (body.trcExpiry !== undefined) airtableFields["TRC Expiry"] = body.trcExpiry;
    if (body.workPermitExpiry !== undefined)
      airtableFields["Work Permit Expiry"] = body.workPermitExpiry;
    if (body.bhpStatus !== undefined) airtableFields["BHP Status"] = body.bhpStatus;
    if (body.contractEndDate !== undefined)
      airtableFields["Contract End Date"] = body.contractEndDate;
    if (body.email !== undefined) airtableFields["Email"] = body.email;
    if (body.phone !== undefined) airtableFields["Phone"] = body.phone;
    if (body.specialization !== undefined) airtableFields["Specialization"] = body.specialization;

    const updated = await updateRecord(req.params.id, airtableFields);
    res.json(mapRecordToWorker(updated));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /workers/:id/upload
router.post("/workers/:id/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const { docType } = req.body as { docType?: string };
    if (!docType || !["passport", "contract"].includes(docType)) {
      res.status(400).json({ error: "docType must be 'passport' or 'contract'" });
      return;
    }

    const fieldName = docType === "passport" ? "Passport" : "Contract";

    // 1. Scan document with AI (runs in parallel with nothing yet — start it now)
    const scanPromise = scanDocument(req.file.buffer, req.file.mimetype, docType as "passport" | "contract");

    // 2. Upload the attachment to Airtable
    await uploadAttachmentToRecord(
      req.params.id,
      fieldName,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // 3. Wait for AI scan result
    const scanned = await scanPromise;
    let autoFilledFields: Record<string, string> = {};

    if (scanned) {
      const airtableUpdates: Record<string, unknown> = {};

      if (scanned.type === "passport") {
        if (scanned.name) {
          airtableUpdates["Name"] = scanned.name;
          autoFilledFields["name"] = scanned.name;
        }
        if (scanned.dateOfBirth) {
          airtableUpdates["Date of Birth"] = scanned.dateOfBirth;
          autoFilledFields["dateOfBirth"] = scanned.dateOfBirth;
        }
        if (scanned.passportExpiry) {
          airtableUpdates["Passport Expiry"] = scanned.passportExpiry;
          autoFilledFields["passportExpiry"] = scanned.passportExpiry;
        }
        if (scanned.passportNumber) {
          airtableUpdates["Passport Number"] = scanned.passportNumber;
          autoFilledFields["passportNumber"] = scanned.passportNumber;
        }
        if (scanned.nationality) {
          airtableUpdates["Nationality"] = scanned.nationality;
          autoFilledFields["nationality"] = scanned.nationality;
        }
      } else if (scanned.type === "contract") {
        if (scanned.contractEndDate) {
          airtableUpdates["Contract End Date"] = scanned.contractEndDate;
          autoFilledFields["contractEndDate"] = scanned.contractEndDate;
        }
        if (scanned.workerName) {
          airtableUpdates["Name"] = scanned.workerName;
          autoFilledFields["name"] = scanned.workerName;
        }
      }

      if (Object.keys(airtableUpdates).length > 0) {
        try {
          await updateRecord(req.params.id, airtableUpdates);
        } catch (updateErr) {
          // Log but don't fail — some fields may not exist in the user's Airtable
          console.warn("[upload] Auto-fill partial failure:", updateErr instanceof Error ? updateErr.message : updateErr);
        }
      }
    }

    // 4. Return updated worker + what was auto-filled
    const record = await fetchRecord(req.params.id);
    res.json({ worker: mapRecordToWorker(record), autoFilled: autoFilledFields, scanned: !!scanned });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /workers/:id/notify
router.post("/workers/:id/notify", async (req, res) => {
  try {
    const record = await fetchRecord(req.params.id);
    const worker = mapRecordToWorker(record);
    const body = req.body as { message?: string; channel?: string };

    // In a production system, this would send an email/SMS
    // For now, we log and return success
    console.log(
      `[Notify] Worker: ${worker.name} | Channel: ${body.channel ?? "email"} | Message: ${body.message}`
    );

    res.json({
      success: true,
      message: `Notification queued for ${worker.name} via ${body.channel ?? "email"}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
