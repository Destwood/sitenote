import { afterEach, describe, expect, it } from "vitest";

import { MAX_Z_INDEX, effectiveZIndex, zIndexAbove } from ".";

afterEach(() => {
  document.body.innerHTML = "";
});

function build(html: string): HTMLElement {
  document.body.innerHTML = html;
  const target = document.getElementById("target");
  if (!(target instanceof HTMLElement)) {
    throw new Error("target missing");
  }
  return target;
}

describe("effectiveZIndex", () => {
  it("returns 0 when no element in the chain has a numeric z-index", () => {
    const target = build('<div><section><p id="target">x</p></section></div>');

    expect(effectiveZIndex(target, window)).toBe(0);
  });

  it("takes the highest z-index among the element and its ancestors", () => {
    const target = build(
      '<header style="z-index: 900"><div style="z-index: 40"><span id="target" style="z-index: 12">x</span></div></header>',
    );

    expect(effectiveZIndex(target, window)).toBe(900);
  });

  it("uses the element's own z-index when it is the highest", () => {
    const target = build(
      '<div style="z-index: 5"><span id="target" style="z-index: 77">x</span></div>',
    );

    expect(effectiveZIndex(target, window)).toBe(77);
  });

  it("ignores auto values", () => {
    const target = build(
      '<div style="z-index: 3"><span id="target" style="z-index: auto">x</span></div>',
    );

    expect(effectiveZIndex(target, window)).toBe(3);
  });

  it("takes the z-index of a plain ancestor", () => {
    const target = build('<div style="z-index: 2147483000"><p id="target">x</p></div>');

    expect(effectiveZIndex(target, window)).toBe(2147483000);
  });

  it("returns 0 for a detached element", () => {
    const element = document.createElement("div");
    element.style.zIndex = "50";

    expect(effectiveZIndex(element, window)).toBe(0);
  });
});

describe("zIndexAbove", () => {
  it("returns one above the anchor when that exceeds the base", () => {
    expect(zIndexAbove(2147483040, 2147483500)).toBe(2147483501);
  });

  it("keeps the base when the anchor is lower", () => {
    expect(zIndexAbove(2147483040, 10)).toBe(2147483040);
    expect(zIndexAbove(2147483040, 2147483039)).toBe(2147483040);
  });

  it("caps at the maximum z-index", () => {
    expect(zIndexAbove(2147483040, MAX_Z_INDEX)).toBe(MAX_Z_INDEX);
  });
});
