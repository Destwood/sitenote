import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/*/vitest.config.ts",
      "packages/*/vitest.config.ts",
      { test: { name: "scripts", include: ["scripts/**/*.test.ts"] } },
    ],
  },
});
