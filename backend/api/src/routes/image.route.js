import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { 
    getImageMetadata, deleteGCP, addGCP, getGCPs, 
    addAnnotation, getAnnotations, processImage,
    getImageMesh, getImageDSM, measureTerrain, simulateFlood,
    exportAsset, createExportPackage, shareProjectView
} from "../controllers/image.controller.js";

const router = Router();
router.use(requireAuth);

// Existing routes
router.route("/:imageId/metadata").get(getImageMetadata);
router.route("/:imageId/process").post(processImage);
router.route("/:imageId/gcps").post(addGCP).get(getGCPs);
router.route("/:imageId/gcps/:gcpId/delete").delete(deleteGCP);
router.route("/:imageId/annotations").post(addAnnotation).get(getAnnotations);

// NEW Output Delivery Routes
router.route("/:imageId/mesh").get(getImageMesh);
router.route("/:imageId/dsm").get(getImageDSM);

// NEW Analysis Routes
router.route("/:imageId/measure").post(measureTerrain);
router.route("/:imageId/flood-sim").post(simulateFlood);

// NEW Export & Share Routes
router.route("/:imageId/export").get(exportAsset);
router.route("/:imageId/export/package").post(createExportPackage);
router.route("/:imageId/share").post(shareProjectView);

export default router;