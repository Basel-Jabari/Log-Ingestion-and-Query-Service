import { config } from "./config.js";
import { app } from "./app.js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { once } from "node:events";

const main = async () => {
    const migrationClient = postgres(config.db.url, {
        max: 1
    });

    try {
        await migrate(drizzle(migrationClient), config.db.migrationConfig);
        console.log("Database migrations completed successfully.");
    } finally {
        await migrationClient.end();
    }

    const server = app.listen(config.server.port);
    await once(server, "listening");
    config.server.isReady = true;
    console.log(`Server is running at http://localhost:${config.server.port}.`);
};

main();
