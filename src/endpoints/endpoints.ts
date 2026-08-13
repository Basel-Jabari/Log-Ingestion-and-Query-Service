import { Router } from "express";
import { healthRouter } from "./health.js";

export const endpoints = Router();

endpoints.use("/health", healthRouter);
