import { getAuth } from "@clerk/express";
import Project from "../models/Projects.model.js";
import Image from "../models/Images.model.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// @desc    Create a new project
// @route   POST /api/projects
export const createProject = asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    if (!userId) {
        throw new ApiError(401, "Unauthorized: Authentication token is missing or invalid");
    }

    const { name, description } = req.body;

    if (!name || name.trim() === "") {
        throw new ApiError(400, "Project name is required");
    }

    const project = await Project.create({
        userId,
        name: name.trim(),
        description: description?.trim() || "",
    });

    if (!project) {
        throw new ApiError(500, "Failed to create project");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, project, "Project created successfully"));
});

// @desc    Get all projects for authenticated user
// @route   GET /api/projects
export const getProjects = asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    if (!userId) {
        throw new ApiError(401, "Unauthorized: Authentication token is missing or invalid");
    }

    const projects = await Project.find({ userId }).sort({ createdAt: -1 });

    return res
        .status(200)
        .json(new ApiResponse(200, projects, "Projects fetched successfully"));
});

// @desc    Get project by ID along with its images
// @route   GET /api/projects/:projectId
export const getProjectById = asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    if (!userId) {
        throw new ApiError(401, "Unauthorized: Authentication token is missing or invalid");
    }

    const { projectId } = req.params;

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
        throw new ApiError(404, "Project not found or you do not have permission");
    }

    const images = await Image.find({ project: projectId }).select("-gcps");

    const responsePayload = {
        project,
        images,
    };

    return res
        .status(200)
        .json(new ApiResponse(200, responsePayload, "Project details fetched successfully"));
});

// @desc    Delete a project and all its images
// @route   DELETE /api/projects/:projectId
export const deleteProject = asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    if (!userId) {
        throw new ApiError(401, "Unauthorized: Authentication token is missing or invalid");
    }

    const { projectId } = req.params;

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
        throw new ApiError(404, "Project not found or you do not have permission");
    }

    // Delete all images belonging to this project first
    await Image.deleteMany({ project: projectId });

    // Delete the project itself
    await Project.findByIdAndDelete(projectId);

    return res
        .status(200)
        .json(new ApiResponse(200, { projectId }, "Project deleted successfully"));
});

// @desc    Upload an image into a project
// @route   POST /api/projects/:projectId/images
export const uploadProjectImage = asyncHandler(async (req, res) => {
    const { userId } = getAuth(req);
    if (!userId) {
        throw new ApiError(401, "Unauthorized: Authentication token is missing or invalid");
    }

    const { projectId } = req.params;

    // Verify user owns the project
    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
        throw new ApiError(404, "Project not found or you do not have permission");
    }

    // Check if multer parsed the image
    const imageFile = req.file;
    if (!imageFile) {
        throw new ApiError(400, "Image file is required under field 'image'");
    }

    const filename = imageFile.originalname;
    const isGeoreferenced =
        filename.toLowerCase().endsWith(".tif") || filename.toLowerCase().endsWith(".tiff");

    const storagePath = imageFile.path || imageFile.location || `uploads/${imageFile.filename}`;

    const image = await Image.create({
        project: projectId,
        filename,
        storagePath,
        isGeoreferenced,
        resolution: 0.5,
    });

    if (!image) {
        throw new ApiError(500, "Failed to register image record");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, image, "Image uploaded and registered successfully"));
});

// @desc    Get images for a specific project
// @route   GET /api/projects/:projectId/images
export const getProjectImages = asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const userId = req.userId;

    // Verify the project exists and belongs to the user
    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
        throw new ApiError(404, "Project not found or unauthorized access");
    }

    // Fetch all images associated with this project
    const images = await Image.find({ project: projectId }).sort({ createdAt: -1 });

    return res
        .status(200)
        .json(new ApiResponse(200, images, "Project images fetched successfully"));
});