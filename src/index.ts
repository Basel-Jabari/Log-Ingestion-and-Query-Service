// Libraries
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { once } from "node:events";
import postgres from "postgres";

// Files
import { config } from "./config.js";
import { app } from "./app.js";
import { pgClient } from "./db/db.js";
import { flushPendingLogs } from "./ingest/writer.js";

const shutdown = async (server: ReturnType<typeof app.listen>) => {
    config.server.isReady = false;

    // Stop accepting new connections, but let the running requests finish
    server.close();

    await flushPendingLogs();
    await pgClient.end();

    process.exit(0);
};

// Start the application
const main = async () => {
    const migrationClient = postgres(config.db.url, {
        max: 1
    });

    try {
        // Apply pending database migrations
        await migrate(drizzle(migrationClient), config.db.migrationConfig);
        console.log("Database migrations completed successfully.");
    } finally {
        // Close the dedicated migration connection
        await migrationClient.end();
    }

    // Start the HTTP server
    const server = app.listen(config.server.port);
    await once(server, "listening");

    // Report readiness only after the server is listening
    config.server.isReady = true;
    console.log(`Server is running at http://localhost:${config.server.port}.`);

    // SIGTERM comes from "docker stop", SIGINT comes from Ctrl+C in a terminal
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
        process.on(signal, () => {
            void shutdown(server);
        });
    }
};

await main();
