import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import workersRouter from "./workers.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workersRouter);

export default router;
