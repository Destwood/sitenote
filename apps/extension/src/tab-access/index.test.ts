import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getTargetTab,
  hasOriginAccess,
  originOfTabUrl,
  removeOriginAccess,
  requestOriginAccess,
} from ".";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  get: vi.fn(),
  contains: vi.fn(),
  request: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("wxt/browser", () => ({
  browser: {
    tabs: { query: mocks.query, get: mocks.get },
    permissions: { contains: mocks.contains, request: mocks.request, remove: mocks.remove },
  },
}));

beforeEach(() => {
  mocks.query.mockReset();
  mocks.get.mockReset();
  mocks.contains.mockReset();
  mocks.request.mockReset();
  mocks.remove.mockReset();
});

describe("originOfTabUrl", () => {
  it.each([
    ["https://example.test/a/b?x=1#y", "https://example.test"],
    ["http://127.0.0.1:4173/", "http://127.0.0.1:4173"],
  ])("returns the origin of %s", (url, origin) => {
    expect(originOfTabUrl(url)).toBe(origin);
  });

  it.each([
    ["no url", undefined],
    ["a chrome page", "chrome://extensions"],
    ["an extension page", "chrome-extension://abc/popup.html"],
    ["a local file", "file:///C:/page.html"],
    ["a blank page", "about:blank"],
    ["the Chrome Web Store", "https://chromewebstore.google.com/detail/x"],
    ["the old Chrome Web Store", "https://chrome.google.com/webstore/detail/x"],
    ["the Edge add-ons store", "https://microsoftedge.microsoft.com/addons/detail/x"],
  ])("returns null for %s", (_name, url) => {
    expect(originOfTabUrl(url)).toBeNull();
  });
});

describe("getTargetTab", () => {
  it("uses the active tab of the current window", async () => {
    mocks.query.mockResolvedValue([{ id: 4, url: "https://example.test/pricing" }]);

    expect(await getTargetTab("")).toEqual({ id: 4, origin: "https://example.test" });
    expect(mocks.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it("uses the tab named in the query string instead", async () => {
    mocks.get.mockResolvedValue({ id: 9, url: "http://127.0.0.1:4173/" });

    expect(await getTargetTab("?tabId=9")).toEqual({ id: 9, origin: "http://127.0.0.1:4173" });
    expect(mocks.get).toHaveBeenCalledWith(9);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each(["?tabId=abc", "?tabId=-1", "?tabId=1.5", "?tabId="])(
    "ignores the invalid tab id in %s",
    async (search) => {
      mocks.query.mockResolvedValue([{ id: 4, url: "https://example.test/" }]);

      expect(await getTargetTab(search)).toEqual({ id: 4, origin: "https://example.test" });
      expect(mocks.get).not.toHaveBeenCalled();
    },
  );

  it("keeps the tab but has no origin when the url is hidden or unsupported", async () => {
    mocks.query.mockResolvedValue([{ id: 4 }]);

    expect(await getTargetTab("")).toEqual({ id: 4, origin: null });
  });

  it("returns null when there is no tab or the lookup fails", async () => {
    mocks.query.mockResolvedValueOnce([]);
    expect(await getTargetTab("")).toBeNull();

    mocks.get.mockRejectedValueOnce(new Error("No tab with id"));
    expect(await getTargetTab("?tabId=5")).toBeNull();
  });
});

describe("origin access", () => {
  it("checks, requests and removes the permission for the origin pattern", async () => {
    mocks.contains.mockResolvedValue(true);
    mocks.request.mockResolvedValue(true);
    mocks.remove.mockResolvedValue(true);

    expect(await hasOriginAccess("https://example.test")).toBe(true);
    expect(await requestOriginAccess("https://example.test")).toBe(true);
    await removeOriginAccess("https://example.test");

    const pattern = { origins: ["https://example.test/*"] };
    expect(mocks.contains).toHaveBeenCalledWith(pattern);
    expect(mocks.request).toHaveBeenCalledWith(pattern);
    expect(mocks.remove).toHaveBeenCalledWith(pattern);
  });

  it("treats a declined request and failures as no access", async () => {
    mocks.request.mockResolvedValueOnce(false);
    expect(await requestOriginAccess("https://example.test")).toBe(false);

    mocks.request.mockRejectedValueOnce(
      new Error("This function must be called during a user gesture"),
    );
    expect(await requestOriginAccess("https://example.test")).toBe(false);

    mocks.contains.mockRejectedValueOnce(new Error("bad"));
    expect(await hasOriginAccess("https://example.test")).toBe(false);

    mocks.remove.mockRejectedValueOnce(new Error("required"));
    await expect(removeOriginAccess("https://example.test")).resolves.toBeUndefined();
  });
});
