import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import workersRouter from "./workers.js";
import aiRouter from "./ai.js";

const router: IRouter = Router();
router.use(healthRouter);
router.use(workersRouter);
router.use(aiRouter);

export default router;
