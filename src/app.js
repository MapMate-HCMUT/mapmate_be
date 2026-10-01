import express from "express";
import mongoose from "mongoose";
import { DB_STATE } from "./constants/database.js";

const app = express();

app.use(express.json());

app.get("/api/health", (req, res) => {
  const isDbConnected = mongoose.connection.readyState === DB_STATE.CONNECTED;
  res.json({
    success: true,
    message: "Backend is running!",
    data: { db: isDbConnected ? "connected" : "disconnected" },
  });
});

export default app;
