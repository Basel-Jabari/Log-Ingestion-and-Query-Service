import { BadRequestError } from "../errors.js";

export type Cursor = {
    timestamp: Date;
    id: bigint;
};

type CursorPayload = {
    timestamp: string;
    id: string;
};

const MAX_CURSOR_LENGTH = 64;
const invalidCursor = (value: string): BadRequestError => {
    const shortened = value.length > MAX_CURSOR_LENGTH ? `${value.slice(0, MAX_CURSOR_LENGTH)}...` : value;
    return new BadRequestError(`invalid cursor: '${shortened}'`);
};

const isCursorPayload = (value: unknown): value is CursorPayload => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }

    const payload = value as Record<string, unknown>;
    return typeof payload["timestamp"] === "string" && typeof payload["id"] === "string" && /^\d+$/.test(payload["id"]);
};

export const encodeCursor = (cursor: Cursor): string => {
    const payload: CursorPayload = {
        timestamp: cursor.timestamp.toISOString(),
        id: cursor.id.toString()
    };

    return Buffer.from(JSON.stringify(payload)).toString("base64url");
};

export const decodeCursor = (value: string): Cursor => {
    let payload: unknown;

    try {
        payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    } catch {
        throw invalidCursor(value);
    }

    if (!isCursorPayload(payload)) {
        throw invalidCursor(value);
    }

    const timestamp = new Date(payload.timestamp);
    if (Number.isNaN(timestamp.getTime())) {
        throw invalidCursor(value);
    }

    return {
        timestamp: timestamp,
        id: BigInt(payload.id)
    };
};
