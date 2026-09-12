import Job from "../models/Jobs.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";

// GET /api/jobs/:jobId
export const getJobStatus = asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    // Populate basic image details so the frontend has context on what is being processed
    const job = await Job.findById(jobId).populate("image", "filename storagePath project");

    if (!job) {
        throw new ApiError(404, "Processing job not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                jobId: job._id,
                jobHash: job.jobHash,
                status: job.status,               // 'queued' | 'active' | 'completed' | 'failed'
                stage: job.stage,                 // 'preprocess' | 'depth_inference' | 'calibration' | 'mesh_generation' | 'finalizing'
                progress: job.progress,           // 0 - 100
                statusMessage: job.statusMessage,
                errorMessage: job.errorMessage,
                backbone: job.backbone,
                calibMethod: job.calibMethod,
                image: job.image,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt
            },
            "Job status retrieved successfully"
        )
    );
});