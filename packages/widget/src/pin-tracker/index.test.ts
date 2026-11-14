import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnchorTarget } from "../anchor-target";
import { createPinTracker, sameMeasurements, type Measurements, type PinTracker } from ".";

function rectOf(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

interface Box {
  element: HTMLElement;
  target: AnchorTarget;
  move: (left: number, top: number) => void;
}

function makeBox(left: number, top: number): Box {
  const element = document.createElement("div");
  document.body.append(element);
  let current = rectOf(left, top, 100, 40);
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => current);
  vi.spyOn(element, "getClientRects").mockImplementation(() => [current] as unknown as DOMRectList);
  return {
    element,
    target: { kind: "element", element, offset: { x: 0, y: 0 } },
    move: (nextLeft, nextTop) => {
      current = rectOf(nextLeft, nextTop, 100, 40);
    },
  };
}

class FakeObserver {
  readonly observed = new Set<Element>();
  disconnected = false;
  constructor(readonly callback: IntersectionObserverCallback) {}
  observe(element: Element): void {
    this.observed.add(element);
  }
  unobserve(element: Element): void {
    this.observed.delete(element);
  }
  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }
  report(element: Element, isIntersecting: boolean): void {
    this.callback(
      [{ target: element, isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

interface Setup {
  tracker: PinTracker;
  measured: Measurements[];
  frames: (() => void)[];
  flush: () => void;
  observers: FakeObserver[];
  cancelled: number[];
}

function setup(withObserver = true): Setup {
  const measured: Measurements[] = [];
  const frames: (() => void)[] = [];
  const observers: FakeObserver[] = [];
  const cancelled: number[] = [];
  const tracker = createPinTracker({
    win: window,
    onMeasure: (measurements) => measured.push(measurements),
    requestFrame: (callback) => frames.push(callback),
    cancelFrame: (handle) => {
      cancelled.push(handle);
      frames.splice(handle - 1, 1);
    },
    createObserver: (callback) => {
      if (!withObserver) {
        return null;
      }
      const observer = new FakeObserver(callback);
      observers.push(observer);
      return observer as unknown as IntersectionObserver;
    },
  });
  return {
    tracker,
    measured,
    frames,
    cancelled,
    observers,
    flush: () => {
      for (const callback of frames.splice(0)) {
        callback();
      }
    },
  };
}

beforeEach(() => {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("sameMeasurements", () => {
  const base = {
    x: 1,
    y: 2,
    pageX: 11,
    pageY: 22,
    rect: { x: 0, y: 0, width: 1, height: 1 },
    rects: [{ x: 0, y: 0, width: 1, height: 1 }],
    visible: true,
    near: true,
  };

  it("compares positions, rectangles and visibility", () => {
    expect(sameMeasurements(new Map([["a", base]]), new Map([["a", { ...base }]]))).toBe(true);
    expect(sameMeasurements(new Map([["a", base]]), new Map([["a", { ...base, x: 2 }]]))).toBe(
      false,
    );
    expect(
      sameMeasurements(new Map([["a", base]]), new Map([["a", { ...base, pageY: 23 }]])),
    ).toBe(false);
    expect(
      sameMeasurements(new Map([["a", base]]), new Map([["a", { ...base, visible: false }]])),
    ).toBe(false);
    expect(
      sameMeasurements(new Map([["a", base]]), new Map([["a", { ...base, near: false }]])),
    ).toBe(false);
    expect(sameMeasurements(new Map([["a", base]]), new Map([["a", { ...base, rects: [] }]]))).toBe(
      false,
    );
    expect(sameMeasurements(new Map([["a", base]]), new Map())).toBe(false);
    expect(sameMeasurements(new Map([["a", base]]), new Map([["b", base]]))).toBe(false);
  });
});

describe("createPinTracker", () => {
  it("measures a target that intersects the viewport and reports its position", () => {
    const { tracker, flush, observers, measured } = setup();
    const box = makeBox(100, 200);

    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    observers[0]?.report(box.element, true);
    flush();

    expect(observers[0]?.observed.has(box.element)).toBe(true);
    expect(measured).toHaveLength(1);
    expect(measured[0]?.get("a")).toMatchObject({ x: 100, y: 200, visible: true });
  });

  it("skips targets whose element is not intersecting", () => {
    const { tracker, flush, observers, measured } = setup();
    const box = makeBox(100, 200);

    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    flush();

    expect(measured).toHaveLength(0);

    observers[0]?.report(box.element, false);
    flush();

    expect(measured).toHaveLength(0);

    observers[0]?.report(box.element, true);
    flush();

    expect(measured.at(-1)?.has("a")).toBe(true);
  });

  it("always measures a forced target even when it is not intersecting", () => {
    const { tracker, flush, measured } = setup();
    const box = makeBox(100, 200);

    tracker.setTargets([{ id: "a", target: box.target, always: true }]);
    flush();

    expect(measured[0]?.get("a")?.visible).toBe(true);
  });

  it("measures every target when no IntersectionObserver is available", () => {
    const { tracker, flush, measured } = setup(false);
    const box = makeBox(100, 200);

    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    flush();

    expect(measured[0]?.has("a")).toBe(true);
  });

  it("marks a target outside the viewport or without boxes as not visible", () => {
    const { tracker, flush, measured } = setup(false);
    const below = makeBox(100, 900);
    const hidden = makeBox(10, 10);
    vi.spyOn(hidden.element, "getClientRects").mockReturnValue([] as unknown as DOMRectList);

    tracker.setTargets([
      { id: "below", target: below.target, always: false },
      { id: "hidden", target: hidden.target, always: false },
    ]);
    flush();

    expect(measured[0]?.get("below")?.visible).toBe(false);
    expect(measured[0]?.get("hidden")?.visible).toBe(false);
  });

  it("skips detached targets", () => {
    const { tracker, flush, measured } = setup(false);
    const box = makeBox(10, 10);
    box.element.remove();

    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    flush();

    expect(measured).toHaveLength(0);
  });

  it("re-measures once per frame on scroll and resize, and reports only changes", () => {
    const { tracker, flush, frames, measured } = setup(false);
    const box = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    flush();

    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(frames).toHaveLength(1);
    flush();
    expect(measured).toHaveLength(1);

    vi.spyOn(window, "scrollY", "get").mockReturnValue(50);
    box.move(100, 150);
    window.dispatchEvent(new Event("scroll"));
    flush();

    expect(measured).toHaveLength(2);
    expect(measured[1]?.get("a")?.y).toBe(150);
  });

  it("keeps a measured pin in place when the element moves and the tracker is invalidated", () => {
    const { tracker, flush, measured } = setup(false);
    const box = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    flush();

    box.move(120, 260);
    tracker.invalidate();
    flush();

    expect(measured.at(-1)?.get("a")).toMatchObject({ x: 100, y: 200 });
  });

  it("keeps a frozen pin in place when the same target is re-synced and its element moves", () => {
    const { tracker, flush, measured } = setup(false);
    const box = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    flush();

    box.move(120, 260);
    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    flush();

    expect(measured.at(-1)?.get("a")).toMatchObject({ x: 100, y: 200 });
  });

  it("reports the new element's position when the same id is reused for another target", () => {
    const { tracker, flush, measured } = setup(false);
    const first = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: first.target, always: false }]);
    flush();

    const second = makeBox(300, 400);
    tracker.setTargets([{ id: "a", target: second.target, always: false }]);
    flush();

    expect(measured.at(-1)?.get("a")).toMatchObject({ x: 300, y: 400, visible: true });
  });

  it("moves a frozen pin by the window scroll delta and keeps its page position", () => {
    const { tracker, flush, measured } = setup(false);
    const box = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    flush();

    vi.spyOn(window, "scrollX", "get").mockReturnValue(10);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(40);
    box.move(90, 160);
    window.dispatchEvent(new Event("scroll"));
    flush();

    expect(measured.at(-1)?.get("a")).toMatchObject({ x: 90, y: 160 });
  });

  it("re-freezes from the live element on resize", () => {
    const { tracker, flush, measured } = setup(false);
    const box = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    flush();

    box.move(100, 260);
    window.dispatchEvent(new Event("resize"));
    flush();

    expect(measured.at(-1)?.get("a")).toMatchObject({ x: 100, y: 260 });
  });

  it("keeps reporting a frozen pin when its element stops intersecting", () => {
    const { tracker, flush, observers, measured } = setup();
    const box = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    observers[0]?.report(box.element, true);
    flush();

    observers[0]?.report(box.element, false);
    flush();

    expect(measured.at(-1)?.get("a")).toMatchObject({ x: 100, y: 200, visible: true });
  });

  it("drops a pin whose element is disconnected and freezes it again at the new target", () => {
    const { tracker, flush, measured } = setup(false);
    const first = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: first.target, always: false }]);
    flush();

    first.element.remove();
    tracker.invalidate();
    flush();

    expect(measured.at(-1)?.has("a")).toBe(false);

    const second = makeBox(300, 400);
    tracker.setTargets([{ id: "a", target: second.target, always: false }]);
    flush();

    expect(measured.at(-1)?.get("a")).toMatchObject({ x: 300, y: 400 });
  });

  it("stops observing removed targets and keeps the others", () => {
    const { tracker, observers } = setup();
    const first = makeBox(0, 0);
    const second = makeBox(0, 0);
    tracker.setTargets([
      { id: "a", target: first.target, always: false },
      { id: "b", target: second.target, always: false },
    ]);

    tracker.setTargets([{ id: "b", target: second.target, always: false }]);

    expect(observers[0]?.observed.has(first.element)).toBe(false);
    expect(observers[0]?.observed.has(second.element)).toBe(true);
  });

  it("does nothing and detaches its listeners while there are no targets", () => {
    const { tracker, flush, frames, observers, measured } = setup();
    const box = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: box.target, always: true }]);
    flush();

    tracker.setTargets([]);
    window.dispatchEvent(new Event("scroll"));

    expect(observers[0]?.disconnected).toBe(true);
    expect(frames).toHaveLength(0);
    expect(measured.at(-1)?.size).toBe(0);
  });

  it("cancels a pending frame when the last target goes away", () => {
    const { tracker, cancelled, frames } = setup(false);
    const box = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: box.target, always: true }]);

    tracker.setTargets([]);

    expect(cancelled).toHaveLength(1);
    expect(frames).toHaveLength(0);
  });

  it("stops listening for good when stopped", () => {
    const { tracker, frames } = setup(false);
    const box = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: box.target, always: true }]);
    tracker.stop();

    window.dispatchEvent(new Event("scroll"));
    tracker.invalidate();

    expect(frames).toHaveLength(0);
  });

  it("keeps the document position of a pin constant while the page scrolls", () => {
    const { tracker, flush, measured } = setup(false);
    const box = makeBox(100, 200);
    tracker.setTargets([{ id: "a", target: box.target, always: false }]);
    flush();

    vi.spyOn(window, "scrollY", "get").mockReturnValue(50);
    box.move(100, 150);
    window.dispatchEvent(new Event("scroll"));
    flush();

    expect(measured.at(-1)?.get("a")).toMatchObject({ y: 150, pageY: 200 });
    expect(measured[0]?.get("a")).toMatchObject({ y: 200, pageY: 200 });
  });

  it("marks a pin near the viewport as near but not visible", () => {
    const { tracker, flush, measured } = setup(false);
    const below = makeBox(100, 1200);
    const far = makeBox(100, 2000);

    tracker.setTargets([
      { id: "below", target: below.target, always: false },
      { id: "far", target: far.target, always: false },
    ]);
    flush();

    expect(measured[0]?.get("below")).toMatchObject({ visible: false, near: true });
    expect(measured[0]?.get("far")).toMatchObject({ visible: false, near: false });
  });
});
