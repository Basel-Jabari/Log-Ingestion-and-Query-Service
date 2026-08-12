import { bigint, pgEnum, pgTable, timestamp, text, jsonb } from "drizzle-orm/pg-core";

export const logLevel = pgEnum("log_level", ["debug", "info", "warn", "error"]);

export type LogAttributeValue = string | number | boolean;
export type LogAttributes = Record<string, LogAttributeValue>;

export type NewLog = typeof logs.$inferInsert;
export type Log = typeof logs.$inferSelect;
export const logs = pgTable("logs", {
    id: bigint("id", {
        mode: "bigint"
    })
        .primaryKey()
        .generatedAlwaysAsIdentity(),

    timestamp: timestamp("timestamp", {
        mode: "date",
        withTimezone: true
    }).notNull(),

    level: logLevel("level").notNull(),

    service: text("service").notNull(),

    message: text("message").notNull(),

    attributes: jsonb("attributes").notNull().$type<LogAttributes>().default({})
});
