import { afterEach, describe, expect, it, vi } from "vitest";

import { createDocumentStyle } from ".";

const CSS_TEXT = "html { cursor: crosshair; }";

class FakeSheet {
  text = "";
  replaceSync(css: string): void {
    this.text = css;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
  Reflect.deleteProperty(document, "adoptedStyleSheets");
});

function stubAdoption(): void {
  vi.stubGlobal("CSSStyleSheet", FakeSheet);
  Object.defineProperty(document, "adoptedStyleSheets", {
    configurable: true,
    writable: true,
    value: [],
  });
}

function stubFailingAdoption(): void {
  vi.stubGlobal("CSSStyleSheet", FakeSheet);
  Object.defineProperty(document, "adoptedStyleSheets", {
    configurable: true,
    get: () => [],
    set: () => {
      throw new TypeError("blocked");
    },
  });
}

describe("createDocumentStyle", () => {
  it("adopts a constructed stylesheet and removes it again", () => {
    stubAdoption();
    const style = createDocumentStyle(document, CSS_TEXT);

    expect(style.attach()).toBe("adopted");
    expect(document.adoptedStyleSheets).toHaveLength(1);
    expect((document.adoptedStyleSheets[0] as unknown as FakeSheet).text).toBe(CSS_TEXT);
    expect(document.head.querySelector("style")).toBeNull();

    style.detach();
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it("attaches only once until it is detached", () => {
    stubAdoption();
    const style = createDocumentStyle(document, CSS_TEXT);

    style.attach();
    style.attach();

    expect(document.adoptedStyleSheets).toHaveLength(1);
  });

  it("can be attached again after detaching and reuses the sheet", () => {
    stubAdoption();
    const style = createDocumentStyle(document, CSS_TEXT);
    style.attach();
    const first = document.adoptedStyleSheets[0];
    style.detach();

    style.attach();

    expect(document.adoptedStyleSheets).toEqual([first]);
  });

  it("leaves other adopted stylesheets alone", () => {
    stubAdoption();
    const other = new FakeSheet() as unknown as CSSStyleSheet;
    document.adoptedStyleSheets = [other];
    const style = createDocumentStyle(document, CSS_TEXT);

    style.attach();
    style.detach();

    expect(document.adoptedStyleSheets).toEqual([other]);
  });

  it("falls back to a style element when adoption is not possible", () => {
    stubFailingAdoption();
    const style = createDocumentStyle(document, CSS_TEXT);

    expect(style.attach()).toBe("element");
    expect(document.head.querySelector("style")?.textContent).toBe(CSS_TEXT);

    style.detach();
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("does nothing when detached without being attached", () => {
    stubAdoption();

    expect(() => {
      createDocumentStyle(document, CSS_TEXT).detach();
    }).not.toThrow();
  });
});
