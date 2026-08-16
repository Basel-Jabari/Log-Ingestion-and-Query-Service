import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "../config.js";
import postgres from "postgres";
import * as schema from "./schema.js";

const client = postgres(config.db.url, {
    max: config.db.poolMax,
    prepare: true
});

export const db = drizzle(client, { schema });
export const pgClient = client;
