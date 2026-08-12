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

type ServerConfig = {
    server: {
        port: number;
        bodyLimit: string;
    };
};

type DBConfig = {
    db: {
        url: string;
        migrationConfig: MigrationConfig;
    };
};

const migrationConfig: MigrationConfig = {
    migrationsFolder: "./src/db/migrations"
};

export const config: DBConfig & ServerConfig = {
    server: {
        port: Number(process.env["PORT"] ?? 8080),
        bodyLimit: process.env["BODY_LIMIT"] ?? "16mb"
    },

    db: {
        url: envOrThrow("DB_URL"),
        migrationConfig: migrationConfig
    }
};
