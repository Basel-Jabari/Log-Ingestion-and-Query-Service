import { Router } from "express";
import { healthRouter } from "./health.js";
import { logsRouter } from "./logs.js";

export const endpoints = Router();

endpoints.use("/health", healthRouter);
endpoints.use("/logs", logsRouter);
