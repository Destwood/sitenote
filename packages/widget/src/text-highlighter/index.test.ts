import { afterEach, describe, expect, it, vi } from "vitest";

import { HIGHLIGHT_CSS, HIGHLIGHT_NAME, createTextHighlighter, isHighlightApiAvailable } from ".";

class FakeHighlight {
  readonly ranges: Range[];
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

class FakeSheet {
  text = "";
  replaceSync(css: string): void {
    this.text = css;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "adoptedStyleSheets");
});

function stubApi(): Map<string, FakeHighlight> {
  const registry = new Map<string, FakeHighlight>();
  vi.stubGlobal("CSS", { highlights: registry });
  vi.stubGlobal("Highlight", FakeHighlight);
  vi.stubGlobal("CSSStyleSheet", FakeSheet);
  Object.defineProperty(document, "adoptedStyleSheets", {
    configurable: true,
    writable: true,
    value: [],
  });
  return registry;
}

function rangeOf(text: string): Range {
  const node = document.createTextNode(text);
  document.body.append(node);
  const range = document.createRange();
  range.selectNodeContents(node);
  return range;
}

describe("isHighlightApiAvailable", () => {
  it("is false without the registry and true with it", () => {
    vi.stubGlobal("CSS", {});
    vi.stubGlobal("Highlight", undefined);
    expect(isHighlightApiAvailable()).toBe(false);

    stubApi();
    expect(isHighlightApiAvailable()).toBe(true);
  });
});

describe("createTextHighlighter", () => {
  it("registers the ranges under one name and installs the stylesheet once", () => {
    const registry = stubApi();
    const highlighter = createTextHighlighter(document);
    const first = rangeOf("one");
    const second = rangeOf("two");

    highlighter.set([first]);
    highlighter.set([first, second]);

    expect(highlighter.supported).toBe(true);
    expect(registry.get(HIGHLIGHT_NAME)?.ranges).toEqual([first, second]);
    expect(document.adoptedStyleSheets).toHaveLength(1);
    expect((document.adoptedStyleSheets[0] as unknown as FakeSheet).text).toBe(HIGHLIGHT_CSS);
  });

  it("removes the registration when there is nothing to highlight", () => {
    const registry = stubApi();
    const highlighter = createTextHighlighter(document);
    highlighter.set([rangeOf("one")]);

    highlighter.set([]);

    expect(registry.has(HIGHLIGHT_NAME)).toBe(false);
  });

  it("clears the registration and the stylesheet on dispose", () => {
    const registry = stubApi();
    const highlighter = createTextHighlighter(document);
    highlighter.set([rangeOf("one")]);

    highlighter.dispose();

    expect(registry.size).toBe(0);
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it("does nothing when the Custom Highlight API is missing", () => {
    vi.stubGlobal("CSS", {});
    vi.stubGlobal("Highlight", undefined);
    const highlighter = createTextHighlighter(document);

    expect(highlighter.supported).toBe(false);
    expect(() => {
      highlighter.set([rangeOf("one")]);
      highlighter.dispose();
    }).not.toThrow();
  });
});
