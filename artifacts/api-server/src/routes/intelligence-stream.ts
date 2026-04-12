/**
 * Intelligence Stream — SSE endpoint for real-time legal events.
 */

import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { onIntelligenceEvent } from "../lib/intelligence-emitter.js";
import { JWT_SECRET } from "./auth.js";

const router = Router();

// GET /api/intelligence/stream — SSE event stream
// Accepts auth via query param ?token= since EventSource doesn't support headers
router.get("/intelligence/stream", (req: Request, res: Response) => {
  const token = (req.query.token as string) ?? req.cookies?.apatris_jwt ?? req.headers.authorization?.replace("Bearer ", "");
  if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
  try { jwt.verify(token, JWT_SECRET); } catch { res.status(401).json({ error: "Invalid token" }); return; }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

  // Keep alive every 30s
  const keepAlive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 30_000);

  // Subscribe to intelligence events
  const unsubscribe = onIntelligenceEvent((event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch { /* client disconnected */ }
  });

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

export default router;
