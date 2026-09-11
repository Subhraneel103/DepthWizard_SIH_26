import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
        console.log(`MongoDB connected with host ${connectionInstance.connection.host}`);
    } catch (error) {
        console.log(error);
        process.exit(1);//immediately stops running the server this helps to prevent wrong data usage.
    }
};
export default connectDB;