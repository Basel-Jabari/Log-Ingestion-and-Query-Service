import { Router } from "express";
import { config } from "../config.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
    if (config.server.isReady) {
        res.status(200).json({
            status: "ready"
        });
    } else {
        res.status(500).json({
            status: "not-ready"
        });
    }
});
