import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { tenantMiddleware } from "./lib/tenant.js";
import { apiLimiter } from "./lib/rate-limit.js";
import router from "./routes";

const app: Express = express();

app.use(helmet());
app.use(cors({
  credentials: true,
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : true, // fallback to permissive in dev only
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(tenantMiddleware);

app.use("/api", apiLimiter);
app.use("/api", router);

export default app;
