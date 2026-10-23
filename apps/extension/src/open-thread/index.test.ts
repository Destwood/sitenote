import { beforeEach, describe, expect, it, vi } from "vitest";

import { isOpenable, openThread } from ".";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("wxt/browser", () => ({ browser: { tabs: { create: mocks.create } } }));

const THREAD_ID = "30000000-0000-4000-8000-000000000001";

beforeEach(() => {
  mocks.create.mockReset();
  mocks.create.mockResolvedValue({ id: 1 });
});

describe("isOpenable", () => {
  it.each([
    ["https://example.test/pricing", true],
    ["http://127.0.0.1:4173/p/a", true],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
    ["chrome://extensions", false],
    ["file:///etc/passwd", false],
    ["not a url", false],
    ["", false],
  ])("%s -> %s", (pageUrl, expected) => {
    expect(isOpenable(pageUrl)).toBe(expected);
  });
});

describe("openThread", () => {
  it("opens the page of the thread in a new tab", async () => {
    const opened = await openThread({
      pageUrl: "https://example.test/pricing",
      threadId: THREAD_ID,
    });

    expect(opened).toBe(true);
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({
      url: `https://example.test/pricing#sitenote=${THREAD_ID}`,
    });
  });

  it("replaces an existing hash of the page with the thread", async () => {
    await openThread({ pageUrl: "https://example.test/pricing?plan=pro#top", threadId: THREAD_ID });

    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({
      url: `https://example.test/pricing?plan=pro#sitenote=${THREAD_ID}`,
    });
  });

  it("refuses an address that is not a web page without opening anything", async () => {
    const opened = await openThread({ pageUrl: "javascript:alert(1)", threadId: THREAD_ID });

    expect(opened).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("reports a tab that could not be created", async () => {
    mocks.create.mockRejectedValue(new Error("no window"));

    expect(await openThread({ pageUrl: "https://example.test/", threadId: THREAD_ID })).toBe(false);
  });
});
