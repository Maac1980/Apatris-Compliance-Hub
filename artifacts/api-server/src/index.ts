import { createServer } from "http";
import app from "./app";
import { initializeDatabase } from "./lib/init-db.js";
import { initWebSocket } from "./lib/websocket.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

(async () => {
  await initializeDatabase();
  const server = createServer(app);
  initWebSocket(server);
  server.listen(port, () => {
    console.log(`Server listening on port ${port} (HTTP + WebSocket)`);
  });
})();
