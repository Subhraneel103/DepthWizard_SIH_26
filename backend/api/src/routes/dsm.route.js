import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validateDSM, getValidationReport } from "../controllers/dsmResult.controller.js";

const router = Router();
router.use(requireAuth);

router.route("/:dsmResultId/validate").post(validateDSM);
router.route("/:dsmResultId/validation-report").get(getValidationReport);

export default router;