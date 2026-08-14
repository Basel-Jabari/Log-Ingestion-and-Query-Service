import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/db.js";
import { logs } from "../../src/db/schema.js";
import { startTestServer } from "../server.js";

const { baseURL, close } = await startTestServer();

afterAll(async () => {
    await close();
    await db.$client.end();
});

beforeEach(async () => {
    await db.delete(logs);
});

const validEntry = () => ({
    timestamp: "2026-07-20T14:32:01.123Z",
    level: "error",
    service: "checkout",
    message: "payment declined",
    attributes: {
        user_id: "42",
        region: "eu-west",
        retries: 3
    }
});

const post = async (body: unknown) => {
    return await fetch(`${baseURL}/logs`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
};

describe("POST /logs", () => {
    it("Stores a batch of one", async () => {
        const res = await post({ logs: [validEntry()] });

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({
            accepted: 1,
            rejected: []
        });

        const rows = await db.select().from(logs);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            timestamp: new Date("2026-07-20T14:32:01.123Z"),
            level: "error",
            service: "checkout",
            message: "payment declined",
            attributes: {
                user_id: "42",
                region: "eu-west",
                retries: 3
            }
        });
    });

    it("Defaults attributes to an empty object", async () => {
        const { attributes, ...entry } = validEntry();
        const res = await post({ logs: [entry] });

        expect(res.status).toBe(200);

        const rows = await db.select().from(logs);
        expect(rows[0]?.attributes).toEqual({});
    });

    it("Keeps valid entries when the batch also contains invalid ones", async () => {
        const res = await post({
            logs: [
                validEntry(),
                { ...validEntry(), level: "critical" },
                validEntry(),
                { ...validEntry(), attributes: { user: { id: 42 } } }
            ]
        });

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({
            accepted: 2,
            rejected: [
                { index: 1, reason: "invalid level: 'critical'" },
                { index: 3, reason: "invalid attributes value for 'user': object" }
            ]
        });

        const rows = await db.select().from(logs);
        expect(rows).toHaveLength(2);
    });

    it("Returns 400 and stores nothing when every entry is rejected", async () => {
        const res = await post({
            logs: [{ ...validEntry(), level: "critical" }, {}]
        });

        expect(res.status).toBe(400);

        const body = (await res.json()) as { accepted: number; rejected: unknown[] };
        expect(body.accepted).toBe(0);
        expect(body.rejected).toHaveLength(2);

        const rows = await db.select().from(logs);
        expect(rows).toHaveLength(0);
    });

    it("Returns 400 for malformed JSON", async () => {
        const res = await fetch(`${baseURL}/logs`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: '{ "logs": ['
        });

        expect(res.status).toBe(400);
        expect(await res.json()).toHaveProperty("error");
    });

    it("Returns 400 when the top-level structure is wrong", async () => {
        expect((await post([validEntry()])).status).toBe(400);
        expect((await post({ entries: [validEntry()] })).status).toBe(400);
        expect((await post({ logs: validEntry() })).status).toBe(400);
        expect((await post({ logs: [] })).status).toBe(400);
    });

    it("Ignores an id supplied by the client", async () => {
        const res = await post({ logs: [{ ...validEntry(), id: 999 }] });

        expect(res.status).toBe(200);

        const rows = await db.select().from(logs);
        expect(rows[0]?.id).not.toBe(999n);
    });
});
