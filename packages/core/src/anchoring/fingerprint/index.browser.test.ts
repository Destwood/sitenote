import { afterEach, describe, expect, it } from "vitest";

import { SITENOTE_ROOT_TAG } from "../../overlay";
import { query, renderHtml } from "../fixtures";
import { fingerprintSchema } from "../schema";
import { FINGERPRINT_TEXT_LIMIT, createFingerprint } from ".";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createFingerprint", () => {
  it("captures the lowercase tag", () => {
    renderHtml(`<SECTION id="s">x</SECTION>`);
    expect(createFingerprint(query("#s")).tag).toBe("section");
  });

  it("collapses whitespace in the text and trims it", () => {
    renderHtml(`<p id="p">  Hello \n\n   <b>big</b>\t world  </p>`);
    expect(createFingerprint(query("#p")).text).toBe("Hello big world");
  });

  it("limits the text to 120 characters", () => {
    renderHtml(`<p id="p">${"abcdefghi ".repeat(40)}</p>`);
    const { text } = createFingerprint(query("#p"));
    expect(text.length).toBeLessThanOrEqual(FINGERPRINT_TEXT_LIMIT);
    expect(text.startsWith("abcdefghi abcdefghi")).toBe(true);
    expect(text.endsWith(" ")).toBe(false);
  });

  it("ignores script, style and textarea content", () => {
    renderHtml(
      `<div id="d">visible<script>var a = 1;</script><style>.a{}</style><textarea>typed</textarea></div>`,
    );
    expect(createFingerprint(query("#d")).text).toBe("visible");
  });

  it("ignores the Sitenote host subtree", () => {
    renderHtml(`<div id="d">page<${SITENOTE_ROOT_TAG}><b>pin</b></${SITENOTE_ROOT_TAG}></div>`);
    query(SITENOTE_ROOT_TAG).attachShadow({ mode: "open" }).innerHTML = "<i>shadow</i>";
    expect(createFingerprint(query("#d")).text).toBe("page");
  });

  it("keeps only stable classes, sorted and without duplicates", () => {
    renderHtml(
      `<div id="d" class="zeta Card_root__a1B2c alpha css-1x2y3z alpha md:px-4 sc-bdfBwQ"></div>`,
    );
    expect(createFingerprint(query("#d")).classes).toEqual(["alpha", "md:px-4", "zeta"]);
  });

  it("returns no classes for an element without a class attribute", () => {
    renderHtml(`<div id="d"></div>`);
    expect(createFingerprint(query("#d")).classes).toEqual([]);
  });

  it("rounds the bounding box", () => {
    renderHtml(`<div id="d" style="width: 100.4px; height: 50.6px"></div>`);
    const { width, height } = createFingerprint(query("#d"));
    expect(width).toBe(100);
    expect(height).toBe(51);
  });

  it("produces a value accepted by the schema", () => {
    renderHtml(`<p id="p" class="lead">Hello</p>`);
    expect(fingerprintSchema.safeParse(createFingerprint(query("#p"))).success).toBe(true);
  });

  it("measures zero for elements without a box", () => {
    renderHtml(`<div id="d" style="display: none">x</div>`);
    const { width, height } = createFingerprint(query("#d"));
    expect(width).toBe(0);
    expect(height).toBe(0);
  });
});
