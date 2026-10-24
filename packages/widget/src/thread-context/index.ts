import {
  CONTEXT_NAME_MAX,
  CONTEXT_TITLE_MAX,
  CONTEXT_URL_MAX,
  CONTEXT_USER_AGENT_MAX,
  fitThreadContext,
  parseUserAgentData,
  type ConsoleErrorRecord,
  type ThreadContext,
  type UserAgentBrand,
  type UserAgentInput,
} from "@sitenote/core";

export const HIGH_ENTROPY_HINTS = ["platformVersion", "fullVersionList"];
export const HIGH_ENTROPY_TIMEOUT_MS = 300;
const MAX_DEVICE_PIXEL_RATIO = 16;

export interface ContextCollectorDeps {
  win: Window;
  doc: Document;
  requestErrors: () => Promise<ConsoleErrorRecord[]>;
  now?: () => Date;
  highEntropyTimeoutMs?: number;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function toBrands(value: unknown): UserAgentBrand[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const brands: UserAgentBrand[] = [];
  for (const entry of value as unknown[]) {
    const brand: unknown =
      typeof entry === "object" && entry !== null ? Reflect.get(entry, "brand") : undefined;
    const version: unknown =
      typeof entry === "object" && entry !== null ? Reflect.get(entry, "version") : undefined;
    if (typeof brand === "string" && typeof version === "string") {
      brands.push({ brand, version });
    }
  }
  return brands;
}

function toText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function timeout(milliseconds: number): Promise<undefined> {
  return new Promise((resolve) =>
    setTimeout(() => {
      resolve(undefined);
    }, milliseconds),
  );
}

async function readHighEntropy(data: object, timeoutMs: number): Promise<object | undefined> {
  const reader: unknown = Reflect.get(data, "getHighEntropyValues");
  if (typeof reader !== "function") {
    return undefined;
  }
  try {
    const values: unknown = await Promise.race([
      Reflect.apply(reader, data, [HIGH_ENTROPY_HINTS]) as Promise<unknown>,
      timeout(timeoutMs),
    ]);
    return typeof values === "object" && values !== null ? values : undefined;
  } catch {
    return undefined;
  }
}

export async function readUserAgentInput(
  nav: Navigator,
  timeoutMs: number = HIGH_ENTROPY_TIMEOUT_MS,
): Promise<UserAgentInput> {
  const data: unknown = Reflect.get(nav, "userAgentData");
  if (typeof data !== "object" || data === null) {
    return { userAgent: nav.userAgent };
  }
  const high = await readHighEntropy(data, timeoutMs);
  return {
    userAgent: nav.userAgent,
    brands: toBrands(Reflect.get(data, "brands")),
    platform: toText(Reflect.get(data, "platform")),
    platformVersion: high === undefined ? undefined : toText(Reflect.get(high, "platformVersion")),
    fullVersionList:
      high === undefined ? undefined : toBrands(Reflect.get(high, "fullVersionList")),
  };
}

function normalizedRatio(ratio: number): number {
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(ratio, MAX_DEVICE_PIXEL_RATIO) : 1;
}

export function createContextCollector(deps: ContextCollectorDeps): () => Promise<ThreadContext> {
  const { win, doc } = deps;
  const now = deps.now ?? (() => new Date());
  return async () => {
    const [consoleErrors, agent] = await Promise.all([
      deps.requestErrors(),
      readUserAgentInput(win.navigator, deps.highEntropyTimeoutMs),
    ]);
    const { browser, os } = parseUserAgentData(agent);
    return fitThreadContext({
      viewport: { width: Math.round(win.innerWidth), height: Math.round(win.innerHeight) },
      devicePixelRatio: normalizedRatio(win.devicePixelRatio),
      pageTitle: clip(doc.title.trim(), CONTEXT_TITLE_MAX),
      url: clip(win.location.href, CONTEXT_URL_MAX),
      browser: {
        name: clip(browser.name, CONTEXT_NAME_MAX),
        version: clip(browser.version, CONTEXT_NAME_MAX),
      },
      os:
        os.version === undefined
          ? { name: clip(os.name, CONTEXT_NAME_MAX) }
          : { name: clip(os.name, CONTEXT_NAME_MAX), version: clip(os.version, CONTEXT_NAME_MAX) },
      userAgent: clip(win.navigator.userAgent, CONTEXT_USER_AGENT_MAX),
      consoleErrors,
      capturedAt: now().toISOString(),
    });
  };
}
