import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchWorkerById } from "../lib/workers-db.js";
import { appendAuditLog } from "../lib/audit-log.js";
import { generateContractPDF, streamContractPDF, type ContractData } from "../lib/contract-generator.js";
import { logGdprAction } from "../lib/gdpr.js";
import { validateBody, CreateContractSchema } from "../lib/validate.js";

const router = Router();

// Default company info (can be overridden by tenant settings in future)
const COMPANY = {
  name: "Apatris Sp. z o.o.",
  address: "ul. Chłodna 51, 00-867 Warszawa",
  nip: "5252828706",
  krs: "0000849614",
  regon: "",
};

// ═══════════════════════════════════════════════════════════════════════════
// POWER OF ATTORNEY (POA)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/poa — list all POA signatories
router.get("/poa", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM power_of_attorney WHERE tenant_id = $1 ORDER BY full_name",
      [req.tenantId!]
    );
    res.json({ signatories: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch POA list" });
  }
});

// POST /api/poa — add a new POA signatory
router.post("/poa", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const { fullName, position, email, phone, pesel, canSignZlecenie, canSignOPrace, canSignB2b, notes } = req.body as {
      fullName?: string; position?: string; email?: string; phone?: string; pesel?: string;
      canSignZlecenie?: boolean; canSignOPrace?: boolean; canSignB2b?: boolean; notes?: string;
    };
    if (!fullName?.trim() || !position?.trim()) {
      return res.status(400).json({ error: "fullName and position are required" });
    }
    const row = await queryOne(
      `INSERT INTO power_of_attorney (tenant_id, full_name, position, email, phone, pesel, can_sign_zlecenie, can_sign_o_prace, can_sign_b2b, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.tenantId!, fullName.trim(), position.trim(), email ?? null, phone ?? null, pesel ?? null,
       canSignZlecenie ?? true, canSignOPrace ?? true, canSignB2b ?? true, notes ?? null]
    );
    appendAuditLog({ timestamp: new Date().toISOString(), actor: req.user?.name ?? "unknown", actorEmail: req.user?.email ?? "", action: "POA_CREATE", workerId: (row as any)?.id ?? "", workerName: fullName!.trim(), note: `POA signatory created: ${position}` });
    res.status(201).json({ signatory: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to add signatory" });
  }
});

// PATCH /api/poa/:id — update a POA signatory
router.patch("/poa/:id", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    const fields: Record<string, string> = {
      fullName: "full_name", position: "position", email: "email", phone: "phone",
      pesel: "pesel", isActive: "is_active", canSignZlecenie: "can_sign_zlecenie",
      canSignOPrace: "can_sign_o_prace", canSignB2b: "can_sign_b2b", notes: "notes",
    };

    for (const [key, col] of Object.entries(fields)) {
      if (body[key] !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(body[key]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = NOW()");
    vals.push(req.params.id, req.tenantId!);

    const row = await queryOne(
      `UPDATE power_of_attorney SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Signatory not found" });
    res.json({ signatory: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update signatory" });
  }
});

// DELETE /api/poa/:id — deactivate a POA signatory
router.delete("/poa/:id", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  try {
    await execute(
      "UPDATE power_of_attorney SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    appendAuditLog({ timestamp: new Date().toISOString(), actor: req.user?.name ?? "unknown", actorEmail: req.user?.email ?? "", action: "POA_DELETE", workerId: req.params.id, workerName: "—", note: "POA signatory deactivated" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to deactivate signatory" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/contracts — list contracts
router.get("/contracts", requireAuth, async (req, res) => {
  try {
    const { workerId, status, type } = req.query as { workerId?: string; status?: string; type?: string };
    let sql = "SELECT * FROM contracts WHERE tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (workerId) { params.push(workerId); sql += ` AND worker_id = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (type) { params.push(type); sql += ` AND contract_type = $${params.length}`; }
    sql += " ORDER BY created_at DESC";
    const rows = await query(sql, params);
    res.json({ contracts: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch contracts" });
  }
});

// GET /api/contracts/:id — get contract details
router.get("/contracts/:id", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      "SELECT * FROM contracts WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Contract not found" });
    res.json({ contract: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch contract" });
  }
});

// POST /api/contracts — create a new contract (draft)
router.post(
  "/contracts",
  requireAuth,
  requireRole("Admin", "Executive", "LegalHead"),
  validateBody(CreateContractSchema),
  async (req, res) => {
    try {
      const body = req.body as {
        workerId?: string; contractType?: string; startDate?: string; endDate?: string;
        hourlyRate?: number; monthlySalary?: number; workLocation?: string;
        jobDescription?: string; poaId?: string; language?: string;
      };

      if (!body.workerId || !body.contractType || !body.startDate) {
        return res.status(400).json({ error: "workerId, contractType, and startDate are required" });
      }

      const validTypes = ["umowa_zlecenie", "umowa_o_prace", "b2b", "aneks"];
      if (!validTypes.includes(body.contractType)) {
        return res.status(400).json({ error: `contractType must be one of: ${validTypes.join(", ")}` });
      }

      // Get worker
      const worker = await fetchWorkerById(body.workerId, req.tenantId!);
      if (!worker) return res.status(404).json({ error: "Worker not found" });

      // Get POA if specified
      let poaName: string | null = null;
      if (body.poaId) {
        const poa = await queryOne<{ full_name: string }>(
          "SELECT full_name FROM power_of_attorney WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE",
          [body.poaId, req.tenantId!]
        );
        if (!poa) return res.status(404).json({ error: "POA signatory not found or inactive" });
        poaName = poa.full_name;
      }

      const row = await queryOne(
        `INSERT INTO contracts
         (tenant_id, worker_id, worker_name, contract_type, status, start_date, end_date,
          hourly_rate, monthly_salary, work_location, job_description, poa_id, poa_name, language, created_by)
         VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          req.tenantId!, body.workerId, worker.full_name, body.contractType,
          body.startDate, body.endDate ?? null,
          body.hourlyRate ?? null, body.monthlySalary ?? null,
          body.workLocation ?? worker.assigned_site ?? "Warszawa",
          body.jobDescription ?? "Prace spawalnicze i montażowe / Welding and assembly work",
          body.poaId ?? null, poaName, body.language ?? "bilingual",
          req.user!.name,
        ]
      );

      res.status(201).json({ contract: row });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create contract" });
    }
  }
);

// POST /api/contracts/:id/generate-pdf — generate and store PDF
router.post(
  "/contracts/:id/generate-pdf",
  requireAuth,
  requireRole("Admin", "Executive", "LegalHead"),
  async (req, res) => {
    try {
      const contract = await queryOne<Record<string, any>>(
        "SELECT * FROM contracts WHERE id = $1 AND tenant_id = $2",
        [req.params.id, req.tenantId!]
      );
      if (!contract) return res.status(404).json({ error: "Contract not found" });

      // Get POA details
      let poaName = contract.poa_name || "Prezes Zarządu";
      let poaPosition = "Pełnomocnik";
      if (contract.poa_id) {
        const poa = await queryOne<{ full_name: string; position: string }>(
          "SELECT full_name, position FROM power_of_attorney WHERE id = $1",
          [contract.poa_id]
        );
        if (poa) { poaName = poa.full_name; poaPosition = poa.position; }
      }

      // Get worker details
      const worker = await fetchWorkerById(contract.worker_id, req.tenantId!);

      const contractData: ContractData = {
        companyName: COMPANY.name,
        companyAddress: COMPANY.address,
        companyNip: COMPANY.nip,
        companyKrs: COMPANY.krs,
        companyRegon: COMPANY.regon,
        poaName,
        poaPosition,
        workerName: contract.worker_name,
        workerPesel: worker?.pesel ?? "",
        workerAddress: "",
        workerNationality: "",
        contractType: contract.contract_type as "umowa_zlecenie" | "umowa_o_prace",
        startDate: new Date(contract.start_date).toISOString().split("T")[0],
        endDate: contract.end_date ? new Date(contract.end_date).toISOString().split("T")[0] : undefined,
        hourlyRate: Number(contract.hourly_rate ?? 0),
        monthlySalary: Number(contract.monthly_salary ?? 0),
        workLocation: contract.work_location || "Warszawa",
        jobDescription: contract.job_description || "Prace spawalnicze",
        language: (contract.language || "bilingual") as "pl" | "en" | "bilingual",
      };

      const pdfPath = await generateContractPDF(contractData, req.tenantId!);

      // Update contract with PDF path
      await execute(
        "UPDATE contracts SET pdf_path = $1, updated_at = NOW() WHERE id = $2",
        [pdfPath, req.params.id]
      );

      await logGdprAction({
        tenantId: req.tenantId!,
        action: "CONTRACT_GENERATED",
        targetType: "contract",
        targetId: req.params.id,
        targetName: `${contract.contract_type} — ${contract.worker_name}`,
        performedBy: req.user!.name,
      });

      res.json({ success: true, pdfPath });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "PDF generation failed" });
    }
  }
);

// GET /api/contracts/:id/pdf — download contract PDF
router.get(
  "/contracts/:id/pdf",
  requireAuth,
  async (req, res) => {
    try {
      const contract = await queryOne<Record<string, any>>(
        "SELECT * FROM contracts WHERE id = $1 AND tenant_id = $2",
        [req.params.id, req.tenantId!]
      );
      if (!contract) return res.status(404).json({ error: "Contract not found" });

      // Get POA
      let poaName = contract.poa_name || "Prezes Zarządu";
      let poaPosition = "Pełnomocnik";
      if (contract.poa_id) {
        const poa = await queryOne<{ full_name: string; position: string }>(
          "SELECT full_name, position FROM power_of_attorney WHERE id = $1",
          [contract.poa_id]
        );
        if (poa) { poaName = poa.full_name; poaPosition = poa.position; }
      }

      const worker = await fetchWorkerById(contract.worker_id, req.tenantId!);

      const contractData: ContractData = {
        companyName: COMPANY.name,
        companyAddress: COMPANY.address,
        companyNip: COMPANY.nip,
        companyKrs: COMPANY.krs,
        companyRegon: COMPANY.regon,
        poaName,
        poaPosition,
        workerName: contract.worker_name,
        workerPesel: worker?.pesel ?? "",
        contractType: contract.contract_type as "umowa_zlecenie" | "umowa_o_prace",
        startDate: new Date(contract.start_date).toISOString().split("T")[0],
        endDate: contract.end_date ? new Date(contract.end_date).toISOString().split("T")[0] : undefined,
        hourlyRate: Number(contract.hourly_rate ?? 0),
        monthlySalary: Number(contract.monthly_salary ?? 0),
        workLocation: contract.work_location || "Warszawa",
        jobDescription: contract.job_description || "Prace spawalnicze",
        language: (contract.language || "bilingual") as "pl" | "en" | "bilingual",
      };

      streamContractPDF(contractData, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : "PDF download failed" });
      }
    }
  }
);

// PATCH /api/contracts/:id/status — update contract status
router.patch(
  "/contracts/:id/status",
  requireAuth,
  requireRole("Admin", "Executive", "LegalHead"),
  async (req, res) => {
    try {
      const { status } = req.body as { status?: string };
      const validStatuses = ["draft", "pending_signature", "active", "terminated", "expired"];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
      }
      const row = await queryOne(
        `UPDATE contracts SET status = $1, updated_at = NOW()${status === "active" ? ", signed_at = NOW()" : ""}
         WHERE id = $2 AND tenant_id = $3 RETURNING *`,
        [status, req.params.id, req.tenantId!]
      );
      if (!row) return res.status(404).json({ error: "Contract not found" });
      res.json({ contract: row });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Status update failed" });
    }
  }
);

export default router;
