export interface Size {
  width: number;
  height: number;
}

export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PanelSide = "right" | "left" | "below" | "above";

export interface PanelPlacement {
  left: number;
  top: number;
  side: PanelSide;
}

export const VIEWPORT_MARGIN = 8;
export const ANCHOR_GAP = 8;

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function placePanel(anchor: AnchorRect, panel: Size, viewport: Size): PanelPlacement {
  const maxLeft = viewport.width - panel.width - VIEWPORT_MARGIN;
  const maxTop = viewport.height - panel.height - VIEWPORT_MARGIN;
  const top = clamp(anchor.y, VIEWPORT_MARGIN, maxTop);

  const rightLeft = anchor.x + anchor.width + ANCHOR_GAP;
  if (rightLeft <= maxLeft) {
    return { left: Math.max(rightLeft, VIEWPORT_MARGIN), top, side: "right" };
  }

  const leftLeft = anchor.x - ANCHOR_GAP - panel.width;
  if (leftLeft >= VIEWPORT_MARGIN) {
    return { left: clamp(leftLeft, VIEWPORT_MARGIN, maxLeft), top, side: "left" };
  }

  const left = clamp(anchor.x + anchor.width / 2 - panel.width / 2, VIEWPORT_MARGIN, maxLeft);
  const belowTop = anchor.y + anchor.height + ANCHOR_GAP;
  if (belowTop >= VIEWPORT_MARGIN && belowTop <= maxTop) {
    return { left, top: belowTop, side: "below" };
  }

  const aboveTop = anchor.y - ANCHOR_GAP - panel.height;
  if (aboveTop >= VIEWPORT_MARGIN && aboveTop <= maxTop) {
    return { left, top: aboveTop, side: "above" };
  }

  return { left, top: clamp(belowTop, VIEWPORT_MARGIN, maxTop), side: "below" };
}

export function placeAbove(
  anchor: AnchorRect,
  element: Size,
  viewport: Size,
): { left: number; top: number } {
  const maxLeft = viewport.width - element.width - VIEWPORT_MARGIN;
  const maxTop = viewport.height - element.height - VIEWPORT_MARGIN;
  const left = clamp(anchor.x + anchor.width / 2 - element.width / 2, VIEWPORT_MARGIN, maxLeft);
  const aboveTop = anchor.y - ANCHOR_GAP - element.height;
  if (aboveTop >= VIEWPORT_MARGIN && aboveTop <= maxTop) {
    return { left, top: aboveTop };
  }
  return { left, top: clamp(anchor.y + anchor.height + ANCHOR_GAP, VIEWPORT_MARGIN, maxTop) };
}
