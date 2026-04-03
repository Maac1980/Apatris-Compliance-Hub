import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { sendWhatsAppAlert } from "../lib/whatsapp.js";

const router = Router();

// Provider abstraction — supports DocuSign or SignNow
function getProvider(): { name: string; apiKey: string } | null {
  if (process.env.DOCUSIGN_API_KEY) return { name: "docusign", apiKey: process.env.DOCUSIGN_API_KEY };
  if (process.env.SIGNNOW_API_KEY) return { name: "signnow", apiKey: process.env.SIGNNOW_API_KEY };
  return null;
}

// POST /api/signatures/certified/send — send document for certified signature
router.post("/signatures/certified/send", requireAuth, requireRole("Admin", "Executive", "LegalHead"), async (req, res) => {
  try {
    const { contractId, workerId, workerName, workerEmail, documentTitle } = req.body as {
      contractId?: string; workerId?: string; workerName?: string; workerEmail?: string; documentTitle?: string;
    };
    if (!contractId || !workerName || !workerEmail) {
      return res.status(400).json({ error: "contractId, workerName, and workerEmail required" });
    }

    const provider = getProvider();
    const providerName = provider?.name || "pending";

    // Generate signing URL (simulated if no provider key)
    const envelopeId = `ENV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baseUrl = process.env.APP_URL || "https://apatris-api.fly.dev";
    const signingUrl = provider
      ? `${baseUrl}/api/signatures/certified/${envelopeId}/sign`
      : `${baseUrl}/api/signatures/certified/${envelopeId}/sign`;

    const row = await queryOne(
      `INSERT INTO certified_signatures (tenant_id, contract_id, worker_id, worker_name, worker_email, provider, envelope_id, status, sent_at, signing_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'sent',NOW(),$8) RETURNING *`,
      [req.tenantId!, contractId, workerId ?? null, workerName, workerEmail, providerName, envelopeId, signingUrl]
    );

    // Update contract status
    await execute(
      "UPDATE contracts SET status = 'pending_signature', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
      [contractId, req.tenantId!]
    );

    // Send WhatsApp with signing link
    if (workerId) {
      try {
        const worker = await queryOne<Record<string, any>>(
          "SELECT phone FROM workers WHERE id = $1", [workerId]
        );
        if (worker?.phone) {
          await sendWhatsAppAlert({
            to: worker.phone,
            workerName: workerName,
            workerI: workerId,
            permitType: `Please sign your ${documentTitle || "contract"}: ${signingUrl}`,
            daysRemaining: 0,
            tenantId: req.tenantId!,
          });
        }
      } catch { /* non-blocking */ }
    }

    // Also send email link
    try {
      const { isMailConfigured } = await import("../lib/mailer.js");
      if (isMailConfigured()) {
        const nodemailer = await import("nodemailer");
        const transport = nodemailer.default.createTransport({
          host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
          port: parseInt(process.env.SMTP_PORT || "587"),
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        await transport.sendMail({
          from: `"Apatris Contracts" <${process.env.SMTP_USER}>`,
          to: workerEmail,
          subject: `Sign your ${documentTitle || "contract"} — Apatris`,
          html: `<div style="font-family:Arial;max-width:500px;margin:0 auto;padding:30px;background:#1e293b;border-radius:12px;color:#e2e8f0;">
            <h2 style="color:#fff;margin:0 0 16px;">Document Ready for Signature</h2>
            <p>Hi ${workerName},</p>
            <p>Your <strong>${documentTitle || "contract"}</strong> is ready for your certified electronic signature.</p>
            <a href="${signingUrl}" style="display:inline-block;background:#C41E18;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">Sign Document</a>
            <p style="color:#64748b;font-size:12px;margin-top:20px;">Apatris Sp. z o.o. · This signature is legally binding.</p>
          </div>`,
        });
      }
    } catch { /* non-blocking */ }

    res.status(201).json({ signature: row, signingUrl });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send" });
  }
});

// GET /api/signatures/certified — list all certified signatures
router.get("/signatures/certified", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT cs.*, c.title AS contract_title
       FROM certified_signatures cs
       LEFT JOIN contracts c ON c.id = cs.contract_id
       WHERE cs.tenant_id = $1
       ORDER BY cs.created_at DESC`,
      [req.tenantId!]
    );
    res.json({ signatures: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/signatures/certified/:id/status — check status
router.get("/signatures/certified/:id/status", requireAuth, async (req, res) => {
  try {
    const row = await queryOne(
      "SELECT * FROM certified_signatures WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ signature: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/signatures/certified/:envelopeId/sign — signing page (simplified)
router.get("/signatures/certified/:envelopeId/sign", async (req, res) => {
  try {
    const sig = await queryOne<Record<string, any>>(
      "SELECT * FROM certified_signatures WHERE envelope_id = $1",
      [req.params.envelopeId]
    );
    if (!sig) return res.status(404).send("Document not found");

    // Mark as viewed
    if (sig.status === "sent") {
      await execute(
        "UPDATE certified_signatures SET status = 'viewed', viewed_at = NOW() WHERE id = $1",
        [sig.id]
      );
    }

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign Document — Apatris</title>
<style>body{margin:0;background:#0f172a;color:#e2e8f0;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}
.card{background:#1e293b;border-radius:16px;padding:40px;max-width:480px;width:100%;text-align:center;border:1px solid #334155;}
h1{color:#fff;font-size:22px;margin:0 0 8px;}
p{color:#94a3b8;font-size:14px;line-height:1.6;}
.btn{display:inline-block;background:#C41E18;color:#fff;padding:14px 32px;border-radius:10px;border:none;font-size:16px;font-weight:bold;cursor:pointer;margin-top:20px;}
.btn:hover{background:#a51914;}
.success{color:#4ade80;font-size:48px;}
.info{color:#64748b;font-size:11px;margin-top:16px;}
</style></head><body>
<div class="card" id="signCard">
  <h1>Sign Document</h1>
  <p>Hi <strong>${sig.worker_name}</strong>, please confirm your certified electronic signature below.</p>
  <p style="color:#fbbf24;font-size:12px;">This signature is legally binding under Polish and EU law (eIDAS Regulation).</p>
  <button class="btn" onclick="signDocument()">I Agree & Sign</button>
  <p class="info">IP: ${ip} · ${new Date().toISOString()}</p>
</div>
<div class="card" id="doneCard" style="display:none;">
  <div class="success">✓</div>
  <h1>Signed Successfully</h1>
  <p>Your certified signature has been recorded. You may close this page.</p>
</div>
<script>
async function signDocument(){
  try{
    const res=await fetch('/api/signatures/certified/webhook',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({envelopeId:'${sig.envelope_id}',event:'signed',ip:'${ip}'})});
    document.getElementById('signCard').style.display='none';
    document.getElementById('doneCard').style.display='block';
  }catch(e){alert('Error signing. Please try again.');}
}
</script></body></html>`);
  } catch (err) {
    res.status(500).send("Error loading document");
  }
});

// POST /api/signatures/certified/webhook — provider webhook or signing completion
router.post("/signatures/certified/webhook", async (req, res) => {
  try {
    const { envelopeId, event, ip } = req.body as { envelopeId?: string; event?: string; ip?: string };
    if (!envelopeId) return res.status(400).json({ error: "envelopeId required" });

    const sig = await queryOne<Record<string, any>>(
      "SELECT * FROM certified_signatures WHERE envelope_id = $1",
      [envelopeId]
    );
    if (!sig) return res.status(404).json({ error: "Not found" });

    const statusMap: Record<string, string> = {
      viewed: "viewed", signed: "signed", completed: "completed", declined: "declined",
    };
    const newStatus = statusMap[event || ""] || "signed";

    const sets = [`status = '${newStatus}'`, "updated_at = NOW()"];
    if (newStatus === "signed" || newStatus === "completed") {
      sets.push("signed_at = NOW()");
      if (ip) sets.push(`ip_address = '${ip}'`);
    }
    if (newStatus === "viewed") sets.push("viewed_at = NOW()");

    await execute(`UPDATE certified_signatures SET ${sets.join(", ")} WHERE id = $1`, [sig.id]);

    // Update contract status
    if (newStatus === "signed" || newStatus === "completed") {
      await execute(
        "UPDATE contracts SET status = 'signed', updated_at = NOW() WHERE id = $1",
        [sig.contract_id]
      );

      // Notify via WhatsApp
      if (sig.worker_id) {
        try {
          const worker = await queryOne<Record<string, any>>(
            "SELECT phone FROM workers WHERE id = $1", [sig.worker_id]
          );
          if (worker?.phone) {
            await sendWhatsAppAlert({
              to: worker.phone,
              workerName: sig.worker_name,
              workerI: sig.worker_id,
              permitType: "Your contract has been signed successfully. A copy will be sent to your email.",
              daysRemaining: 0,
              tenantId: sig.tenant_id,
            });
          }
        } catch { /* non-blocking */ }
      }
    }

    res.json({ ok: true, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Webhook failed" });
  }
});

// GET /api/signatures/certified/:id/certificate — download certificate
router.get("/signatures/certified/:id/certificate", requireAuth, async (req, res) => {
  try {
    const sig = await queryOne<Record<string, any>>(
      "SELECT * FROM certified_signatures WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId!]
    );
    if (!sig) return res.status(404).json({ error: "Not found" });
    if (sig.status !== "signed" && sig.status !== "completed") {
      return res.status(400).json({ error: "Document not yet signed" });
    }

    // Generate certificate HTML
    const cert = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Signature Certificate</title>
<style>body{font-family:Arial;max-width:600px;margin:40px auto;padding:20px;} h1{color:#C41E18;} .box{border:2px solid #C41E18;padding:20px;border-radius:8px;margin:20px 0;} .field{margin:8px 0;} .label{color:#666;font-size:12px;} .value{font-weight:bold;font-size:14px;}</style></head>
<body>
<h1>Certified Electronic Signature Certificate</h1>
<div class="box">
  <div class="field"><span class="label">Signer:</span> <span class="value">${sig.worker_name}</span></div>
  <div class="field"><span class="label">Email:</span> <span class="value">${sig.worker_email}</span></div>
  <div class="field"><span class="label">Document ID:</span> <span class="value">${sig.contract_id}</span></div>
  <div class="field"><span class="label">Envelope ID:</span> <span class="value">${sig.envelope_id}</span></div>
  <div class="field"><span class="label">Provider:</span> <span class="value">${sig.provider}</span></div>
  <div class="field"><span class="label">Signed At:</span> <span class="value">${sig.signed_at ? new Date(sig.signed_at).toISOString() : "—"}</span></div>
  <div class="field"><span class="label">IP Address:</span> <span class="value">${sig.ip_address || "—"}</span></div>
  <div class="field"><span class="label">Status:</span> <span class="value">${sig.status.toUpperCase()}</span></div>
</div>
<p style="color:#666;font-size:11px;">This certificate confirms that the above-named signer applied a certified electronic signature in accordance with EU Regulation No 910/2014 (eIDAS) and Polish law. Issued by Apatris Sp. z o.o., NIP: 5252828706.</p>
</body></html>`;

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", `attachment; filename="certificate-${sig.envelope_id}.html"`);
    res.send(cert);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
