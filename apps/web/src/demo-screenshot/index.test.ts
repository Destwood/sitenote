import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ domToCanvas: vi.fn() }));

vi.mock("modern-screenshot", () => ({ domToCanvas: mocks.domToCanvas }));

import { SCREENSHOT_PADDING, createDemoScreenshots, cropRegion } from ".";

const VIEWPORT = { width: 1000, height: 800 };

describe("cropRegion", () => {
  it("adds the padding around the rect and scales it to canvas pixels", () => {
    expect(cropRegion({ x: 100, y: 200, width: 50, height: 40 }, VIEWPORT, 2)).toEqual({
      x: (100 - SCREENSHOT_PADDING) * 2,
      y: (200 - SCREENSHOT_PADDING) * 2,
      width: (50 + 2 * SCREENSHOT_PADDING) * 2,
      height: (40 + 2 * SCREENSHOT_PADDING) * 2,
    });
  });

  it("clamps the region to the viewport", () => {
    expect(cropRegion({ x: -10, y: -10, width: 30, height: 30 }, VIEWPORT, 1)).toEqual({
      x: 0,
      y: 0,
      width: 36,
      height: 36,
    });
    expect(cropRegion({ x: 990, y: 790, width: 40, height: 40 }, VIEWPORT, 1)).toMatchObject({
      x: 974,
      y: 774,
      width: 1000 - 974,
      height: 800 - 774,
    });
  });

  it("never returns an empty region", () => {
    const region = cropRegion({ x: 5000, y: 5000, width: 0, height: 0 }, VIEWPORT, 1);
    expect(region.width).toBeGreaterThanOrEqual(1);
    expect(region.height).toBeGreaterThanOrEqual(1);
  });
});

function fakeDocument(context: { drawImage: ReturnType<typeof vi.fn> } | null) {
  const target = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: (callback: (blob: Blob | null) => void, type: string) => {
      callback(new Blob(["image"], { type }));
    },
  };
  return {
    target,
    doc: {
      documentElement: { tag: "html" },
      createElement: vi.fn(() => target),
    } as unknown as Document,
  };
}

describe("createDemoScreenshots", () => {
  it("renders the page at the device scale, crops the padded rect and encodes it as webp", async () => {
    const drawImage = vi.fn();
    const { target, doc } = fakeDocument({ drawImage });
    const page = { canvas: true };
    mocks.domToCanvas.mockResolvedValue(page);
    const win = { innerWidth: 1000, innerHeight: 800, scrollX: 0, scrollY: 120 } as Window;

    const capture = await createDemoScreenshots({ win, doc }).capture(
      { x: 100, y: 200, width: 50, height: 40 },
      2,
    );

    expect(mocks.domToCanvas).toHaveBeenCalledWith(
      { tag: "html" },
      expect.objectContaining({
        width: 1000,
        height: 800,
        scale: 2,
        style: { transform: "translate(0px, -120px)" },
      }),
    );
    expect(target.width).toBe(capture.width);
    expect(target.height).toBe(capture.height);
    expect(drawImage).toHaveBeenCalledWith(
      page,
      expect.any(Number),
      expect.any(Number),
      capture.width,
      capture.height,
      0,
      0,
      capture.width,
      capture.height,
    );
    expect(capture.blob.type).toBe("image/webp");
  });

  it("fails when the canvas has no 2d context", async () => {
    const { doc } = fakeDocument(null);
    mocks.domToCanvas.mockResolvedValue({});
    const win = { innerWidth: 1000, innerHeight: 800, scrollX: 0, scrollY: 0 } as Window;
    await expect(
      createDemoScreenshots({ win, doc }).capture({ x: 0, y: 0, width: 10, height: 10 }, 1),
    ).rejects.toThrow("A 2D canvas context is not available.");
  });
});
