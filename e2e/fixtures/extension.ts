import { chromium, test as base } from "@playwright/test";
import type { BrowserContext, Worker } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const STABLE_EXTENSION_ID = "anefihllkbkenhjbjggfndgemgkfaeoa";

const EXTENSION_PATH = resolve(import.meta.dirname, "../../apps/extension/.output/chrome-mv3-e2e");

function assertExtensionBuilt() {
  if (!existsSync(resolve(EXTENSION_PATH, "manifest.json"))) {
    throw new Error(
      `Built extension not found at ${EXTENSION_PATH}. ` +
        "Run `pnpm --filter @sitenote/extension build:e2e` or run the tests through `pnpm e2e` from the repository root.",
    );
  }
}

async function findServiceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
}

export interface ExtensionContextOptions {
  deviceScaleFactor?: number;
}

export async function launchExtensionContext(
  headless: boolean,
  baseURL: string | undefined,
  options: ExtensionContextOptions = {},
): Promise<BrowserContext> {
  assertExtensionBuilt();
  return chromium.launchPersistentContext("", {
    channel: "chromium",
    headless,
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(options.deviceScaleFactor === undefined ? {} : { viewport: null }),
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      ...(options.deviceScaleFactor === undefined
        ? []
        : [
            `--force-device-scale-factor=${String(options.deviceScaleFactor)}`,
            "--window-size=1280,800",
          ]),
    ],
  });
}

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({ baseURL, headless }, use) => {
    const context = await launchExtensionContext(headless, baseURL);
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = await findServiceWorker(context);
    await use(new URL(worker.url()).host);
  },
});

export const expect = base.expect;
