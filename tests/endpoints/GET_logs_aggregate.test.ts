import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/db.js";
import { logs, NewLog } from "../../src/db/schema.js";
import { startTestServer } from "../server.js";

const { baseURL, close } = await startTestServer();

afterAll(async () => {
    await close();
    await db.$client.end();
});

type Bucket = {
    start: string;
    group: string | null;
    count: number;
};

// Two rows share the first minute, one sits seven minutes later, and two fall outside
// the range the tests ask about
const seedRows: NewLog[] = [
    {
        timestamp: new Date("2026-07-20T14:00:00Z"),
        level: "info",
        service: "checkout",
        message: "payment accepted",
        attributes: { user_id: "42", retries: 3 }
    },
    {
        timestamp: new Date("2026-07-20T14:00:30Z"),
        level: "error",
        service: "checkout",
        message: "payment DECLINED",
        attributes: { user_id: "7" }
    },
    {
        timestamp: new Date("2026-07-20T14:01:00Z"),
        level: "error",
        service: "auth",
        message: "login declined",
        attributes: { user_id: "42" }
    },
    {
        timestamp: new Date("2026-07-20T14:07:00Z"),
        level: "warn",
        service: "auth",
        message: "slow response",
        attributes: {}
    },
    {
        timestamp: new Date("2026-07-20T13:59:00Z"),
        level: "info",
        service: "checkout",
        message: "before the range",
        attributes: {}
    },
    {
        timestamp: new Date("2026-07-20T16:00:00Z"),
        level: "info",
        service: "checkout",
        message: "after the range",
        attributes: {}
    }
];

beforeEach(async () => {
    await db.delete(logs);
    await db.insert(logs).values(seedRows);
});

// The hour every test asks about unless it says otherwise
const hour = "since=2026-07-20T14:00:00Z&until=2026-07-20T15:00:00Z";

const request = async (search: string) => {
    return await fetch(`${baseURL}/logs/aggregate?${search}`);
};

const buckets = async (search: string): Promise<Bucket[]> => {
    const res = await request(search);
    const body = await res.json();

    // Report what the server said, not only that it failed
    expect(res.status, JSON.stringify(body)).toBe(200);
    return (body as { buckets: Bucket[] }).buckets;
};

describe("GET /logs/aggregate", () => {
    it("Counts the logs of every minute and leaves empty minutes out", async () => {
        expect(await buckets(`${hour}&bucket=1m`)).toEqual([
            { start: "2026-07-20T14:00:00Z", group: null, count: 2 },
            { start: "2026-07-20T14:01:00Z", group: null, count: 1 },
            { start: "2026-07-20T14:07:00Z", group: null, count: 1 }
        ]);
    });

    it("Sends the count as a number and the group as null when group_by is missing", async () => {
        const result = await buckets(`${hour}&bucket=1h`);

        expect(result).toHaveLength(1);
        expect(result[0]?.count).toBeTypeOf("number");
        expect(result[0]?.group).toBeNull();
    });

    it("Reads every bucket size", async () => {
        expect(await buckets(`${hour}&bucket=5m`)).toEqual([
            { start: "2026-07-20T14:00:00Z", group: null, count: 3 },
            { start: "2026-07-20T14:05:00Z", group: null, count: 1 }
        ]);

        expect(await buckets(`${hour}&bucket=1h`)).toEqual([{ start: "2026-07-20T14:00:00Z", group: null, count: 4 }]);

        expect(await buckets("since=2026-07-20T00:00:00Z&until=2026-07-21T00:00:00Z&bucket=1d")).toEqual([
            { start: "2026-07-20T00:00:00Z", group: null, count: 6 }
        ]);
    });

    it("Starts the first bucket at since, not on a round minute", async () => {
        expect(await buckets("since=2026-07-20T14:00:30Z&until=2026-07-20T15:00:00Z&bucket=1m")).toEqual([
            { start: "2026-07-20T14:00:00Z", group: null, count: 1 },
            { start: "2026-07-20T14:01:00Z", group: null, count: 1 },
            { start: "2026-07-20T14:07:00Z", group: null, count: 1 }
        ]);
    });

    it("Groups by service", async () => {
        expect(await buckets(`${hour}&bucket=1m&group_by=service`)).toEqual([
            { start: "2026-07-20T14:00:00Z", group: "checkout", count: 2 },
            { start: "2026-07-20T14:01:00Z", group: "auth", count: 1 },
            { start: "2026-07-20T14:07:00Z", group: "auth", count: 1 }
        ]);
    });

    it("Groups by level, splitting one bucket into several rows", async () => {
        expect(await buckets(`${hour}&bucket=1h&group_by=level`)).toEqual([
            { start: "2026-07-20T14:00:00Z", group: "error", count: 2 },
            { start: "2026-07-20T14:00:00Z", group: "info", count: 1 },
            { start: "2026-07-20T14:00:00Z", group: "warn", count: 1 }
        ]);
    });

    it("Accepts the same filters as the query endpoint", async () => {
        expect(await buckets(`${hour}&bucket=1h&service=auth`)).toEqual([
            { start: "2026-07-20T14:00:00Z", group: null, count: 2 }
        ]);

        expect(await buckets(`${hour}&bucket=1h&level=error`)).toEqual([
            { start: "2026-07-20T14:00:00Z", group: null, count: 2 }
        ]);

        // The value is stored as the number 3, the filter arrives as the text "3"
        expect(await buckets(`${hour}&bucket=1h&attr.retries=3`)).toEqual([
            { start: "2026-07-20T14:00:00Z", group: null, count: 1 }
        ]);

        expect(await buckets(`${hour}&bucket=1h&q=DECLINED`)).toEqual([
            { start: "2026-07-20T14:00:00Z", group: null, count: 2 }
        ]);
    });

    it("Combines a filter with a grouping", async () => {
        expect(await buckets(`${hour}&bucket=1h&attr.user_id=42&group_by=service`)).toEqual([
            { start: "2026-07-20T14:00:00Z", group: "auth", count: 1 },
            { start: "2026-07-20T14:00:00Z", group: "checkout", count: 1 }
        ]);
    });

    it("Treats since as inclusive and until as exclusive", async () => {
        expect(await buckets("since=2026-07-20T14:01:00Z&until=2026-07-20T14:07:00Z&bucket=1h")).toEqual([
            { start: "2026-07-20T14:00:00Z", group: null, count: 1 }
        ]);
    });

    it("Returns no bucket when the range holds no log", async () => {
        expect(await buckets("since=2026-07-21T00:00:00Z&until=2026-07-22T00:00:00Z&bucket=1h")).toEqual([]);
    });

    it("Returns no bucket when since and until are the same moment", async () => {
        expect(await buckets("since=2026-07-20T14:00:00Z&until=2026-07-20T14:00:00Z&bucket=1m")).toEqual([]);
    });

    it("Ignores an unknown parameter", async () => {
        expect(await buckets(`${hour}&bucket=1h&unknown=value`)).toHaveLength(1);
    });

    it("Returns 400 when a required parameter is missing", async () => {
        const invalid = [
            "bucket=1m",
            "bucket=1m&since=2026-07-20T14:00:00Z",
            "bucket=1m&until=2026-07-20T15:00:00Z",
            hour
        ];

        for (const search of invalid) {
            const res = await request(search);

            expect(res.status, search).toBe(400);
            expect(await res.json()).toHaveProperty("error");
        }
    });

    it("Returns 400 for an invalid parameter", async () => {
        const invalid = [
            `${hour}&bucket=30s`,
            `${hour}&bucket=1`,
            `${hour}&bucket=1m&group_by=message`,
            `${hour}&bucket=1m&level=critical`,
            "since=yesterday&until=2026-07-20T15:00:00Z&bucket=1m",
            "since=2026-07-20T15:00:00Z&until=2026-07-20T14:00:00Z&bucket=1m"
        ];

        for (const search of invalid) {
            const res = await request(search);

            expect(res.status, search).toBe(400);
            expect(await res.json()).toHaveProperty("error");
        }
    });
});
