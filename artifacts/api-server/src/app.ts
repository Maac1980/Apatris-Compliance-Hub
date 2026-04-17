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

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],       // Vite injects inline scripts; SW registration is inline
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],                          // API calls to own origin only
      frameSrc: ["'none'"],                            // No iframes allowed
      frameAncestors: ["'none'"],                      // Prevent clickjacking — app cannot be iframed
      objectSrc: ["'none'"],                           // No Flash/plugins
      baseUri: ["'self'"],                             // Prevent <base> tag hijacking
      formAction: ["'self'"],                          // Forms submit to own origin only
      workerSrc: ["'self'", "blob:"],                  // Service workers + blob workers
    },
  },
}));

// CORS: strict in production, permissive in development
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : null;

if (!allowedOrigins && process.env.NODE_ENV === "production") {
  console.warn(
    "[SECURITY] ALLOWED_ORIGINS not set in production. CORS will reject all cross-origin requests. " +
    "Set ALLOWED_ORIGINS=https://your-domain.com to allow specific origins."
  );
}

app.use(cors({
  credentials: true,
  origin: allowedOrigins
    ? allowedOrigins                       // Explicit whitelist from env var
    : process.env.NODE_ENV === "production"
      ? false                              // Production without whitelist = deny all cross-origin
      : true,                              // Development = allow all (Vite dev server, etc.)
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(tenantMiddleware);

// Public routes (no auth required) — must be before apiLimiter
import publicVerifyRouter from "./routes/public-verify.js";
app.use("/api", publicVerifyRouter);

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
