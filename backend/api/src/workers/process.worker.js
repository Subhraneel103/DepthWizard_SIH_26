import fs from "fs";
import path from "path";
import Job from "../models/Jobs.model.js";
import Image from "../models/Images.model.js";
import DsmResult from "../models/DsmResults.model.js";
import { Worker } from "bullmq";

const connection = { host: "127.0.0.1", port: 6379 };

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const worker = new Worker("3d-processing", async (bullJob) => {
    const { jobId, imageId, storagePath } = bullJob.data;
    console.log(`[Worker] Picked up job ${jobId} for image ${imageId}`);

    await Job.findByIdAndUpdate(jobId, { 
        status: "active", 
        stage: "preprocess", 
        progress: 15, 
        statusMessage: "Validating telemetry and metadata..." 
    });
    await sleep(2000);

    await Job.findByIdAndUpdate(jobId, { 
        stage: "depth_inference", 
        progress: 45, 
        statusMessage: "Running Vision Transformer depth inference..." 
    });
    await sleep(3500);

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

    const sourceTifPath = path.resolve(process.cwd(), "public", storagePath ? storagePath.replace(/^\//, "") : "");
    if (fs.existsSync(sourceTifPath)) {
        fs.copyFileSync(sourceTifPath, absoluteDsmPath);
    } else {
        fs.writeFileSync(absoluteDsmPath, "SIMULATED_DSM_GEOTIFF_DATA");
    }

    // FIX: Provide a valid minimal binary GLTF header so Three.js GLTFLoader doesn't crash on JSON parsing
    if (!fs.existsSync(absoluteMeshPath)) {
        const dummyGltfJson = JSON.stringify({
            asset: { version: "2.0", generator: "GeospatialPlatformMock" },
            scenes: [{ nodes: [0] }],
            nodes: [{ mesh: 0 }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
            accessors: [
                { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
                { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
            ],
            bufferViews: [
                { buffer: 0, byteLength: 36, byteOffset: 0 },
                { buffer: 0, byteLength: 6, byteOffset: 36 }
            ],
            buffers: [{ byteLength: 44 }]
        });
        
        // Write out a valid GLB container structure (GLTF binary format chunk)
        const jsonBuffer = Buffer.from(dummyGltfJson);
        const paddingLength = (4 - (jsonBuffer.length % 4)) % 4;
        const paddedJson = Buffer.concat([jsonBuffer, Buffer.alloc(paddingLength, 0x20)]);
        
        const binBuffer = Buffer.alloc(44, 0); // 36 bytes for 3 vec3 vertices + 6 bytes for indices + padding
        const binPaddingLength = (4 - (binBuffer.length % 4)) % 4;
        const paddedBin = Buffer.concat([binBuffer, Buffer.alloc(binPaddingLength, 0x00)]);

        const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBin.length;
        const glbHeader = Buffer.alloc(12);
        glbHeader.writeUInt32LE(0x46546C67, 0); // "glTF"
        glbHeader.writeUInt32LE(2, 4);         // Version 2
        glbHeader.writeUInt32LE(totalLength, 8);

        const chunk1Header = Buffer.alloc(8);
        chunk1Header.writeUInt32LE(paddedJson.length, 0);
        chunk1Header.writeUInt32LE(0x4E4F534A, 4); // JSON chunk

        const chunk2Header = Buffer.alloc(8);
        chunk2Header.writeUInt32LE(paddedBin.length, 0);
        chunk2Header.writeUInt32LE(0x004E4942, 4); // BIN chunk

        const glbFileBuffer = Buffer.concat([glbHeader, chunk1Header, paddedJson, chunk2Header, paddedBin]);
        fs.writeFileSync(absoluteMeshPath, glbFileBuffer);
    }

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

    await Image.findByIdAndUpdate(imageId, {
        meshUrl: result.storagePathMesh,
        dsmUrl: result.storagePathGeotiff,
        status: "completed"
    });

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