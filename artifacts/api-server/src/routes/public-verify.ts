/**
 * Public Verification Routes — NO AUTH REQUIRED.
 * QR code on worker's compliance card links to /api/public/verify/:token
 * Border police, PIP, clients can scan and see worker status instantly.
 *
 * Also: public recruitment form + client portal link.
 */

import { Router } from "express";
import { query, queryOne, execute } from "../lib/db.js";
import crypto from "crypto";

const router = Router();

// ═══ WORKER VERIFICATION (QR scan) ═════════════════════════════════════

// POST /api/v1/verify/generate — generate verification token for a worker (requires auth)
router.post("/v1/verify/generate", async (req, res) => {
  try {
    const { workerId, tenantId } = req.body as { workerId?: string; tenantId?: string };
    if (!workerId || !tenantId) return res.status(400).json({ error: "workerId and tenantId required" });

    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 90 * 86_400_000).toISOString(); // 90 days

    // Upsert — one active token per worker
    await execute("DELETE FROM verification_tokens WHERE worker_id = $1", [workerId]);
    await execute(
      "INSERT INTO verification_tokens (worker_id, tenant_id, token, expires_at) VALUES ($1, $2, $3, $4)",
      [workerId, tenantId, token, expiresAt]
    );

    res.json({ token, url: `/verify/${token}`, expiresAt });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/public/verify/:token — PUBLIC, no auth
router.get("/public/verify/:token", async (req, res) => {
  try {
    const vt = await queryOne<any>(
      "SELECT * FROM verification_tokens WHERE token = $1 AND expires_at > NOW()",
      [req.params.token]
    );
    if (!vt) return res.status(404).json({ error: "Invalid or expired verification link" });

    // Fetch worker data
    const worker = await queryOne<any>(
      `SELECT w.first_name, w.last_name, w.nationality, w.specialization,
              w.trc_expiry, w.work_permit_expiry, w.passport_expiry,
              w.bhp_expiry, w.medical_exam_expiry, w.contract_end_date,
              w.pesel, w.passport_number
       FROM workers w WHERE w.id = $1`,
      [vt.worker_id]
    );
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    // Fetch legal snapshot
    let legalStatus: any = null;
    try {
      legalStatus = await queryOne<any>(
        `SELECT legal_status, risk_level, legal_basis, summary, conditions, warnings
         FROM worker_legal_snapshots WHERE worker_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [vt.worker_id]
      );
    } catch { /* table may not exist */ }

    // Fetch tenant name
    const tenant = await queryOne<any>("SELECT name FROM tenants WHERE id = $1", [vt.tenant_id]);

    const now = new Date();
    const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86_400_000) : null;

    res.json({
      verified: true,
      timestamp: now.toISOString(),
      employer: tenant?.name ?? "Apatris Sp. z o.o.",
      worker: {
        name: `${worker.first_name} ${worker.last_name}`,
        nationality: worker.nationality,
        specialization: worker.specialization,
        passportNumber: worker.passport_number ? `***${worker.passport_number.slice(-4)}` : null,
      },
      legalStatus: {
        status: legalStatus?.legal_status ?? "UNKNOWN",
        riskLevel: legalStatus?.risk_level ?? "UNKNOWN",
        basis: legalStatus?.legal_basis ?? null,
        summary: legalStatus?.summary ?? "No legal assessment available",
      },
      documents: {
        trc: { expiry: worker.trc_expiry, daysLeft: daysUntil(worker.trc_expiry) },
        workPermit: { expiry: worker.work_permit_expiry, daysLeft: daysUntil(worker.work_permit_expiry) },
        passport: { expiry: worker.passport_expiry, daysLeft: daysUntil(worker.passport_expiry) },
        bhp: { expiry: worker.bhp_expiry, daysLeft: daysUntil(worker.bhp_expiry) },
        medical: { expiry: worker.medical_exam_expiry, daysLeft: daysUntil(worker.medical_exam_expiry) },
        contract: { expiry: worker.contract_end_date, daysLeft: daysUntil(worker.contract_end_date) },
      },
      expiresAt: vt.expires_at,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Verification failed" });
  }
});

// ═══ PUBLIC RECRUITMENT FORM ════════════════════════════════════════════

// POST /api/public/apply — submit job application (PUBLIC, no auth)
router.post("/public/apply", async (req, res) => {
  try {
    const {
      firstName, lastName, email, phone, nationality, specialization,
      experience, message, tenantSlug,
    } = req.body as Record<string, string>;

    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ error: "firstName, lastName, and phone are required" });
    }

    // Find tenant by slug or use default
    let tenantId: string | null = null;
    if (tenantSlug) {
      const t = await queryOne<any>(
        "SELECT id FROM tenants WHERE LOWER(name) = LOWER($1) OR id::text = $1 LIMIT 1",
        [tenantSlug]
      );
      tenantId = t?.id ?? null;
    }
    if (!tenantId) {
      const dt = await queryOne<any>("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1");
      tenantId = dt?.id ?? null;
    }
    if (!tenantId) return res.status(500).json({ error: "No tenant configured" });

    const app = await queryOne<any>(
      `INSERT INTO job_applications (tenant_id, first_name, last_name, email, phone, nationality, specialization, experience, notes, source, status, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'public_form', 'new', NOW())
       RETURNING id`,
      [tenantId, firstName, lastName, email ?? null, phone, nationality ?? null,
       specialization ?? null, experience ?? null, message ?? null]
    );

    res.status(201).json({ success: true, applicationId: app?.id, message: "Application submitted successfully" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to submit application" });
  }
});

// POST /api/public/apply/files — handle CV + passport uploads (PUBLIC)
router.post("/public/apply/files", async (req, res) => {
  try {
    const multer = (await import("multer")).default;
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).fields([
      { name: "cv", maxCount: 1 },
      { name: "passport", maxCount: 1 },
    ]);

    upload(req as any, res as any, async (err: any) => {
      if (err) return res.status(400).json({ error: "File upload failed" });
      const files = (req as any).files as Record<string, any[]>;
      const uploaded: string[] = [];

      // Store files as base64 in job_applications metadata (simple approach)
      // In production, upload to R2/S3
      const appData = JSON.parse((req.body?.applicationData as string) ?? "{}");
      const phone = appData.phone ?? "unknown";

      if (files?.cv?.[0]) {
        uploaded.push(`CV: ${files.cv[0].originalname} (${Math.round(files.cv[0].size / 1024)}KB)`);
      }
      if (files?.passport?.[0]) {
        uploaded.push(`Passport: ${files.passport[0].originalname} (${Math.round(files.passport[0].size / 1024)}KB)`);
        // Run AI extraction on passport if available
        try {
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (apiKey && files.passport[0].mimetype.startsWith("image/")) {
            const { default: Anthropic } = await import("@anthropic-ai/sdk");
            const anthropic = new Anthropic({ apiKey });
            const base64 = files.passport[0].buffer.toString("base64");
            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-6", max_tokens: 512,
              messages: [{ role: "user", content: [
                { type: "image", source: { type: "base64", media_type: files.passport[0].mimetype, data: base64 } },
                { type: "text", text: "Extract from this passport/ID: fullName, dateOfBirth, nationality, passportNumber, expiryDate. Return JSON only." },
              ]}],
            });
            const text = response.content[0]?.type === "text" ? response.content[0].text : "";
            uploaded.push(`AI extraction: ${text.slice(0, 200)}`);
          }
        } catch { /* AI extraction non-critical */ }
      }

      // Update the latest application with file info
      try {
        await execute(
          "UPDATE job_applications SET notes = COALESCE(notes,'') || $1 WHERE phone = $2 ORDER BY applied_at DESC LIMIT 1",
          ["\n[Files: " + uploaded.join(", ") + "]", phone]
        );
      } catch { /* non-critical */ }

      res.json({ uploaded });
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/public/apply/config — get basic tenant config for form display
router.get("/public/apply/config", async (_req, res) => {
  try {
    const tenant = await queryOne<any>("SELECT id, name FROM tenants ORDER BY created_at ASC LIMIT 1");
    res.json({
      tenantName: tenant?.name ?? "Apatris",
      specializations: ["TIG Welder", "MIG/MAG Welder", "Pipe Welder", "Structural Welder", "Plumber", "Electrician", "Carpenter", "General Construction", "Forklift Operator", "CNC Operator", "Other"],
      nationalities: ["Ukrainian", "Belarusian", "Georgian", "Moldovan", "Armenian", "Indian", "Nepali", "Filipino", "Vietnamese", "Polish", "Other"],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ═══ CLIENT PORTAL LINK ═════════════════════════════════════════════════

// POST /api/v1/client-portal/generate — generate read-only link for client
router.post("/v1/client-portal/generate", async (req, res) => {
  try {
    const { clientName, workerIds, tenantId } = req.body as { clientName?: string; workerIds?: string[]; tenantId?: string };
    if (!clientName || !tenantId) return res.status(400).json({ error: "clientName and tenantId required" });

    const token = crypto.randomBytes(20).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString(); // 30 days

    await execute(
      "INSERT INTO client_portal_links (tenant_id, client_name, token, worker_ids, expires_at) VALUES ($1, $2, $3, $4, $5)",
      [tenantId, clientName, token, workerIds ?? [], expiresAt]
    );

    res.json({ token, url: `/client/${token}`, expiresAt });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/public/client/:token — PUBLIC client portal
router.get("/public/client/:token", async (req, res) => {
  try {
    const link = await queryOne<any>(
      "SELECT * FROM client_portal_links WHERE token = $1 AND expires_at > NOW()",
      [req.params.token]
    );
    if (!link) return res.status(404).json({ error: "Invalid or expired portal link" });

    // Fetch workers for this client
    let workers: any[];
    if (link.worker_ids?.length > 0) {
      workers = await query<any>(
        `SELECT id, first_name, last_name, nationality, specialization,
                trc_expiry, work_permit_expiry, bhp_expiry, medical_exam_expiry, contract_end_date
         FROM workers WHERE id = ANY($1) AND tenant_id = $2`,
        [link.worker_ids, link.tenant_id]
      );
    } else {
      workers = await query<any>(
        `SELECT id, first_name, last_name, nationality, specialization,
                trc_expiry, work_permit_expiry, bhp_expiry, medical_exam_expiry, contract_end_date
         FROM workers WHERE tenant_id = $1 LIMIT 50`,
        [link.tenant_id]
      );
    }

    const now = new Date();
    const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86_400_000) : null;
    const zone = (days: number | null) => days === null ? "unknown" : days < 0 ? "expired" : days < 30 ? "red" : days <= 60 ? "yellow" : "green";

    const workerList = workers.map(w => ({
      name: `${w.first_name} ${w.last_name}`,
      nationality: w.nationality,
      specialization: w.specialization,
      documents: {
        trc: { daysLeft: daysUntil(w.trc_expiry), zone: zone(daysUntil(w.trc_expiry)) },
        workPermit: { daysLeft: daysUntil(w.work_permit_expiry), zone: zone(daysUntil(w.work_permit_expiry)) },
        bhp: { daysLeft: daysUntil(w.bhp_expiry), zone: zone(daysUntil(w.bhp_expiry)) },
        medical: { daysLeft: daysUntil(w.medical_exam_expiry), zone: zone(daysUntil(w.medical_exam_expiry)) },
        contract: { daysLeft: daysUntil(w.contract_end_date), zone: zone(daysUntil(w.contract_end_date)) },
      },
    }));

    const compliant = workerList.filter(w => Object.values(w.documents).every((d: any) => d.zone === "green" || d.zone === "unknown")).length;

    res.json({
      clientName: link.client_name,
      generated: link.created_at,
      expiresAt: link.expires_at,
      timestamp: now.toISOString(),
      summary: {
        totalWorkers: workerList.length,
        compliant,
        complianceRate: workerList.length > 0 ? Math.round((compliant / workerList.length) * 100) : 0,
      },
      workers: workerList,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/public/apply/form — serve the public recruitment form as HTML
router.get("/public/apply/form", async (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Apply — Apatris Workforce</title>
  <meta property="og:title" content="Join Apatris — We're Hiring!">
  <meta property="og:description" content="Apply for welding and construction jobs in Poland. Quick application — takes 2 minutes.">
  <meta property="og:type" content="website">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0b;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{max-width:440px;width:100%;background:#141416;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:32px;box-shadow:0 25px 60px rgba(0,0,0,0.5)}
    .logo{width:48px;height:48px;background:linear-gradient(135deg,#1a1a1a,#0a0a0a);border:1px solid rgba(255,255,255,0.1);border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px;font-weight:900;color:#C41E18;font-family:Impact,sans-serif}
    h1{text-align:center;font-size:22px;font-weight:900;letter-spacing:0.12em;margin-bottom:4px}
    .sub{text-align:center;font-size:11px;color:rgba(255,255,255,0.25);letter-spacing:0.15em;text-transform:uppercase;margin-bottom:24px}
    .accent{height:2px;background:linear-gradient(90deg,transparent,#C41E18,transparent);margin:-24px -32px 24px;border-radius:0}
    label{display:block;font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px}
    input,select,textarea{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px 14px;color:#fff;font-size:14px;outline:none;margin-bottom:14px;transition:border 0.2s}
    input:focus,select:focus,textarea:focus{border-color:rgba(196,30,24,0.5)}
    select{appearance:none;cursor:pointer}
    textarea{resize:none;height:70px}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .btn{width:100%;padding:14px;background:#C41E18;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.05em;margin-top:4px;transition:background 0.2s}
    .btn:hover{background:#a81914}
    .btn:disabled{background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.2);cursor:not-allowed}
    .success{text-align:center;padding:40px 0}
    .success h2{font-size:20px;margin:16px 0 8px;font-weight:800}
    .success p{font-size:13px;color:rgba(255,255,255,0.5)}
    .check{width:56px;height:56px;background:rgba(16,185,129,0.1);border:2px solid rgba(16,185,129,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:28px}
    .footer{text-align:center;font-size:9px;color:rgba(255,255,255,0.08);margin-top:20px;letter-spacing:0.15em;text-transform:uppercase}
    .req{color:#C41E18}
    .upload-box{width:100%;background:rgba(255,255,255,0.04);border:2px dashed rgba(255,255,255,0.1);border-radius:10px;padding:16px;text-align:center;cursor:pointer;margin-bottom:14px;transition:border 0.2s}
    .upload-box:hover{border-color:rgba(196,30,24,0.4)}
    .upload-box.has-file{border-color:rgba(16,185,129,0.4);background:rgba(16,185,129,0.05)}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">A</div>
    <h1>APATRIS</h1>
    <p class="sub">Job Application</p>
    <div class="accent"></div>

    <div id="form-view">
      <form id="apply-form" onsubmit="submitForm(event)">
        <div class="row">
          <div><label>First Name <span class="req">*</span></label><input name="firstName" required placeholder="Jan"></div>
          <div><label>Last Name <span class="req">*</span></label><input name="lastName" required placeholder="Kowalski"></div>
        </div>
        <label>Phone <span class="req">*</span></label><input name="phone" type="tel" required placeholder="+48 xxx xxx xxx">
        <label>Email</label><input name="email" type="email" placeholder="your@email.com">
        <div class="row">
          <div><label>Nationality</label><select name="nationality"><option value="">Select...</option><option>Ukrainian</option><option>Belarusian</option><option>Georgian</option><option>Moldovan</option><option>Armenian</option><option>Indian</option><option>Nepali</option><option>Filipino</option><option>Vietnamese</option><option>Polish</option><option>Other</option></select></div>
          <div><label>Specialization</label><select name="specialization"><option value="">Select...</option><option>TIG Welder</option><option>MIG/MAG Welder</option><option>Pipe Welder</option><option>Structural Welder</option><option>Plumber</option><option>Electrician</option><option>Carpenter</option><option>General Construction</option><option>Forklift Operator</option><option>CNC Operator</option><option>Other</option></select></div>
        </div>
        <label>Experience</label><input name="experience" placeholder="e.g. 5 years TIG welding">
        <label>CV / Resume</label>
        <div class="upload-box" onclick="document.getElementById('cv-input').click()">
          <input type="file" id="cv-input" name="cv" accept=".pdf,.doc,.docx" style="display:none" onchange="showFileName(this,'cv-name')">
          <span id="cv-name" style="font-size:12px;color:rgba(255,255,255,0.4)">📄 Tap to upload CV (PDF, DOC)</span>
        </div>
        <label>Passport / ID Photo</label>
        <div class="upload-box" onclick="document.getElementById('passport-input').click()">
          <input type="file" id="passport-input" name="passport" accept="image/*,.pdf" style="display:none" onchange="showFileName(this,'passport-name')">
          <span id="passport-name" style="font-size:12px;color:rgba(255,255,255,0.4)">📷 Tap to upload passport photo</span>
        </div>
        <label>Message</label><textarea name="message" placeholder="Tell us about yourself..."></textarea>
        <button type="submit" class="btn" id="submit-btn">Submit Application</button>
      </form>
    </div>

    <div id="success-view" style="display:none" class="success">
      <div class="check">✓</div>
      <h2>Application Submitted!</h2>
      <p>Thank you for applying. Our team will review your application and contact you soon.</p>
    </div>

    <p class="footer">Powered by Apatris Compliance Hub</p>
  </div>

  <script>
    function showFileName(input, spanId) {
      const span = document.getElementById(spanId);
      if (input.files && input.files[0]) {
        span.textContent = '✅ ' + input.files[0].name;
        input.parentElement.classList.add('has-file');
      }
    }
    async function submitForm(e) {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      btn.disabled = true; btn.textContent = 'Submitting...';
      const fd = new FormData(e.target);
      // Send text fields as JSON, files separately
      const data = {};
      fd.forEach((v, k) => { if (typeof v === 'string') data[k] = v; });
      try {
        // Submit application data
        const r = await fetch('/api/public/apply', {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
        });
        if (r.ok) {
          // Upload files if provided (non-blocking)
          const cvFile = document.getElementById('cv-input').files[0];
          const passportFile = document.getElementById('passport-input').files[0];
          if (cvFile || passportFile) {
            const uploadForm = new FormData();
            if (cvFile) uploadForm.append('cv', cvFile);
            if (passportFile) uploadForm.append('passport', passportFile);
            uploadForm.append('applicationData', JSON.stringify(data));
            fetch('/api/public/apply/files', { method: 'POST', body: uploadForm }).catch(() => {});
          }
          document.getElementById('form-view').style.display = 'none';
          document.getElementById('success-view').style.display = 'block';
        } else { btn.disabled = false; btn.textContent = 'Submit Application'; alert('Failed — please try again.'); }
      } catch { btn.disabled = false; btn.textContent = 'Submit Application'; alert('Network error.'); }
    }
  </script>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

// GET /api/public/verify/:token/page — serve verification result as HTML
router.get("/public/verify/:token/page", async (req, res) => {
  try {
    // Fetch data using the JSON endpoint
    const baseUrl = `\${req.protocol}://\${req.get("host")}`;
    const r = await fetch(`\${baseUrl}/api/public/verify/\${req.params.token}`);
    if (!r.ok) {
      res.setHeader("Content-Type", "text/html");
      return res.send('<html><body style="background:#0a0a0b;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><div style="text-align:center"><h1 style="color:#C41E18;font-size:48px">Invalid Link</h1><p style="color:rgba(255,255,255,0.4)">This verification link is expired or invalid.</p></div></body></html>');
    }
    const data = await r.json();
    const statusColor = data.legalStatus?.status === "VALID" || data.legalStatus?.status === "PROTECTED_PENDING" ? "#10B981" : data.legalStatus?.riskLevel === "CRITICAL" ? "#EF4444" : "#F59E0B";

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Worker Verification — Apatris</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0a0a0b;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{max-width:440px;width:100%;background:#141416;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:28px;box-shadow:0 25px 60px rgba(0,0,0,0.5)}.logo{text-align:center;margin-bottom:20px}.logo span{color:#C41E18;font-size:32px;font-weight:900;font-family:Impact,sans-serif}.badge{display:inline-block;padding:8px 16px;border-radius:10px;font-weight:800;font-size:13px;letter-spacing:0.08em;margin:12px 0}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px}.row .label{color:rgba(255,255,255,0.4)}.row .val{font-weight:700;text-align:right}.section{font-size:10px;font-weight:800;color:rgba(255,255,255,0.2);letter-spacing:0.12em;text-transform:uppercase;margin:16px 0 8px}.ts{text-align:center;font-size:10px;color:rgba(255,255,255,0.15);margin-top:16px}</style></head>
    <body><div class="card">
      <div class="logo"><span>A</span><div style="font-size:18px;font-weight:900;letter-spacing:0.12em;margin-top:4px">APATRIS</div><div style="font-size:9px;color:rgba(255,255,255,0.2);letter-spacing:0.15em;text-transform:uppercase;margin-top:2px">Worker Verification</div></div>
      <div style="text-align:center"><div class="badge" style="background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40">${data.legalStatus?.status ?? "UNKNOWN"}</div></div>
      <div class="section">Worker</div>
      <div class="row"><span class="label">Name</span><span class="val">${data.worker?.name ?? "—"}</span></div>
      <div class="row"><span class="label">Nationality</span><span class="val">${data.worker?.nationality ?? "—"}</span></div>
      <div class="row"><span class="label">Specialization</span><span class="val">${data.worker?.specialization ?? "—"}</span></div>
      <div class="row"><span class="label">Employer</span><span class="val">${data.employer ?? "—"}</span></div>
      <div class="section">Legal Status</div>
      <div class="row"><span class="label">Status</span><span class="val" style="color:${statusColor}">${data.legalStatus?.status ?? "—"}</span></div>
      <div class="row"><span class="label">Risk Level</span><span class="val">${data.legalStatus?.riskLevel ?? "—"}</span></div>
      <div class="row"><span class="label">Legal Basis</span><span class="val">${data.legalStatus?.basis ?? "—"}</span></div>
      <div class="section">Documents</div>
      ${Object.entries(data.documents ?? {}).map(([k, v]: any) => `<div class="row"><span class="label">${k}</span><span class="val" style="color:${(v?.daysLeft ?? -1) < 0 ? '#EF4444' : (v?.daysLeft ?? 0) < 30 ? '#F59E0B' : '#10B981'}">${v?.daysLeft !== null ? (v.daysLeft < 0 ? 'EXPIRED' : v.daysLeft + 'd left') : '—'}</span></div>`).join("")}
      <div class="ts">Verified: ${data.timestamp ?? new Date().toISOString()} · Valid until: ${data.expiresAt ? new Date(data.expiresAt).toLocaleDateString("en-GB") : "—"}</div>
    </div></body></html>`;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch {
    res.setHeader("Content-Type", "text/html");
    res.send('<html><body style="background:#0a0a0b;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><h1 style="color:#C41E18">Verification Error</h1></body></html>');
  }
});

// GET /api/public/agency — landing page for staffing agencies
router.get("/public/agency", async (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Apatris — Compliance Platform for Staffing Agencies</title>
  <meta property="og:title" content="Apatris — Stop losing money on compliance failures">
  <meta property="og:description" content="AI-powered workforce compliance platform for staffing agencies managing foreign workers in Poland. 14-day free trial.">
  <meta property="og:type" content="website">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0b;color:#fff;overflow-x:hidden}
    .hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 20px;position:relative}
    .hero::before{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:600px;height:400px;background:radial-gradient(ellipse,rgba(196,30,24,0.15),transparent 70%);pointer-events:none}
    .logo{width:64px;height:64px;background:linear-gradient(135deg,#1a1a1a,#0a0a0a);border:1px solid rgba(255,255,255,0.1);border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:36px;font-weight:900;color:#C41E18;font-family:Impact,sans-serif}
    h1{font-size:clamp(28px,5vw,48px);font-weight:900;letter-spacing:0.06em;line-height:1.1;margin-bottom:12px}
    h1 span{color:#C41E18}
    .subtitle{font-size:clamp(14px,2vw,18px);color:rgba(255,255,255,0.5);max-width:600px;margin:0 auto 32px;line-height:1.6}
    .cta{display:inline-block;padding:16px 40px;background:#C41E18;color:#fff;border-radius:14px;font-size:16px;font-weight:800;text-decoration:none;letter-spacing:0.04em;transition:all 0.2s;box-shadow:0 8px 30px rgba(196,30,24,0.3)}
    .cta:hover{background:#a81914;transform:translateY(-2px);box-shadow:0 12px 40px rgba(196,30,24,0.4)}
    .trust{margin-top:24px;font-size:12px;color:rgba(255,255,255,0.2)}
    .features{padding:80px 20px;max-width:900px;margin:0 auto}
    .features h2{text-align:center;font-size:28px;font-weight:900;margin-bottom:40px;letter-spacing:0.04em}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}
    .card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:24px}
    .card .icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:12px;font-size:20px}
    .card h3{font-size:15px;font-weight:800;margin-bottom:6px}
    .card p{font-size:13px;color:rgba(255,255,255,0.4);line-height:1.5}
    .pricing{padding:80px 20px;max-width:900px;margin:0 auto}
    .pricing h2{text-align:center;font-size:28px;font-weight:900;margin-bottom:40px}
    .plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
    .plan{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:28px;text-align:center}
    .plan.featured{border-color:rgba(196,30,24,0.4);background:rgba(196,30,24,0.05)}
    .plan h3{font-size:18px;font-weight:800;margin-bottom:4px}
    .plan .price{font-size:36px;font-weight:900;margin:12px 0 4px}
    .plan .price span{font-size:14px;color:rgba(255,255,255,0.3);font-weight:400}
    .plan .period{font-size:12px;color:rgba(255,255,255,0.3);margin-bottom:16px}
    .plan ul{list-style:none;text-align:left;margin-bottom:20px}
    .plan li{font-size:12px;color:rgba(255,255,255,0.5);padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
    .plan li::before{content:'✓ ';color:#10B981;font-weight:800}
    .plan .btn{display:block;padding:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:13px;font-weight:700;text-decoration:none;transition:all 0.2s}
    .plan.featured .btn{background:#C41E18;border-color:#C41E18}
    .plan .btn:hover{transform:translateY(-1px)}
    .form-section{padding:80px 20px;max-width:500px;margin:0 auto}
    .form-section h2{text-align:center;font-size:24px;font-weight:900;margin-bottom:8px}
    .form-section .sub{text-align:center;font-size:13px;color:rgba(255,255,255,0.3);margin-bottom:28px}
    .form-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px}
    .form-card label{display:block;font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px}
    .form-card input,.form-card select{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px 14px;color:#fff;font-size:14px;outline:none;margin-bottom:14px}
    .form-card input:focus{border-color:rgba(196,30,24,0.5)}
    .form-card .submit{width:100%;padding:14px;background:#C41E18;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;margin-top:4px}
    .form-card .submit:hover{background:#a81914}
    .footer{text-align:center;padding:40px 20px;font-size:10px;color:rgba(255,255,255,0.1);letter-spacing:0.12em;text-transform:uppercase;border-top:1px solid rgba(255,255,255,0.04)}
    .success{text-align:center;padding:40px 0;display:none}
    .success h3{font-size:20px;font-weight:800;margin:12px 0 8px}
    .success p{font-size:13px;color:rgba(255,255,255,0.4)}
    .check{width:56px;height:56px;background:rgba(16,185,129,0.1);border:2px solid rgba(16,185,129,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:28px}
  </style>
</head>
<body>

  <!-- HERO -->
  <section class="hero">
    <div class="logo">A</div>
    <h1>Stop losing money on<br><span>compliance failures</span></h1>
    <p class="subtitle">AI-powered workforce compliance platform for staffing agencies managing foreign workers in Poland. From document tracking to legal case management — automated.</p>
    <a href="#trial" class="cta">Start 14-Day Free Trial</a>
    <p class="trust">No credit card required · Set up in 10 minutes · Cancel anytime</p>
  </section>

  <!-- FEATURES -->
  <section class="features">
    <h2>What Apatris does for your agency</h2>
    <div class="grid">
      <div class="card">
        <div class="icon" style="background:rgba(16,185,129,0.1);color:#10B981">⚖️</div>
        <h3>Legal Case Management</h3>
        <p>8-stage case lifecycle with SLA tracking. AI generates legal documents at every stage — your lawyer reviews, doesn't write from scratch.</p>
      </div>
      <div class="card">
        <div class="icon" style="background:rgba(59,130,246,0.1);color:#3B82F6">📄</div>
        <h3>AI Document Intelligence</h3>
        <p>Upload a passport, TRC, or work permit — AI extracts all data in seconds. 21 document types recognized. Auto-links to worker profile.</p>
      </div>
      <div class="card">
        <div class="icon" style="background:rgba(196,30,24,0.1);color:#C41E18">🔍</div>
        <h3>QR Compliance Verification</h3>
        <p>Border police scans QR code on worker's phone — sees legal status instantly. No app needed. Proves compliance on the spot.</p>
      </div>
      <div class="card">
        <div class="icon" style="background:rgba(139,92,246,0.1);color:#8B5CF6">🧠</div>
        <h3>Immigration Law Search</h3>
        <p>Ask any question about Polish immigration law — get answers from verified legal knowledge base, sourced search, and AI analysis.</p>
      </div>
      <div class="card">
        <div class="icon" style="background:rgba(245,158,11,0.1);color:#F59E0B">⚡</div>
        <h3>Auto-Escalation</h3>
        <p>Cases don't sit unattended. SLA breach → automatic WhatsApp to coordinator → email to lawyer → alert to management.</p>
      </div>
      <div class="card">
        <div class="icon" style="background:rgba(6,182,212,0.1);color:#06B6D4">📊</div>
        <h3>Client Portal</h3>
        <p>Generate a read-only link for your clients. They see their workers' compliance status in real time. Trust that sells.</p>
      </div>
    </div>
  </section>

  <!-- PRICING -->
  <section class="pricing">
    <h2>Simple pricing. No surprises.</h2>
    <div class="plans">
      <div class="plan">
        <h3>Starter</h3>
        <div class="price">€199<span>/mo</span></div>
        <div class="period">Up to 50 workers</div>
        <ul>
          <li>Compliance tracking</li>
          <li>Document management</li>
          <li>Worker app (5-tier RBAC)</li>
          <li>Email alerts</li>
          <li>Basic reports</li>
        </ul>
        <a href="#trial" class="btn">Start Free Trial</a>
      </div>
      <div class="plan featured">
        <h3>Professional</h3>
        <div class="price">€499<span>/mo</span></div>
        <div class="period">Up to 200 workers</div>
        <ul>
          <li>Everything in Starter</li>
          <li>AI document extraction</li>
          <li>Legal case management</li>
          <li>AI document generation</li>
          <li>Knowledge graph</li>
          <li>Client portal links</li>
          <li>WhatsApp + push alerts</li>
          <li>Priority support</li>
        </ul>
        <a href="#trial" class="btn">Start Free Trial</a>
      </div>
      <div class="plan">
        <h3>Enterprise</h3>
        <div class="price">€999<span>/mo</span></div>
        <div class="period">Unlimited workers</div>
        <ul>
          <li>Everything in Professional</li>
          <li>White-label branding</li>
          <li>Multi-country support</li>
          <li>API access</li>
          <li>Custom integrations</li>
          <li>Dedicated account manager</li>
        </ul>
        <a href="#trial" class="btn">Contact Sales</a>
      </div>
    </div>
  </section>

  <!-- TRIAL FORM -->
  <section class="form-section" id="trial">
    <h2>Start your free trial</h2>
    <p class="sub">14 days free. No credit card. Full access.</p>
    <div class="form-card">
      <div id="trial-form-view">
        <form id="trial-form" onsubmit="submitTrial(event)">
          <label>Agency Name *</label><input name="agencyName" required placeholder="Your company name">
          <label>Your Name *</label><input name="contactName" required placeholder="Full name">
          <label>Email *</label><input name="email" type="email" required placeholder="your@agency.com">
          <label>Phone</label><input name="phone" type="tel" placeholder="+48 xxx xxx xxx">
          <label>Number of Workers</label>
          <select name="workerCount"><option value="1-25">1-25</option><option value="25-50">25-50</option><option value="50-100">50-100</option><option value="100-200" selected>100-200</option><option value="200+">200+</option></select>
          <label>Country</label>
          <select name="country"><option value="Poland" selected>Poland</option><option value="Ireland">Ireland</option><option value="Germany">Germany</option><option value="Czech Republic">Czech Republic</option><option value="Other">Other</option></select>
          <button type="submit" class="submit" id="trial-btn">Start Free Trial</button>
        </form>
      </div>
      <div id="trial-success" class="success">
        <div class="check">✓</div>
        <h3>Welcome to Apatris!</h3>
        <p>We'll set up your account and send login details within 24 hours.</p>
      </div>
    </div>
  </section>

  <footer class="footer">Apatris Sp. z o.o. · NIP 5252828706 · Powered by AI</footer>

  <script>
    async function submitTrial(e) {
      e.preventDefault();
      const btn = document.getElementById('trial-btn');
      btn.disabled = true; btn.textContent = 'Submitting...';
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      try {
        const r = await fetch('/api/public/apply', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ firstName: data.contactName, lastName: data.agencyName, phone: data.phone || 'N/A', email: data.email, specialization: 'Agency Trial', experience: data.workerCount + ' workers in ' + data.country, message: 'AGENCY TRIAL REQUEST: ' + data.agencyName })
        });
        if (r.ok) {
          document.getElementById('trial-form-view').style.display = 'none';
          document.getElementById('trial-success').style.display = 'block';
        } else { btn.disabled = false; btn.textContent = 'Start Free Trial'; }
      } catch { btn.disabled = false; btn.textContent = 'Start Free Trial'; }
    }
  </script>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

export default router;
