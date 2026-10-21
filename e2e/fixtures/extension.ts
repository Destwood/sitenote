import { chromium, test as base } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const EXTENSION_PATH = resolve(import.meta.dirname, "../../apps/extension/.output/chrome-mv3");

function assertExtensionBuilt() {
  if (!existsSync(resolve(EXTENSION_PATH, "manifest.json"))) {
    throw new Error(
      `Built extension not found at ${EXTENSION_PATH}. ` +
        "Run `pnpm --filter @sitenote/extension build` or run the tests through `pnpm e2e` from the repository root.",
    );
  }
}

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ baseURL, headless }, use) => {
    assertExtensionBuilt();
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless,
      ...(baseURL === undefined ? {} : { baseURL }),
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    await use(context);
    await context.close();
  },
});

export const expect = base.expect;
