import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Heavy ESM packages (BullMQ, @supabase/supabase-js) can take >5 s on
    // first import in a cold Vitest worker. 15 s gives ample headroom while
    // still catching genuine infinite-loop hangs.
    testTimeout: 15000,
    // Run env-setup before every test file so required env vars are set
    // before any project module is imported.
    setupFiles: ["./tests/setup/env-setup.ts", "./tests/setup/mock-jwt-verifier.ts"],
    include: ["tests/**/*.test.ts"],
    // Reset mock call history (but not implementations) between tests.
    clearMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/server.ts",
        "src/tracing.ts",
        "src/types/**",
        "src/config/**",
      ],
    },
  },
});
