//require('dotenv').config({path:"./.env"})//make .env file available everywhere
import dotenv from "dotenv";
import connectDB from "./db/index.js";
import app from "./app.js";

dotenv.config({
    path:"./.env"
});

connectDB()
.then(() => {
    app.listen(process.env.PORT || 3000, () => {
        console.log(`Server is running on port ${process.env.PORT}`);
    })
})
.catch(error=>{
    console.log(error);
    throw error
});
