import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

interface WsClient {
  ws: WebSocket;
  tenantId: string;
  userId: string;
  role: string;
  channels: Set<string>;
}

const clients = new Map<WebSocket, WsClient>();

/**
 * Initialize WebSocket server on the same HTTP server as Express.
 * Clients connect to ws://host/ws?token=JWT_TOKEN
 */
export function initWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    // Authenticate via query param token
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(4001, "Authentication required");
      return;
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET) as {
        email: string; name: string; role: string; tenantId?: string;
      };

      const client: WsClient = {
        ws,
        tenantId: payload.tenantId ?? "default",
        userId: payload.email,
        role: payload.role,
        channels: new Set(["gps", "alerts"]), // Subscribe to default channels
      };

      clients.set(ws, client);
      console.log(`[WS] Client connected: ${payload.name} (${payload.role})`);

      // Handle incoming messages (channel subscriptions)
      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "subscribe" && msg.channel) {
            client.channels.add(msg.channel);
          }
          if (msg.type === "unsubscribe" && msg.channel) {
            client.channels.delete(msg.channel);
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on("close", () => {
        clients.delete(ws);
        console.log(`[WS] Client disconnected: ${payload.name}`);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: "connected",
        channels: Array.from(client.channels),
        message: `Connected as ${payload.name}`,
      }));

    } catch {
      ws.close(4001, "Invalid token");
    }
  });

  // Heartbeat every 30 seconds
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30000);

  console.log("[WS] WebSocket server initialized on /ws");
  return wss;
}

/**
 * Broadcast a message to all connected clients in a specific tenant + channel.
 */
export function broadcast(tenantId: string, channel: string, data: Record<string, unknown>): void {
  const message = JSON.stringify({ type: "event", channel, data, timestamp: new Date().toISOString() });

  for (const [ws, client] of clients) {
    if (client.tenantId === tenantId && client.channels.has(channel) && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

/**
 * Broadcast GPS check-in/check-out events.
 */
export function broadcastGpsEvent(tenantId: string, event: {
  type: "checkin" | "checkout";
  workerName: string;
  siteName: string;
  timestamp: string;
}): void {
  broadcast(tenantId, "gps", event);
}

/**
 * Broadcast compliance alert events.
 */
export function broadcastAlert(tenantId: string, alert: {
  type: "critical" | "warning" | "expired";
  workerName: string;
  documentType: string;
  daysUntilExpiry: number;
}): void {
  broadcast(tenantId, "alerts", alert);
}

/**
 * Get count of connected clients per tenant.
 */
export function getConnectionStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const [, client] of clients) {
    stats[client.tenantId] = (stats[client.tenantId] ?? 0) + 1;
  }
  return stats;
}
