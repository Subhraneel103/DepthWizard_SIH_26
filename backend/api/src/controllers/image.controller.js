import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import Image from "../models/Images.model.js";

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