import { logLevel, LogAttributes, LogLevel, NewLog } from "../db/schema.js";
import { BadRequestError } from "../errors.js";
import { decodeCursor, type Cursor } from "./cursor.js";

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

const parseTimestamp = (value: unknown, fiveMinutes: boolean): Date => {
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

    // We subtract 1 because in Date:
    // Months start from 0
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day) {
        throw new BadRequestError(`invalid timestamp: ${describeValue(value)}`);
    }

    if (fiveMinutes && timestamp.getTime() > Date.now() + FIVE_MINUTES) {
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

const parseText = (value: unknown, field: "service" | "message" | "q"): string => {
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

const parseLimit = (value: unknown): number => {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw new BadRequestError(`invalid limit: ${describeValue(value)}`);
    }

    const limit = Number(value);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
        throw new BadRequestError(`limit must be an integer between 1 and 1000: ${describeValue(value)}`);
    }

    return limit;
};

// Filters arrive flat, as attr.user_id=42, never as a nested object
// Their values always come from the URL, so they are always strings
const parseAttr = (query: Record<string, unknown>): AttributeFilters => {
    const attributes: AttributeFilters = {};
    for (const [key, value] of Object.entries(query)) {
        if (!key.startsWith("attr.")) {
            continue;
        }

        const attrKey = key.slice("attr.".length);
        if (attrKey === "") {
            throw new BadRequestError("invalid attr key: empty key");
        }

        // A repeated filter, like attr.a=1&attr.a=2, arrives as an array
        if (typeof value !== "string") {
            throw new BadRequestError(`invalid attr value for '${attrKey}': ${describeValue(value)}`);
        }

        attributes[attrKey] = value;
    }

    return attributes;
};

const parseCursor = (value: unknown): Cursor => {
    if (typeof value !== "string") {
        throw new BadRequestError(`invalid cursor: ${describeValue(value)}`);
    }

    return decodeCursor(value);
};

export const validateLog = (log: unknown): NewLog => {
    if (!isPlainObject(log)) {
        throw new BadRequestError(`log entry must be an object, received ${describeValue(log)}`);
    }

    return {
        timestamp: parseTimestamp(log["timestamp"], true),
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

    entries.forEach((entry, index) => {
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
    });

    return {
        valid: valid,
        rejected: rejected
    };
};

// An attribute filter is compared as text, so a number in the URL stays a string here
export type AttributeFilters = Record<string, string>;

export type QueryParameters = {
    service?: string;
    level?: LogLevel;
    since?: Date;
    until?: Date;
    attributes: AttributeFilters;
    subMessage?: string;
    limit: number;
    cursor?: Cursor;
};

const DEFAULT_LIMIT = 100;

export const validateQueryParameters = (query: unknown): QueryParameters => {
    const parameters = isPlainObject(query) ? query : {};

    const service = parameters["service"] ? parseText(parameters["service"], "service") : undefined;
    const level = parameters["level"] ? parseLevel(parameters["level"]) : undefined;
    const since = parameters["since"] ? parseTimestamp(parameters["since"], false) : undefined;
    const until = parameters["until"] ? parseTimestamp(parameters["until"], false) : undefined;
    const attributes = parseAttr(parameters);
    const subMessage = parameters["q"] ? parseText(parameters["q"], "q") : undefined;
    const limit = parameters["limit"] ? parseLimit(parameters["limit"]) : DEFAULT_LIMIT;
    const cursor = parameters["cursor"] ? parseCursor(parameters["cursor"]) : undefined;

    if (since && until) {
        if (since.getTime() > until.getTime()) {
            throw new BadRequestError("invalid time range (since > until)");
        }
    }

    return {
        service: service,
        level: level,
        since: since,
        until: until,
        attributes: attributes,
        subMessage: subMessage,
        limit: limit,
        cursor: cursor
    };
};
