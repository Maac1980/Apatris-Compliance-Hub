import app from "./app";
import { startScheduler } from "./lib/scheduler.js";
import { initMobilePinsTable } from "./lib/mobile-pins.js";
import { initHoursTable } from "./routes/hours.js";

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

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  startScheduler();
  initMobilePinsTable().catch((err) =>
    console.error("[MobilePins] Failed to initialise table:", err)
  );
  initHoursTable().catch((err) =>
    console.error("[Hours] Failed to initialise table:", err)
  );
});
