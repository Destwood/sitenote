import { defineConfig } from "@playwright/test";

const FIXTURE_PORT = 4173;
const FIXTURE_ORIGIN = `http://127.0.0.1:${String(FIXTURE_PORT)}`;
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: FIXTURE_ORIGIN,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium-extension" }],
  webServer: {
    command: "node fixtures/server.ts",
    url: FIXTURE_ORIGIN,
    reuseExistingServer: !isCi,
    env: { FIXTURE_PORT: String(FIXTURE_PORT) },
  },
});
