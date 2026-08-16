import { bigint, index, pgEnum, pgTable, timestamp, text, jsonb } from "drizzle-orm/pg-core";

export const logLevel = pgEnum("log_level", ["debug", "info", "warn", "error"]);
export type LogLevel = (typeof logLevel.enumValues)[number];

export type LogAttributeValue = string | number | boolean;
export type LogAttributes = Record<string, LogAttributeValue>;

export type NewLog = typeof logs.$inferInsert;
export type Log = typeof logs.$inferSelect;
export const logs = pgTable(
    "logs",
    {
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

        attributes: jsonb("attributes").$type<LogAttributes>().default({})
    },
    (table) => [
        index("logs_timestamp_id_service_level_idx").on(table.timestamp, table.id, table.service, table.level),
        index("logs_service_timestamp_idx").on(table.service, table.timestamp),

        // GIN is built for columns that hold many small values inside one field
        // "jsonb_path_ops" is a smaller and faster variant of the index
        index("logs_attributes_gin_idx").using("gin", table.attributes.op("jsonb_path_ops"))
    ]
);
