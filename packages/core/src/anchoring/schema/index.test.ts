import { describe, expect, it } from "vitest";

import { anchorSchema, elementAnchorSchema, textAnchorSchema, type Anchor } from ".";

const elementAnchor = {
  kind: "element",
  selectors: {
    id: "hero",
    testId: "hero-title",
    css: "#hero",
    nthPath: "body > main:nth-of-type(1) > section:nth-of-type(1)",
  },
  fingerprint: { tag: "section", text: "Welcome", classes: ["hero"], width: 1200, height: 480.5 },
  offset: { x: 0.25, y: 0.75 },
};

const textAnchor = {
  kind: "text",
  quote: { exact: "Fast setup", prefix: "Cards ", suffix: " in seconds" },
  position: { start: 12, end: 22 },
  container: "main > p",
};

function withChange(base: object, path: string[], value: unknown): unknown {
  const copy = structuredClone(base) as Record<string, unknown>;
  let target = copy;
  for (const key of path.slice(0, -1)) {
    target = target[key] as Record<string, unknown>;
  }
  const last = path.at(-1);
  if (last === undefined) {
    return copy;
  }
  if (value === undefined) {
    Reflect.deleteProperty(target, last);
  } else {
    target[last] = value;
  }
  return copy;
}

describe("anchorSchema", () => {
  it("parses a valid element anchor", () => {
    expect(anchorSchema.parse(elementAnchor)).toEqual(elementAnchor);
  });

  it("parses a valid text anchor", () => {
    expect(anchorSchema.parse(textAnchor)).toEqual(textAnchor);
  });

  it("accepts an element anchor without optional selectors", () => {
    const withoutId = withChange(elementAnchor, ["selectors", "id"], undefined);
    const withoutBoth = withChange(withoutId as object, ["selectors", "testId"], undefined);
    const parsed = elementAnchorSchema.parse(withoutBoth);
    expect(parsed.selectors).toEqual({ css: "#hero", nthPath: elementAnchor.selectors.nthPath });
  });

  it("round-trips through JSON", () => {
    const anchors: Anchor[] = [
      elementAnchorSchema.parse(elementAnchor),
      textAnchorSchema.parse(textAnchor),
    ];
    for (const anchor of anchors) {
      expect(anchorSchema.parse(JSON.parse(JSON.stringify(anchor)))).toEqual(anchor);
    }
  });

  it("discriminates by kind", () => {
    expect(anchorSchema.parse(elementAnchor).kind).toBe("element");
    expect(anchorSchema.parse(textAnchor).kind).toBe("text");
    expect(anchorSchema.safeParse({ ...textAnchor, kind: "image" }).success).toBe(false);
    expect(anchorSchema.safeParse({ ...elementAnchor, kind: "text" }).success).toBe(false);
  });

  it("strips unknown keys", () => {
    expect(anchorSchema.parse({ ...textAnchor, extra: 1 })).toEqual(textAnchor);
  });

  it.each([null, undefined, "element", 42, [], {}, { kind: "element" }, { kind: "text" }])(
    "rejects non-anchor value %j",
    (input) => {
      expect(anchorSchema.safeParse(input).success).toBe(false);
    },
  );

  it.each([
    ["missing css", ["selectors", "css"], undefined],
    ["empty css", ["selectors", "css"], ""],
    ["missing nthPath", ["selectors", "nthPath"], undefined],
    ["empty nthPath", ["selectors", "nthPath"], ""],
    ["empty id", ["selectors", "id"], ""],
    ["numeric id", ["selectors", "id"], 5],
    ["missing selectors", ["selectors"], undefined],
    ["missing fingerprint", ["fingerprint"], undefined],
    ["empty tag", ["fingerprint", "tag"], ""],
    ["numeric text", ["fingerprint", "text"], 5],
    ["classes not an array", ["fingerprint", "classes"], "a b"],
    ["non-string class", ["fingerprint", "classes"], ["a", 1]],
    ["negative width", ["fingerprint", "width"], -1],
    ["string height", ["fingerprint", "height"], "10"],
    ["infinite width", ["fingerprint", "width"], Infinity],
    ["NaN height", ["fingerprint", "height"], NaN],
    ["offset above 1", ["offset", "x"], 1.01],
    ["offset below 0", ["offset", "y"], -0.01],
    ["offset not a number", ["offset", "x"], "0.5"],
    ["missing offset", ["offset"], undefined],
  ])("rejects an element anchor with %s", (_name, path, value) => {
    const input = withChange(elementAnchor, path, value);
    expect(elementAnchorSchema.safeParse(input).success).toBe(false);
    expect(anchorSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ["missing quote", ["quote"], undefined],
    ["empty exact", ["quote", "exact"], ""],
    ["missing exact", ["quote", "exact"], undefined],
    ["missing prefix", ["quote", "prefix"], undefined],
    ["missing suffix", ["quote", "suffix"], undefined],
    ["numeric suffix", ["quote", "suffix"], 1],
    ["missing position", ["position"], undefined],
    ["negative start", ["position", "start"], -1],
    ["fractional start", ["position", "start"], 1.5],
    ["fractional end", ["position", "end"], 22.5],
    ["end equal to start", ["position", "end"], 12],
    ["end before start", ["position", "end"], 3],
    ["infinite end", ["position", "end"], Infinity],
    ["string start", ["position", "start"], "12"],
    ["missing container", ["container"], undefined],
    ["empty container", ["container"], ""],
    ["numeric container", ["container"], 1],
  ])("rejects a text anchor with %s", (_name, path, value) => {
    const input = withChange(textAnchor, path, value);
    expect(textAnchorSchema.safeParse(input).success).toBe(false);
    expect(anchorSchema.safeParse(input).success).toBe(false);
  });

  it("accepts boundary offsets and zero-size fingerprints", () => {
    const atZero = withChange(elementAnchor, ["offset", "x"], 0);
    const atOne = withChange(atZero as object, ["offset", "y"], 1);
    const flat = withChange(atOne as object, ["fingerprint", "width"], 0);
    expect(elementAnchorSchema.safeParse(flat).success).toBe(true);
  });

  it("accepts a position that starts at zero", () => {
    const input = withChange(textAnchor, ["position"], { start: 0, end: 1 });
    expect(textAnchorSchema.safeParse(input).success).toBe(true);
  });

  it("reports the failing path for malformed input", () => {
    const result = anchorSchema.safeParse(withChange(textAnchor, ["position", "end"], 12));
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("position"))).toBe(true);
  });
});
