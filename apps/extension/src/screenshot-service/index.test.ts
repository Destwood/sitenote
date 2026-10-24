import { describe, expect, it, vi } from "vitest";

import { createCaptureStore } from "../capture-store";
import { failure } from "@sitenote/widget";
import {
  CAPTURE_MIN_INTERVAL_MS,
  CAPTURE_QUEUE_LIMIT,
  createScreenshotService,
  type CaptureSender,
  type CaptureTab,
} from ".";

const SENDER: CaptureSender = { tabId: 7, windowId: 3, origin: "https://example.test" };
const REQUEST = {
  rect: { x: 10, y: 20, width: 100, height: 50 },
  devicePixelRatio: 2,
};
const ACTIVE: CaptureTab = { active: true, windowId: 3, url: "https://example.test/pricing?x=1" };
const DATA_URL = "data:image/png;base64,AAAA";

function setup(
  options: {
    tabs?: (CaptureTab | null)[];
    capture?: () => Promise<string>;
    crop?: () => Promise<{ blob: Blob; width: number; height: number }>;
  } = {},
) {
  let time = 10_000;
  const log: string[] = [];
  const tabs = [...(options.tabs ?? [])];
  const getTab = vi.fn(() => Promise.resolve(tabs.length > 0 ? (tabs.shift() ?? null) : ACTIVE));
  const captureVisibleTab = vi.fn((windowId: number) => {
    log.push(`capture ${String(windowId)} at ${String(time)}`);
    return options.capture?.() ?? Promise.resolve(DATA_URL);
  });
  const crop = vi.fn(
    options.crop ?? (() => Promise.resolve({ blob: new Blob(["x"]), width: 232, height: 182 })),
  );
  const wait = vi.fn((milliseconds: number) => {
    time += milliseconds;
    return Promise.resolve();
  });
  const store = createCaptureStore();
  const service = createScreenshotService({
    store,
    captureVisibleTab,
    crop,
    getTab,
    wait,
    now: () => time,
  });
  return { service, store, getTab, captureVisibleTab, crop, wait, log };
}

describe("createScreenshotService", () => {
  it("captures the window, crops with the request and stores the result", async () => {
    const { service, store, captureVisibleTab, crop } = setup();

    const result = await service.capture(SENDER, REQUEST);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.data.width).toBe(232);
    expect(result.data.height).toBe(182);
    expect(store.get(result.data.captureId)).toMatchObject({ width: 232, height: 182 });
    expect(captureVisibleTab).toHaveBeenCalledWith(3);
    expect(crop).toHaveBeenCalledWith(DATA_URL, REQUEST);
  });

  it.each([
    ["the tab is gone", null],
    ["the tab is not active", { ...ACTIVE, active: false }],
    ["the tab moved to another window", { ...ACTIVE, windowId: 4 }],
    ["the tab shows another origin", { ...ACTIVE, url: "https://other.test/" }],
    ["the tab has no readable url", { ...ACTIVE, url: undefined }],
  ])("refuses before capturing when %s", async (_name, tab) => {
    const { service, captureVisibleTab } = setup({ tabs: [tab] });

    expect(await service.capture(SENDER, REQUEST)).toEqual(failure("capture_failed"));
    expect(captureVisibleTab).not.toHaveBeenCalled();
  });

  it("discards the image when the user left the tab during the capture", async () => {
    const { service, crop } = setup({ tabs: [ACTIVE, { ...ACTIVE, active: false }] });

    expect(await service.capture(SENDER, REQUEST)).toEqual(failure("capture_failed"));
    expect(crop).not.toHaveBeenCalled();
  });

  it("reports a failed capture or crop", async () => {
    const capture = setup({ capture: () => Promise.reject(new Error("no permission")) });
    expect(await capture.service.capture(SENDER, REQUEST)).toEqual(failure("capture_failed"));

    const crop = setup({ crop: () => Promise.reject(new Error("outside")) });
    expect(await crop.service.capture(SENDER, REQUEST)).toEqual(failure("capture_failed"));
  });

  it("spaces captures by at least the minimum interval", async () => {
    const { service, log } = setup();

    await Promise.all([
      service.capture(SENDER, REQUEST),
      service.capture(SENDER, REQUEST),
      service.capture(SENDER, REQUEST),
    ]);

    const times = log.map((entry) => Number(entry.split(" at ")[1]));
    expect(times).toHaveLength(3);
    expect(times[1]).toBeGreaterThanOrEqual((times[0] ?? 0) + CAPTURE_MIN_INTERVAL_MS);
    expect(times[2]).toBeGreaterThanOrEqual((times[1] ?? 0) + CAPTURE_MIN_INTERVAL_MS);
  });

  it("does not wait when the previous capture was long ago", async () => {
    const { service, wait } = setup();

    await service.capture(SENDER, REQUEST);

    expect(wait).not.toHaveBeenCalled();
  });

  it("runs requests one at a time", async () => {
    let release: (value: string) => void = () => undefined;
    const first = new Promise<string>((resolve) => {
      release = resolve;
    });
    const { service, captureVisibleTab } = setup({ capture: () => first });

    const one = service.capture(SENDER, REQUEST);
    const two = service.capture(SENDER, REQUEST);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(captureVisibleTab).toHaveBeenCalledTimes(1);
    release(DATA_URL);
    await Promise.all([one, two]);

    expect(captureVisibleTab).toHaveBeenCalledTimes(2);
  });

  it("answers rate_limited when too many requests are waiting and recovers afterwards", async () => {
    let release: (value: string) => void = () => undefined;
    const blocked = new Promise<string>((resolve) => {
      release = resolve;
    });
    const { service } = setup({ capture: () => blocked });

    const accepted = Array.from({ length: CAPTURE_QUEUE_LIMIT }, () =>
      service.capture(SENDER, REQUEST),
    );
    const rejected = await service.capture(SENDER, REQUEST);
    release(DATA_URL);
    const results = await Promise.all(accepted);

    expect(rejected).toEqual(failure("rate_limited"));
    expect(results.every((result) => result.ok)).toBe(true);
    expect((await service.capture(SENDER, REQUEST)).ok).toBe(true);
  });
});
