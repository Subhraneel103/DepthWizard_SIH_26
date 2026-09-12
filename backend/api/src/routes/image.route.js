import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { getImageMetadata } from "../controllers/image.controller.js";

const router = Router();

// Apply auth to all image subroutes
router.use(requireAuth);

router.route("/:imageId/metadata").get(getImageMetadata);

export default router;