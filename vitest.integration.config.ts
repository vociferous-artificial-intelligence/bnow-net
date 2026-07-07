import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests (*.itest.ts) run against a disposable Neon branch — see
// scripts/test-integration.sh. Kept out of the default `npm test` include so the
// unit suite stays instant and credential-free.
export default defineConfig({
  test: {
    include: ["src/**/*.itest.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // DB tests share one branch; serialize to keep state deterministic
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
