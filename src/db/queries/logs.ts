import { and, desc, eq, gte, ilike, lt, sql, type SQL } from "drizzle-orm";
import { QueryParameters } from "../../utils/validate.js";
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

export const selectLogs = async (parameters: QueryParameters) => {
    const conditions: (SQL | undefined)[] = [
        parameters.service ? eq(logs.service, parameters.service) : undefined,
        parameters.level ? eq(logs.level, parameters.level) : undefined,
        parameters.since ? gte(logs.timestamp, parameters.since) : undefined,
        parameters.until ? lt(logs.timestamp, parameters.until) : undefined,

        // q is a case insensitive substring match, so ILIKE and not LIKE
        parameters.subMessage ? ilike(logs.message, `%${escapeLikePattern(parameters.subMessage)}%`) : undefined
    ];

    for (const [key, value] of Object.entries(parameters.attributes)) {
        conditions.push(sql`${logs.attributes} ->> ${key}::text = ${value}`);
    }

    if (parameters.cursor) {
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
