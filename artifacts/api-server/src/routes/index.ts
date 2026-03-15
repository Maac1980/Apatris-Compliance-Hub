import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import workersRouter from "./workers.js";
import authRouter from "./auth.js";
import adminsRouter from "./admins.js";
import documentsRouter from "./documents.js";
import logsRouter from "./logs.js";
import payrollRouter from "./payroll.js";
import siteCoordinatorsRouter from "./site-coordinators.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminsRouter);
router.use(documentsRouter);
router.use(logsRouter);
router.use(payrollRouter);
router.use(siteCoordinatorsRouter);
router.use(workersRouter);

export default router;
