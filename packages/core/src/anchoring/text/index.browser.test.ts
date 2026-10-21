import { afterEach, describe, expect, it } from "vitest";

import { SITENOTE_ROOT_TAG } from "../../overlay";
import { query, queryAll, renderHtml, selectText } from "../fixtures";
import { textAnchorSchema, type TextAnchor } from "../schema";
import { buildTextModel, rangeToOffsets } from "../text-model";
import { CONTEXT_LENGTH, TIE_CONFIDENCE_FACTOR, createTextAnchor, resolveTextAnchor } from ".";

afterEach(() => {
  document.body.innerHTML = "";
});

function anchorOf(needle: string, occurrence = 0): TextAnchor {
  const anchor = createTextAnchor(selectText(needle, occurrence));
  if (!anchor) {
    throw new Error(`No anchor for ${needle}`);
  }
  return anchor;
}

function resolveRange(anchor: TextAnchor): Range | undefined {
  const resolution = resolveTextAnchor(anchor);
  return resolution.status === "resolved" ? resolution.range : undefined;
}

function offsetsOf(range: Range | undefined): { start: number; end: number } | null {
  return range ? rangeToOffsets(range, document.body) : null;
}

describe("createTextAnchor", () => {
  it("captures the quote, context, position and container", () => {
    renderHtml(`<h1>Title</h1><p>The quick brown fox jumps over the lazy dog.</p>`);
    const anchor = anchorOf("brown fox");
    expect(anchor).toEqual({
      kind: "text",
      quote: { exact: "brown fox", prefix: "TitleThe quick ", suffix: " jumps over the lazy dog." },
      position: { start: 15, end: 24 },
      container: "p",
    });
  });

  it("limits the prefix and suffix to 32 characters", () => {
    const before = "a".repeat(50);
    const after = "z".repeat(50);
    renderHtml(`<p>${before}TARGET${after}</p>`);
    const anchor = anchorOf("TARGET");
    expect(CONTEXT_LENGTH).toBe(32);
    expect(anchor.quote.prefix).toBe("a".repeat(32));
    expect(anchor.quote.suffix).toBe("z".repeat(32));
  });

  it("uses shorter context near the document edges", () => {
    renderHtml(`<p>TARGET</p>`);
    const anchor = anchorOf("TARGET");
    expect(anchor.quote.prefix).toBe("");
    expect(anchor.quote.suffix).toBe("");
  });

  it("returns null for collapsed selections", () => {
    renderHtml(`<p>Hello</p>`);
    const range = document.createRange();
    range.setStart(query("p").firstChild ?? document.body, 2);
    range.collapse(true);
    expect(createTextAnchor(range)).toBeNull();
  });

  it("returns null for whitespace-only selections", () => {
    renderHtml(`<p>Hello    world</p>`);
    expect(createTextAnchor(selectText("    "))).toBeNull();
  });

  it("returns null for selections without text", () => {
    renderHtml(`<div id="empty"></div><p>text</p>`);
    const range = document.createRange();
    range.selectNodeContents(query("#empty"));
    expect(createTextAnchor(range)).toBeNull();
  });

  it("trims surrounding whitespace from the quote and adjusts the position", () => {
    renderHtml(`<p>one  two  three</p>`);
    const anchor = anchorOf("  two  ");
    expect(anchor.quote.exact).toBe("two");
    expect(anchor.position).toEqual({ start: 5, end: 8 });
    expect(anchor.quote.prefix).toBe("one  ");
    expect(anchor.quote.suffix).toBe("  three");
  });

  it("anchors selections that span inline elements to the enclosing block", () => {
    renderHtml(`<p id="p">Hello <b>big</b> world</p><p>other</p>`);
    const range = document.createRange();
    range.setStart(query("#p").firstChild ?? document.body, 3);
    range.setEnd(query("#p").lastChild ?? document.body, 3);
    const anchor = createTextAnchor(range);
    expect(anchor?.quote.exact).toBe("lo big wo");
    expect(anchor?.container).toBe("#p");
  });

  it("climbs from inline elements to the nearest block", () => {
    renderHtml(`<div id="box"><p>text <em><b id="deep">emphasis</b></em></p><p>other</p></div>`);
    const anchor = createTextAnchor(selectText("emphasis"));
    expect(anchor?.container).toBe("#box > p:nth-of-type(1)");
  });

  it("uses the common ancestor block for selections across blocks", () => {
    renderHtml(`<section id="s"><p>First paragraph.</p><p>Second paragraph.</p></section>`);
    const range = document.createRange();
    range.setStart(queryAll("p")[0]?.firstChild ?? document.body, 6);
    range.setEnd(queryAll("p")[1]?.firstChild ?? document.body, 6);
    const anchor = createTextAnchor(range);
    expect(anchor?.container).toBe("#s");
    expect(anchor?.quote.exact).toBe("paragraph.Second");
  });

  it("treats flex items and list items as blocks but not inline-block", () => {
    renderHtml(
      `<ul id="list"><li id="item">Item <span style="display: inline-block" id="chip">chip</span></li></ul>`,
    );
    expect(createTextAnchor(selectText("chip"))?.container).toBe("#item");
    renderHtml(`<div style="display: flex"><span id="flex">flexed</span></div>`);
    expect(createTextAnchor(selectText("flexed"))?.container).toBe("#flex");
  });

  it("skips elements without a box such as display: contents", () => {
    renderHtml(`<p id="p"><span style="display: contents">wrapped</span></p>`);
    expect(createTextAnchor(selectText("wrapped"))?.container).toBe("#p");
  });

  it("falls back to body for text placed directly in the body", () => {
    renderHtml(`Loose text <b>bold</b>`);
    expect(createTextAnchor(selectText("Loose"))?.container).toBe("body");
    expect(createTextAnchor(selectText("bold"))?.container).toBe("body");
  });

  it("falls back to body when the common ancestor is body or above", () => {
    renderHtml(`<p>one</p><p>two</p>`);
    const range = document.createRange();
    range.setStart(queryAll("p")[0]?.firstChild ?? document.body, 0);
    range.setEnd(queryAll("p")[1]?.firstChild ?? document.body, 3);
    expect(createTextAnchor(range)?.container).toBe("body");
  });

  it("falls back to body for documents without a browsing context", () => {
    const parsed = new DOMParser().parseFromString(
      "<body><p>Detached copy.</p></body>",
      "text/html",
    );
    const text = parsed.querySelector("p")?.firstChild;
    expect(parsed.defaultView).toBeNull();
    expect(text).toBeTruthy();
    if (!text) {
      return;
    }
    const range = parsed.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 8);
    expect(createTextAnchor(range, parsed)).toMatchObject({
      quote: { exact: "Detached" },
      container: "body",
    });
  });

  it("returns null when the selection is outside the body", () => {
    renderHtml(`<p>text</p>`);
    const range = document.createRange();
    range.selectNodeContents(document.head);
    expect(createTextAnchor(range)).toBeNull();
  });

  it("returns null for selections inside the Sitenote host", () => {
    renderHtml(`<p>page</p><${SITENOTE_ROOT_TAG}><span>pin text</span></${SITENOTE_ROOT_TAG}>`);
    expect(createTextAnchor(selectText("pin text"))).toBeNull();
  });

  it("computes positions against the body text model", () => {
    renderHtml(`<p>alpha</p><script>ignored()</script><p>beta gamma</p>`);
    const anchor = anchorOf("gamma");
    expect(anchor.position).toEqual({ start: 10, end: 15 });
    expect(buildTextModel(document.body).text.slice(10, 15)).toBe("gamma");
  });

  it("produces anchors accepted by the schema", () => {
    renderHtml(`<p>Schema check text</p>`);
    const anchor = anchorOf("check");
    expect(textAnchorSchema.parse(JSON.parse(JSON.stringify(anchor)))).toEqual(anchor);
  });

  it("stores a container that matches exactly one element", () => {
    renderHtml(`<section><p>same</p><p>same</p></section><section><p>other</p></section>`);
    const anchor = anchorOf("same", 1);
    expect(document.querySelectorAll(anchor.container)).toHaveLength(1);
    expect(document.querySelector(anchor.container)).toBe(queryAll("p")[1]);
  });
});

describe("resolveTextAnchor", () => {
  it("resolves through the container when the page is unchanged", () => {
    renderHtml(`<h1>Title</h1><p>The quick brown fox jumps.</p><p>Another paragraph.</p>`);
    const anchor = anchorOf("brown fox");
    const resolution = resolveTextAnchor(anchor);
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") {
      return;
    }
    expect(resolution.method).toBe("container");
    expect(resolution.confidence).toBe(1);
    expect(resolution.range.toString()).toBe("brown fox");
    expect(resolution.range.startContainer).toBe(query("p").firstChild);
  });

  it("resolves ranges that span several text nodes", () => {
    renderHtml(`<p id="p">Hello <b>big</b> world</p>`);
    const range = document.createRange();
    range.setStart(query("#p").firstChild ?? document.body, 3);
    range.setEnd(query("#p").lastChild ?? document.body, 3);
    const anchor = createTextAnchor(range);
    expect(anchor).not.toBeNull();
    if (!anchor) {
      return;
    }
    const resolved = resolveRange(anchor);
    expect(resolved?.toString()).toBe("lo big wo");
    expect(resolved?.startContainer).toBe(query("#p").firstChild);
    expect(resolved?.endContainer).toBe(query("#p").lastChild);
  });

  it("falls back to the whole document when the container moved", () => {
    renderHtml(`<section><p>Keep this sentence together.</p></section>`);
    const anchor = anchorOf("this sentence");
    renderHtml(
      `<aside><p>Intro.</p></aside><section><div><p>Keep this sentence together.</p></div></section>`,
    );
    const resolution = resolveTextAnchor({ ...anchor, container: "section > p" });
    expect(resolution).toMatchObject({ status: "resolved", method: "document" });
    expect(resolution.status === "resolved" && resolution.range.toString()).toBe("this sentence");
  });

  it("falls back to the document when the container is missing, invalid or ambiguous", () => {
    renderHtml(`<p>Only one place for this text.</p><p>Something else.</p>`);
    const anchor = anchorOf("this text");
    for (const container of [".missing", "p[[", "p"]) {
      expect(resolveTextAnchor({ ...anchor, container })).toMatchObject({
        status: "resolved",
        method: "document",
      });
    }
  });

  it("ignores containers inside the Sitenote host", () => {
    renderHtml(
      `<p>Page text here.</p><${SITENOTE_ROOT_TAG}><p id="fake">Page text here.</p></${SITENOTE_ROOT_TAG}>`,
    );
    const anchor = anchorOf("text here");
    const resolution = resolveTextAnchor({ ...anchor, container: "#fake" });
    expect(resolution).toMatchObject({ status: "resolved", method: "document" });
  });

  it("chooses the occurrence in the container that best matches the context", () => {
    renderHtml(`<p>Ready. Go now. Wait. Go now. Done.</p>`);
    const anchor = anchorOf("Go now", 1);
    const resolved = resolveRange(anchor);
    expect(offsetsOf(resolved)).toEqual(anchor.position);
  });

  it("falls through when occurrences in the container cannot be told apart", () => {
    renderHtml(`<p>aaa</p>`);
    const anchor: TextAnchor = {
      kind: "text",
      quote: { exact: "aa", prefix: "", suffix: "" },
      position: { start: 1, end: 3 },
      container: "p",
    };
    expect(resolveTextAnchor(anchor)).toMatchObject({ status: "resolved", method: "position" });
    expect(offsetsOf(resolveRange(anchor))).toEqual({ start: 1, end: 3 });
  });

  it("prefers a better context in another container over a poor local match", () => {
    renderHtml(
      `<section id="a"><p>Call us today: Contact support, anytime.</p></section><section id="b"><p>If stuck, Contact support, please be patient and kind.</p></section>`,
    );
    const anchor: TextAnchor = {
      kind: "text",
      quote: {
        exact: "Contact support",
        prefix: "If stuck, ",
        suffix: ", please be patient and k",
      },
      position: { start: 0, end: 15 },
      container: "#a > p",
    };
    const resolved = resolveRange(anchor);
    expect(resolved?.startContainer).toBe(query("#b > p").firstChild);
  });

  it("disambiguates duplicated text by prefix and suffix", () => {
    renderHtml(`<p>First: Contact us.</p><p>Second: Contact us.</p><p>Third: Contact us.</p>`);
    const anchors = [0, 1, 2].map((occurrence) => anchorOf("Contact us", occurrence));
    renderHtml(
      `<div><p>New intro.</p><p>Third: Contact us.</p><p>First: Contact us.</p><p>Second: Contact us.</p></div>`,
    );
    const labels = anchors.map((anchor) => resolveRange(anchor)?.startContainer.textContent);
    expect(labels).toEqual(["First: Contact us.", "Second: Contact us.", "Third: Contact us."]);
  });

  it("uses the position when context cannot separate identical occurrences", () => {
    renderHtml(`<p>${"Repeat line. ".repeat(9)}</p>`);
    const anchor = anchorOf("Repeat line.", 4);
    const resolution = resolveTextAnchor(anchor);
    expect(resolution).toMatchObject({ status: "resolved", method: "position" });
    expect(offsetsOf(resolveRange(anchor))).toEqual(anchor.position);
    expect(resolution.status === "resolved" && resolution.confidence).toBeGreaterThan(
      TIE_CONFIDENCE_FACTOR,
    );
  });

  it("uses the occurrence nearest to the stored position when a tie persists", () => {
    renderHtml(`<p>${"Repeat line. ".repeat(9)}</p>`);
    const anchor = anchorOf("Repeat line.", 4);
    document.body.prepend(Object.assign(document.createElement("h1"), { textContent: "ABC" }));
    const resolution = resolveTextAnchor(anchor);
    expect(resolution).toMatchObject({ status: "resolved", method: "document" });
    expect(offsetsOf(resolveRange(anchor))).toEqual({
      start: anchor.position.start + 3,
      end: anchor.position.end + 3,
    });
    expect(resolution.status === "resolved" && resolution.confidence).toBe(TIE_CONFIDENCE_FACTOR);
  });

  it("picks the nearest occurrence even when it lies after the stored position", () => {
    renderHtml(`<p>Same words.</p><p>Same words.</p>`);
    const anchor: TextAnchor = {
      kind: "text",
      quote: { exact: "Same words.", prefix: "", suffix: "" },
      position: { start: 40, end: 51 },
      container: "body",
    };
    expect(offsetsOf(resolveRange(anchor))).toEqual({ start: 11, end: 22 });
    const early = { ...anchor, position: { start: 0, end: 11 } };
    expect(offsetsOf(resolveRange(early))).toEqual({ start: 0, end: 11 });
  });

  it("orphans when the quoted text no longer exists", () => {
    renderHtml(`<p>The quick brown fox jumps.</p>`);
    const anchor = anchorOf("brown fox");
    renderHtml(`<p>The quick red fox jumps.</p>`);
    expect(resolveTextAnchor(anchor)).toEqual({ status: "orphaned" });
  });

  it("orphans when the stored position now holds different text", () => {
    renderHtml(`<p>Short</p>`);
    const anchor: TextAnchor = {
      kind: "text",
      quote: { exact: "missing", prefix: "", suffix: "" },
      position: { start: 0, end: 7 },
      container: "p",
    };
    expect(resolveTextAnchor(anchor)).toEqual({ status: "orphaned" });
  });

  it("orphans when the position lies outside the document text", () => {
    renderHtml(`<p>Short</p>`);
    const anchor: TextAnchor = {
      kind: "text",
      quote: { exact: "gone", prefix: "", suffix: "" },
      position: { start: 100, end: 104 },
      container: "p",
    };
    expect(resolveTextAnchor(anchor)).toEqual({ status: "orphaned" });
  });

  it("never matches text that only exists in hidden or ignored nodes", () => {
    renderHtml(
      `<p>Visible text.</p><script>var secret = "secret value";</script><${SITENOTE_ROOT_TAG}><b>secret value</b></${SITENOTE_ROOT_TAG}>`,
    );
    const anchor: TextAnchor = {
      kind: "text",
      quote: { exact: "secret value", prefix: "", suffix: "" },
      position: { start: 0, end: 12 },
      container: "body",
    };
    expect(resolveTextAnchor(anchor)).toEqual({ status: "orphaned" });
  });

  it("reports a higher confidence for a matching context than for a mismatched one", () => {
    renderHtml(`<p>Alpha Contact support Omega.</p>`);
    const perfect = anchorOf("Contact support");
    const mismatched: TextAnchor = {
      ...perfect,
      quote: { ...perfect.quote, prefix: "Zzz", suffix: "Qqq" },
    };
    const first = resolveTextAnchor(perfect);
    const second = resolveTextAnchor(mismatched);
    expect(first.status === "resolved" && first.confidence).toBe(1);
    expect(second.status === "resolved" && second.confidence).toBe(0.5);
  });

  it("returns an orphan for documents without a body", () => {
    const xml = new DOMParser().parseFromString("<root>text</root>", "application/xml");
    const anchor: TextAnchor = {
      kind: "text",
      quote: { exact: "text", prefix: "", suffix: "" },
      position: { start: 0, end: 4 },
      container: "root",
    };
    expect(resolveTextAnchor(anchor, xml)).toEqual({ status: "orphaned" });
    expect(createTextAnchor(document.createRange(), xml)).toBeNull();
  });
});
