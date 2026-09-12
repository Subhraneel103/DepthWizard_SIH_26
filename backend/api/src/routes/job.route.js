import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { getJobStatus } from "../controllers/job.controller.js";

const router = Router();
router.use(requireAuth);

router.route("/:jobId").get(getJobStatus);

export default router;