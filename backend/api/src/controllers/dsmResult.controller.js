import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import ValidationReport from "../models/ValidationReport.model.js";
import DsmResult from "../models/DsmResults.model.js";

// POST /api/dsm-results/:dsmResultId/validate
export const validateDSM = asyncHandler(async (req, res) => {
    const { dsmResultId } = req.params;

    // Verify DSM result exists before validating
    const dsm = await DsmResult.findById(dsmResultId);
    if (!dsm) throw new ApiError(404, "DSM result not found");

    // Mock computation of metrics
    const report = await ValidationReport.create({
        dsmResultId,
        metrics: { rmse: 0.38, mae: 0.29, maxError: 0.82 },
        residuals: [
            { gcpLabel: "GCP-1", errorMeters: 0.21 },
            { gcpLabel: "GCP-2", errorMeters: -0.34 },
            { gcpLabel: "GCP-3", errorMeters: 0.12 }
        ],
        accuracyGrade: "A"
    });

    return res.status(200).json(new ApiResponse(200, report, "Elevation validation completed"));
});

// GET /api/dsm-results/:dsmResultId/validation-report
export const getValidationReport = asyncHandler(async (req, res) => {
    const { dsmResultId } = req.params;

    const report = await ValidationReport.findOne({ dsmResultId });
    if (!report) throw new ApiError(404, "Validation report not found for this DSM");

    return res.status(200).json(new ApiResponse(200, report, "Validation report retrieved"));
});