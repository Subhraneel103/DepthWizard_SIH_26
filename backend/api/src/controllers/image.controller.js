import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import Image from "../models/Images.model.js";
import Job from "../models/Jobs.model.js";


// Get metadata for a specific image
// GET /api/images/:imageId
export const getImageMetadata = asyncHandler(async (req, res) => {
    const { imageId } = req.params;

    const image = await Image.findById(imageId);

    if (!image) {
        throw new ApiError(404, "Image not found");
    }

    const metadata = {
        imageId: image._id,
        filename: image.filename,
        storagePath: image.storagePath,
        bounds: image.bounds,
        isGeoreferenced: image.isGeoreferenced,
        crs: image.crs,
        resolution: image.resolution,
        uploadedAt: image.uploadedAt,
        gcpsCount: image.gcps ? image.gcps.length : 0
    };

    return res
        .status(200)
        .json(new ApiResponse(200, metadata, "Image metadata fetched successfully"));
});


// GCP (Ground Control Point) management routes
// POST /api/images/:imageId/gcps
export const addGCP = asyncHandler(async (req, res) => {
    const { imageId } = req.params;
    const { pixelX, pixelY, lat, lon, worldX, worldY, elevation, label, source } = req.body;

    // Support both lat/lon and worldY/worldX
    const resolvedLat = lat ?? worldY;
    const resolvedLon = lon ?? worldX;

    if (pixelX === undefined || pixelY === undefined || elevation === undefined) {
        throw new ApiError(400, "pixelX, pixelY, and elevation are required");
    }

    const image = await Image.findById(imageId);
    if (!image) {
        throw new ApiError(404, "Image not found");
    }

    image.gcps.push({
        pixelX,
        pixelY,
        lat: resolvedLat,
        lon: resolvedLon,
        elevation,
        label: label || `GCP-${image.gcps.length + 1}`,
        source: source || 'manual'
    });

    await image.save();

    return res
        .status(201)
        .json(new ApiResponse(201, image.gcps, "GCP added successfully"));
});


// GET /api/images/:imageId/gcps
// GET /api/images/:imageId/gcps
export const getGCPs = asyncHandler(async (req, res) => {
    const { imageId } = req.params;

    const image = await Image.findById(imageId).select("gcps");
    if (!image) {
        throw new ApiError(404, "Image not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, image.gcps, "GCPs fetched successfully"));
});

// deleteGCP function to delete a specific GCP from an image
// DELETE /api/images/:imageId/gcps/:gcpId
export const deleteGCP = asyncHandler(async (req, res) => {
    const { imageId, gcpId } = req.params;

    const image = await Image.findById(imageId);
    if (!image) {
        throw new ApiError(404, "Image not found");
    }

    // Check if the GCP exists in the array
    const gcp = image.gcps.id(gcpId);
    if (!gcp) {
        throw new ApiError(404, "GCP point not found");
    }

    // Pull the subdocument from the array
    image.gcps.pull(gcpId);
    await image.save();

    return res
        .status(200)
        .json(new ApiResponse(200, image.gcps, "GCP deleted successfully"));
});

// Annotation management routes
// POST /api/images/:imageId/annotations
export const addAnnotation = asyncHandler(async (req, res) => {
    const { imageId } = req.params;
    const { label, type, coordinates, color, notes } = req.body;

    if (!label || !coordinates) {
        throw new ApiError(400, "Label and coordinates are required");
    }

    const image = await Image.findById(imageId);
    if (!image) {
        throw new ApiError(404, "Image not found");
    }

    const newAnnotation = {
        label,
        type: type || "point",
        coordinates,
        color: color || "#ff0000",
        notes: notes || "",
        createdAt: new Date()
    };

    image.annotations.push(newAnnotation);
    await image.save();

    return res
        .status(201)
        .json(new ApiResponse(201, image.annotations, "Annotation added successfully"));
});

// GET /api/images/:imageId/annotations
export const getAnnotations = asyncHandler(async (req, res) => {
    const { imageId } = req.params;

    const image = await Image.findById(imageId).select("annotations");
    if (!image) {
        throw new ApiError(404, "Image not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, image.annotations, "Annotations fetched successfully"));
});


// Process image and initiate terrain pipeline
// POST /api/images/:imageId/process
export const processImage = asyncHandler(async (req, res) => {
    const { imageId } = req.params;
    const { backbone, calibMethod } = req.body;

    const image = await Image.findById(imageId);
    if (!image) {
        throw new ApiError(404, "Image not found");
    }

    // Generate a unique UI hash like #QM-8841
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const jobHash = `#QM-${randomSuffix}`;

    // Create the job matching your schema
    const job = await Job.create({
        image: image._id,
        jobHash,
        backbone: backbone || "vit-l",
        calibMethod: calibMethod || (image.gcps?.length ? "gcp" : "srtm"),
        status: "queued",
        stage: "preprocess",
        progress: 0,
        statusMessage: "Task enqueued for processing"
    });

    // Mock pipeline stages in the background (runs asynchronously)
    setTimeout(async () => {
        try {
            // Stage 1: Active / Depth inference
            await Job.findByIdAndUpdate(job._id, {
                status: "active",
                stage: "depth_inference",
                progress: 35,
                statusMessage: "Running Vision Transformer depth inference"
            });

            // Stage 2: Calibration & Mesh generation
            setTimeout(async () => {
                await Job.findByIdAndUpdate(job._id, {
                    stage: "mesh_generation",
                    progress: 75,
                    statusMessage: "Constructing 3D surface mesh and elevation matrix"
                });

                // Stage 3: Completed
                setTimeout(async () => {
                    await Job.findByIdAndUpdate(job._id, {
                        status: "completed",
                        stage: "finalizing",
                        progress: 100,
                        statusMessage: "Terrain pipeline completed successfully"
                    });
                }, 3000);
            }, 3000);
        } catch (err) {
            await Job.findByIdAndUpdate(job._id, {
                status: "failed",
                errorMessage: err.message
            });
        }
    }, 1000);

    return res.status(202).json(
        new ApiResponse(
            202,
            {
                jobId: job._id,
                jobHash: job.jobHash,
                status: job.status,
                stage: job.stage,
                progress: job.progress
            },
            "Terrain processing initiated"
        )
    );
});