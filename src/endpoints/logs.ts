import { Router } from "express";
import { validateAggregateParameters, validateLogBatch, validateQueryParameters } from "../utils/validate.js";
import { aggregateLogs, selectLogs } from "../db/queries/logs.js";
import { Log } from "../db/schema.js";
import { encodeCursor } from "../utils/cursor.js";
import { writeLogs } from "../ingest/writer.js";

export const logsRouter = Router();

logsRouter.post("/", async (req, res) => {
    const { valid, rejected } = validateLogBatch(req.body);

    if (valid.length > 0) {
        // We did await here because suppose an error did happen in the DB query
        // Without await, the res would send 200 success than 503 unavailable service
        // And that doesn't make sense
        await writeLogs(valid);
    }

    res.status(valid.length > 0 ? 200 : 400).json({
        accepted: valid.length,
        rejected: rejected
    });
});

// The id is a bigint, and JSON.stringify throws on bigint
// The contract accepts any unique id, so we send it as text
const toLogResponse = (log: Log) => {
    return {
        id: log.id.toString(),
        timestamp: log.timestamp,
        level: log.level,
        service: log.service,
        message: log.message,
        attributes: log.attributes ?? {}
    };
};

logsRouter.get("/aggregate", async (req, res) => {
    const parameters = validateAggregateParameters(req.query);
    const buckets = await aggregateLogs(parameters);

    res.json({
        buckets: buckets
    });
});

logsRouter.get("/", async (req, res) => {
    const queryParameters = validateQueryParameters(req.query);

    // selectLogs asks for one row more than the limit
    // That extra row only tells us whether another page exists
    const filteredLogs = await selectLogs(queryParameters);
    const hasMore = filteredLogs.length > queryParameters.limit;
    const page = filteredLogs.slice(0, queryParameters.limit);

    res.json({
        logs: page.map(toLogResponse),
        // The next page continues after the last row we return
        next_cursor: hasMore ? encodeCursor(page[page.length - 1]) : null
    });
});
