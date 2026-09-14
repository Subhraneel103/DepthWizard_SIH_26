import multer from "multer";
import path from "path";
import fs from "fs";

// 1. Ensure the upload directory exists
const uploadDir = path.resolve(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 2. Configure Multer to save files to the disk
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); 
    },
    filename: function (req, file, cb) {
        // Creates a safe, unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

// 3. Export the Multer middleware with file size limits (e.g., 50MB) 
// to prevent memory exhaustion crashes when handling large 17MB+ rasters.
export const uploadImageHandler = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size
}).single("image");