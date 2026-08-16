import type { MigrationConfig } from "drizzle-orm/migrator";
import { existsSync } from "node:fs";

if (existsSync(".env")) {
    process.loadEnvFile();
}

export const envOrThrow = (key: string) => {
    if (!process.env[key]) {
        throw new Error(`${key} environment variable is required!`);
    }

    return process.env[key];
};

const envNumber = (key: string, fallback: number) => {
    const value = Number(process.env[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

type ServerConfig = {
    server: {
        port: number;
        bodyLimit: string;
        isReady: boolean;
    };
};

type DBConfig = {
    db: {
        url: string;
        poolMax: number;
        migrationConfig: MigrationConfig;
    };
};

// The service collects rows from many requests and writes them together
type IngestConfig = {
    ingest: {
        // Largest number of rows we send to PostgreSQL in one INSERT
        maxBatchRows: number;

        // How long a row may wait for other rows to join its batch, in milliseconds
        flushIntervalMs: number;

        // How many INSERT statements may run at the same time
        maxConcurrentWrites: number;

        // Safety limit: how many rows may wait in memory before we start refusing new batches
        maxQueuedRows: number;
    };
};

const migrationConfig: MigrationConfig = {
    migrationsFolder: "./src/db/migrations"
};

export const config: DBConfig & ServerConfig & IngestConfig = {
    server: {
        port: Number(process.env["PORT"] ?? 8080),
        bodyLimit: process.env["BODY_LIMIT"] ?? "16mb",
        isReady: false
    },

    db: {
        url: envOrThrow("DB_URL"),
        poolMax: envNumber("DB_POOL_MAX", 12),
        migrationConfig: migrationConfig
    },

    // Those numbers are suggested by AI
    ingest: {
        maxBatchRows: envNumber("INGEST_MAX_BATCH_ROWS", 5000),
        flushIntervalMs: envNumber("INGEST_FLUSH_INTERVAL_MS", 20),
        maxConcurrentWrites: envNumber("INGEST_MAX_CONCURRENT_WRITES", 4),
        maxQueuedRows: envNumber("INGEST_MAX_QUEUED_ROWS", 50_000)
    }
};
