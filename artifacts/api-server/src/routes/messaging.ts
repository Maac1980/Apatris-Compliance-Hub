import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { createHash } from "crypto";

const router = Router();

// Simple encryption (XOR with key hash — production should use AES)
const ENC_KEY = process.env.JWT_SECRET || "apatris-msg-key";
function encrypt(text: string): string {
  const keyHash = createHash("sha256").update(ENC_KEY).digest();
  const buf = Buffer.from(text, "utf8");
  const enc = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) enc[i] = buf[i] ^ keyHash[i % keyHash.length];
  return enc.toString("base64");
}
function decrypt(encoded: string): string {
  const keyHash = createHash("sha256").update(ENC_KEY).digest();
  const buf = Buffer.from(encoded, "base64");
  const dec = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) dec[i] = buf[i] ^ keyHash[i % keyHash.length];
  return dec.toString("utf8");
}

function getUserId(req: any): string { return req.user?.email || req.user?.name || "unknown"; }
function getUserName(req: any): string { return req.user?.name || req.user?.email || "Unknown"; }

// GET /api/messages/threads
router.get("/messages/threads", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const rows = await query<Record<string, any>>(
      `SELECT * FROM message_threads WHERE tenant_id = $1 AND participant_ids::text LIKE $2 ORDER BY last_message_at DESC`,
      [req.tenantId!, `%"${userId}"%`]
    );
    // Decrypt last messages
    const threads = rows.map(t => ({
      ...t,
      last_message: t.last_message ? decrypt(t.last_message) : null,
    }));
    res.json({ threads });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/messages/send
router.post("/messages/send", requireAuth, async (req, res) => {
  try {
    const { receiverId, receiverName, message } = req.body as { receiverId?: string; receiverName?: string; message?: string };
    if (!receiverId || !message) return res.status(400).json({ error: "receiverId and message required" });

    const senderId = getUserId(req);
    const senderName = getUserName(req);
    const encrypted = encrypt(message);

    // Find or create thread
    const participants = JSON.stringify([senderId, receiverId].sort());
    const participantNames = JSON.stringify([senderName, receiverName || receiverId]);

    let thread = await queryOne<Record<string, any>>(
      `SELECT id FROM message_threads WHERE tenant_id = $1 AND participant_ids = $2::jsonb`,
      [req.tenantId!, participants]
    );

    if (!thread) {
      thread = await queryOne<Record<string, any>>(
        `INSERT INTO message_threads (tenant_id, participant_ids, participant_names, last_message, last_message_at)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW()) RETURNING id`,
        [req.tenantId!, participants, participantNames, encrypted]
      );
    } else {
      await execute(
        "UPDATE message_threads SET last_message = $1, last_message_at = NOW() WHERE id = $2",
        [encrypted, thread.id]
      );
    }

    const msg = await queryOne(
      `INSERT INTO messages (tenant_id, thread_id, sender_id, sender_name, receiver_id, receiver_name, message, encrypted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) RETURNING *`,
      [req.tenantId!, thread!.id, senderId, senderName, receiverId, receiverName || receiverId, encrypted]
    );

    res.status(201).json({ message: { ...(msg as any), message: message } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/messages/thread/:threadId
router.get("/messages/thread/:threadId", requireAuth, async (req, res) => {
  try {
    const rows = await query<Record<string, any>>(
      "SELECT * FROM messages WHERE thread_id = $1 AND tenant_id = $2 ORDER BY created_at ASC",
      [req.params.threadId, req.tenantId!]
    );
    const messages = rows.map(m => ({
      ...m, message: m.encrypted ? decrypt(m.message) : m.message,
    }));

    // Mark as read
    const userId = getUserId(req);
    await execute(
      "UPDATE messages SET read_at = NOW() WHERE thread_id = $1 AND receiver_id = $2 AND read_at IS NULL",
      [req.params.threadId, userId]
    );

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/messages/:id/read
router.patch("/messages/:id/read", requireAuth, async (req, res) => {
  try {
    await execute("UPDATE messages SET read_at = NOW() WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId!]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/messages/unread
router.get("/messages/unread", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const row = await queryOne<Record<string, any>>(
      "SELECT COUNT(*) AS count FROM messages WHERE receiver_id = $1 AND tenant_id = $2 AND read_at IS NULL",
      [userId, req.tenantId!]
    );
    res.json({ unread: Number(row?.count ?? 0) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
