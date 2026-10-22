import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __SITENOTE_E2E__: false },
  test: {
    name: "extension",
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
