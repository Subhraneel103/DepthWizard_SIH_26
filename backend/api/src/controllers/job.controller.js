// src/controllers/jobController.js
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import Job from "../models/Jobs.model.js";

export const getJobStatus = asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    
    // 1. Try to find by Job ID (used during the active progress bar polling)
    let job = await Job.findById(jobId).catch(() => null);

    // 2. If not found, React might have sent the Image ID (used on initial page load)
    if (!job) {
        job = await Job.findOne({ image: jobId }).sort({ createdAt: -1 });
    }

    if (!job) throw new ApiError(404, "Job not found");

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                jobId: job._id,
                jobHash: job.jobHash,
                status: job.status,
                stage: job.stage,
                progress: job.progress,
                statusMessage: job.statusMessage
            },
            "Job status fetched successfully"
        )
    );
});