import { threadContextSchema } from "@sitenote/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createContextCollector, readUserAgentInput } from ".";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const NOW = new Date("2026-10-22T09:30:00.000Z");
const AT = NOW.toISOString();

function navigatorWith(extra: Record<string, unknown> = {}, userAgent = CHROME_UA): Navigator {
  return { userAgent, ...extra } as unknown as Navigator;
}

function userAgentData(overrides: Record<string, unknown> = {}) {
  return {
    brands: [
      { brand: "Not?A_Brand", version: "99" },
      { brand: "Google Chrome", version: "130" },
    ],
    platform: "Windows",
    getHighEntropyValues: vi.fn(() =>
      Promise.resolve({
        platformVersion: "15.0.0",
        fullVersionList: [{ brand: "Google Chrome", version: "130.0.6723.92" }],
      }),
    ),
    ...overrides,
  };
}

function windowWith(options: Record<string, unknown> = {}): Window {
  return {
    innerWidth: 1440.4,
    innerHeight: 900,
    devicePixelRatio: 2,
    location: { href: "https://example.test/pricing?plan=pro#top" },
    navigator: navigatorWith({ userAgentData: userAgentData() }),
    ...options,
  } as unknown as Window;
}

function documentWith(title: string): Document {
  return { title } as unknown as Document;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("readUserAgentInput", () => {
  it("uses the user agent string alone without userAgentData", async () => {
    expect(await readUserAgentInput(navigatorWith())).toEqual({ userAgent: CHROME_UA });
  });

  it("reads brands, platform and the high entropy values", async () => {
    const data = userAgentData();

    const input = await readUserAgentInput(navigatorWith({ userAgentData: data }));

    expect(data.getHighEntropyValues).toHaveBeenCalledWith(["platformVersion", "fullVersionList"]);
    expect(input).toEqual({
      userAgent: CHROME_UA,
      brands: [
        { brand: "Not?A_Brand", version: "99" },
        { brand: "Google Chrome", version: "130" },
      ],
      platform: "Windows",
      platformVersion: "15.0.0",
      fullVersionList: [{ brand: "Google Chrome", version: "130.0.6723.92" }],
    });
  });

  it("keeps the low entropy values when the high entropy request fails", async () => {
    const data = userAgentData({
      getHighEntropyValues: vi.fn(() => Promise.reject(new Error("blocked"))),
    });

    const input = await readUserAgentInput(navigatorWith({ userAgentData: data }));

    expect(input.platform).toBe("Windows");
    expect(input.platformVersion).toBeUndefined();
    expect(input.fullVersionList).toBeUndefined();
  });

  it("keeps the low entropy values when the high entropy request hangs", async () => {
    vi.useFakeTimers();
    const data = userAgentData({ getHighEntropyValues: vi.fn(() => new Promise(() => undefined)) });

    const pending = readUserAgentInput(navigatorWith({ userAgentData: data }), 100);
    await vi.advanceTimersByTimeAsync(100);

    expect((await pending).platform).toBe("Windows");
  });

  it("ignores malformed userAgentData fields", async () => {
    const data = userAgentData({
      brands: [{ brand: 1 }, null, "x"],
      platform: 7,
      getHighEntropyValues: vi.fn(() => Promise.resolve("nope")),
    });

    const input = await readUserAgentInput(navigatorWith({ userAgentData: data }));

    expect(input.brands).toEqual([]);
    expect(input.platform).toBeUndefined();
    expect(input.platformVersion).toBeUndefined();
  });

  it("works without getHighEntropyValues", async () => {
    const input = await readUserAgentInput(
      navigatorWith({ userAgentData: { brands: [], platform: "Linux" } }),
    );

    expect(input.platform).toBe("Linux");
    expect(input.platformVersion).toBeUndefined();
  });
});

describe("createContextCollector", () => {
  it("builds a context that satisfies the shared schema", async () => {
    const collect = createContextCollector({
      win: windowWith(),
      doc: documentWith("  Pricing - Northwind  "),
      requestErrors: () => Promise.resolve([{ kind: "error", message: "Boom", at: AT }]),
      now: () => NOW,
    });

    const context = await collect();

    expect(threadContextSchema.safeParse(context).success).toBe(true);
    expect(context).toEqual({
      viewport: { width: 1440, height: 900 },
      devicePixelRatio: 2,
      pageTitle: "Pricing - Northwind",
      url: "https://example.test/pricing?plan=pro#top",
      browser: { name: "Chrome", version: "130.0.6723.92" },
      os: { name: "Windows", version: "11" },
      userAgent: CHROME_UA,
      consoleErrors: [{ kind: "error", message: "Boom", at: AT }],
      capturedAt: AT,
    });
  });

  it("clips long values and sanitizes control characters", async () => {
    const win = windowWith({
      location: { href: `https://example.test/${"a".repeat(3000)}` },
      navigator: navigatorWith({}, `ua\u0000${"u".repeat(600)}`),
    });
    const collect = createContextCollector({
      win,
      doc: documentWith(`${"t".repeat(400)}\uD800`),
      requestErrors: () => Promise.resolve([]),
      now: () => NOW,
    });

    const context = await collect();

    expect(context.pageTitle).toHaveLength(300);
    expect(context.url).toHaveLength(2048);
    expect(context.userAgent).toHaveLength(511);
    expect(threadContextSchema.safeParse(context).success).toBe(true);
  });

  it("falls back to a ratio of one for impossible values and caps large ones", async () => {
    const ratioOf = async (devicePixelRatio: number) =>
      (
        await createContextCollector({
          win: windowWith({ devicePixelRatio }),
          doc: documentWith("t"),
          requestErrors: () => Promise.resolve([]),
        })()
      ).devicePixelRatio;

    expect(await ratioOf(0)).toBe(1);
    expect(await ratioOf(Number.NaN)).toBe(1);
    expect(await ratioOf(-2)).toBe(1);
    expect(await ratioOf(1.25)).toBe(1.25);
    expect(await ratioOf(40)).toBe(16);
  });

  it("describes an unknown browser and omits the os version when it is unknown", async () => {
    const collect = createContextCollector({
      win: windowWith({ navigator: navigatorWith({}, "curl/8.0") }),
      doc: documentWith(""),
      requestErrors: () => Promise.resolve([]),
    });

    const context = await collect();

    expect(context.browser).toEqual({ name: "Unknown", version: "" });
    expect(context.os).toEqual({ name: "Unknown" });
    expect(context.pageTitle).toBe("");
  });

  it("drops the oldest errors when the context would be too large", async () => {
    const heavy = Array.from({ length: 20 }, (_, index) => ({
      kind: "error" as const,
      message: `${String(index)}${"m".repeat(990)}`,
      stack: "k".repeat(4000),
      source: "s".repeat(500),
      at: AT,
    }));
    const collect = createContextCollector({
      win: windowWith(),
      doc: documentWith("t"),
      requestErrors: () => Promise.resolve(heavy),
    });

    const context = await collect();

    expect(context.consoleErrors.length).toBeLessThan(20);
    expect(threadContextSchema.safeParse(context).success).toBe(true);
  });
});
