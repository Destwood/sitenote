import { createElementAnchor, createTextAnchor } from "@sitenote/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ORPHANED,
  isTargetAlive,
  measureTarget,
  observableElement,
  resolveAnchor,
  type AnchorTarget,
} from ".";

function rectOf(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

beforeEach(() => {
  document.body.innerHTML =
    '<main><h1 id="title">Hello there</h1><p id="copy">The quick brown fox jumps over the lazy dog.</p></main>';
});

afterEach(() => {
  document.body.innerHTML = "";
});

function textRange(): Range {
  const node = document.querySelector("#copy")?.firstChild;
  if (node === null || node === undefined) {
    throw new Error("missing text");
  }
  const range = document.createRange();
  range.setStart(node, 4);
  range.setEnd(node, 19);
  return range;
}

describe("resolveAnchor", () => {
  it("resolves an element anchor to the element and keeps the offset", () => {
    const title = document.querySelector("#title");
    if (title === null) {
      throw new Error("missing title");
    }
    const anchor = createElementAnchor(title, { clientX: 0, clientY: 0 });

    const resolution = resolveAnchor(anchor, document);

    expect(resolution).toEqual({
      status: "resolved",
      target: { kind: "element", element: title, offset: anchor.offset },
    });
  });

  it("resolves a text anchor to a range with the quoted text", () => {
    const anchor = createTextAnchor(textRange(), document);
    if (anchor === null) {
      throw new Error("no anchor");
    }

    const resolution = resolveAnchor(anchor, document);

    expect(resolution.status).toBe("resolved");
    expect(resolution.status === "resolved" && resolution.target.kind).toBe("text");
    expect(
      resolution.status === "resolved" && resolution.target.kind === "text"
        ? resolution.target.range.toString()
        : "",
    ).toBe("quick brown fox");
  });

  it("orphans an element anchor whose element is gone", () => {
    const title = document.querySelector("#title");
    if (title === null) {
      throw new Error("missing title");
    }
    const anchor = createElementAnchor(title, { clientX: 0, clientY: 0 });
    title.remove();

    expect(resolveAnchor(anchor, document)).toBe(ORPHANED);
  });

  it("orphans a text anchor whose text is gone", () => {
    const anchor = createTextAnchor(textRange(), document);
    if (anchor === null) {
      throw new Error("no anchor");
    }
    document.querySelector("#copy")?.remove();

    expect(resolveAnchor(anchor, document)).toBe(ORPHANED);
  });
});

describe("isTargetAlive", () => {
  it("is true for an attached element and false after it is removed", () => {
    const element = document.querySelector("#title");
    if (element === null) {
      throw new Error("missing title");
    }
    const target: AnchorTarget = { kind: "element", element, offset: { x: 0, y: 0 } };

    expect(isTargetAlive(target)).toBe(true);
    element.remove();
    expect(isTargetAlive(target)).toBe(false);
  });

  it("is true for a range with text and false once the range collapses", () => {
    const range = textRange();
    const target: AnchorTarget = { kind: "text", range };

    expect(isTargetAlive(target)).toBe(true);
    document.querySelector("#copy")?.remove();
    expect(isTargetAlive(target)).toBe(false);
  });

  it("is false for a collapsed range", () => {
    const range = textRange();
    range.collapse();

    expect(isTargetAlive({ kind: "text", range })).toBe(false);
  });
});

describe("observableElement", () => {
  it("returns the element itself for an element target", () => {
    const element = document.querySelector("#title");
    if (element === null) {
      throw new Error("missing title");
    }

    expect(observableElement({ kind: "element", element, offset: { x: 0, y: 0 } })).toBe(element);
  });

  it("returns the parent element of a range inside a single text node", () => {
    expect(observableElement({ kind: "text", range: textRange() })).toBe(
      document.querySelector("#copy"),
    );
  });

  it("returns the common ancestor element of a range across elements", () => {
    const range = document.createRange();
    range.setStart(document.querySelector("#title")?.firstChild ?? document.body, 0);
    range.setEnd(document.querySelector("#copy")?.firstChild ?? document.body, 3);

    expect(observableElement({ kind: "text", range })).toBe(document.querySelector("main"));
  });
});

describe("measureTarget", () => {
  it("places an element pin at the offset inside the element rectangle", () => {
    const element = document.querySelector("#title");
    if (element === null) {
      throw new Error("missing title");
    }
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rectOf(100, 200, 200, 40));
    vi.spyOn(element, "getClientRects").mockReturnValue([
      rectOf(100, 200, 200, 40),
    ] as unknown as DOMRectList);

    const measurement = measureTarget({ kind: "element", element, offset: { x: 0.25, y: 0.5 } });

    expect(measurement).toEqual({
      x: 150,
      y: 220,
      rect: { x: 100, y: 200, width: 200, height: 40 },
      rects: [],
      hidden: false,
    });
  });

  it("marks an element without boxes as hidden", () => {
    const element = document.querySelector("#title");
    if (element === null) {
      throw new Error("missing title");
    }
    vi.spyOn(element, "getClientRects").mockReturnValue([] as unknown as DOMRectList);

    expect(measureTarget({ kind: "element", element, offset: { x: 0, y: 0 } }).hidden).toBe(true);
  });

  it("places a text pin at the end of the first client rectangle", () => {
    const range = textRange();
    vi.spyOn(range, "getClientRects").mockReturnValue([
      rectOf(50, 80, 120, 18),
      rectOf(50, 98, 60, 18),
    ] as unknown as DOMRectList);
    vi.spyOn(range, "getBoundingClientRect").mockReturnValue(rectOf(50, 80, 120, 36));

    const measurement = measureTarget({ kind: "text", range });

    expect(measurement.x).toBe(170);
    expect(measurement.y).toBe(80);
    expect(measurement.rect).toEqual({ x: 50, y: 80, width: 120, height: 36 });
    expect(measurement.rects).toHaveLength(2);
    expect(measurement.hidden).toBe(false);
  });

  it("marks a text range without client rectangles as hidden", () => {
    const range = textRange();
    vi.spyOn(range, "getClientRects").mockReturnValue([] as unknown as DOMRectList);
    vi.spyOn(range, "getBoundingClientRect").mockReturnValue(rectOf(0, 0, 0, 0));

    expect(measureTarget({ kind: "text", range }).hidden).toBe(true);
  });
});
