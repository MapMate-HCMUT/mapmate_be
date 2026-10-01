import mongoose from "mongoose";
import { DEFAULT_DB_NAME } from "../constants/database.js";

export const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not defined in .env");

  mongoose.connection.on("disconnected", () => console.warn("MongoDB disconnected"));
  mongoose.connection.on("error", (err) => console.error("MongoDB error:", err.message));

  const conn = await mongoose.connect(uri, {
    dbName: process.env.DB_NAME || DEFAULT_DB_NAME,
    autoIndex: process.env.NODE_ENV !== "production",
  });
  console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
};
