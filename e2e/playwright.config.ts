import { defineConfig } from "@playwright/test";

const FIXTURE_PORT = 4173;
const FIXTURE_ORIGIN = `http://127.0.0.1:${String(FIXTURE_PORT)}`;
const WEB_ORIGIN = "http://localhost:3000";
const CLICKUP_MOCK_PORT = 4411;
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
      testIgnore: ["comments.spec.ts", "context.spec.ts"],
      dependencies: ["web"],
      use: { baseURL: FIXTURE_ORIGIN },
    },
    {
      name: "chromium-extension-comments",
      testDir: "tests/extension",
      testMatch: "comments.spec.ts",
      dependencies: ["chromium-extension"],
      timeout: 90000,
      use: { baseURL: FIXTURE_ORIGIN },
    },
    {
      name: "chromium-extension-context",
      testDir: "tests/extension",
      testMatch: "context.spec.ts",
      dependencies: ["chromium-extension-comments"],
      timeout: 120000,
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
      command: "node fixtures/clickup/server.ts",
      url: `http://127.0.0.1:${String(CLICKUP_MOCK_PORT)}/health`,
      reuseExistingServer: true,
      env: { CLICKUP_MOCK_PORT: String(CLICKUP_MOCK_PORT) },
    },
    {
      command: "pnpm --filter @sitenote/web start",
      url: WEB_ORIGIN,
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
