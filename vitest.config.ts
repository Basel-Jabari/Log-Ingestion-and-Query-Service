import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Runs once before every test file
        // We use it to migrate the database
        globalSetup: "./tests/global_setup.ts"
    }
});
