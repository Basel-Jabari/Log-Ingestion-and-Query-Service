import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { logs, logLevel } from "../../src/db/schema.js";

describe("The Database Schema", () => {
    it("Logs Table", () => {
        const table = getTableConfig(logs);
        expect(table.name).toBe("logs");
        expect(table.columns.map((column) => column.name)).toEqual([
            "id",
            "timestamp",
            "level",
            "service",
            "message",
            "attributes"
        ]);
    });

    it("Log Level", () => {
        expect(logLevel.enumValues).toEqual(["debug", "info", "warn", "error"]);
    });
});
