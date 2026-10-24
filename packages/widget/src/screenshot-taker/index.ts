import { type AnchorTarget, measureTarget, observableElement } from "../anchor-target";
import type { WidgetBackend } from "../backend";

export const FRAME_TIMEOUT_MS = 100;
export const SCROLL_QUIET_MS = 100;
export const SCROLL_MAX_MS = 1000;

export interface ScreenshotTakerDeps {
  win: Window;
  setHostHidden: (hidden: boolean) => void;
  backend: Pick<WidgetBackend, "captureScreenshot">;
}

export interface ScreenshotTaker {
  take: (target: AnchorTarget) => Promise<string | null>;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function nextFrame(win: Window): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    win.requestAnimationFrame(finish);
    setTimeout(finish, FRAME_TIMEOUT_MS);
  });
}

async function nextFrames(win: Window): Promise<void> {
  await nextFrame(win);
  await nextFrame(win);
}

function waitForScrollEnd(win: Window): Promise<void> {
  return new Promise((resolve) => {
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const cap = setTimeout(finish, SCROLL_MAX_MS);

    function finish(): void {
      clearTimeout(quiet);
      clearTimeout(cap);
      win.removeEventListener("scroll", onScroll, true);
      win.removeEventListener("scrollend", finish, true);
      resolve();
    }

    function onScroll(): void {
      clearTimeout(quiet);
      quiet = setTimeout(finish, SCROLL_QUIET_MS);
    }

    win.addEventListener("scroll", onScroll, true);
    win.addEventListener("scrollend", finish, true);
    quiet = setTimeout(finish, SCROLL_QUIET_MS);
  });
}

function isFullyVisible(rect: Rect, win: Window): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= win.innerWidth &&
    rect.y + rect.height <= win.innerHeight
  );
}

function fitsViewport(rect: Rect, win: Window): boolean {
  return rect.width <= win.innerWidth && rect.height <= win.innerHeight;
}

function isEmpty(rect: Rect): boolean {
  return rect.width <= 0 || rect.height <= 0;
}

export function createScreenshotTaker(deps: ScreenshotTakerDeps): ScreenshotTaker {
  const { win } = deps;
  return {
    take: async (target) => {
      deps.setHostHidden(true);
      try {
        await nextFrames(win);
        let rect = measureTarget(target).rect;
        if (isEmpty(rect)) {
          return null;
        }
        if (!isFullyVisible(rect, win) && fitsViewport(rect, win)) {
          observableElement(target)?.scrollIntoView({ block: "center", inline: "nearest" });
          await waitForScrollEnd(win);
          await nextFrames(win);
          rect = measureTarget(target).rect;
          if (isEmpty(rect)) {
            return null;
          }
        }
        const result = await deps.backend.captureScreenshot(rect, win.devicePixelRatio);
        return result.ok ? result.data.captureId : null;
      } catch {
        return null;
      } finally {
        deps.setHostHidden(false);
      }
    },
  };
}
