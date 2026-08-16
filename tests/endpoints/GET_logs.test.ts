import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/db.js";
import { logs, NewLog } from "../../src/db/schema.js";
import { startTestServer } from "../server.js";

const { baseURL, close } = await startTestServer();

afterAll(async () => {
    await close();
    await db.$client.end();
});

type LogPage = {
    logs: {
        id: string;
        timestamp: string;
        level: string;
        service: string;
        message: string;
        attributes: Record<string, unknown>;
    }[];
    next_cursor: string | null;
};

// Every message is unique, so a test can name the rows it expects
const seedRows: NewLog[] = [
    {
        timestamp: new Date("2026-07-20T14:00:00.000Z"),
        level: "info",
        service: "checkout",
        message: "payment accepted",
        attributes: { user_id: "42", retries: 3 }
    },
    {
        timestamp: new Date("2026-07-20T14:01:00.000Z"),
        level: "error",
        service: "checkout",
        message: "payment DECLINED",
        attributes: { user_id: "7" }
    },
    {
        timestamp: new Date("2026-07-20T14:02:00.000Z"),
        level: "error",
        service: "auth",
        message: "login declined",
        attributes: { user_id: "42" }
    },
    {
        timestamp: new Date("2026-07-20T14:03:00.000Z"),
        level: "warn",
        service: "auth",
        message: "slow response",
        attributes: {}
    }
];

beforeEach(async () => {
    await db.delete(logs);
    await db.insert(logs).values(seedRows);
});

const query = async (search: string) => {
    return await fetch(`${baseURL}/logs${search}`);
};

const page = async (search: string): Promise<LogPage> => {
    const res = await query(search);
    const body = await res.json();

    // Report what the server said, not only that it failed
    expect(res.status, JSON.stringify(body)).toBe(200);
    return body as LogPage;
};

const messagesOf = (result: LogPage) => {
    return result.logs.map((log) => log.message);
};

describe("GET /logs", () => {
    it("Returns every log, newest first, when no filter is given", async () => {
        const result = await page("");

        expect(messagesOf(result)).toEqual(["slow response", "login declined", "payment DECLINED", "payment accepted"]);
        expect(result.next_cursor).toBeNull();
    });

    it("Sends the id as a string and always sends attributes", async () => {
        const result = await page("");

        for (const log of result.logs) {
            expect(typeof log.id).toBe("string");
            expect(log.attributes).toBeTypeOf("object");
        }

        expect(result.logs[0]?.attributes).toEqual({});
        expect(result.logs[3]?.attributes).toEqual({ user_id: "42", retries: 3 });
        expect(result.logs[3]?.timestamp).toBe("2026-07-20T14:00:00.000Z");
    });

    it("Filters by service and by level", async () => {
        expect(messagesOf(await page("?service=checkout"))).toEqual(["payment DECLINED", "payment accepted"]);
        expect(messagesOf(await page("?level=error"))).toEqual(["login declined", "payment DECLINED"]);
    });

    it("Combines filters freely", async () => {
        expect(messagesOf(await page("?service=auth&level=error"))).toEqual(["login declined"]);
        expect(messagesOf(await page("?service=auth&level=debug"))).toEqual([]);
    });

    it("Treats since as inclusive and until as exclusive", async () => {
        const result = await page("?since=2026-07-20T14:01:00Z&until=2026-07-20T14:03:00Z");

        expect(messagesOf(result)).toEqual(["login declined", "payment DECLINED"]);
    });

    it("Filters by attribute, comparing values as strings", async () => {
        expect(messagesOf(await page("?attr.user_id=42"))).toEqual(["login declined", "payment accepted"]);

        // The value is stored as the number 3, the filter arrives as the text "3"
        expect(messagesOf(await page("?attr.retries=3"))).toEqual(["payment accepted"]);
        expect(messagesOf(await page("?attr.user_id=42&attr.retries=3"))).toEqual(["payment accepted"]);
        expect(messagesOf(await page("?attr.user_id=nobody"))).toEqual([]);
    });

    it("Matches the message without caring about case", async () => {
        expect(messagesOf(await page("?q=declined"))).toEqual(["login declined", "payment DECLINED"]);
        expect(messagesOf(await page("?q=PAYMENT"))).toEqual(["payment DECLINED", "payment accepted"]);
    });

    it("Treats a wildcard in q as ordinary text", async () => {
        expect(messagesOf(await page("?q=%25"))).toEqual([]);
        expect(messagesOf(await page("?q=payment_accepted"))).toEqual([]);
    });

    it("Ignores an unknown parameter", async () => {
        expect(messagesOf(await page("?unknown=value"))).toHaveLength(4);
    });

    it("Walks every page through the cursor without repeating or losing a log", async () => {
        const first = await page("?limit=2");
        expect(messagesOf(first)).toEqual(["slow response", "login declined"]);
        expect(first.next_cursor).toBeTypeOf("string");

        const second = await page(`?limit=2&cursor=${encodeURIComponent(first.next_cursor!)}`);
        expect(messagesOf(second)).toEqual(["payment DECLINED", "payment accepted"]);
        expect(second.next_cursor).toBeNull();
    });

    it("Keeps the filters working while paging", async () => {
        const first = await page("?level=error&limit=1");
        expect(messagesOf(first)).toEqual(["login declined"]);

        const second = await page(`?level=error&limit=1&cursor=${encodeURIComponent(first.next_cursor!)}`);
        expect(messagesOf(second)).toEqual(["payment DECLINED"]);
        expect(second.next_cursor).toBeNull();
    });

    it("Returns no cursor when the last page is exactly full", async () => {
        const result = await page("?limit=4");

        expect(result.logs).toHaveLength(4);
        expect(result.next_cursor).toBeNull();
    });

    it("Stays in a stable order when several logs share one timestamp", async () => {
        await db.delete(logs);
        const sameMoment = new Date("2026-07-20T15:00:00.000Z");
        await db.insert(logs).values(
            ["first", "second", "third"].map((message) => ({
                timestamp: sameMoment,
                level: "info" as const,
                service: "checkout",
                message: message,
                attributes: {}
            }))
        );

        const seen: string[] = [];
        let cursor: string | null = null;

        for (let request = 0; request < 3; request++) {
            const search = cursor ? `?limit=1&cursor=${encodeURIComponent(cursor)}` : "?limit=1";
            const result = await page(search);

            expect(result.logs).toHaveLength(1);
            seen.push(result.logs[0]!.message);
            cursor = result.next_cursor;
        }

        // Newest id first, and no row is served twice or skipped
        expect(seen).toEqual(["third", "second", "first"]);
        expect(cursor).toBeNull();
    });

    it("Returns 400 for an invalid parameter", async () => {
        const invalid = [
            "?level=critical",
            "?since=yesterday",
            "?until=2026-13-01T00:00:00Z",
            "?since=2026-07-20T15:00:00Z&until=2026-07-20T14:00:00Z",
            "?limit=0",
            "?limit=1001",
            "?limit=ten",
            "?cursor=not-a-cursor"
        ];

        for (const search of invalid) {
            const res = await query(search);

            expect(res.status, search).toBe(400);
            expect(await res.json()).toHaveProperty("error");
        }
    });
});
