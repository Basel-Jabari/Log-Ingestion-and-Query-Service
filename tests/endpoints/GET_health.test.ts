import { afterAll, describe, expect, it } from "vitest";
import { config } from "../../src/config.js";
import { startTestServer } from "../server.js";

const { baseURL, close } = await startTestServer();

// Stop this test file's server after its tests finish
afterAll(close);

describe("GET /health", () => {
    it("Server is not ready", async () => {
        config.server.isReady = false;

        const res = await fetch(`${baseURL}/health`);
        expect(res.status).toBe(500);
        await expect(res.json()).resolves.toEqual({
            status: "not-ready"
        });
    });

    it("Server is ready", async () => {
        config.server.isReady = true;

        const res = await fetch(`${baseURL}/health`);
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({
            status: "ready"
        });
    });
});
