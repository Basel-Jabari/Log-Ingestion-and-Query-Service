import { and, asc, desc, eq, gte, ilike, lt, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { AggregateParameters, BucketSize, GroupBy, LogFilters, QueryParameters } from "../../utils/validate.js";
import { db } from "../db.js";
import { logs, NewLog } from "../schema.js";

export const insertLogs = async (Logs: NewLog[]) => {
    await db.insert(logs).values(Logs);
};

// % and _ are wildcards for ILIKE
// Without escaping them, a search for "50%" would match almost every message
const escapeLikePattern = (value: string) => {
    return value.replace(/[\\%_]/g, "\\$&");
};

const filterConditions = (filters: LogFilters) => {
    const conditions = [
        filters.service ? eq(logs.service, filters.service) : undefined,
        filters.level ? eq(logs.level, filters.level) : undefined,

        // q is a case insensitive substring match, so ILIKE and not LIKE
        filters.subMessage ? ilike(logs.message, `%${escapeLikePattern(filters.subMessage)}%`) : undefined
    ];

    // ->> reads the value as text, which is how the contract compares attributes
    for (const [key, value] of Object.entries(filters.attributes)) {
        conditions.push(sql`${logs.attributes} ->> ${key}::text = ${value}`);
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

    return db
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
    const origin = parameters.since.toISOString();
    const start =
        sql`date_bin(${BUCKET_INTERVALS[parameters.bucket]}::interval, ${logs.timestamp}, ${origin}::timestamptz)`.mapWith(
            logs.timestamp
        );

    const groupColumn = parameters.groupBy ? GROUP_COLUMNS[parameters.groupBy] : undefined;
    const group = groupColumn ? sql<string | null>`${groupColumn}::text` : sql<string | null>`null::text`;
    const grouping = groupColumn ? [sql`1`, sql`2`] : [sql`1`];

    return db
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
