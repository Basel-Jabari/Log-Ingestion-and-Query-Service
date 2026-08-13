// Libraries
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { once } from "node:events";
import postgres from "postgres";

// Files
import { config } from "./config.js";
import { app } from "./app.js";

// Middlewares
import { middlewareErrorHandler } from "./middlewares/error_handler.js";

// Starting the server
const main = async () => {
    const migrationClient = postgres(config.db.url, {
        max: 1
    });

    try {
        // Auto-Migration
        await migrate(drizzle(migrationClient), config.db.migrationConfig);
        console.log("Database migrations completed successfully.");
    } finally {
        // End the database connection
        await migrationClient.end();
    }

    // Starting the server
    const server = app.listen(config.server.port);
    await once(server, "listening");

    // Set isReady = true for GET /health endpoint
    config.server.isReady = true;
    console.log(`Server is running at http://localhost:${config.server.port}.`);
};

await main();

app.use(middlewareErrorHandler);
