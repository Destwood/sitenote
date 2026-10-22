import type { CapturedImage } from "../capture-store";
import type { CaptureRect } from "../transport";

export const CROP_PADDING = 16;
export const WEBP_QUALITY = 0.85;

export interface CropInput {
  rect: CaptureRect;
  devicePixelRatio: number;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeCropRegion(
  input: CropInput,
  image: { width: number; height: number },
  padding: number = CROP_PADDING,
): CropRegion | null {
  const { rect, devicePixelRatio: scale } = input;
  const left = Math.max(0, Math.round((rect.x - padding) * scale));
  const top = Math.max(0, Math.round((rect.y - padding) * scale));
  const right = Math.min(image.width, Math.round((rect.x + rect.width + padding) * scale));
  const bottom = Math.min(image.height, Math.round((rect.y + rect.height + padding) * scale));
  if (right - left < 1 || bottom - top < 1) {
    return null;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export type ImageCropper = (dataUrl: string, input: CropInput) => Promise<CapturedImage>;

export const cropDataUrl: ImageCropper = async (dataUrl, input) => {
  const source = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(source);
  try {
    const region = computeCropRegion(input, bitmap);
    if (region === null) {
      throw new Error("The area to capture is outside the visible page");
    }
    const canvas = new OffscreenCanvas(region.width, region.height);
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("A 2d canvas is not available");
    }
    context.drawImage(
      bitmap,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      region.width,
      region.height,
    );
    let blob = await canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
    if (blob.type !== "image/webp") {
      blob = await canvas.convertToBlob({ type: "image/png" });
    }
    return { blob, width: region.width, height: region.height };
  } finally {
    bitmap.close();
  }
};
