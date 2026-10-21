import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "extension",
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
