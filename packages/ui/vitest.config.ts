import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ui",
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
