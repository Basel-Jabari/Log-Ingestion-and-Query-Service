import { logLevel, LogAttributes, LogLevel, NewLog } from "../db/schema.js";
import { BadRequestError } from "../errors.js";

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const FIVE_MINUTES = 5 * 60 * 1000;

const MAX_REASON_VALUE_LENGTH = 64;

const describeValue = (value: unknown): string => {
    if (typeof value === "string") {
        const shortened =
            value.length > MAX_REASON_VALUE_LENGTH ? `${value.slice(0, MAX_REASON_VALUE_LENGTH)}...` : value;
        return `'${shortened}'`;
    }

    if (Array.isArray(value)) {
        return "array";
    }

    if (typeof value === "object" && value !== null) {
        return "object";
    }

    return String(value);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isLogLevel = (value: unknown): value is LogLevel => {
    return typeof value === "string" && (logLevel.enumValues as string[]).includes(value);
};

const parseTimestamp = (value: unknown): Date => {
    if (value === undefined) {
        throw new BadRequestError("missing timestamp");
    }

    if (typeof value !== "string" || !ISO_8601.test(value)) {
        throw new BadRequestError(`invalid timestamp: ${describeValue(value)}`);
    }

    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
        throw new BadRequestError(`invalid timestamp: ${describeValue(value)}`);
    }

    if (timestamp.getTime() > Date.now() + FIVE_MINUTES) {
        throw new BadRequestError(`timestamp is more than five minutes in the future: ${describeValue(value)}`);
    }

    return timestamp;
};

const parseLevel = (value: unknown): LogLevel => {
    if (value === undefined) {
        throw new BadRequestError("missing level");
    }

    if (!isLogLevel(value)) {
        throw new BadRequestError(`invalid level: ${describeValue(value)}`);
    }

    return value;
};

const parseText = (value: unknown, field: "service" | "message"): string => {
    if (value === undefined) {
        throw new BadRequestError(`missing ${field}`);
    }

    if (typeof value !== "string" || value.trim() === "") {
        throw new BadRequestError(`invalid ${field}: ${describeValue(value)}`);
    }

    return value;
};

const parseAttributes = (value: unknown): LogAttributes => {
    if (value === undefined) {
        return {};
    }

    if (!isPlainObject(value)) {
        throw new BadRequestError(`invalid attributes: ${describeValue(value)}`);
    }

    const attributes: LogAttributes = {};
    for (const [key, attribute] of Object.entries(value)) {
        if (typeof attribute !== "string" && typeof attribute !== "number" && typeof attribute !== "boolean") {
            throw new BadRequestError(`invalid attributes value for '${key}': ${describeValue(attribute)}`);
        }

        attributes[key] = attribute;
    }

    return attributes;
};

export const validateLog = (log: unknown): NewLog => {
    if (!isPlainObject(log)) {
        throw new BadRequestError(`log entry must be an object, received ${describeValue(log)}`);
    }

    return {
        timestamp: parseTimestamp(log["timestamp"]),
        level: parseLevel(log["level"]),
        service: parseText(log["service"], "service"),
        message: parseText(log["message"], "message"),
        attributes: parseAttributes(log["attributes"])
    };
};

export type RejectedLog = {
    index: number;
    reason: string;
};

export type ValidatedLogBatch = {
    valid: NewLog[];
    rejected: RejectedLog[];
};

export const validateLogBatch = (body: unknown): ValidatedLogBatch => {
    if (!isPlainObject(body)) {
        throw new BadRequestError("request body must be an object with a 'logs' array");
    }

    const entries = body["logs"];
    if (!Array.isArray(entries)) {
        throw new BadRequestError(`'logs' must be an array, received ${describeValue(entries)}`);
    }

    if (entries.length === 0) {
        throw new BadRequestError("'logs' must contain at least one entry");
    }

    const valid: NewLog[] = [];
    const rejected: RejectedLog[] = [];

    for (let [entry, index] of entries) {
        try {
            valid.push(validateLog(entry));
        } catch (error) {
            if (!(error instanceof BadRequestError)) {
                throw error;
            }

            rejected.push({
                index: index,
                reason: error.message
            });
        }
    }

    return {
        valid: valid,
        rejected: rejected
    };
};
