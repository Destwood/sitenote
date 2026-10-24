import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "widget",
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
