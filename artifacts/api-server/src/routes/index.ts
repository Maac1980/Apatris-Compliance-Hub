import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import workersRouter from "./workers.js";
import authRouter from "./auth.js";
import adminsRouter from "./admins.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminsRouter);
router.use(workersRouter);

export default router;
