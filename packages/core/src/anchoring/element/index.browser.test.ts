import { afterEach, describe, expect, it } from "vitest";

import { SITENOTE_ROOT_TAG } from "../../overlay";
import { centerOf, query, queryAll, renderHtml } from "../fixtures";
import { createFingerprint } from "../fingerprint";
import { elementAnchorSchema, type ElementAnchor } from "../schema";
import {
  ACCEPT_THRESHOLD,
  FINGERPRINT_MARGIN,
  FINGERPRINT_THRESHOLD,
  MAX_FINGERPRINT_CANDIDATES,
  NTH_PATH_THRESHOLD,
  createElementAnchor,
  pinPosition,
  resolveElementAnchor,
} from ".";

afterEach(() => {
  document.body.innerHTML = "";
});

function anchorFor(selector: string): ElementAnchor {
  const element = query(selector);
  return createElementAnchor(element, centerOf(element));
}

function withSelectors(
  anchor: ElementAnchor,
  selectors: Partial<ElementAnchor["selectors"]>,
): ElementAnchor {
  return { ...anchor, selectors: { ...anchor.selectors, ...selectors } };
}

function withFingerprint(
  anchor: ElementAnchor,
  fingerprint: Partial<ElementAnchor["fingerprint"]>,
): ElementAnchor {
  return { ...anchor, fingerprint: { ...anchor.fingerprint, ...fingerprint } };
}

function resolvedElement(anchor: ElementAnchor): Element | undefined {
  const resolution = resolveElementAnchor(anchor);
  return resolution.status === "resolved" ? resolution.element : undefined;
}

describe("thresholds", () => {
  it("keep the documented ordering", () => {
    expect(ACCEPT_THRESHOLD).toBeLessThan(NTH_PATH_THRESHOLD);
    expect(NTH_PATH_THRESHOLD).toBeLessThan(FINGERPRINT_THRESHOLD);
    expect(FINGERPRINT_MARGIN).toBeGreaterThan(0);
  });
});

describe("createElementAnchor", () => {
  const card = `<div id="box" style="position: absolute; left: 40px; top: 60px; width: 200px; height: 100px">Box</div>`;

  it("stores the click position as a fraction of the element box", () => {
    renderHtml(card);
    const box = query("#box");
    const rect = box.getBoundingClientRect();
    const anchor = createElementAnchor(box, {
      clientX: rect.left + rect.width * 0.25,
      clientY: rect.top + rect.height * 0.8,
    });
    expect(anchor.offset).toEqual({ x: 0.25, y: 0.8 });
  });

  it("clamps points outside the element", () => {
    renderHtml(card);
    const box = query("#box");
    const rect = box.getBoundingClientRect();
    expect(
      createElementAnchor(box, { clientX: rect.left - 50, clientY: rect.bottom + 50 }).offset,
    ).toEqual({
      x: 0,
      y: 1,
    });
    expect(
      createElementAnchor(box, { clientX: rect.right + 50, clientY: rect.top - 50 }).offset,
    ).toEqual({
      x: 1,
      y: 0,
    });
  });

  it("uses the centre for elements without a box", () => {
    renderHtml(`<div id="box" style="display: none">x</div>`);
    const anchor = createElementAnchor(query("#box"), { clientX: 10, clientY: 10 });
    expect(anchor.offset).toEqual({ x: 0.5, y: 0.5 });
  });

  it("falls back to the centre for a single zero-size axis", () => {
    renderHtml(`<div id="box" style="width: 100px; height: 0">x</div>`);
    const box = query("#box");
    const rect = box.getBoundingClientRect();
    const anchor = createElementAnchor(box, { clientX: rect.left + 25, clientY: rect.top });
    expect(anchor.offset).toEqual({ x: 0.25, y: 0.5 });
  });

  it("records a stable id and a test id", () => {
    renderHtml(`<h1 id="title" data-testid="page-title">Hello</h1>`);
    const anchor = anchorFor("#title");
    expect(anchor.selectors.id).toBe("title");
    expect(anchor.selectors.testId).toBe("page-title");
    expect(anchor.selectors.css).toBe("#title");
    expect(anchor.selectors.nthPath).toBe("body > h1:nth-of-type(1)");
    expect(anchor.fingerprint).toEqual(createFingerprint(query("#title")));
  });

  it("omits generated ids and missing test ids", () => {
    renderHtml(`<h1 id=":r1:" data-testid="">Hello</h1>`);
    const anchor = anchorFor("h1");
    expect("id" in anchor.selectors).toBe(false);
    expect("testId" in anchor.selectors).toBe(false);
  });

  it("produces anchors accepted by the schema and stable through JSON", () => {
    renderHtml(`<p id="p" class="lead">Hello <b>world</b></p>`);
    const anchor = anchorFor("#p");
    const parsed = elementAnchorSchema.parse(JSON.parse(JSON.stringify(anchor)));
    expect(parsed).toEqual(anchor);
  });
});

describe("pinPosition", () => {
  it("converts the offset to viewport coordinates", () => {
    renderHtml(
      `<div id="box" style="position: absolute; left: 40px; top: 60px; width: 200px; height: 100px"></div>`,
    );
    const box = query("#box");
    const rect = box.getBoundingClientRect();
    expect(pinPosition(box, { x: 0.5, y: 0.25 })).toEqual({
      x: rect.left + 100,
      y: rect.top + 25,
    });
  });

  it("follows the element when it moves or resizes", () => {
    renderHtml(
      `<div id="box" style="position: absolute; left: 0; top: 0; width: 100px; height: 100px"></div>`,
    );
    const box = query("#box");
    const before = pinPosition(box, { x: 0.5, y: 0.5 });
    box.style.left = "100px";
    box.style.width = "200px";
    const after = pinPosition(box, { x: 0.5, y: 0.5 });
    expect(after.x - before.x).toBe(150);
    expect(after.y).toBe(before.y);
  });
});

describe("resolveElementAnchor by selectors", () => {
  const page = `
    <main>
      <h1 id="title" data-testid="page-title" class="headline">Pricing for teams</h1>
      <p class="lead">Simple plans for every size of team.</p>
    </main>`;

  it("resolves by id first", () => {
    renderHtml(page);
    const anchor = anchorFor("#title");
    const resolution = resolveElementAnchor(anchor);
    expect(resolution).toMatchObject({ status: "resolved", method: "id" });
    expect(resolvedElement(anchor)).toBe(query("#title"));
  });

  it("resolves by test id when the id is gone", () => {
    renderHtml(page);
    const anchor = anchorFor("#title");
    query("#title").removeAttribute("id");
    expect(resolveElementAnchor(anchor)).toMatchObject({ status: "resolved", method: "testId" });
    expect(resolvedElement(anchor)).toBe(query("h1"));
  });

  it("resolves by css when id and test id are gone", () => {
    renderHtml(`${page}<p class="note">Other</p>`);
    const anchor = anchorFor(".lead");
    expect(anchor.selectors.id).toBeUndefined();
    expect(resolveElementAnchor(anchor)).toMatchObject({ status: "resolved", method: "css" });
    expect(resolvedElement(anchor)).toBe(query(".lead"));
  });

  it("resolves by nth path when the css selector no longer matches", () => {
    renderHtml(page);
    const anchor = withSelectors(anchorFor(".lead"), { css: ".renamed" });
    expect(resolveElementAnchor(anchor)).toMatchObject({ status: "resolved", method: "nthPath" });
    expect(resolvedElement(anchor)).toBe(query(".lead"));
  });

  it("reports a confidence equal to the fingerprint similarity", () => {
    renderHtml(page);
    const resolution = resolveElementAnchor(anchorFor("#title"));
    expect(resolution.status === "resolved" && resolution.confidence).toBe(1);
  });

  it("skips an id that matches more than one element", () => {
    renderHtml(`<p id="dup" data-testid="a">One</p><p id="dup" data-testid="b">Two</p>`);
    const anchor = withSelectors(anchorFor("[data-testid=b]"), { id: "dup" });
    const resolution = resolveElementAnchor(anchor);
    expect(resolution).toMatchObject({ status: "resolved", method: "testId" });
    expect(resolvedElement(anchor)).toBe(query("[data-testid=b]"));
  });

  it("skips a test id that matches more than one element", () => {
    renderHtml(`<p data-testid="dup">One</p><p data-testid="dup">Two</p>`);
    const anchor = anchorFor("p");
    expect(resolveElementAnchor(anchor)).toMatchObject({ status: "resolved", method: "css" });
  });

  it("does not throw on malformed selectors", () => {
    renderHtml(page);
    const anchor = withSelectors(anchorFor(".lead"), { css: "p[[", nthPath: ">>>", id: "a b" });
    expect(resolveElementAnchor(anchor)).toMatchObject({
      status: "resolved",
      method: "fingerprint",
    });
  });

  it("rejects a selector hit whose fingerprint is too different", () => {
    renderHtml(page);
    const anchor = withFingerprint(anchorFor("#title"), {
      text: "Completely unrelated content here",
      classes: ["other"],
      width: 5,
      height: 5,
    });
    expect(resolveElementAnchor(anchor)).toEqual({ status: "orphaned" });
  });

  it("accepts an id match with different text when the rest still fits", () => {
    renderHtml(page);
    const anchor = withFingerprint(anchorFor("#title"), { text: "Old headline about plans" });
    expect(resolveElementAnchor(anchor)).toMatchObject({ status: "resolved", method: "id" });
  });

  it("rejects a structural match with conflicting text", () => {
    renderHtml(`<main><p>Alpha beta gamma delta</p><p>Epsilon zeta eta theta</p></main>`);
    const anchor = anchorFor("p");
    query("p").textContent = "Completely different words appear here instead";
    const resolution = resolveElementAnchor(anchor);
    expect(resolution.status).toBe("orphaned");
  });

  it("does not gate structural matches when either side has no text", () => {
    renderHtml(`<section id="s"><img alt="a" /></section><section><img alt="b" /></section>`);
    const anchor = anchorFor("#s");
    const withoutText = withFingerprint(anchor, { text: "" });
    expect(resolveElementAnchor(withoutText)).toMatchObject({ status: "resolved", method: "id" });
  });

  it("requires more evidence for the nth path than for other selectors", () => {
    renderHtml(`<div id="target"></div>`);
    const target = query("#target");
    const base = createElementAnchor(target, centerOf(target));
    target.style.display = "none";
    const weak = withFingerprint(base, { text: "", classes: ["gone"], width: 100, height: 100 });
    const viaCss = withSelectors(weak, {
      id: undefined,
      css: "#target",
      nthPath: "body > nothing",
    });
    const viaNth = withSelectors(weak, {
      id: undefined,
      css: "#missing",
      nthPath: "body > div:nth-of-type(1)",
    });
    const cssResolution = resolveElementAnchor(viaCss);
    expect(cssResolution).toMatchObject({ status: "resolved", method: "css" });
    expect(cssResolution.status === "resolved" && cssResolution.confidence).toBeGreaterThanOrEqual(
      ACCEPT_THRESHOLD,
    );
    expect(cssResolution.status === "resolved" && cssResolution.confidence).toBeLessThan(
      NTH_PATH_THRESHOLD,
    );
    expect(resolveElementAnchor(viaNth).status).toBe("orphaned");
  });
});

describe("resolveElementAnchor by fingerprint", () => {
  const cards = `
    <div id="grid">
      <article><h3>Instant setup</h3><p>Install the extension and start commenting in under a minute.</p></article>
      <article><h3>Real-time threads</h3><p>Replies, mentions and status changes show up for everyone.</p></article>
      <article><h3>Task handoff</h3><p>Turn a thread into a task with the page link attached.</p></article>
    </div>`;

  it("finds a moved element by its content", () => {
    renderHtml(cards);
    const anchor = anchorFor("article:nth-of-type(2)");
    const grid = query("#grid");
    grid.append(query("article:nth-of-type(2)"));
    grid.prepend(query("article:nth-of-type(2)"));
    const resolution = resolveElementAnchor(anchor);
    expect(resolution).toMatchObject({ status: "resolved", method: "fingerprint" });
    expect(resolvedElement(anchor)?.textContent).toContain("Real-time threads");
  });

  it("finds an element after its tag stays and its ancestors change", () => {
    renderHtml(cards);
    const anchor = anchorFor("article:nth-of-type(3)");
    const wrapper = document.createElement("section");
    wrapper.append(...queryAll("article"));
    query("#grid").replaceChildren(wrapper);
    expect(resolvedElement(anchor)?.textContent).toContain("Task handoff");
  });

  it("orphans when the element was removed and neighbours differ", () => {
    renderHtml(cards);
    const anchor = anchorFor("article:nth-of-type(2)");
    query("article:nth-of-type(2)").remove();
    expect(resolveElementAnchor(anchor)).toEqual({ status: "orphaned" });
  });

  it("orphans when two candidates are equally good", () => {
    renderHtml(`<div><p class="a">Same text</p><p class="a">Same text</p></div>`);
    const anchor = withSelectors(anchorFor("p"), { css: "nope", nthPath: "nope" });
    expect(resolveElementAnchor(anchor)).toEqual({ status: "orphaned" });
  });

  it("accepts the best candidate when it leads the runner-up by the margin", () => {
    renderHtml(`<div><p>Same text here</p><p>Same text here, plus extra words</p></div>`);
    const anchor = withSelectors(anchorFor("p"), { css: "nope", nthPath: "nope" });
    const resolution = resolveElementAnchor(anchor);
    expect(resolution).toMatchObject({ status: "resolved", method: "fingerprint" });
    expect(resolvedElement(anchor)).toBe(query("p"));
  });

  it("orphans when the best candidate is below the threshold", () => {
    renderHtml(`<div><p>Totally different paragraph about something else</p></div>`);
    const anchor: ElementAnchor = {
      kind: "element",
      selectors: { css: "nope", nthPath: "nope" },
      fingerprint: {
        tag: "p",
        text: "Original wording of the note",
        classes: ["x"],
        width: 10,
        height: 10,
      },
      offset: { x: 0.5, y: 0.5 },
    };
    expect(resolveElementAnchor(anchor)).toEqual({ status: "orphaned" });
  });

  it("ignores elements with a different tag", () => {
    renderHtml(`<div><span>Hello world</span></div>`);
    const anchor: ElementAnchor = {
      kind: "element",
      selectors: { css: "nope", nthPath: "nope" },
      fingerprint: createFingerprint(query("span")),
      offset: { x: 0.5, y: 0.5 },
    };
    query("span").replaceWith(
      Object.assign(document.createElement("em"), { textContent: "Hello world" }),
    );
    expect(resolveElementAnchor(anchor)).toEqual({ status: "orphaned" });
  });

  it("matches the tag case-insensitively for SVG elements", () => {
    renderHtml(
      `<svg><foreignObject id="fo" width="50" height="20"><div>x</div></foreignObject></svg>`,
    );
    const anchor: ElementAnchor = {
      kind: "element",
      selectors: { css: "nope", nthPath: "nope" },
      fingerprint: createFingerprint(query("#fo")),
      offset: { x: 0.5, y: 0.5 },
    };
    expect(anchor.fingerprint.tag).toBe("foreignobject");
    expect(resolvedElement(anchor)).toBe(query("#fo"));
  });

  it("never offers elements inside the Sitenote host as candidates", () => {
    renderHtml(
      `<div><p id="real">Pin me please</p><${SITENOTE_ROOT_TAG}><p id="fake">Pin me please</p></${SITENOTE_ROOT_TAG}></div>`,
    );
    const anchor = withSelectors(anchorFor("#real"), {
      id: undefined,
      css: "nope",
      nthPath: "nope",
    });
    expect(resolvedElement(anchor)).toBe(query("#real"));
  });

  it("does not resolve selectors to elements inside the Sitenote host", () => {
    renderHtml(`<${SITENOTE_ROOT_TAG}><p id="fake">Pin me please</p></${SITENOTE_ROOT_TAG}>`);
    const anchor: ElementAnchor = {
      kind: "element",
      selectors: { id: "fake", css: "#fake", nthPath: "body > p" },
      fingerprint: createFingerprint(query("#fake")),
      offset: { x: 0.5, y: 0.5 },
    };
    expect(resolveElementAnchor(anchor)).toEqual({ status: "orphaned" });
  });

  it("inspects at most the maximum number of candidates", () => {
    const filler = Array.from(
      { length: MAX_FINGERPRINT_CANDIDATES },
      (_, index) => `<span>filler ${String(index)}</span>`,
    ).join("");
    renderHtml(`${filler}<span id="late">Distinctive late arrival</span>`);
    const anchor: ElementAnchor = {
      kind: "element",
      selectors: { css: "nope", nthPath: "nope" },
      fingerprint: createFingerprint(query("#late")),
      offset: { x: 0.5, y: 0.5 },
    };
    expect(resolveElementAnchor(anchor)).toEqual({ status: "orphaned" });
    query("#late").remove();
    document.body.prepend(
      Object.assign(document.createElement("span"), { textContent: "Distinctive late arrival" }),
    );
    expect(resolveElementAnchor(anchor)).toMatchObject({
      status: "resolved",
      method: "fingerprint",
    });
  });

  it("orphans on documents without a body", () => {
    const xml = new DOMParser().parseFromString("<root><a/></root>", "application/xml");
    const anchor: ElementAnchor = {
      kind: "element",
      selectors: { css: "nope", nthPath: "nope" },
      fingerprint: { tag: "a", text: "", classes: [], width: 0, height: 0 },
      offset: { x: 0.5, y: 0.5 },
    };
    expect(resolveElementAnchor(anchor, xml)).toEqual({ status: "orphaned" });
  });
});
