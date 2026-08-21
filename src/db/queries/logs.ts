import { and, asc, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { AggregateParameters, BucketSize, GroupBy, LogFilters, QueryParameters } from "../../utils/validate.js";
import { db, pgClient } from "../db.js";
import { logs, NewLog } from "../schema.js";

// Everything is sent as text[] and cast inside SQL
export const insertLogs = async (rows: NewLog[]) => {
    const timestamps: string[] = [];
    const levels: string[] = [];
    const services: string[] = [];
    const messages: string[] = [];
    const attributes: string[] = [];

    for (const row of rows) {
        timestamps.push(row.timestamp.toISOString());
        levels.push(row.level);
        services.push(row.service);
        messages.push(row.message);
        attributes.push(JSON.stringify(row.attributes ?? {}));
    }

    await pgClient`
        INSERT INTO logs (timestamp, level, service, message, attributes)
        SELECT timestamp::timestamptz, level::log_level, service, message, attributes::jsonb
        FROM unnest(
            ${timestamps}::text[],
            ${levels}::text[],
            ${services}::text[],
            ${messages}::text[],
            ${attributes}::text[]
        ) AS batch(timestamp, level, service, message, attributes)
    `;
};

// % and _ are wildcards for ILIKE
// Without escaping them, a search for "50%" would match almost every message
const escapeLikePattern = (value: string) => {
    return value.replace(/[\\%_]/g, "\\$&");
};

// A small JSON document with one pair, for example {"user_id":"42"}
// The @> operator asks PostgreSQL: does the stored JSON contain this pair?
const attributeContains = (key: string, value: string | number | boolean) => {
    return sql`${logs.attributes} @> ${JSON.stringify({ [key]: value })}::jsonb`;
};

// "42" and "-3.5" are numbers, "42abc" and "" are not
const NUMBER_VALUE = /^-?\d+(\.\d+)?$/;

// For a value that looks like a number or like a boolean we ask two questions joined by OR
// for example {"retries":"3"} OR {"retries":3}
// Both questions use the index
// And together they give the same answers
const attributeCondition = (key: string, value: string) => {
    const probes = [attributeContains(key, value)];

    if (NUMBER_VALUE.test(value)) {
        probes.push(attributeContains(key, Number(value)));
    }

    if (value === "true" || value === "false") {
        probes.push(attributeContains(key, value === "true"));
    }

    return probes.length === 1 ? probes[0] : or(...probes);
};

const filterConditions = (filters: LogFilters) => {
    const conditions = [
        filters.service ? eq(logs.service, filters.service) : undefined,
        filters.level ? eq(logs.level, filters.level) : undefined,

        // q is a case insensitive substring match, so ILIKE and not LIKE
        filters.subMessage ? ilike(logs.message, `%${escapeLikePattern(filters.subMessage)}%`) : undefined
    ];

    for (const [key, value] of Object.entries(filters.attributes)) {
        conditions.push(attributeCondition(key, value));
    }

    return conditions;
};

export const selectLogs = async (parameters: QueryParameters) => {
    const conditions = filterConditions(parameters);

    conditions.push(
        parameters.since ? gte(logs.timestamp, parameters.since) : undefined,
        parameters.until ? lt(logs.timestamp, parameters.until) : undefined
    );

    if (parameters.cursor) {
        // The driver cannot bind a Date or a bigint inside a raw fragment
        // Sending them as text and casting keeps the comparison in Postgres types
        const timestamp = parameters.cursor.timestamp.toISOString();
        const id = parameters.cursor.id.toString();

        conditions.push(sql`(${logs.timestamp}, ${logs.id}) < (${timestamp}::timestamptz, ${id}::bigint)`);
    }

    return await db
        .select()
        .from(logs)
        .where(and(...conditions))
        .orderBy(desc(logs.timestamp), desc(logs.id))
        .limit(parameters.limit + 1);
};

const BUCKET_INTERVALS = {
    "1m": "1 minute",
    "5m": "5 minutes",
    "1h": "1 hour",
    "1d": "1 day"
} satisfies Record<BucketSize, string>;

const GROUP_COLUMNS = {
    service: logs.service,
    level: logs.level
} satisfies Record<GroupBy, AnyPgColumn>;

export const aggregateLogs = async (parameters: AggregateParameters) => {
    const conditions = filterConditions(parameters);
    conditions.push(gte(logs.timestamp, parameters.since), lt(logs.timestamp, parameters.until));

    // date_bin arguments:
    // 1. Bucket size, such as "5 minutes"
    // 2. The timestamp column that determines which bucket each log belongs to
    // 3. The origin—the point from which bucket boundaries are calculated
    // mapWith tells Drizzle to convert the returned value like a timestamp column
    const origin = "1900-01-01T00:00:00.000Z";
    const start =
        sql`date_bin(${BUCKET_INTERVALS[parameters.bucket]}::interval, ${logs.timestamp}, ${origin}::timestamptz)`.mapWith(
            logs.timestamp
        );

    const groupColumn = parameters.groupBy ? GROUP_COLUMNS[parameters.groupBy] : undefined;
    const group = groupColumn ? sql<string | null>`${groupColumn}::text` : sql<string | null>`null::text`;
    const grouping = groupColumn ? [sql`1`, sql`2`] : [sql`1`];

    return await db
        .select({
            start: start,
            group: group,
            // count(*) is a bigint, which the driver hands back as text
            count: sql<number>`count(*)`.mapWith(Number)
        })
        .from(logs)
        .where(and(...conditions))
        .groupBy(...grouping)
        .orderBy(...grouping.map((position) => asc(position)));
};
