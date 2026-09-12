import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { getImageMetadata, deleteGCP, addGCP, getGCPs, addAnnotation, getAnnotations} from "../controllers/image.controller.js";

const router = Router();

// Apply auth to all image subroutes
router.use(requireAuth);

router.route("/:imageId/metadata").get(getImageMetadata);

// GCP routes
router.route("/:imageId/gcps")
    .post(addGCP)
    .get(getGCPs);

router.route("/:imageId/gcps/:gcpId/delete")
    .delete(deleteGCP);

// Annotation routes
router.route("/:imageId/annotations")
    .post(addAnnotation)
    .get(getAnnotations);

export default router;