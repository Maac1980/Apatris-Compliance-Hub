import express, { type Express } from "express";
import cors from "cors";
import { tenantMiddleware } from "./lib/tenant.js";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(tenantMiddleware);

app.use("/api", router);

export default app;
