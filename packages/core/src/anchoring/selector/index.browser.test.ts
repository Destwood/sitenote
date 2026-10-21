import { afterEach, describe, expect, it } from "vitest";

import { SITENOTE_ROOT_TAG } from "../../overlay";
import { fixtures, query, queryAll, renderHtml } from "../fixtures";
import { buildCssSelector, buildNthPath } from ".";

afterEach(() => {
  document.body.innerHTML = "";
});

function selectorOf(selector: string): string {
  return buildCssSelector(query(selector));
}

describe("buildCssSelector candidates", () => {
  it("prefers a stable id", () => {
    renderHtml(`<div id="hero" data-testid="x" class="hero">a</div><div>b</div>`);
    expect(selectorOf("#hero")).toBe("#hero");
  });

  it("skips generated ids", () => {
    renderHtml(`<div id=":r1:" data-testid="first">a</div><div id="ember123">b</div>`);
    expect(selectorOf("[data-testid]")).toBe('[data-testid="first"]');
    expect(buildCssSelector(query("#ember123"))).not.toContain("ember123");
  });

  it("prefers data-testid, then data-test, then data-cy", () => {
    renderHtml(
      `<p data-cy="c" data-test="t" data-testid="i">1</p><p data-cy="c2" data-test="t2">2</p><p data-cy="c3">3</p>`,
    );
    const [first, second, third] = queryAll("p");
    expect(first && buildCssSelector(first)).toBe('[data-testid="i"]');
    expect(second && buildCssSelector(second)).toBe('[data-test="t2"]');
    expect(third && buildCssSelector(third)).toBe('[data-cy="c3"]');
  });

  it("uses other data attributes with short, stable values", () => {
    renderHtml(`<p data-section="pricing">1</p><p data-section="faq">2</p>`);
    expect(selectorOf("[data-section=pricing]")).toBe('[data-section="pricing"]');
  });

  it.each([
    ["transient state attributes", `<p data-state="open">1</p><p data-state="closed">2</p>`],
    ["boolean-like values", `<p data-flag="true">1</p><p data-flag="false">2</p>`],
    ["hashed values", `<p data-token="x9Y8z7k2">1</p><p data-token="a1B2c3d4">2</p>`],
    ["long values", `<p data-note="${"n".repeat(65)}">1</p><p data-note="${"m".repeat(65)}">2</p>`],
    ["hashed attribute names", `<p data-v-7ba5bd90="">1</p><p data-v-7ba5bd91="">2</p>`],
    ["empty values", `<p data-empty="">1</p><p data-empty="">2</p>`],
  ])("ignores data attributes with %s", (_name, html) => {
    renderHtml(html);
    const [first] = queryAll("p");
    const selector = first ? buildCssSelector(first) : "";
    expect(selector).not.toContain("data-");
    expect(first && document.querySelectorAll(selector)).toHaveLength(1);
  });

  it("limits attribute-based candidates to a value length of 64", () => {
    const value = "v".repeat(64);
    renderHtml(`<p data-id="${value}">1</p><p>2</p>`);
    expect(selectorOf("p")).toBe(`[data-id="${value}"]`);
  });

  it("uses aria-label", () => {
    renderHtml(`<button aria-label="Close dialog">x</button><button>y</button>`);
    expect(selectorOf("button")).toBe('[aria-label="Close\\ dialog"]');
  });

  it("uses tag with role", () => {
    renderHtml(`<div role="dialog">a</div><div role="alert">b</div>`);
    expect(selectorOf("[role=alert]")).toBe('div[role="alert"]');
  });

  it("uses tag with name", () => {
    renderHtml(`<input name="email" /><input name="password" />`);
    expect(selectorOf("[name=password]")).toBe('input[name="password"]');
  });

  it("uses one stable class when it is unique", () => {
    renderHtml(`<p class="Text_root__a1B2c lead">a</p><p class="Text_root__a1B2c">b</p>`);
    expect(selectorOf(".lead")).toBe("p.lead");
  });

  it("uses two stable classes when one is not enough", () => {
    renderHtml(`<p class="note">a</p><p class="warning">b</p><p class="note warning">c</p>`);
    expect(buildCssSelector(queryAll("p")[2] ?? document.body)).toBe("p.note.warning");
  });

  it("never uses generated class names", () => {
    renderHtml(`<div class="css-1x2y3z Button_root__a1B2c">a</div><div class="css-9q8w7e">b</div>`);
    const selector = selectorOf("div");
    expect(selector).not.toContain("css-");
    expect(selector).not.toContain("Button_root");
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(document.querySelector(selector)?.textContent).toBe("a");
  });

  it("uses the plain tag when it is unique", () => {
    renderHtml(`<main><h1>Title</h1><p>x</p></main>`);
    expect(selectorOf("h1")).toBe("h1");
  });

  it("escapes ids, classes and attribute values", () => {
    renderHtml(
      `<p id="a.b#c">1</p><p class="w-1/2 md:px-4 sm:[&>*]:p-2">2</p><p data-x='he said "hi" \\ ok'>3</p><p>4</p>`,
    );
    const [first, second, third] = queryAll("p");
    for (const element of [first, second, third]) {
      const selector = element ? buildCssSelector(element) : "";
      expect(document.querySelectorAll(selector)).toHaveLength(1);
      expect(document.querySelector(selector)).toBe(element);
    }
    expect(first && buildCssSelector(first)).toBe("#a\\.b\\#c");
    expect(second && buildCssSelector(second)).toBe("p.w-1\\/2");
  });

  it("escapes numeric leading characters in ids", () => {
    renderHtml(`<p id="1abc">x</p><p>y</p>`);
    const selector = selectorOf("p");
    expect(selector).toBe("#\\31 abc");
    expect(document.querySelector(selector)?.textContent).toBe("x");
  });
});

describe("buildCssSelector ancestors", () => {
  it("combines the closest anchored ancestor with the element", () => {
    renderHtml(
      `<nav id="nav"><a href="/a">A</a><a href="/b">B</a></nav><footer><a href="/c">C</a></footer>`,
    );
    expect(buildCssSelector(queryAll("a")[1] ?? document.body)).toBe("#nav > a:nth-of-type(2)");
  });

  it("adds nth-of-type only when siblings are indistinguishable", () => {
    renderHtml(
      `<section id="s"><p>one</p><h2>two</h2><div>three</div></section><section><p>four</p></section>`,
    );
    expect(selectorOf("h2")).toBe("h2");
    expect(buildCssSelector(queryAll("p")[0] ?? document.body)).toBe("#s > p");
  });

  it("uses sibling-unique classes instead of positions", () => {
    renderHtml(
      `<ul id="menu"><li class="first">a</li><li class="last">b</li></ul><ul><li class="first">c</li></ul>`,
    );
    expect(buildCssSelector(queryAll("li")[1] ?? document.body)).toBe("li.last");
    expect(buildCssSelector(queryAll("li")[0] ?? document.body)).toBe("#menu > li.first");
  });

  it("uses a descendant combination when the anchor is further up", () => {
    renderHtml(
      `<div id="app"><div><div><p class="title">a</p></div></div></div><div><div><div><p class="title">b</p></div></div></div>`,
    );
    expect(buildCssSelector(queryAll("p")[0] ?? document.body)).toBe("#app p.title");
  });

  it("walks through several unanchored ancestors", () => {
    renderHtml(
      `<div id="a"><div><div><span>x</span></div><div><span>y</span></div></div></div><div><div><div><span>z</span></div></div></div>`,
    );
    const selector = buildCssSelector(queryAll("span")[1] ?? document.body);
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(document.querySelector(selector)?.textContent).toBe("y");
  });

  it("falls back to the nth path beyond six ancestors", () => {
    const tree = (label: string): string =>
      `<div>${"<div>".repeat(8)}<span>${label}</span>${"</div>".repeat(8)}</div>`;
    renderHtml(tree("first") + tree("second"));
    const target = queryAll("span")[1];
    expect(target).toBeDefined();
    if (!target) {
      return;
    }
    const selector = buildCssSelector(target);
    expect(selector).toBe(buildNthPath(target));
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    expect(document.querySelector(selector)).toBe(target);
  });

  it("returns a selector for html, head and body", () => {
    expect(buildCssSelector(document.body)).toBe("body");
    expect(buildCssSelector(document.documentElement)).toBe("html");
    expect(buildCssSelector(document.head)).toBe("head");
  });

  it("returns a unique selector for every element of every fixture", () => {
    for (const html of Object.values(fixtures)) {
      renderHtml(html);
      for (const element of document.body.querySelectorAll("*")) {
        const selector = buildCssSelector(element);
        expect(document.querySelectorAll(selector).length, selector).toBe(1);
        expect(document.querySelector(selector), selector).toBe(element);
      }
    }
  });

  it("builds selectors inside an open shadow root", () => {
    renderHtml(`<div id="host"></div>`);
    const shadow = query("#host").attachShadow({ mode: "open" });
    shadow.innerHTML = `<section><p>one</p><p>two</p></section><footer><p>three</p></footer>`;
    const target = shadow.querySelectorAll("p")[1];
    expect(target).toBeDefined();
    if (!target) {
      return;
    }
    const selector = buildCssSelector(target, shadow);
    expect(shadow.querySelectorAll(selector)).toHaveLength(1);
    expect(shadow.querySelector(selector)).toBe(target);
  });

  it("builds selectors for SVG elements", () => {
    renderHtml(
      `<svg id="icon" viewBox="0 0 10 10"><circle cx="1" cy="1" r="1"></circle><circle cx="2" cy="2" r="1"></circle></svg>`,
    );
    const target = queryAll("circle")[1];
    expect(target && buildCssSelector(target)).toBe("#icon > circle:nth-of-type(2)");
  });
});

describe("buildCssSelector and the Sitenote host", () => {
  it("never mentions the host and is not affected by its shadow content", () => {
    renderHtml(
      `<section><p>a</p><p>b</p></section><${SITENOTE_ROOT_TAG}><p>light</p></${SITENOTE_ROOT_TAG}>`,
    );
    const host = query(SITENOTE_ROOT_TAG);
    host.attachShadow({ mode: "open" }).innerHTML = `<p>shadow</p><button>shadow button</button>`;
    for (const element of queryAll("section, section > p")) {
      expect(buildCssSelector(element)).not.toContain(SITENOTE_ROOT_TAG);
      expect(buildNthPath(element)).not.toContain(SITENOTE_ROOT_TAG);
    }
    expect(selectorOf("section")).toBe("section");
  });

  it("does not use the host as a candidate for itself", () => {
    renderHtml(`<${SITENOTE_ROOT_TAG} id="sn" data-testid="sn"></${SITENOTE_ROOT_TAG}>`);
    expect(selectorOf(SITENOTE_ROOT_TAG)).not.toContain('data-testid="sn"');
  });
});

describe("buildNthPath", () => {
  it("builds a full path from body with nth-of-type on every step", () => {
    renderHtml(`<header><a>x</a></header><main><p>1</p><p>2</p><div><p>3</p></div></main>`);
    expect(buildNthPath(queryAll("p")[1] ?? document.body)).toBe(
      "body > main:nth-of-type(1) > p:nth-of-type(2)",
    );
    expect(buildNthPath(queryAll("p")[2] ?? document.body)).toBe(
      "body > main:nth-of-type(1) > div:nth-of-type(1) > p:nth-of-type(1)",
    );
  });

  it("returns only body for the body element", () => {
    expect(buildNthPath(document.body)).toBe("body");
  });

  it("starts at html for elements outside body", () => {
    expect(buildNthPath(document.head)).toBe("html:nth-of-type(1) > head:nth-of-type(1)");
  });

  it("counts only siblings of the same type", () => {
    renderHtml(`<p>a</p><div>b</div><p>c</p><span>d</span><p>e</p>`);
    expect(buildNthPath(queryAll("p")[2] ?? document.body)).toBe("body > p:nth-of-type(3)");
    expect(buildNthPath(query("span"))).toBe("body > span:nth-of-type(1)");
  });

  it("resolves back to the element it was built for", () => {
    for (const html of Object.values(fixtures)) {
      renderHtml(html);
      for (const element of document.body.querySelectorAll("*")) {
        expect(document.querySelector(buildNthPath(element))).toBe(element);
      }
    }
  });
});
