import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Run once before the test suite to migrate the test database
        globalSetup: "./tests/global_setup.ts",

        // Run test files sequentially to avoid shared database state conflicts
        fileParallelism: false
    }
});
