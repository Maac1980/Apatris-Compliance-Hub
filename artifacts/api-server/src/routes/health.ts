import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Health check — must return 200 for Replit autoscale.
// No auth, no validation, no database — just a fast 200 OK.
router.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

export default router;
