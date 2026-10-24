import { pinPosition, resolveElementAnchor, resolveTextAnchor, type Anchor } from "@sitenote/core";
import type { AnchorRect } from "@sitenote/ui";

export type AnchorTarget =
  | { kind: "element"; element: Element; offset: { x: number; y: number } }
  | { kind: "text"; range: Range };

export type Resolution = { status: "resolved"; target: AnchorTarget } | { status: "orphaned" };

export interface TargetMeasurement {
  x: number;
  y: number;
  rect: AnchorRect;
  rects: AnchorRect[];
  hidden: boolean;
}

export const ORPHANED: Resolution = { status: "orphaned" };

function toRect(rect: DOMRectReadOnly): AnchorRect {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

export function resolveAnchor(anchor: Anchor, doc: Document = document): Resolution {
  if (anchor.kind === "element") {
    const result = resolveElementAnchor(anchor, doc);
    return result.status === "resolved"
      ? {
          status: "resolved",
          target: { kind: "element", element: result.element, offset: anchor.offset },
        }
      : ORPHANED;
  }
  const result = resolveTextAnchor(anchor, doc);
  return result.status === "resolved"
    ? { status: "resolved", target: { kind: "text", range: result.range } }
    : ORPHANED;
}

export function isTargetAlive(target: AnchorTarget): boolean {
  if (target.kind === "element") {
    return target.element.isConnected;
  }
  const { range } = target;
  return !range.collapsed && range.startContainer.isConnected && range.endContainer.isConnected;
}

export function observableElement(target: AnchorTarget): Element | null {
  if (target.kind === "element") {
    return target.element;
  }
  const ancestor = target.range.commonAncestorContainer;
  return ancestor.nodeType === Node.ELEMENT_NODE ? (ancestor as Element) : ancestor.parentElement;
}

export function measureTarget(target: AnchorTarget): TargetMeasurement {
  if (target.kind === "element") {
    const { x, y } = pinPosition(target.element, target.offset);
    return {
      x,
      y,
      rect: toRect(target.element.getBoundingClientRect()),
      rects: [],
      hidden: target.element.getClientRects().length === 0,
    };
  }
  const list = [...target.range.getClientRects()];
  const first = list[0];
  const rect = toRect(target.range.getBoundingClientRect());
  return {
    x: first === undefined ? rect.x : first.right,
    y: first === undefined ? rect.y : first.top,
    rect,
    rects: list.map(toRect),
    hidden: first === undefined,
  };
}
