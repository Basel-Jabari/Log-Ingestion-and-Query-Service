import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { config } from "../src/config.js";
import postgres from "postgres";

export const setup = async () => {
    const client = postgres(config.db.url, {
        max: 1
    });

    try {
        await migrate(drizzle(client), config.db.migrationConfig);
    } finally {
        await client.end();
    }
};
