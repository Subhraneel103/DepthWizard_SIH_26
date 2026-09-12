import { getAuth } from "@clerk/express";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

export const requireAuth = asyncHandler(async (req, res, next) => {
    const { userId } = getAuth(req);

    if (!userId) {
        throw new ApiError(401, "Unauthorized: You must be logged in to access this resource");
    }

    req.userId = userId;
    next();
});