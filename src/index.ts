// Libraries
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { once } from "node:events";
import postgres from "postgres";

// Files
import { config } from "./config.js";
import { app } from "./app.js";

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
};

await main();
