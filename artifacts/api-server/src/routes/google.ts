import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "https://apatris-api.fly.dev/api/google/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function isGoogleConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

async function getTokens(tenantId: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const row = await queryOne<Record<string, any>>(
    "SELECT access_token, refresh_token, expires_at FROM google_integrations WHERE tenant_id = $1",
    [tenantId]
  );
  if (!row) return null;

  // Refresh if expired
  if (row.expires_at && new Date(row.expires_at) < new Date() && row.refresh_token) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: row.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const data = await res.json();
      if (data.access_token) {
        const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
        await execute(
          "UPDATE google_integrations SET access_token = $1, expires_at = $2, updated_at = NOW() WHERE tenant_id = $3",
          [data.access_token, expiresAt.toISOString(), tenantId]
        );
        return { access_token: data.access_token, refresh_token: row.refresh_token };
      }
    } catch (err) {
      console.error("[Google] Token refresh failed:", err);
    }
  }
  return { access_token: row.access_token, refresh_token: row.refresh_token };
}

// GET /api/google/status — connection status
router.get("/google/status", requireAuth, async (req, res) => {
  try {
    const row = await queryOne<Record<string, any>>(
      "SELECT email, scopes, connected_at FROM google_integrations WHERE tenant_id = $1",
      [req.tenantId!]
    );
    res.json({
      configured: isGoogleConfigured(),
      connected: !!row,
      email: row?.email || null,
      scopes: row?.scopes || null,
      connectedAt: row?.connected_at || null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/google/auth — start OAuth2 flow
router.get("/google/auth", requireAuth, requireRole("Admin", "Executive"), async (req, res) => {
  if (!isGoogleConfigured()) return res.status(503).json({ error: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not configured" });

  const state = req.tenantId!;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${encodeURIComponent(state)}`;

  res.json({ url });
});

// GET /api/google/callback — OAuth2 callback
router.get("/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query as Record<string, string>;
    if (!code) return res.status(400).send("Missing code");

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: GOOGLE_REDIRECT_URI,
      }),
    });
    const tokens = await tokenRes.json();

    if (!tokens.access_token) return res.status(400).send("Token exchange failed");

    // Get user email
    let email = "";
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const user = await userRes.json();
      email = user.email || "";
    } catch { /* non-blocking */ }

    const tenantId = state || null;
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    // Upsert
    await execute(
      `INSERT INTO google_integrations (tenant_id, access_token, refresh_token, email, scopes, expires_at, connected_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET access_token = $2, refresh_token = COALESCE($3, google_integrations.refresh_token),
       email = $4, scopes = $5, expires_at = $6, connected_at = NOW(), updated_at = NOW()`,
      [tenantId, tokens.access_token, tokens.refresh_token || null, email, SCOPES, expiresAt.toISOString()]
    );

    res.send(`<!DOCTYPE html><html><head><title>Connected</title></head>
<body style="background:#0f172a;color:#fff;font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;">
<div style="text-align:center;"><h1 style="color:#4ade80;">Google Workspace Connected</h1>
<p>Account: ${email}</p><p style="color:#64748b;">You may close this window.</p></div></body></html>`);
  } catch (err) {
    res.status(500).send("OAuth error: " + (err instanceof Error ? err.message : "Unknown"));
  }
});

// POST /api/google/gmail/send — send email via Gmail API
router.post("/google/gmail/send", requireAuth, async (req, res) => {
  try {
    const tokens = await getTokens(req.tenantId!);
    if (!tokens) return res.status(503).json({ error: "Google not connected" });

    const { to, subject, body: htmlBody } = req.body as { to?: string; subject?: string; body?: string };
    if (!to || !subject || !htmlBody) return res.status(400).json({ error: "to, subject, body required" });

    // Construct RFC 2822 email
    const raw = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${htmlBody}`
    ).toString("base64url");

    const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });

    if (!gmailRes.ok) {
      const err = await gmailRes.text();
      return res.status(502).json({ error: `Gmail API error: ${err}` });
    }

    const result = await gmailRes.json();
    res.json({ sent: true, messageId: result.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Send failed" });
  }
});

// POST /api/google/calendar/event — create calendar event
router.post("/google/calendar/event", requireAuth, async (req, res) => {
  try {
    const tokens = await getTokens(req.tenantId!);
    if (!tokens) return res.status(503).json({ error: "Google not connected" });

    const { summary, description, start, end, attendees, addMeet } = req.body as {
      summary?: string; description?: string; start?: string; end?: string;
      attendees?: string[]; addMeet?: boolean;
    };
    if (!summary || !start || !end) return res.status(400).json({ error: "summary, start, end required" });

    const event: Record<string, any> = {
      summary,
      description: description || "",
      start: { dateTime: start, timeZone: "Europe/Warsaw" },
      end: { dateTime: end, timeZone: "Europe/Warsaw" },
    };
    if (attendees?.length) event.attendees = attendees.map(e => ({ email: e }));
    if (addMeet) event.conferenceData = { createRequest: { requestId: `meet-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } };

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events${addMeet ? "?conferenceDataVersion=1" : ""}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }
    );

    if (!calRes.ok) {
      const err = await calRes.text();
      return res.status(502).json({ error: `Calendar API error: ${err}` });
    }

    const result = await calRes.json();
    res.json({
      created: true,
      eventId: result.id,
      htmlLink: result.htmlLink,
      meetLink: result.hangoutLink || result.conferenceData?.entryPoints?.[0]?.uri || null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/google/drive/upload — upload document to Drive
router.post("/google/drive/upload", requireAuth, async (req, res) => {
  try {
    const tokens = await getTokens(req.tenantId!);
    if (!tokens) return res.status(503).json({ error: "Google not connected" });

    const { fileName, content, mimeType, folderId } = req.body as {
      fileName?: string; content?: string; mimeType?: string; folderId?: string;
    };
    if (!fileName || !content) return res.status(400).json({ error: "fileName and content required" });

    // Create file metadata
    const metadata: Record<string, any> = { name: fileName, mimeType: mimeType || "application/pdf" };
    if (folderId) metadata.parents = [folderId];

    const boundary = "apatris_upload_boundary";
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType || "application/pdf"}\r\nContent-Transfer-Encoding: base64\r\n\r\n${content}\r\n--${boundary}--`;

    const driveRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!driveRes.ok) {
      const err = await driveRes.text();
      return res.status(502).json({ error: `Drive API error: ${err}` });
    }

    const result = await driveRes.json();
    res.json({ uploaded: true, fileId: result.id, webViewLink: result.webViewLink });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
  }
});

// GET /api/google/calendar/events — upcoming events
router.get("/google/calendar/events", requireAuth, async (req, res) => {
  try {
    const tokens = await getTokens(req.tenantId!);
    if (!tokens) return res.status(503).json({ error: "Google not connected" });

    const now = new Date().toISOString();
    const maxDate = new Date(Date.now() + 30 * 86_400_000).toISOString();

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(maxDate)}&maxResults=20&orderBy=startTime&singleEvents=true`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );

    if (!calRes.ok) return res.status(502).json({ error: "Calendar API error" });
    const result = await calRes.json();
    res.json({ events: result.items || [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
