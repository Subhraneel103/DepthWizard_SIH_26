import { Router } from "express";
import {
    createProject,
    getProjects,
    getProjectById,
    deleteProject,
    uploadProjectImage,
    getProjectImages
} from "../controllers/project.controller.js";
import { uploadImageHandler } from "../middlewares/upload.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(requireAuth); // Apply authentication middleware to all project routes

// Project collection routes
router
    .route("/")
    .post(createProject)
    .get(getProjects);

// Single project route
router
    .route("/:projectId")
    .get(getProjectById)
    .delete(deleteProject);

// Raster / Satellite image upload route
router
    .route("/:projectId/images")
    .post(uploadImageHandler, uploadProjectImage)
    .get(getProjectImages);

export default router;