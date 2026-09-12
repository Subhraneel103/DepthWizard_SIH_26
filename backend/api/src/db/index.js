import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async () => {
    try {
        // Automatically strips any trailing slash from the URI
        const cleanUri = process.env.MONGODB_URI.replace(/\/+$/, "");

        const connectionInstance = await mongoose.connect(cleanUri, {
            dbName: DB_NAME,
        });

        console.log(`MongoDB connected with host: ${connectionInstance.connection.host}`);
    } catch (error) {
        console.log("MongoDB connection error:", error);
        process.exit(1);
    }
};

export default connectDB;