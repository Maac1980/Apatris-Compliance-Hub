import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// In production, serve the built React frontend from the same server.
// process.cwd() is the workspace root when running: node artifacts/api-server/dist/index.cjs
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(process.cwd(), "artifacts/apatris-dashboard/dist/public");
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("*splat", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }
}

export default app;
