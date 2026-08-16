import { config } from "../config.js";
import { insertLogs } from "../db/queries/logs.js";
import { ServiceUnavailableError } from "../errors.js";
import type { NewLog } from "../db/schema.js";

type PendingWrite = {
    rows: NewLog[];
    resolve: () => void;
    reject: (error: unknown) => void;
};

const queue: PendingWrite[] = [];

let queuedRows = 0;
let writesInFlight = 0;
let flushTimer: NodeJS.Timeout | undefined;

// The first request is always taken, even if it alone is bigger than the limit
const takeBatch = () => {
    const batch: PendingWrite[] = [];
    let rows = 0;

    while (queue.length > 0) {
        const next = queue[0];

        if (batch.length > 0 && rows + next.rows.length > config.ingest.maxBatchRows) {
            break;
        }

        queue.shift();
        queuedRows -= next.rows.length;
        rows += next.rows.length;
        batch.push(next);
    }

    return batch;
};

const runWrite = async (batch: PendingWrite[]) => {
    try {
        // flatMap joins the row arrays of all the requests into one array
        await insertLogs(batch.flatMap((write) => write.rows));

        for (const write of batch) {
            write.resolve();
        }
    } catch (error) {
        for (const write of batch) {
            write.reject(error);
        }
    } finally {
        writesInFlight--;
        startWrites();
    }
};

// Starts as many writes as the settings allow. It is not async on purpose:
// it only starts the work and returns at once, so the request that called it is not blocked.
const startWrites = () => {
    while (queue.length > 0 && writesInFlight < config.ingest.maxConcurrentWrites) {
        const batch = takeBatch();
        writesInFlight++;
        void runWrite(batch);
    }
};

const scheduleFlush = () => {
    // If a timer already exists, do nothing
    // This prevents the application from creating one timer for every request
    if (flushTimer) {
        return;
    }

    flushTimer = setTimeout(() => {
        flushTimer = undefined;
        startWrites();
    }, config.ingest.flushIntervalMs);

    // Without it, the process would refuse to exit while a timer is waiting.
    flushTimer.unref();
};

export const writeLogs = (rows: NewLog[]) => {
    if (queuedRows + rows.length > config.ingest.maxQueuedRows) {
        return Promise.reject(new ServiceUnavailableError("ingestion queue is full, please retry"));
    }

    return new Promise<void>((resolve, reject) => {
        queue.push({ rows: rows, resolve: resolve, reject: reject });
        queuedRows += rows.length;

        // Write now instead of waiting for the timer
        if (queuedRows >= config.ingest.maxBatchRows) {
            startWrites();
        }

        // The timer makes sure they are written soon even if no new request arrives
        scheduleFlush();
    });
};

// Used when the service shuts down, so that rows already accepted are not lost
export const flushPendingLogs = async () => {
    startWrites();

    while (queue.length > 0 || writesInFlight > 0) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        startWrites();
    }
};
