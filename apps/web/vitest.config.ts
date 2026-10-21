import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "web",
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
