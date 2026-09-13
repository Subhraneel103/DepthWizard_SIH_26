import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { clerkMiddleware } from "@clerk/express";
import "./workers/process.worker.js"; // Ensure the worker is initialized when the app starts

// Route imports (matches your project.route.js filename)
import projectRouter from "./routes/project.route.js";
import imageRouter from "./routes/image.route.js"; 
import jobRouter from "./routes/job.route.js"; 
import dsmRouter from "./routes/dsm.route.js";

// Middleware imports
import { errorHandler } from "./middlewares/error.middleware.js";
import ApiError from "./utils/ApiError.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 1. CORS configuration
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || "http://localhost:5173",
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], // added while creating frontend
        credentials: true,
    })
);

// 2. Request body parsers
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// 3. Static directory for local uploads & rasters
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// 4. Clerk authentication parser (populates session state)
app.use(clerkMiddleware());

// 5. API Routes
app.use("/api/projects", projectRouter);
app.use("/api/images", imageRouter);
app.use("/api/jobs", jobRouter); 
app.use("/api/dsm-results", dsmRouter);


// 6. 404 Route Handler
app.use((req, res, next) => {
    next(new ApiError(404, `Route not found: ${req.originalUrl}`));
});

// 7. Centralized Global Error Handler (from middlewares/error.middleware.js)
app.use(errorHandler);

export default app;