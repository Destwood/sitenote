import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnchorTarget } from "../anchor-target";
import { failure, success } from "@sitenote/widget";
import type { PageSessionDeps } from "../page-session";
import { SCROLL_MAX_MS, SCROLL_QUIET_MS, createScreenshotTaker } from ".";

const CAPTURE_ID = "60000000-0000-4000-8000-000000000001";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function elementAt(box: Box | (() => Box)) {
  const element = document.createElement("div");
  const read = typeof box === "function" ? box : () => box;
  element.getBoundingClientRect = () => {
    const { x, y, width, height } = read();
    return new DOMRect(x, y, width, height);
  };
  element.getClientRects = () => [element.getBoundingClientRect()] as unknown as DOMRectList;
  const scrollIntoView = vi.fn();
  element.scrollIntoView = scrollIntoView;
  const target: AnchorTarget = { kind: "element", element, offset: { x: 0.5, y: 0.5 } };
  return { target, scrollIntoView };
}

function setup(options: { send?: PageSessionDeps["send"]; frames?: boolean } = {}) {
  const events = new EventTarget();
  const win = Object.assign(events, {
    innerWidth: 1000,
    innerHeight: 800,
    devicePixelRatio: 2,
    requestAnimationFrame: (callback: () => void) =>
      options.frames === false ? 0 : setTimeout(callback, 16),
  }) as unknown as Window;
  const hidden: boolean[] = [];
  const send = vi.fn(
    options.send ??
      (() => Promise.resolve(success({ captureId: CAPTURE_ID, width: 10, height: 10 }))),
  );
  const taker = createScreenshotTaker({
    win,
    setHostHidden: (value) => {
      hidden.push(value);
    },
    send: send as unknown as PageSessionDeps["send"],
  });
  return { taker, send, hidden, events };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createScreenshotTaker", () => {
  it("hides the host, sends the rect and device pixel ratio, then restores the host", async () => {
    const { taker, send, hidden } = setup();
    const { target } = elementAt({ x: 100, y: 200, width: 300, height: 120 });

    const pending = taker.take(target);
    await vi.advanceTimersByTimeAsync(500);

    expect(await pending).toBe(CAPTURE_ID);
    expect(hidden).toEqual([true, false]);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: "screenshot.capture",
      rect: { x: 100, y: 200, width: 300, height: 120 },
      devicePixelRatio: 2,
    });
  });

  it("keeps the host hidden until the capture answered", async () => {
    let answer: (value: ReturnType<typeof success>) => void = () => undefined;
    const { taker, hidden } = setup({
      send: (() =>
        new Promise((resolve) => {
          answer = resolve;
        })) as unknown as PageSessionDeps["send"],
    });
    const { target } = elementAt({ x: 10, y: 10, width: 50, height: 50 });

    const pending = taker.take(target);
    await vi.advanceTimersByTimeAsync(500);
    expect(hidden).toEqual([true]);
    answer(success({ captureId: CAPTURE_ID, width: 1, height: 1 }));

    expect(await pending).toBe(CAPTURE_ID);
    expect(hidden).toEqual([true, false]);
  });

  it("does not scroll when the target is fully visible", async () => {
    const { taker } = setup();
    const { target, scrollIntoView } = elementAt({ x: 0, y: 0, width: 1000, height: 800 });

    const pending = taker.take(target);
    await vi.advanceTimersByTimeAsync(500);
    await pending;

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls a partly hidden target to the centre, waits and measures again", async () => {
    const { taker, send } = setup();
    let top = 700;
    const { target, scrollIntoView } = elementAt(() => ({
      x: 100,
      y: top,
      width: 300,
      height: 200,
    }));
    scrollIntoView.mockImplementation(() => {
      top = 300;
    });

    const pending = taker.take(target);
    await vi.advanceTimersByTimeAsync(2000);

    expect(await pending).toBe(CAPTURE_ID);
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "center", inline: "nearest" });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ rect: { x: 100, y: 300, width: 300, height: 200 } }),
    );
  });

  it("waits for scrolling to stop before capturing", async () => {
    const { taker, send, events } = setup();
    let top = 700;
    const { target, scrollIntoView } = elementAt(() => ({ x: 0, y: top, width: 100, height: 200 }));
    scrollIntoView.mockImplementation(() => {
      top = 300;
      const tick = () => events.dispatchEvent(new Event("scroll"));
      setTimeout(tick, 50);
      setTimeout(tick, 120);
    });

    const pending = taker.take(target);
    await vi.advanceTimersByTimeAsync(260);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SCROLL_QUIET_MS + 400);
    await pending;

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("stops waiting for scroll after the hard cap", async () => {
    const { taker, send, events } = setup();
    const { target, scrollIntoView } = elementAt({ x: 0, y: 700, width: 100, height: 200 });
    scrollIntoView.mockImplementation(() => {
      setInterval(() => events.dispatchEvent(new Event("scroll")), 30);
    });

    const pending = taker.take(target);
    await vi.advanceTimersByTimeAsync(SCROLL_MAX_MS + 600);
    await pending;

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not scroll a target that is larger than the viewport", async () => {
    const { taker, send } = setup();
    const { target, scrollIntoView } = elementAt({ x: -50, y: -50, width: 2000, height: 3000 });

    const pending = taker.take(target);
    await vi.advanceTimersByTimeAsync(500);
    await pending;

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("returns null without asking for a capture when the target has no box", async () => {
    const { taker, send, hidden } = setup();
    const { target } = elementAt({ x: 0, y: 0, width: 0, height: 0 });

    const pending = taker.take(target);
    await vi.advanceTimersByTimeAsync(500);

    expect(await pending).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(hidden).toEqual([true, false]);
  });

  it("returns null and restores the host when the background refuses", async () => {
    const { taker, hidden } = setup({
      send: (() =>
        Promise.resolve(failure("capture_failed"))) as unknown as PageSessionDeps["send"],
    });
    const { target } = elementAt({ x: 10, y: 10, width: 50, height: 50 });

    const pending = taker.take(target);
    await vi.advanceTimersByTimeAsync(500);

    expect(await pending).toBeNull();
    expect(hidden).toEqual([true, false]);
  });

  it("returns null and restores the host when sending throws", async () => {
    const { taker, hidden } = setup({
      send: (() => Promise.reject(new Error("gone"))) as unknown as PageSessionDeps["send"],
    });
    const { target } = elementAt({ x: 10, y: 10, width: 50, height: 50 });

    const pending = taker.take(target);
    await vi.advanceTimersByTimeAsync(500);

    expect(await pending).toBeNull();
    expect(hidden).toEqual([true, false]);
  });

  it("continues when animation frames never fire, as in a background tab", async () => {
    const { taker } = setup({ frames: false });
    const { target } = elementAt({ x: 10, y: 10, width: 50, height: 50 });

    const pending = taker.take(target);
    await vi.advanceTimersByTimeAsync(500);

    expect(await pending).toBe(CAPTURE_ID);
  });
});
