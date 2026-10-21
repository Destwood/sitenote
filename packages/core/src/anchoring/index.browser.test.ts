import { afterEach, describe, expect, it } from "vitest";

import * as core from "..";
import { SITENOTE_ROOT_TAG } from "../overlay";
import {
  anchorSchema,
  buildTextModel,
  createElementAnchor,
  createFingerprint,
  createTextAnchor,
  elementAnchorSchema,
  resolveElementAnchor,
  resolveTextAnchor,
  textAnchorSchema,
  type ElementAnchor,
  type ElementResolution,
  type TextAnchor,
  type TextResolution,
} from ".";
import {
  centerOf,
  fixtures,
  query,
  queryAll,
  regenerateHashes,
  renderHtml,
  selectText,
} from "./fixtures";

const SELECTOR_METHODS = ["id", "testId", "css", "nthPath"];

afterEach(() => {
  document.body.innerHTML = "";
});

function collapse(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function elementAnchorFor(selector: string): ElementAnchor {
  const element = query(selector);
  const anchor = createElementAnchor(element, centerOf(element));
  const json = JSON.parse(JSON.stringify(anchor)) as unknown;
  expect(anchorSchema.parse(json)).toEqual(anchor);
  return elementAnchorSchema.parse(json);
}

function textAnchorFor(needle: string, occurrence = 0): TextAnchor {
  const anchor = createTextAnchor(selectText(needle, occurrence));
  if (!anchor) {
    throw new Error(`No text anchor for ${needle}`);
  }
  const json = JSON.parse(JSON.stringify(anchor)) as unknown;
  expect(anchorSchema.parse(json)).toEqual(anchor);
  return textAnchorSchema.parse(json);
}

function expectResolvedElement(
  resolution: ElementResolution,
): Extract<ElementResolution, { status: "resolved" }> {
  if (resolution.status !== "resolved") {
    throw new Error("Expected the element anchor to resolve");
  }
  return resolution;
}

function expectResolvedText(
  resolution: TextResolution,
): Extract<TextResolution, { status: "resolved" }> {
  if (resolution.status !== "resolved") {
    throw new Error("Expected the text anchor to resolve");
  }
  return resolution;
}

const LANDING_ELEMENTS = [
  { name: "hero title", selector: "#hero-title" },
  { name: "call to action", selector: '[data-testid="cta-primary"]' },
  { name: "nav link", selector: 'nav a[href="/pricing"]' },
  { name: "second card", selector: "article:nth-of-type(2)" },
  { name: "second card title", selector: "article:nth-of-type(2) h3" },
  { name: "third list item", selector: "li:nth-of-type(3)" },
  { name: "footer text", selector: "footer p" },
];

const LANDING_TEXTS = [
  "Pin comments to any element",
  "start commenting in under a minute",
  "status changes show up for everyone",
  "Screenshots captured with every comment",
  "All rights reserved",
];

describe("unchanged page", () => {
  it("resolves every element anchor to the same element through a selector", () => {
    renderHtml(fixtures.landing);
    const targets = LANDING_ELEMENTS.map(({ name, selector }) => ({
      name,
      element: query(selector),
      anchor: elementAnchorFor(selector),
    }));
    for (const { name, element, anchor } of targets) {
      const resolution = expectResolvedElement(resolveElementAnchor(anchor));
      expect(resolution.element, name).toBe(element);
      expect(SELECTOR_METHODS, name).toContain(resolution.method);
      expect(resolution.confidence, name).toBe(1);
    }
  });

  it("uses the strongest selector available for each target", () => {
    renderHtml(fixtures.landing);
    const methods = LANDING_ELEMENTS.map(({ selector }) => {
      const resolution = expectResolvedElement(resolveElementAnchor(elementAnchorFor(selector)));
      return resolution.method;
    });
    expect(methods).toEqual(["id", "testId", "css", "css", "css", "css", "css"]);
  });

  it("resolves every text anchor to the same text node", () => {
    renderHtml(fixtures.landing);
    const targets = LANDING_TEXTS.map((needle) => ({
      needle,
      range: selectText(needle),
      anchor: textAnchorFor(needle),
    }));
    for (const { needle, range, anchor } of targets) {
      const resolution = expectResolvedText(resolveTextAnchor(anchor));
      expect(resolution.range.toString(), needle).toBe(needle);
      expect(resolution.range.startContainer, needle).toBe(range.startContainer);
      expect(resolution.range.startOffset, needle).toBe(range.startOffset);
      expect(resolution.method, needle).toBe("container");
      expect(resolution.confidence, needle).toBe(1);
    }
  });

  it("resolves against a freshly rendered identical page", () => {
    renderHtml(fixtures.landing);
    const elements = LANDING_ELEMENTS.map(({ selector }) => elementAnchorFor(selector));
    const texts = LANDING_TEXTS.map((needle) => textAnchorFor(needle));
    renderHtml(fixtures.landing);
    for (const anchor of elements) {
      const resolution = expectResolvedElement(resolveElementAnchor(anchor));
      expect(SELECTOR_METHODS).toContain(resolution.method);
      expect(document.querySelector(anchor.selectors.nthPath)).toBe(resolution.element);
    }
    for (const anchor of texts) {
      const resolution = expectResolvedText(resolveTextAnchor(anchor));
      expect(resolution.range.toString()).toBe(anchor.quote.exact);
      expect(resolution.method).toBe("container");
    }
  });
});

describe("reordered siblings", () => {
  function rotateCards(): void {
    const grid = query("section:nth-of-type(2) > div");
    const first = grid.firstElementChild;
    if (first) {
      grid.append(first);
    }
  }

  it("finds each card by its content after the cards are rotated", () => {
    renderHtml(fixtures.landing);
    const cards = ["Instant setup", "Real-time threads", "Task handoff"];
    const anchors = [1, 2, 3].map((index) =>
      elementAnchorFor(`article:nth-of-type(${String(index)})`),
    );
    rotateCards();
    anchors.forEach((anchor, index) => {
      const resolution = expectResolvedElement(resolveElementAnchor(anchor));
      expect(resolution.element.localName).toBe("article");
      expect(collapse(resolution.element.querySelector("h3")?.textContent ?? "")).toBe(
        cards[index],
      );
      expect(resolution.method).toBe("fingerprint");
    });
  });

  it("finds the card title and the pinned sentence after the cards are rotated", () => {
    renderHtml(fixtures.landing);
    const title = elementAnchorFor("article:nth-of-type(2) h3");
    const sentence = textAnchorFor("status changes show up for everyone");
    rotateCards();
    const titleResolution = expectResolvedElement(resolveElementAnchor(title));
    expect(collapse(titleResolution.element.textContent)).toBe("Real-time threads");
    const textResolution = expectResolvedText(resolveTextAnchor(sentence));
    expect(textResolution.range.toString()).toBe("status changes show up for everyone");
    expect(textResolution.method).toBe("document");
    const article = textResolution.range.startContainer.parentElement?.closest("article");
    expect(collapse(article?.querySelector("h3")?.textContent ?? "")).toBe("Real-time threads");
  });

  it("keeps resolving unaffected elements through selectors", () => {
    renderHtml(fixtures.landing);
    const hero = elementAnchorFor("#hero-title");
    const link = elementAnchorFor('nav a[href="/pricing"]');
    rotateCards();
    expect(expectResolvedElement(resolveElementAnchor(hero)).method).toBe("id");
    expect(expectResolvedElement(resolveElementAnchor(link)).method).toBe("css");
  });

  it("follows the reordered list items by content", () => {
    renderHtml(fixtures.landing);
    const anchor = elementAnchorFor("li:nth-of-type(2)");
    const list = query("ul");
    list.prepend(...[...list.children].reverse());
    const resolution = expectResolvedElement(resolveElementAnchor(anchor));
    expect(collapse(resolution.element.textContent)).toBe(
      "Screenshots captured with every comment",
    );
    expect(resolution.method).toBe("fingerprint");
  });
});

describe("changed classes", () => {
  it("resolves every anchor after all hashed class names are regenerated", () => {
    renderHtml(fixtures.landing);
    const elements = LANDING_ELEMENTS.map(({ selector }) => elementAnchorFor(selector));
    const texts = LANDING_TEXTS.map((needle) => textAnchorFor(needle));
    const regenerated = regenerateHashes(fixtures.landing);
    expect(regenerated).not.toBe(fixtures.landing);
    expect(regenerated).not.toContain("Card_root__m4N8p");
    renderHtml(regenerated);
    for (const anchor of elements) {
      const resolution = expectResolvedElement(resolveElementAnchor(anchor));
      expect(SELECTOR_METHODS).toContain(resolution.method);
      expect(document.querySelector(anchor.selectors.nthPath)).toBe(resolution.element);
      expect(resolution.confidence).toBe(1);
    }
    for (const anchor of texts) {
      const resolution = expectResolvedText(resolveTextAnchor(anchor));
      expect(resolution.range.toString()).toBe(anchor.quote.exact);
    }
  });

  it("never stores hashed class names in anchors", () => {
    renderHtml(fixtures.landing);
    for (const { selector } of LANDING_ELEMENTS) {
      const anchor = elementAnchorFor(selector);
      expect(JSON.stringify(anchor)).not.toMatch(/__[A-Za-z0-9]{5}/);
    }
  });

  it("keeps stable classes in the fingerprint", () => {
    renderHtml(fixtures.landing);
    expect(elementAnchorFor("footer").fingerprint.classes).toEqual(["site-footer"]);
    expect(elementAnchorFor("ul").fingerprint.classes).toEqual(["feature-list"]);
  });

  it("also resolves when a stable class is renamed", () => {
    renderHtml(fixtures.landing);
    const anchor = elementAnchorFor("footer");
    query("footer").className = "site-footer-v2";
    const resolution = expectResolvedElement(resolveElementAnchor(anchor));
    expect(resolution.element).toBe(query("footer"));
  });
});

describe("edited text", () => {
  function editCard(): void {
    const title = query("article:nth-of-type(2) h3");
    title.textContent = "Realtime threads";
    const paragraph = query("article:nth-of-type(2) p");
    paragraph.textContent = paragraph.textContent.replace("status changes", "state changes");
  }

  it("still resolves elements whose text got a small edit", () => {
    renderHtml(fixtures.landing);
    const card = elementAnchorFor("article:nth-of-type(2)");
    const title = elementAnchorFor("article:nth-of-type(2) h3");
    const paragraph = elementAnchorFor("article:nth-of-type(2) p");
    editCard();
    const resolvedCard = expectResolvedElement(resolveElementAnchor(card));
    expect(resolvedCard.element).toBe(query("article:nth-of-type(2)"));
    expect(resolvedCard.confidence).toBeLessThan(1);
    expect(resolvedCard.confidence).toBeGreaterThan(0.8);
    expect(expectResolvedElement(resolveElementAnchor(title)).element).toBe(
      query("article:nth-of-type(2) h3"),
    );
    expect(expectResolvedElement(resolveElementAnchor(paragraph)).element).toBe(
      query("article:nth-of-type(2) p"),
    );
  });

  it("orphans a text anchor whose quoted text no longer exists", () => {
    renderHtml(fixtures.landing);
    const edited = textAnchorFor("status changes show up");
    editCard();
    expect(resolveTextAnchor(edited)).toEqual({ status: "orphaned" });
  });

  it("keeps resolving a quote in the same paragraph that was not touched", () => {
    renderHtml(fixtures.landing);
    const untouched = textAnchorFor("show up for everyone immediately");
    editCard();
    const resolution = expectResolvedText(resolveTextAnchor(untouched));
    expect(resolution.range.toString()).toBe("show up for everyone immediately");
    expect(["container", "document"]).toContain(resolution.method);
    expect(resolution.confidence).toBeLessThan(1);
  });

  it("keeps resolving text anchors elsewhere on the page", () => {
    renderHtml(fixtures.landing);
    const other = textAnchorFor("Screenshots captured with every comment");
    editCard();
    expect(expectResolvedText(resolveTextAnchor(other)).method).toBe("container");
  });

  it("orphans the element when its text was replaced entirely and its neighbours differ", () => {
    renderHtml(fixtures.landing);
    const title = elementAnchorFor("article:nth-of-type(3) h3");
    query("article:nth-of-type(3) h3").textContent = "Quarterly revenue";
    expect(resolveElementAnchor(title)).toEqual({ status: "orphaned" });
  });
});

describe("removed element", () => {
  function removeSecondCard(): void {
    query("article:nth-of-type(2)").remove();
  }

  it("orphans the card, its title and its text instead of picking a neighbour", () => {
    renderHtml(fixtures.landing);
    const card = elementAnchorFor("article:nth-of-type(2)");
    const title = elementAnchorFor("article:nth-of-type(2) h3");
    const link = elementAnchorFor("article:nth-of-type(2) a");
    const sentence = textAnchorFor("status changes show up for everyone");
    removeSecondCard();
    expect(resolveElementAnchor(card)).toEqual({ status: "orphaned" });
    expect(resolveElementAnchor(title)).toEqual({ status: "orphaned" });
    expect(resolveElementAnchor(link)).toEqual({ status: "orphaned" });
    expect(resolveTextAnchor(sentence)).toEqual({ status: "orphaned" });
  });

  it("still resolves the remaining cards, including the one that shifted position", () => {
    renderHtml(fixtures.landing);
    const first = elementAnchorFor("article:nth-of-type(1)");
    const third = elementAnchorFor("article:nth-of-type(3)");
    const thirdTitle = textAnchorFor("Task handoff");
    removeSecondCard();
    expect(expectResolvedElement(resolveElementAnchor(first)).element).toBe(
      query("article:nth-of-type(1)"),
    );
    const resolvedThird = expectResolvedElement(resolveElementAnchor(third));
    expect(resolvedThird.element).toBe(query("article:nth-of-type(2)"));
    expect(resolvedThird.method).toBe("fingerprint");
    expect(expectResolvedText(resolveTextAnchor(thirdTitle)).range.toString()).toBe("Task handoff");
  });

  it("orphans a removed call to action and a removed list item", () => {
    renderHtml(fixtures.landing);
    const button = elementAnchorFor('[data-testid="cta-primary"]');
    const item = elementAnchorFor("li:nth-of-type(3)");
    query('[data-testid="cta-primary"]').remove();
    query("li:nth-of-type(3)").remove();
    expect(resolveElementAnchor(button)).toEqual({ status: "orphaned" });
    expect(resolveElementAnchor(item)).toEqual({ status: "orphaned" });
  });
});

describe("duplicated text", () => {
  const SENTENCE = "Contact support if the problem persists.";

  function resolveAll(anchors: TextAnchor[]): Extract<TextResolution, { status: "resolved" }>[] {
    return anchors.map((anchor) => expectResolvedText(resolveTextAnchor(anchor)));
  }

  function precedingNote(range: Range): string {
    return collapse(range.startContainer.parentElement?.previousElementSibling?.textContent ?? "");
  }

  it("anchors each of the three occurrences separately", () => {
    renderHtml(fixtures.article);
    const anchors = [0, 1, 2].map((occurrence) => textAnchorFor(SENTENCE, occurrence));
    const positions = anchors.map((anchor) => anchor.position.start);
    expect(new Set(positions).size).toBe(3);
    expect(new Set(anchors.map((anchor) => anchor.container)).size).toBe(3);
    expect(new Set(anchors.map((anchor) => anchor.quote.prefix)).size).toBe(3);
  });

  it("resolves each anchor to its own occurrence on the unchanged page", () => {
    renderHtml(fixtures.article);
    const ranges = [0, 1, 2].map((occurrence) => selectText(SENTENCE, occurrence));
    const anchors = [0, 1, 2].map((occurrence) => textAnchorFor(SENTENCE, occurrence));
    const resolutions = resolveAll(anchors);
    resolutions.forEach((resolution, index) => {
      expect(resolution.range.startContainer).toBe(ranges[index]?.startContainer);
      expect(resolution.method).toBe("container");
    });
  });

  it("uses prefix and suffix when the page is reordered and the containers no longer match", () => {
    renderHtml(fixtures.article);
    const notes = [0, 1, 2].map((occurrence) => precedingNote(selectText(SENTENCE, occurrence)));
    const anchors = [0, 1, 2].map((occurrence) => textAnchorFor(SENTENCE, occurrence));
    query("main").prepend(...queryAll("section").reverse());
    const resolutions = resolveAll(anchors);
    expect(resolutions.map((resolution) => resolution.method)).toEqual([
      "document",
      "container",
      "document",
    ]);
    expect(resolutions.map((resolution) => precedingNote(resolution.range))).toEqual(notes);
    for (const resolution of resolutions) {
      expect(resolution.range.toString()).toBe(SENTENCE);
    }
  });

  it("keeps each anchor on its own occurrence when a new section is inserted first", () => {
    renderHtml(fixtures.article);
    const anchors = [0, 1, 2].map((occurrence) => textAnchorFor(SENTENCE, occurrence));
    const section = document.createElement("section");
    section.innerHTML = `<h2>Version 1.3</h2><p>Added dark mode.</p><p>${SENTENCE}</p>`;
    query("main h1").after(section);
    const resolutions = resolveAll(anchors);
    const notes = resolutions.map((resolution) => precedingNote(resolution.range));
    expect(notes).toEqual([
      "Fixed a crash in the exporter when the file name was empty.",
      "Improved startup time by deferring the analytics bundle.",
      "First public release with element and text comments.",
    ]);
  });
});

describe("SPA re-render", () => {
  const rerender = (html: string): string =>
    html
      .replaceAll(":r1:", ":r8:")
      .replaceAll(":r2:", ":r9:")
      .replaceAll("«r3»", "«r4»")
      .replaceAll("ember1042", "ember2077")
      .replaceAll("7ba5bd90", "1c9d2e3f");

  const targets = [
    { name: "email input", selector: 'input[name="email"]' },
    { name: "password input", selector: 'input[name="password"]' },
    { name: "team select", selector: "select" },
    { name: "submit button", selector: "button" },
    { name: "form", selector: "form" },
    { name: "hint", selector: "form > p" },
  ];

  it("does not store generated ids in anchors", () => {
    renderHtml(fixtures.spa);
    for (const { selector } of targets) {
      const anchor = elementAnchorFor(selector);
      expect("id" in anchor.selectors).toBe(false);
      const json = JSON.stringify(anchor);
      for (const generated of [":r1:", ":r2:", "«r3»", "ember1042", "7ba5bd90"]) {
        expect(json).not.toContain(generated);
      }
    }
  });

  it("resolves into the freshly created tree after the body is replaced", () => {
    renderHtml(fixtures.spa);
    const anchors = targets.map(({ selector }) => elementAnchorFor(selector));
    const old = targets.map(({ selector }) => query(selector));
    const texts = [textAnchorFor("agree to the terms"), textAnchorFor("Work email")];
    const next = rerender(fixtures.spa);
    expect(next).not.toBe(fixtures.spa);
    renderHtml(next);
    anchors.forEach((anchor, index) => {
      const resolution = expectResolvedElement(resolveElementAnchor(anchor));
      expect(resolution.element.isConnected).toBe(true);
      expect(resolution.element).not.toBe(old[index]);
      expect(SELECTOR_METHODS).toContain(resolution.method);
      expect(document.querySelector(anchor.selectors.nthPath)).toBe(resolution.element);
    });
    for (const anchor of texts) {
      const resolution = expectResolvedText(resolveTextAnchor(anchor));
      expect(resolution.range.toString()).toBe(anchor.quote.exact);
      expect(resolution.range.startContainer.isConnected).toBe(true);
    }
  });

  it("resolves by fingerprint when the structure around the element changes", () => {
    renderHtml(fixtures.spa);
    const anchor = elementAnchorFor("button");
    renderHtml(rerender(fixtures.spa));
    const form = query("form");
    const wrapper = document.createElement("section");
    form.replaceWith(wrapper);
    wrapper.append(form);
    wrapper.after(Object.assign(document.createElement("button"), { textContent: "Cancel" }));
    const resolution = expectResolvedElement(resolveElementAnchor(anchor));
    expect(resolution.method).toBe("fingerprint");
    expect(resolution.element).toBe(query("form button"));
  });
});

describe("Sitenote host element", () => {
  function mountHost(lookalikeStyle = ""): HTMLElement {
    const host = document.createElement(SITENOTE_ROOT_TAG);
    host.innerHTML = `<article style="${lookalikeStyle}"><h3>Real-time threads</h3><p>Replies, mentions and status changes show up for everyone immediately.</p><a href="/threads">See threads</a></article>`;
    host.attachShadow({ mode: "open" }).innerHTML =
      `<style>p { color: red }</style><p>Overlay secret text</p><button>Comment</button><slot></slot>`;
    document.body.append(host);
    return host;
  }

  it("never leaks into selectors", () => {
    renderHtml(fixtures.landing);
    mountHost();
    for (const element of document.body.querySelectorAll("*")) {
      if (element.closest(SITENOTE_ROOT_TAG)) {
        continue;
      }
      const anchor = createElementAnchor(element, { clientX: 0, clientY: 0 });
      expect(anchor.selectors.css).not.toContain(SITENOTE_ROOT_TAG);
      expect(anchor.selectors.nthPath).not.toContain(SITENOTE_ROOT_TAG);
    }
  });

  it("never leaks into the text model or text anchors", () => {
    renderHtml(fixtures.landing);
    const without = buildTextModel(document.body).text;
    const withoutAnchor = textAnchorFor("All rights reserved");
    mountHost();
    const model = buildTextModel(document.body);
    expect(model.text).toBe(without);
    expect(model.text).not.toContain("Overlay secret text");
    expect(model.text.split("Real-time threads")).toHaveLength(2);
    expect(textAnchorFor("All rights reserved")).toEqual(withoutAnchor);
  });

  it("never leaks into fingerprints", () => {
    renderHtml(`<div id="wrap"><p>Page text</p></div>`);
    const before = createFingerprint(query("#wrap"));
    const host = mountHost();
    query("#wrap").append(host);
    const after = createFingerprint(query("#wrap"));
    expect(after.text).toBe("Page text");
    expect(after.text).toBe(before.text);
  });

  it("never offers its lookalike content as a fingerprint candidate", () => {
    renderHtml(fixtures.landing);
    const anchor = elementAnchorFor("article:nth-of-type(2)");
    const broken: ElementAnchor = {
      ...anchor,
      selectors: { css: "#gone", nthPath: "body > gone" },
    };
    const { width, height } = query("article:nth-of-type(2)").getBoundingClientRect();
    mountHost(
      `display: block; box-sizing: border-box; width: ${String(width)}px; height: ${String(height)}px`,
    );
    const resolution = expectResolvedElement(resolveElementAnchor(broken));
    expect(resolution.method).toBe("fingerprint");
    expect(resolution.element).toBe(query("section:nth-of-type(2) article:nth-of-type(2)"));
    expect(resolution.element.closest(SITENOTE_ROOT_TAG)).toBeNull();
  });

  it("never resolves text that only exists inside the host", () => {
    renderHtml(fixtures.landing);
    mountHost();
    const anchor: TextAnchor = {
      kind: "text",
      quote: { exact: "Overlay secret text", prefix: "", suffix: "" },
      position: { start: 0, end: 19 },
      container: "body",
    };
    expect(resolveTextAnchor(anchor)).toEqual({ status: "orphaned" });
  });
});

describe("public API", () => {
  it("re-exports the anchoring engine and url helpers from the package entry", () => {
    expect(core.parsePageUrl("https://example.com/a/")).toEqual({
      site: "https://example.com",
      page: "https://example.com/a",
    });
    expect(core.SITENOTE_ROOT_TAG).toBe(SITENOTE_ROOT_TAG);
    for (const name of [
      "createElementAnchor",
      "resolveElementAnchor",
      "createTextAnchor",
      "resolveTextAnchor",
      "anchorSchema",
      "buildCssSelector",
      "buildNthPath",
      "isStableClassName",
      "isStableId",
      "fingerprintSimilarity",
      "pinPosition",
    ]) {
      expect(core).toHaveProperty(name);
    }
  });
});
