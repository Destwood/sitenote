import { describe, expect, it } from "vitest";

import {
  ANCHOR_GAP,
  VIEWPORT_MARGIN,
  placeAbove,
  placePanel,
  type AnchorRect,
  type PanelPlacement,
  type Size,
} from ".";

const VIEWPORT: Size = { width: 1000, height: 800 };
const PANEL: Size = { width: 320, height: 300 };

function anchorAt(x: number, y: number, width = 24, height = 24): AnchorRect {
  return { x, y, width, height };
}

describe("placePanel", () => {
  const cases: {
    name: string;
    anchor: AnchorRect;
    viewport: Size;
    expected: PanelPlacement;
  }[] = [
    {
      name: "opens to the right of the anchor when there is room",
      anchor: anchorAt(100, 100),
      viewport: VIEWPORT,
      expected: { left: 132, top: 100, side: "right" },
    },
    {
      name: "flips to the left near the right edge",
      anchor: anchorAt(900, 100),
      viewport: VIEWPORT,
      expected: { left: 900 - ANCHOR_GAP - 320, top: 100, side: "left" },
    },
    {
      name: "clamps the top when the panel would overflow the bottom edge",
      anchor: anchorAt(100, 700),
      viewport: VIEWPORT,
      expected: { left: 132, top: 800 - 300 - VIEWPORT_MARGIN, side: "right" },
    },
    {
      name: "clamps the top to the margin when the anchor is above the viewport",
      anchor: anchorAt(100, -50),
      viewport: VIEWPORT,
      expected: { left: 132, top: VIEWPORT_MARGIN, side: "right" },
    },
    {
      name: "places the panel below the anchor when neither side fits",
      anchor: anchorAt(200, 100),
      viewport: { width: 400, height: 800 },
      expected: { left: 52, top: 100 + 24 + ANCHOR_GAP, side: "below" },
    },
    {
      name: "places the panel above the anchor when neither side nor below fits",
      anchor: anchorAt(200, 600),
      viewport: { width: 400, height: 800 },
      expected: { left: 52, top: 600 - ANCHOR_GAP - 300, side: "above" },
    },
    {
      name: "clamps horizontally on a narrow viewport",
      anchor: anchorAt(10, 100),
      viewport: { width: 340, height: 800 },
      expected: { left: VIEWPORT_MARGIN, top: 100 + 24 + ANCHOR_GAP, side: "below" },
    },
    {
      name: "keeps the panel inside the viewport when there is no room above or below",
      anchor: anchorAt(200, 150),
      viewport: { width: 400, height: 320 },
      expected: { left: 52, top: 320 - 300 - VIEWPORT_MARGIN, side: "below" },
    },
  ];

  it.each(cases)("$name", ({ anchor, viewport, expected }) => {
    expect(placePanel(anchor, PANEL, viewport)).toEqual(expected);
  });

  it("never returns a position outside the viewport for any anchor on a grid", () => {
    for (const viewport of [VIEWPORT, { width: 360, height: 640 }, { width: 600, height: 340 }]) {
      for (let x = -30; x <= viewport.width + 30; x += 37) {
        for (let y = -30; y <= viewport.height + 30; y += 41) {
          const { left, top } = placePanel(anchorAt(x, y), PANEL, viewport);

          expect(left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
          expect(top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
          expect(left + PANEL.width).toBeLessThanOrEqual(viewport.width - VIEWPORT_MARGIN);
          expect(top + PANEL.height).toBeLessThanOrEqual(viewport.height - VIEWPORT_MARGIN);
        }
      }
    }
  });

  it("pins the panel to the margin when it is larger than the viewport", () => {
    expect(placePanel(anchorAt(10, 10), PANEL, { width: 200, height: 200 })).toEqual({
      left: VIEWPORT_MARGIN,
      top: VIEWPORT_MARGIN,
      side: "below",
    });
  });
});

describe("placeAbove", () => {
  const element: Size = { width: 96, height: 32 };

  it("centres the element above the anchor", () => {
    expect(placeAbove({ x: 200, y: 200, width: 100, height: 20 }, element, VIEWPORT)).toEqual({
      left: 202,
      top: 200 - ANCHOR_GAP - 32,
    });
  });

  it("flips below the anchor when there is no room above", () => {
    expect(placeAbove({ x: 200, y: 10, width: 100, height: 20 }, element, VIEWPORT)).toEqual({
      left: 202,
      top: 10 + 20 + ANCHOR_GAP,
    });
  });

  it("clamps to the left and right edges", () => {
    expect(placeAbove({ x: 0, y: 200, width: 20, height: 20 }, element, VIEWPORT).left).toBe(
      VIEWPORT_MARGIN,
    );
    expect(placeAbove({ x: 990, y: 200, width: 20, height: 20 }, element, VIEWPORT).left).toBe(
      1000 - 96 - VIEWPORT_MARGIN,
    );
  });

  it("clamps the flipped position to the bottom edge", () => {
    expect(placeAbove({ x: 200, y: 10, width: 100, height: 790 }, element, VIEWPORT).top).toBe(
      800 - 32 - VIEWPORT_MARGIN,
    );
  });
});
