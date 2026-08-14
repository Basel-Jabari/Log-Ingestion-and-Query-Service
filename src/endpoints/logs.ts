import { Router } from "express";
import { db } from "../db/db.js";
import { logs } from "../db/schema.js";
import { validateLogBatch } from "../utils/validate.js";

export const logsRouter = Router();

logsRouter.post("/", async (req, res) => {
    const { valid, rejected } = validateLogBatch(req.body);

    if (valid.length > 0) {
        await db.insert(logs).values(valid);
    }

    res.status(valid.length > 0 ? 200 : 400).json({
        accepted: valid.length,
        rejected: rejected
    });
});
