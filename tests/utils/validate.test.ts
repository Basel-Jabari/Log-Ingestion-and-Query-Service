import { describe, expect, it } from "vitest";
import { BadRequestError } from "../../src/errors.js";
import { encodeCursor } from "../../src/utils/cursor.js";
import { validateLog, validateLogBatch, validateQueryParameters } from "../../src/utils/validate.js";

const validEntry = () => ({
    timestamp: "2006-03-29T14:32:01.123Z",
    level: "error",
    service: "no-service :(",
    message: "sasuke is not good :)",
    attributes: {
        user_id: "1",
        region: "pal",
        retries: 0
    }
});

const parsedEntry = () => ({
    ...validEntry(),
    timestamp: new Date(validEntry().timestamp)
});

const reasonFor = (entry: unknown): string => {
    try {
        validateLog(entry);
    } catch (error) {
        return (error as Error).message;
    }

    throw new Error("expected the entry to be rejected");
};

describe("validateLog", () => {
    it("Accepts a valid entry and converts the timestamp to a Date", () => {
        expect(validateLog(validEntry())).toEqual(parsedEntry());
    });

    it("Defaults attributes to an empty object when omitted", () => {
        const { attributes, ...entry } = validEntry();
        expect(validateLog(entry).attributes).toEqual({});
    });

    it("Drops keys the client made up", () => {
        const modifiedEntry = {
            ...validEntry(),
            id: 999,
            injected: "nope"
        };

        expect(validateLog(modifiedEntry)).toEqual(parsedEntry());
    });

    it("Rejects entries that are not objects", () => {
        expect(reasonFor(null)).toBe("log entry must be an object, received null");
        expect(reasonFor([validEntry()])).toBe("log entry must be an object, received array");
        expect(reasonFor("log")).toBe("log entry must be an object, received 'log'");
    });

    it("Rejects a missing or non-ISO 8601 timestamp", () => {
        expect(reasonFor({ ...validEntry(), timestamp: undefined })).toBe("missing timestamp");
        expect(reasonFor({ ...validEntry(), timestamp: "March 5 2020" })).toBe("invalid timestamp: 'March 5 2020'");
        expect(reasonFor({ ...validEntry(), timestamp: "2026-07-20" })).toBe("invalid timestamp: '2026-07-20'");
        expect(reasonFor({ ...validEntry(), timestamp: 1753021921123 })).toBe("invalid timestamp: 1753021921123");
    });

    it("Rejects a timestamp without a timezone, since the column stores one", () => {
        expect(reasonFor({ ...validEntry(), timestamp: "2026-07-20T14:32:01" })).toBe(
            "invalid timestamp: '2026-07-20T14:32:01'"
        );
    });

    it("Rejects an ISO 8601 shaped timestamp that is not a real date", () => {
        expect(reasonFor({ ...validEntry(), timestamp: "2026-02-31T00:00:00Z" })).toBe(
            "invalid timestamp: '2026-02-31T00:00:00Z'"
        );
    });

    it("Rejects a timestamp more than five minutes in the future", () => {
        const future = new Date(Date.now() + 6 * 60 * 1000).toISOString();
        expect(reasonFor({ ...validEntry(), timestamp: future })).toBe(
            `timestamp is more than five minutes in the future: '${future}'`
        );
    });

    it("Accepts a timestamp inside the five minute window", () => {
        const soon = new Date(Date.now() + 60 * 1000).toISOString();
        expect(validateLog({ ...validEntry(), timestamp: soon }).timestamp).toEqual(new Date(soon));
    });

    it("Accepts every log level", () => {
        for (const level of ["debug", "info", "warn", "error"]) {
            expect(validateLog({ ...validEntry(), level: level }).level).toBe(level);
        }
    });

    it("Rejects a missing or unknown level", () => {
        expect(reasonFor({ ...validEntry(), level: undefined })).toBe("missing level");
        expect(reasonFor({ ...validEntry(), level: "critical" })).toBe("invalid level: 'critical'");
        expect(reasonFor({ ...validEntry(), level: "ERROR" })).toBe("invalid level: 'ERROR'");
    });

    it("Rejects an empty or non-string service and message", () => {
        expect(reasonFor({ ...validEntry(), service: undefined })).toBe("missing service");
        expect(reasonFor({ ...validEntry(), service: "" })).toBe("invalid service: ''");
        expect(reasonFor({ ...validEntry(), service: "   " })).toBe("invalid service: '   '");
        expect(reasonFor({ ...validEntry(), message: undefined })).toBe("missing message");
        expect(reasonFor({ ...validEntry(), message: "" })).toBe("invalid message: ''");
        expect(reasonFor({ ...validEntry(), message: 42 })).toBe("invalid message: 42");
    });

    it("Accepts a flat attributes object with string, number, and boolean values", () => {
        const attributes = { text: "value", count: 3, enabled: true };
        expect(validateLog({ ...validEntry(), attributes: attributes }).attributes).toEqual(attributes);
    });

    it("Accepts an empty attributes object", () => {
        expect(validateLog({ ...validEntry(), attributes: {} }).attributes).toEqual({});
    });

    it("Rejects attributes that are not a flat object", () => {
        expect(reasonFor({ ...validEntry(), attributes: null })).toBe("invalid attributes: null");
        expect(reasonFor({ ...validEntry(), attributes: [1, 2, 3] })).toBe("invalid attributes: array");
        expect(reasonFor({ ...validEntry(), attributes: "region" })).toBe("invalid attributes: 'region'");
        expect(reasonFor({ ...validEntry(), attributes: 0 })).toBe("invalid attributes: 0");
    });

    it("Rejects nested objects and arrays inside attributes", () => {
        expect(reasonFor({ ...validEntry(), attributes: { user: { id: 42 } } })).toBe(
            "invalid attributes value for 'user': object"
        );
        expect(reasonFor({ ...validEntry(), attributes: { tags: ["a", "b"] } })).toBe(
            "invalid attributes value for 'tags': array"
        );
        expect(reasonFor({ ...validEntry(), attributes: { region: null } })).toBe(
            "invalid attributes value for 'region': null"
        );
    });

    it("Truncates long values in the rejection reason", () => {
        const reason = reasonFor({ ...validEntry(), level: "c".repeat(100) });
        expect(reason).toBe(`invalid level: '${"c".repeat(64)}...'`);
    });
});

describe("validateLogBatch", () => {
    it("Separates valid entries from invalid ones and reports each index", () => {
        const { valid, rejected } = validateLogBatch({
            logs: [
                validEntry(),
                { ...validEntry(), level: "critical" },
                validEntry(),
                { ...validEntry(), message: undefined }
            ]
        });

        expect(valid).toHaveLength(2);
        expect(rejected).toEqual([
            { index: 1, reason: "invalid level: 'critical'" },
            { index: 3, reason: "missing message" }
        ]);
    });

    it("Accepts a batch of one", () => {
        const { valid, rejected } = validateLogBatch({ logs: [validEntry()] });
        expect(valid).toHaveLength(1);
        expect(rejected).toEqual([]);
    });

    it("Reports every entry when they are all invalid", () => {
        const { valid, rejected } = validateLogBatch({ logs: [{}, "log"] });
        expect(valid).toEqual([]);
        expect(rejected).toHaveLength(2);
    });

    it("Throws for a body that is not the expected structure", () => {
        expect(() => validateLogBatch(undefined)).toThrow(BadRequestError);
        expect(() => validateLogBatch([validEntry()])).toThrow("request body must be an object with a 'logs' array");
        expect(() => validateLogBatch({})).toThrow("'logs' must be an array, received undefined");
        expect(() => validateLogBatch({ logs: validEntry() })).toThrow("'logs' must be an array, received object");
        expect(() => validateLogBatch({ logs: [] })).toThrow("'logs' must contain at least one entry");
    });
});

describe("validateQueryParameters", () => {
    it("Returns defaults when the query is empty or not an object", () => {
        expect(validateQueryParameters({})).toEqual({
            service: undefined,
            level: undefined,
            since: undefined,
            until: undefined,
            attributes: {},
            subMessage: undefined,
            limit: 100,
            cursor: undefined
        });
        expect(validateQueryParameters(undefined).limit).toBe(100);
        expect(validateQueryParameters(null).attributes).toEqual({});
    });

    it("Parses every supported filter", () => {
        const cursor = encodeCursor({
            timestamp: new Date("2026-07-20T14:02:00.000Z"),
            id: 39n
        });

        expect(
            validateQueryParameters({
                service: "checkout",
                level: "error",
                since: "2026-07-20T14:00:00Z",
                until: "2026-07-20T15:00:00Z",
                "attr.user_id": "42",
                "attr.retries": "3",
                q: "declined",
                limit: "50",
                cursor: cursor
            })
        ).toEqual({
            service: "checkout",
            level: "error",
            since: new Date("2026-07-20T14:00:00Z"),
            until: new Date("2026-07-20T15:00:00Z"),
            attributes: {
                user_id: "42",
                retries: "3"
            },
            subMessage: "declined",
            limit: 50,
            cursor: {
                timestamp: new Date("2026-07-20T14:02:00.000Z"),
                id: 39n
            }
        });
    });

    it("Ignores unknown query keys", () => {
        expect(validateQueryParameters({ unknown: "value", service: "auth" }).service).toBe("auth");
    });

    it("Reads attr.<key> as flat string filters", () => {
        expect(
            validateQueryParameters({
                "attr.user_id": "42",
                service: "checkout"
            }).attributes
        ).toEqual({
            user_id: "42"
        });
    });

    it("Rejects an empty attr. key", () => {
        expect(() => validateQueryParameters({ "attr.": "42" })).toThrow("invalid attr key: empty key");
    });

    it("Rejects a repeated attr filter that arrives as an array", () => {
        expect(() =>
            validateQueryParameters({
                "attr.user_id": ["42", "7"]
            })
        ).toThrow("invalid attr value for 'user_id': array");
    });

    it("Does not apply the five-minute rule to since and until", () => {
        const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        expect(validateQueryParameters({ since: future }).since).toEqual(new Date(future));
    });

    it("Rejects until earlier than since", () => {
        expect(() =>
            validateQueryParameters({
                since: "2026-07-20T15:00:00Z",
                until: "2026-07-20T14:00:00Z"
            })
        ).toThrow("invalid time range (since > until)");
    });

    it("Rejects an unsupported level", () => {
        expect(() => validateQueryParameters({ level: "critical" })).toThrow("invalid level: 'critical'");
    });

    it("Rejects a limit outside 1 to 1000", () => {
        expect(() => validateQueryParameters({ limit: "0" })).toThrow(
            "limit must be an integer between 1 and 1000: '0'"
        );
        expect(() => validateQueryParameters({ limit: "1001" })).toThrow(
            "limit must be an integer between 1 and 1000: '1001'"
        );
        expect(() => validateQueryParameters({ limit: "ten" })).toThrow("invalid limit: 'ten'");
    });

    it("Rejects a malformed cursor", () => {
        expect(() => validateQueryParameters({ cursor: "not-a-cursor" })).toThrow(BadRequestError);
        expect(() => validateQueryParameters({ cursor: ["a", "b"] })).toThrow("invalid cursor: array");
    });

    it("Rejects an empty q", () => {
        expect(() => validateQueryParameters({ q: "   " })).toThrow("invalid q: '   '");
    });
});
