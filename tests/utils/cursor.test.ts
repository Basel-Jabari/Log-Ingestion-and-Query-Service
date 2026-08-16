import { describe, expect, it } from "vitest";
import { BadRequestError } from "../../src/errors.js";
import { decodeCursor, encodeCursor } from "../../src/utils/cursor.js";

const sample = {
    timestamp: new Date("2026-07-20T14:02:00.000Z"),
    id: 39n
};

const reasonFor = (value: string): string => {
    try {
        decodeCursor(value);
    } catch (error) {
        return (error as Error).message;
    }

    throw new Error("expected the cursor to be rejected");
};

describe("encodeCursor", () => {
    it("Encodes a cursor as base64url", () => {
        const encoded = encodeCursor(sample);

        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))).toEqual({
            timestamp: "2026-07-20T14:02:00.000Z",
            id: "39"
        });
    });
});

describe("decodeCursor", () => {
    it("Round-trips a cursor", () => {
        expect(decodeCursor(encodeCursor(sample))).toEqual(sample);
    });

    it("Keeps a large id as bigint", () => {
        const cursor = {
            timestamp: new Date("2026-07-20T14:02:00.000Z"),
            id: 9007199254740993n
        };

        expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    });

    it("Rejects garbage that is not base64url JSON", () => {
        const reason = reasonFor("not-a-cursor");

        expect(reason).toBe("invalid cursor: 'not-a-cursor'");
        expect(() => decodeCursor("not-a-cursor")).toThrow(BadRequestError);
    });

    it("Rejects a payload with the wrong shape", () => {
        const encoded = Buffer.from(JSON.stringify({ timestamp: "2026-07-20T14:02:00.000Z" })).toString("base64url");

        expect(reasonFor(encoded)).toMatch(/^invalid cursor: '/);
        expect(() => decodeCursor(encoded)).toThrow(BadRequestError);
    });

    it("Rejects a non-digit id", () => {
        const encoded = Buffer.from(
            JSON.stringify({
                timestamp: "2026-07-20T14:02:00.000Z",
                id: "39n"
            })
        ).toString("base64url");

        expect(reasonFor(encoded)).toMatch(/^invalid cursor: '/);
        expect(() => decodeCursor(encoded)).toThrow(BadRequestError);
    });

    it("Rejects an invalid timestamp", () => {
        const encoded = Buffer.from(
            JSON.stringify({
                timestamp: "yesterday",
                id: "39"
            })
        ).toString("base64url");

        expect(reasonFor(encoded)).toMatch(/^invalid cursor: '/);
        expect(() => decodeCursor(encoded)).toThrow(BadRequestError);
    });

    it("Shortens a long invalid cursor in the error message", () => {
        const value = "x".repeat(80);
        const reason = reasonFor(value);

        expect(reason).toBe(`invalid cursor: '${"x".repeat(64)}...'`);
    });
});
