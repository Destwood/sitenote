import { describe, expect, it } from "vitest";

import { CROP_PADDING, computeCropRegion } from ".";

const IMAGE = { width: 2880, height: 1800 };

describe("computeCropRegion", () => {
  it("adds sixteen css pixels on each side and scales by the device pixel ratio", () => {
    expect(
      computeCropRegion(
        { rect: { x: 100, y: 200, width: 300, height: 120 }, devicePixelRatio: 2 },
        IMAGE,
      ),
    ).toEqual({ x: 168, y: 368, width: 664, height: 304 });
  });

  it("uses the padding constant", () => {
    expect(CROP_PADDING).toBe(16);
    expect(
      computeCropRegion(
        { rect: { x: 100, y: 100, width: 100, height: 100 }, devicePixelRatio: 1 },
        IMAGE,
      ),
    ).toEqual({ x: 84, y: 84, width: 132, height: 132 });
  });

  it("clamps to the image on every side", () => {
    expect(
      computeCropRegion(
        { rect: { x: 4, y: 6, width: 30, height: 40 }, devicePixelRatio: 1 },
        { width: 50, height: 60 },
      ),
    ).toEqual({ x: 0, y: 0, width: 50, height: 60 });
  });

  it("clamps an element that is larger than the viewport", () => {
    expect(
      computeCropRegion(
        { rect: { x: -50, y: -50, width: 5000, height: 5000 }, devicePixelRatio: 2 },
        IMAGE,
      ),
    ).toEqual({ x: 0, y: 0, width: 2880, height: 1800 });
  });

  it("rounds fractional device pixels", () => {
    const region = computeCropRegion(
      { rect: { x: 10.4, y: 10.4, width: 100.3, height: 50.2 }, devicePixelRatio: 1.25 },
      IMAGE,
    );
    expect(region).not.toBeNull();
    expect(Number.isInteger(region?.x)).toBe(true);
    expect(Number.isInteger(region?.width)).toBe(true);
    expect(Number.isInteger(region?.height)).toBe(true);
  });

  it("returns null when the area is entirely outside the image", () => {
    expect(
      computeCropRegion(
        { rect: { x: 5000, y: 5000, width: 10, height: 10 }, devicePixelRatio: 1 },
        IMAGE,
      ),
    ).toBeNull();
    expect(
      computeCropRegion(
        { rect: { x: -500, y: 0, width: 100, height: 100 }, devicePixelRatio: 1 },
        IMAGE,
      ),
    ).toBeNull();
  });
});
