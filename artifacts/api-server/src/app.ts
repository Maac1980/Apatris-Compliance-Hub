import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { tenantMiddleware } from "./lib/tenant.js";
import { apiLimiter } from "./lib/rate-limit.js";
import router from "./routes";

const app: Express = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  credentials: true,
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(tenantMiddleware);

app.use("/api", apiLimiter);
app.use("/api", router);

// ── Static file serving for dashboard and workforce app ─────────────────────
const cwd = process.cwd();
console.log("[static] cwd:", cwd, "__dirname:", __dirname);

const dashboardPaths = [
  "/app/artifacts/apatris-dashboard/dist/public",
  path.join(cwd, "artifacts/apatris-dashboard/dist/public"),
  path.resolve(__dirname, "../../apatris-dashboard/dist/public"),
  path.resolve(__dirname, "../../../artifacts/apatris-dashboard/dist/public"),
];
const workforcePaths = [
  "/app/artifacts/workforce-app/dist/public",
  path.join(cwd, "artifacts/workforce-app/dist/public"),
  path.resolve(__dirname, "../../workforce-app/dist/public"),
  path.resolve(__dirname, "../../../artifacts/workforce-app/dist/public"),
];

console.log("[static] checking dashboard paths:", dashboardPaths.map(p => `${p} → ${fs.existsSync(p)}`));
const dashDist = dashboardPaths.find(p => fs.existsSync(p));
const workDist = workforcePaths.find(p => fs.existsSync(p));

if (workDist) {
  console.log("[static] workforce app from:", workDist);
  app.use("/workforce", express.static(workDist));
  app.get("/workforce/{*splat}", (_req, res) => {
    res.sendFile(path.join(workDist, "index.html"));
  });
}

if (dashDist) {
  console.log("[static] dashboard from:", dashDist);
  app.use("/", express.static(dashDist));
  app.get("/{*splat}", (_req, res, next) => {
    if (!_req.path.startsWith("/api") && !_req.path.startsWith("/workforce") && !_req.path.match(/\.(js|css|png|svg|ico|json|woff|woff2)$/)) {
      res.sendFile(path.join(dashDist, "index.html"));
    } else {
      next();
    }
  });
} else {
  console.warn("[static] No dashboard dist found:", dashboardPaths);
}

export default app;
