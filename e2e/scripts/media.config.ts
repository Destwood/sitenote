import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "record-demo.ts",
  workers: 1,
  timeout: 180_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    channel: "chromium",
  },
});
