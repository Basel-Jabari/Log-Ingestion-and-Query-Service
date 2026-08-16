import { Router } from "express";
import { validateLogBatch } from "../utils/validate.js";
import { insertLogs } from "../db/queries/logs.js";

export const logsRouter = Router();

logsRouter.post("/", async (req, res) => {
    const { valid, rejected } = validateLogBatch(req.body);

    if (valid.length > 0) {
        await insertLogs(valid);
    }

    res.status(valid.length > 0 ? 200 : 400).json({
        accepted: valid.length,
        rejected: rejected
    });
});
