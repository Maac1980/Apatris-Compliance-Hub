import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { logGdprAction } from "../lib/gdpr.js";
import { validateBody, SignatureSchema } from "../lib/validate.js";

const router = Router();

// POST /api/signatures — save a signature for a contract
router.post("/signatures", requireAuth, validateBody(SignatureSchema), async (req, res) => {
  try {
    const { contractId, workerId, signerName, signerRole, signatureData } = req.body as {
      contractId?: string; workerId?: string; signerName?: string;
      signerRole?: string; signatureData?: string;
    };

    if (!contractId || !signerName || !signerRole || !signatureData) {
      return res.status(400).json({ error: "contractId, signerName, signerRole, and signatureData are required" });
    }

    if (signerRole !== "worker" && signerRole !== "company") {
      return res.status(400).json({ error: "signerRole must be 'worker' or 'company'" });
    }

    // Validate base64 PNG (should start with data:image/png;base64,)
    if (!signatureData.startsWith("data:image/")) {
      return res.status(400).json({ error: "signatureData must be a base64-encoded image (data:image/png;base64,...)" });
    }

    // Verify contract exists and belongs to tenant
    const contract = await queryOne(
      "SELECT id, worker_name, status FROM contracts WHERE id = $1 AND tenant_id = $2",
      [contractId, req.tenantId!]
    );
    if (!contract) return res.status(404).json({ error: "Contract not found" });

    // Check if already signed by this role
    const existing = await queryOne(
      "SELECT id FROM signatures WHERE contract_id = $1 AND signer_role = $2 AND tenant_id = $3",
      [contractId, signerRole, req.tenantId!]
    );
    if (existing) {
      return res.status(409).json({ error: `Contract already signed by ${signerRole}` });
    }

    // Save signature
    const sig = await queryOne(
      `INSERT INTO signatures (tenant_id, contract_id, worker_id, signer_name, signer_role, signature_data, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        req.tenantId!, contractId, workerId ?? null, signerName, signerRole, signatureData,
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip,
        req.headers["user-agent"],
      ]
    );

    // Update contract signature status
    const signedField = signerRole === "worker" ? "signed_by_worker" : "signed_by_company";
    await execute(
      `UPDATE contracts SET ${signedField} = TRUE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [contractId, req.tenantId!]
    );

    // Check if both parties have signed → activate contract
    const contractRow = await queryOne<{ signed_by_worker: boolean; signed_by_company: boolean }>(
      "SELECT signed_by_worker, signed_by_company FROM contracts WHERE id = $1",
      [contractId]
    );
    if (contractRow?.signed_by_worker && contractRow?.signed_by_company) {
      await execute(
        "UPDATE contracts SET status = 'active', signed_at = NOW(), updated_at = NOW() WHERE id = $1",
        [contractId]
      );
    }

    // GDPR log
    await logGdprAction({
      tenantId: req.tenantId!,
      action: "SIGNATURE_CAPTURED",
      targetType: "contract",
      targetId: contractId,
      targetName: signerName,
      performedBy: req.user!.name,
      details: { signerRole, bothSigned: contractRow?.signed_by_worker && contractRow?.signed_by_company },
    });

    res.status(201).json({
      signature: { id: (sig as any).id, signerName, signerRole, signedAt: (sig as any).signed_at },
      contractActivated: contractRow?.signed_by_worker && contractRow?.signed_by_company,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Signature capture failed" });
  }
});

// GET /api/signatures/contract/:contractId — get signatures for a contract
router.get("/signatures/contract/:contractId", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, signer_name, signer_role, signed_at, ip_address
       FROM signatures WHERE contract_id = $1 AND tenant_id = $2 ORDER BY signed_at`,
      [req.params.contractId, req.tenantId!]
    );
    res.json({ signatures: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch signatures" });
  }
});

// GET /api/signatures/:id/image — get the signature image (base64 PNG)
router.get("/signatures/:id/image", requireAuth, async (req, res) => {
  try {
    const row = await queryOne<{ signature_data: string; signer_name: string }>(
      "SELECT signature_data, signer_name FROM signatures WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Signature not found" });

    // Return the raw base64 data URL
    res.json({ signatureData: row.signature_data, signerName: row.signer_name });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch signature" });
  }
});

// DELETE /api/signatures/:id — revoke a signature (admin only)
router.delete(
  "/signatures/:id",
  requireAuth,
  requireRole("Admin", "Executive"),
  async (req, res) => {
    try {
      const sig = await queryOne<{ contract_id: string; signer_role: string }>(
        "SELECT contract_id, signer_role FROM signatures WHERE id = $1 AND tenant_id = $2",
        [req.params.id, req.tenantId!]
      );
      if (!sig) return res.status(404).json({ error: "Signature not found" });

      await execute("DELETE FROM signatures WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);

      // Reset the contract signature flag
      const signedField = sig.signer_role === "worker" ? "signed_by_worker" : "signed_by_company";
      await execute(
        `UPDATE contracts SET ${signedField} = FALSE, status = 'pending_signature', signed_at = NULL, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [sig.contract_id, req.tenantId!]
      );

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Revocation failed" });
    }
  }
);

export default router;
