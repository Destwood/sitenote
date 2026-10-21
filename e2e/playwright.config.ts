import { defineConfig } from "@playwright/test";

const FIXTURE_PORT = 4173;
const FIXTURE_ORIGIN = `http://127.0.0.1:${String(FIXTURE_PORT)}`;
const WEB_ORIGIN = "http://localhost:3000";
const isCi = Boolean(process.env.CI);

export default defineConfig({
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-extension",
      testDir: "tests/extension",
      dependencies: ["web"],
      use: { baseURL: FIXTURE_ORIGIN },
    },
    {
      name: "web",
      testDir: "tests/web",
      use: { baseURL: WEB_ORIGIN, channel: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node fixtures/server.ts",
      url: FIXTURE_ORIGIN,
      reuseExistingServer: !isCi,
      env: { FIXTURE_PORT: String(FIXTURE_PORT) },
    },
    {
      command: "pnpm --filter @sitenote/web start",
      url: WEB_ORIGIN,
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
