import { afterEach, describe, expect, it } from "vitest";

import { SITENOTE_ROOT_TAG } from "../../overlay";
import { query, renderHtml } from "../fixtures";
import {
  buildTextModel,
  elementTextBounds,
  isInsideIgnoredElement,
  offsetToPoint,
  offsetsToRange,
  pointToOffset,
  rangeToOffsets,
  readCollapsedText,
} from ".";

afterEach(() => {
  document.body.innerHTML = "";
});

function renderSample(): void {
  renderHtml(
    `<h1>Title</h1><p id="p">Hello <b>big</b> world</p><script>var hidden = 1;</script>` +
      `<style>.x { color: red; }</style><noscript>no script</noscript>` +
      `<template><i>template text</i></template><textarea>typed text</textarea><p id="q">End</p>`,
  );
}

describe("buildTextModel", () => {
  it("concatenates raw text node data in document order", () => {
    renderSample();
    expect(buildTextModel(document.body).text).toBe("TitleHello big worldEnd");
  });

  it("skips script, style, noscript, template and textarea content", () => {
    renderSample();
    const { text } = buildTextModel(document.body);
    for (const hidden of ["hidden", "color", "no script", "template text", "typed text"]) {
      expect(text).not.toContain(hidden);
    }
  });

  it("skips the Sitenote host including its light DOM and shadow root", () => {
    renderHtml(`<p>Page</p><${SITENOTE_ROOT_TAG}><span>light child</span></${SITENOTE_ROOT_TAG}>`);
    const host = query(SITENOTE_ROOT_TAG);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<p>shadow secret</p>";
    expect(buildTextModel(document.body).text).toBe("Page");
  });

  it("keeps whitespace exactly as it is in the DOM", () => {
    renderHtml("<p>  a\n  b  </p>");
    expect(buildTextModel(document.body).text).toBe("  a\n  b  ");
  });

  it("ignores empty text nodes", () => {
    renderHtml("<p></p>");
    const paragraph = query("p");
    paragraph.append(document.createTextNode(""), document.createTextNode("x"));
    const model = buildTextModel(document.body);
    expect(model.nodes).toHaveLength(1);
    expect(model.text).toBe("x");
  });

  it("returns an empty model for an ignored root and for a root without text", () => {
    renderSample();
    expect(buildTextModel(document.querySelector("script") ?? document.body).text).toBe("");
    renderHtml("<div></div>");
    expect(buildTextModel(document.body).text).toBe("");
  });

  it("can start from a text node", () => {
    renderHtml("<p>solo</p>");
    const textNode = query("p").firstChild;
    expect(textNode && buildTextModel(textNode).text).toBe("solo");
  });

  it("can start from the document", () => {
    renderHtml("<p>from document</p>");
    expect(buildTextModel(document).text).toContain("from document");
  });
});

describe("isInsideIgnoredElement", () => {
  it("detects ignored ancestors", () => {
    renderHtml(`<${SITENOTE_ROOT_TAG}><span id="s">x</span></${SITENOTE_ROOT_TAG}><p id="p">y</p>`);
    expect(isInsideIgnoredElement(query("#s"))).toBe(true);
    expect(isInsideIgnoredElement(query("#p"))).toBe(false);
  });
});

describe("offsetToPoint and pointToOffset", () => {
  it("maps offsets to text nodes and back", () => {
    renderSample();
    const model = buildTextModel(document.body);
    for (let offset = 0; offset <= model.text.length; offset += 1) {
      const point = offsetToPoint(model, offset, "start");
      expect(point).not.toBeNull();
      if (point) {
        expect(pointToOffset(model, point.node, point.offset)).toBe(offset);
      }
    }
  });

  it("prefers the following node for start and the preceding node for end at a boundary", () => {
    renderHtml("<p>ab<b>cd</b></p>");
    const model = buildTextModel(document.body);
    expect(offsetToPoint(model, 2, "start")).toEqual({ node: model.nodes[1], offset: 0 });
    expect(offsetToPoint(model, 2, "end")).toEqual({ node: model.nodes[0], offset: 2 });
    expect(offsetToPoint(model, 0, "end")).toEqual({ node: model.nodes[0], offset: 0 });
    expect(offsetToPoint(model, 4, "start")).toEqual({ node: model.nodes[1], offset: 2 });
    expect(offsetToPoint(model, 4, "end")).toEqual({ node: model.nodes[1], offset: 2 });
  });

  it("rejects offsets outside the text and models without text", () => {
    renderHtml("<p>abc</p>");
    const model = buildTextModel(document.body);
    expect(offsetToPoint(model, -1, "start")).toBeNull();
    expect(offsetToPoint(model, 4, "start")).toBeNull();
    expect(offsetToPoint(model, 1.5, "start")).toBeNull();
    renderHtml("<div></div>");
    expect(offsetToPoint(buildTextModel(document.body), 0, "start")).toBeNull();
  });

  it("accepts a root node in place of a model", () => {
    renderHtml("<p>abc</p>");
    expect(offsetToPoint(document.body, 1, "start")?.offset).toBe(1);
  });

  it("maps element boundary points to the next included text node", () => {
    renderHtml(`<div id="d"><p>one</p><p id="two">two</p><p>three</p></div>`);
    const model = buildTextModel(document.body);
    const container = query("#d");
    expect(pointToOffset(model, container, 0)).toBe(0);
    expect(pointToOffset(model, container, 1)).toBe(3);
    expect(pointToOffset(model, container, 2)).toBe(6);
    expect(pointToOffset(model, container, 3)).toBe(model.text.length);
    expect(pointToOffset(model, query("#two"), 0)).toBe(3);
    expect(pointToOffset(model, query("#two"), 1)).toBe(6);
  });

  it("maps text nodes outside the model to the next included offset", () => {
    renderHtml(`<p>one</p><textarea id="t">hidden</textarea><p>two</p>`);
    const model = buildTextModel(document.body);
    const hidden = query("#t").firstChild;
    expect(hidden && pointToOffset(model, hidden, 2)).toBe(3);
  });

  it("returns the full length when the point is after all text", () => {
    renderHtml(`<p>one</p><div id="after"></div>`);
    const model = buildTextModel(document.body);
    expect(pointToOffset(model, query("#after"), 0)).toBe(3);
  });
});

describe("elementTextBounds", () => {
  it("returns the text span covered by an element", () => {
    renderHtml(`<p>aa</p><section id="s"><p>bb</p><p>cc</p></section><p>dd</p>`);
    expect(elementTextBounds(document.body, query("#s"))).toEqual({ start: 2, end: 6 });
  });

  it("returns an empty span for an element without text", () => {
    renderHtml(`<p>aa</p><div id="e"></div><p>bb</p>`);
    expect(elementTextBounds(document.body, query("#e"))).toEqual({ start: 2, end: 2 });
  });
});

describe("rangeToOffsets and offsetsToRange", () => {
  it("converts a range inside one text node", () => {
    renderHtml("<p>hello world</p>");
    const range = document.createRange();
    const node = query("p").firstChild;
    expect(node).not.toBeNull();
    if (!node) {
      return;
    }
    range.setStart(node, 6);
    range.setEnd(node, 11);
    expect(rangeToOffsets(range, document.body)).toEqual({ start: 6, end: 11 });
  });

  it("converts a range that spans several elements", () => {
    renderHtml(`<p>Hello <b>big</b> world</p>`);
    const range = document.createRange();
    const first = query("p").firstChild;
    const last = query("p").lastChild;
    if (!first || !last) {
      throw new Error("missing nodes");
    }
    range.setStart(first, 3);
    range.setEnd(last, 3);
    expect(rangeToOffsets(range, document.body)).toEqual({ start: 3, end: 12 });
    const back = offsetsToRange(3, 12, document.body);
    expect(back?.toString()).toBe("lo big wo");
  });

  it("converts ranges whose boundaries are element positions", () => {
    renderHtml(`<div id="d"><p>one</p><p>two</p></div>`);
    const range = document.createRange();
    range.selectNodeContents(query("#d"));
    expect(rangeToOffsets(range, document.body)).toEqual({ start: 0, end: 6 });
  });

  it("returns null for collapsed ranges and ranges outside the root", () => {
    renderHtml(`<p id="in">inside</p><p id="out">outside</p>`);
    const collapsed = document.createRange();
    collapsed.setStart(query("#in"), 0);
    collapsed.collapse(true);
    expect(rangeToOffsets(collapsed, document.body)).toBeNull();
    const outside = document.createRange();
    outside.selectNodeContents(query("#out"));
    expect(rangeToOffsets(outside, query("#in"))).toBeNull();
  });

  it("returns null for invalid offsets", () => {
    renderHtml("<p>abc</p>");
    expect(offsetsToRange(2, 2, document.body)).toBeNull();
    expect(offsetsToRange(2, 1, document.body)).toBeNull();
    expect(offsetsToRange(0, 4, document.body)).toBeNull();
    expect(offsetsToRange(-1, 2, document.body)).toBeNull();
  });

  it("round-trips every substring of a small document", () => {
    renderHtml("<p>ab<i>cd</i></p><p>ef</p>");
    const model = buildTextModel(document.body);
    for (let start = 0; start < model.text.length; start += 1) {
      for (let end = start + 1; end <= model.text.length; end += 1) {
        const range = offsetsToRange(start, end, model);
        expect(range?.toString()).toBe(model.text.slice(start, end));
        expect(range && rangeToOffsets(range, model)).toEqual({ start, end });
      }
    }
  });
});

describe("readCollapsedText", () => {
  it("collapses whitespace and trims", () => {
    renderHtml("<p>  Hello \n\n   <b>big</b>\t world  </p>");
    expect(readCollapsedText(document.body, 120)).toBe("Hello big world");
  });

  it("cuts at the limit without a trailing space", () => {
    renderHtml("<p>aaaa bbbb cccc dddd</p>");
    expect(readCollapsedText(document.body, 10)).toBe("aaaa bbbb");
    expect(readCollapsedText(document.body, 4)).toBe("aaaa");
  });

  it("stops reading once the limit is exceeded", () => {
    renderHtml(`<p>${"word ".repeat(1000)}</p><p>${"more ".repeat(1000)}</p>`);
    expect(readCollapsedText(document.body, 12)).toBe("word word wo");
  });

  it("ignores scripts, styles and the Sitenote host", () => {
    renderHtml(
      `<div id="d">a<script>x</script><style>y</style><${SITENOTE_ROOT_TAG}>z</${SITENOTE_ROOT_TAG}>b</div>`,
    );
    expect(readCollapsedText(query("#d"), 120)).toBe("ab");
  });

  it("returns an empty string for an element without text", () => {
    renderHtml("<div id='d'></div>");
    expect(readCollapsedText(query("#d"), 120)).toBe("");
  });
});
