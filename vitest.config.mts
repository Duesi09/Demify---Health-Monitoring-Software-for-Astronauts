import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@onboard": path.resolve(import.meta.dirname, "onboard"),
      // `server-only` throws outside the React Server bundler; stub it in tests.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The tests check the scripted health stories; the pitch build runs the healthy crew (src/lib/config.ts).
    env: { DEMIFY_HEALTHY_CREW: "false" },
  },
});
