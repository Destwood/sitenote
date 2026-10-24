import type { CaptureRect } from "@sitenote/widget";
import { domToCanvas } from "modern-screenshot";

export const SCREENSHOT_BUCKET = "screenshots";
export const SCREENSHOT_PADDING = 16;
export const SCREENSHOT_QUALITY = 0.9;
export const SCREENSHOT_TYPE = "image/webp";

export interface DemoCapture {
  blob: Blob;
  width: number;
  height: number;
}

export interface DemoScreenshots {
  capture: (rect: CaptureRect, devicePixelRatio: number) => Promise<DemoCapture>;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropRegion(rect: CaptureRect, viewport: Viewport, scale: number): PixelRegion {
  const left = Math.max(0, Math.floor(rect.x - SCREENSHOT_PADDING));
  const top = Math.max(0, Math.floor(rect.y - SCREENSHOT_PADDING));
  const right = Math.max(
    left + 1,
    Math.min(viewport.width, Math.ceil(rect.x + rect.width + SCREENSHOT_PADDING)),
  );
  const bottom = Math.max(
    top + 1,
    Math.min(viewport.height, Math.ceil(rect.y + rect.height + SCREENSHOT_PADDING)),
  );
  const x = Math.floor(left * scale);
  const y = Math.floor(top * scale);
  return {
    x,
    y,
    width: Math.max(1, Math.ceil(right * scale) - x),
    height: Math.max(1, Math.ceil(bottom * scale) - y),
  };
}

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error("The screenshot could not be encoded."));
        } else {
          resolve(blob);
        }
      },
      SCREENSHOT_TYPE,
      SCREENSHOT_QUALITY,
    );
  });
}

export function createDemoScreenshots(deps: { win: Window; doc: Document }): DemoScreenshots {
  const { win, doc } = deps;
  return {
    capture: async (rect, devicePixelRatio) => {
      const viewport = { width: win.innerWidth, height: win.innerHeight };
      const page = await domToCanvas(doc.documentElement, {
        width: viewport.width,
        height: viewport.height,
        scale: devicePixelRatio,
        style: { transform: `translate(${String(-win.scrollX)}px, ${String(-win.scrollY)}px)` },
      });
      const region = cropRegion(rect, viewport, devicePixelRatio);
      const target = doc.createElement("canvas");
      target.width = region.width;
      target.height = region.height;
      const context = target.getContext("2d");
      if (context === null) {
        throw new Error("A 2D canvas context is not available.");
      }
      context.drawImage(
        page,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height,
      );
      return { blob: await encode(target), width: region.width, height: region.height };
    },
  };
}
