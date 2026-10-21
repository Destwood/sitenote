import type { AnchorRect } from "@sitenote/ui";

import {
  isTargetAlive,
  measureTarget,
  observableElement,
  type AnchorTarget,
} from "../anchor-target";

export interface TrackedTarget {
  id: string;
  target: AnchorTarget;
  always: boolean;
}

export interface PinMeasurement {
  x: number;
  y: number;
  rect: AnchorRect;
  rects: AnchorRect[];
  visible: boolean;
}

export type Measurements = ReadonlyMap<string, PinMeasurement>;

export interface PinTrackerDeps {
  win: Window;
  onMeasure: (measurements: Measurements) => void;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
  createObserver?: (callback: IntersectionObserverCallback) => IntersectionObserver | null;
}

export interface PinTracker {
  setTargets: (targets: readonly TrackedTarget[]) => void;
  invalidate: () => void;
  stop: () => void;
}

function sameRect(a: AnchorRect, b: AnchorRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function sameMeasurement(a: PinMeasurement, b: PinMeasurement): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.visible === b.visible &&
    sameRect(a.rect, b.rect) &&
    a.rects.length === b.rects.length &&
    a.rects.every((rect, index) => {
      const other = b.rects[index];
      return other !== undefined && sameRect(rect, other);
    })
  );
}

export function sameMeasurements(a: Measurements, b: Measurements): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [id, measurement] of a) {
    const other = b.get(id);
    if (other === undefined || !sameMeasurement(measurement, other)) {
      return false;
    }
  }
  return true;
}

function defaultObserver(
  win: Window,
  callback: IntersectionObserverCallback,
): IntersectionObserver | null {
  const Observer = (win as Window & { IntersectionObserver?: typeof IntersectionObserver })
    .IntersectionObserver;
  return Observer === undefined ? null : new Observer(callback);
}

export function createPinTracker(deps: PinTrackerDeps): PinTracker {
  const { win } = deps;
  const requestFrame = deps.requestFrame ?? ((callback) => win.requestAnimationFrame(callback));
  const cancelFrame =
    deps.cancelFrame ??
    ((handle) => {
      win.cancelAnimationFrame(handle);
    });
  const createObserver = deps.createObserver ?? ((callback) => defaultObserver(win, callback));

  let targets: readonly TrackedTarget[] = [];
  let observer: IntersectionObserver | null = null;
  const observed = new Set<Element>();
  const intersecting = new Set<Element>();
  let frame: number | null = null;
  let listening = false;
  let last: Measurements = new Map();

  function schedule(): void {
    if (frame !== null || targets.length === 0) {
      return;
    }
    frame = requestFrame(() => {
      frame = null;
      measure();
    });
  }

  function measure(): void {
    const width = win.innerWidth;
    const height = win.innerHeight;
    const next = new Map<string, PinMeasurement>();
    for (const { id, target, always } of targets) {
      const element = observableElement(target);
      const inView = always || observer === null || (element !== null && intersecting.has(element));
      if (!inView || !isTargetAlive(target)) {
        continue;
      }
      const { x, y, rect, rects, hidden } = measureTarget(target);
      next.set(id, {
        x,
        y,
        rect,
        rects,
        visible: !hidden && x >= 0 && y >= 0 && x <= width && y <= height,
      });
    }
    if (!sameMeasurements(last, next)) {
      last = next;
      deps.onMeasure(next);
    }
  }

  function handleIntersections(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        intersecting.add(entry.target);
      } else {
        intersecting.delete(entry.target);
      }
    }
    schedule();
  }

  function listen(): void {
    if (!listening) {
      listening = true;
      win.addEventListener("scroll", schedule, { capture: true, passive: true });
      win.addEventListener("resize", schedule, { passive: true });
    }
  }

  function unlisten(): void {
    if (listening) {
      listening = false;
      win.removeEventListener("scroll", schedule, { capture: true });
      win.removeEventListener("resize", schedule);
    }
    if (frame !== null) {
      cancelFrame(frame);
      frame = null;
    }
    observer?.disconnect();
    observer = null;
    observed.clear();
    intersecting.clear();
  }

  function syncObserved(): void {
    const wanted = new Set<Element>();
    for (const { target } of targets) {
      const element = observableElement(target);
      if (element !== null) {
        wanted.add(element);
      }
    }
    observer ??= createObserver(handleIntersections);
    for (const element of [...observed]) {
      if (!wanted.has(element)) {
        observer?.unobserve(element);
        observed.delete(element);
        intersecting.delete(element);
      }
    }
    for (const element of wanted) {
      if (!observed.has(element)) {
        observer?.observe(element);
        observed.add(element);
      }
    }
  }

  return {
    setTargets: (next) => {
      targets = next;
      if (targets.length === 0) {
        unlisten();
        if (last.size > 0) {
          last = new Map();
          deps.onMeasure(last);
        }
        return;
      }
      listen();
      syncObserved();
      schedule();
    },
    invalidate: schedule,
    stop: () => {
      targets = [];
      unlisten();
      last = new Map();
    },
  };
}
