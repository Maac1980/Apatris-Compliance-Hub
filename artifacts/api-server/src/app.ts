import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { tenantMiddleware } from "./lib/tenant.js";
import { apiLimiter } from "./lib/rate-limit.js";
import router from "./routes";

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(tenantMiddleware);

app.use("/api", apiLimiter);
app.use("/api", router);

export default app;
