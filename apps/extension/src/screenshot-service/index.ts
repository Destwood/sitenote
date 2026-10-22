import type { CaptureStore } from "../capture-store";
import { failure, success, type MessageResult } from "../messages";
import type { ImageCropper } from "../screenshot-crop";
import type { CaptureRect, CapturedScreenshot } from "../transport";

export const CAPTURE_MIN_INTERVAL_MS = 550;
export const CAPTURE_QUEUE_LIMIT = 4;

export interface CaptureTab {
  active: boolean;
  windowId: number;
  url?: string | undefined;
}

export interface CaptureSender {
  tabId: number;
  windowId: number;
  origin: string;
}

export interface CaptureRequest {
  rect: CaptureRect;
  devicePixelRatio: number;
}

export interface ScreenshotServiceDeps {
  store: CaptureStore;
  captureVisibleTab: (windowId: number) => Promise<string>;
  crop: ImageCropper;
  getTab: (tabId: number) => Promise<CaptureTab | null>;
  wait: (milliseconds: number) => Promise<void>;
  now?: () => number;
  minIntervalMs?: number;
}

export interface ScreenshotService {
  capture: (
    sender: CaptureSender,
    request: CaptureRequest,
  ) => Promise<MessageResult<CapturedScreenshot>>;
}

function originOf(url: string | undefined): string | null {
  const parsed = url === undefined ? null : URL.parse(url);
  return parsed === null ? null : parsed.origin;
}

function isShowing(tab: CaptureTab | null, sender: CaptureSender): boolean {
  return (
    tab !== null &&
    tab.active &&
    tab.windowId === sender.windowId &&
    originOf(tab.url) === sender.origin
  );
}

export function createScreenshotService(deps: ScreenshotServiceDeps): ScreenshotService {
  const now = deps.now ?? Date.now;
  const minInterval = deps.minIntervalMs ?? CAPTURE_MIN_INTERVAL_MS;
  let queue: Promise<unknown> = Promise.resolve();
  let waiting = 0;
  let lastCallAt = Number.NEGATIVE_INFINITY;

  async function run(
    sender: CaptureSender,
    request: CaptureRequest,
  ): Promise<MessageResult<CapturedScreenshot>> {
    try {
      if (!isShowing(await deps.getTab(sender.tabId), sender)) {
        return failure("capture_failed");
      }
      const elapsed = now() - lastCallAt;
      if (elapsed < minInterval) {
        await deps.wait(minInterval - elapsed);
      }
      lastCallAt = now();
      const dataUrl = await deps.captureVisibleTab(sender.windowId);
      if (!isShowing(await deps.getTab(sender.tabId), sender)) {
        return failure("capture_failed");
      }
      const image = await deps.crop(dataUrl, request);
      const captureId = deps.store.add(image);
      return success({ captureId, width: image.width, height: image.height });
    } catch {
      return failure("capture_failed");
    }
  }

  return {
    capture: (sender, request) => {
      if (waiting >= CAPTURE_QUEUE_LIMIT) {
        return Promise.resolve(failure("rate_limited"));
      }
      waiting += 1;
      const result = queue.then(() => run(sender, request));
      queue = result.finally(() => {
        waiting -= 1;
      });
      return result;
    },
  };
}
