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

// 3. Export the Multer middleware
// Note: Ensure "file" matches the exact FormData key your React app uses. 
// If your React app uses formData.append("image", file), change "file" to "image" here.
export const uploadImageHandler = multer({ storage }).single("image");