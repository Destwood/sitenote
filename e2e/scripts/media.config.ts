import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "record-demo.ts",
  workers: 1,
  timeout: 300_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    channel: "chromium",
    launchOptions: { slowMo: 250 },
  },
});
