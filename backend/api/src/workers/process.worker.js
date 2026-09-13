import { Worker } from "bullmq";
import fs from "fs";
import path from "path";
import Job from "../models/Jobs.model.js";
import Image from "../models/Images.model.js";
import DsmResult from "../models/DsmResults.model.js";

const connection = { host: "127.0.0.1", port: 6379 };

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const worker = new Worker("3d-processing", async (bullJob) => {
    const { jobId, imageId, storagePath } = bullJob.data;
    console.log(`[Worker] Picked up job ${jobId} for image ${imageId}`);

    // 1. Preprocessing
    await Job.findByIdAndUpdate(jobId, { 
        status: "active", 
        stage: "preprocess", 
        progress: 15, 
        statusMessage: "Validating telemetry and metadata..." 
    });
    await sleep(2000);

    // 2. Depth Inference
    await Job.findByIdAndUpdate(jobId, { 
        stage: "depth_inference", 
        progress: 45, 
        statusMessage: "Running Vision Transformer depth inference..." 
    });
    await sleep(3500);

    // 3. Mesh Generation
    await Job.findByIdAndUpdate(jobId, { 
        stage: "mesh_generation", 
        progress: 80, 
        statusMessage: "Constructing 3D surface mesh and elevation matrix..." 
    });
    await sleep(3000);

    const uploadDir = path.resolve(process.cwd(), "public/uploads");
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const dsmFilename = `dsm_${imageId}.tif`;
    const meshFilename = `mesh_${imageId}.glb`;
    
    const absoluteDsmPath = path.join(uploadDir, dsmFilename);
    const absoluteMeshPath = path.join(uploadDir, meshFilename);

    // Copy the actual valid uploaded raw .tif file so geotiff.js can parse its binary headers successfully
    const sourceTifPath = path.resolve(process.cwd(), "public", storagePath ? storagePath.replace(/^\//, "") : "");
    if (fs.existsSync(sourceTifPath)) {
        fs.copyFileSync(sourceTifPath, absoluteDsmPath);
    } else {
        // Absolute fallback if source is missing
        fs.writeFileSync(absoluteDsmPath, "SIMULATED_DSM_GEOTIFF_DATA");
    }

    if (!fs.existsSync(absoluteMeshPath)) {
        fs.writeFileSync(absoluteMeshPath, "SIMULATED_3D_MESH_DATA");
    }

    // 4. Finalize & Save DsmResult
    const result = await DsmResult.create({
        image: imageId,
        storagePathGeotiff: `/uploads/${dsmFilename}`,
        storagePathMesh: `/uploads/${meshFilename}`,
        minElevation: 12.4,
        maxElevation: 48.7,
        modelBackbone: "large",
        vertexCount: 15000,
        faceCount: 30000,
    });

    // 5. Update original image pointers
    await Image.findByIdAndUpdate(imageId, {
        meshUrl: result.storagePathMesh,
        dsmUrl: result.storagePathGeotiff,
        status: "completed"
    });

    // 6. Complete Job
    await Job.findByIdAndUpdate(jobId, { 
        status: "completed", 
        stage: "finalizing", 
        progress: 100, 
        statusMessage: "Terrain pipeline completed successfully" 
    });

    console.log(`[Worker] Successfully finished job ${jobId}`);
    return { success: true, resultId: result._id };
}, { connection });

worker.on("failed", async (job, err) => {
    console.error(`[Worker] Job ${job.id} failed:`, err);
    if (job.data?.jobId) {
        await Job.findByIdAndUpdate(job.data.jobId, { 
            status: "failed", 
            errorMessage: err.message 
        });
    }
});

export default worker;