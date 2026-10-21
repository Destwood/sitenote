import { describe, expect, it } from "vitest";

import { type Fingerprint } from "../schema";
import {
  FINGERPRINT_WEIGHTS,
  classSimilarity,
  fingerprintSimilarity,
  sizeSimilarity,
  textSimilarity,
} from ".";

function fingerprint(overrides: Partial<Fingerprint> = {}): Fingerprint {
  return {
    tag: "div",
    text: "Instant setup",
    classes: ["card"],
    width: 300,
    height: 120,
    ...overrides,
  };
}

describe("FINGERPRINT_WEIGHTS", () => {
  it("sum to one", () => {
    const sum = FINGERPRINT_WEIGHTS.text + FINGERPRINT_WEIGHTS.classes + FINGERPRINT_WEIGHTS.size;
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe("textSimilarity", () => {
  it("is one for identical strings, ignoring case", () => {
    expect(textSimilarity("Hello world", "Hello world")).toBe(1);
    expect(textSimilarity("Hello World", "hello world")).toBe(1);
  });

  it("is one when both strings are empty", () => {
    expect(textSimilarity("", "")).toBe(1);
  });

  it("is zero when only one string is empty", () => {
    expect(textSimilarity("", "text")).toBe(0);
    expect(textSimilarity("text", "")).toBe(0);
  });

  it("handles single characters", () => {
    expect(textSimilarity("a", "a")).toBe(1);
    expect(textSimilarity("a", "b")).toBe(0);
    expect(textSimilarity("a", "ab")).toBe(0);
  });

  it("matches the Sørensen–Dice coefficient on character bigrams", () => {
    expect(textSimilarity("night", "nacht")).toBeCloseTo(0.25, 10);
    expect(textSimilarity("abcd", "abcd ")).toBeCloseTo((2 * 3) / (3 + 4), 10);
    expect(textSimilarity("aaaa", "aa")).toBeCloseTo((2 * 1) / (3 + 1), 10);
  });

  it("is symmetric", () => {
    const a = "Replies, mentions and status changes";
    const b = "Replies and mentions";
    expect(textSimilarity(a, b)).toBeCloseTo(textSimilarity(b, a), 10);
  });

  it("is high for a small edit and low for unrelated text", () => {
    const original = "Replies, mentions and status changes show up for everyone immediately.";
    const edited = "Replies, mentions and state changes show up for everyone immediately.";
    expect(textSimilarity(original, edited)).toBeGreaterThan(0.9);
    expect(textSimilarity(original, "Install the extension and start commenting.")).toBeLessThan(
      0.5,
    );
  });
});

describe("classSimilarity", () => {
  it("is one when both lists are empty", () => {
    expect(classSimilarity([], [])).toBe(1);
  });

  it("is zero when only one list is empty or the lists are disjoint", () => {
    expect(classSimilarity([], ["a"])).toBe(0);
    expect(classSimilarity(["a"], [])).toBe(0);
    expect(classSimilarity(["a", "b"], ["c"])).toBe(0);
  });

  it("is the Jaccard index", () => {
    expect(classSimilarity(["a", "b"], ["a", "b"])).toBe(1);
    expect(classSimilarity(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3, 10);
    expect(classSimilarity(["a", "b", "c"], ["a"])).toBeCloseTo(1 / 3, 10);
  });

  it("ignores duplicates and order", () => {
    expect(classSimilarity(["a", "a", "b"], ["b", "a"])).toBe(1);
  });
});

describe("sizeSimilarity", () => {
  it("is one for equal sizes and for two zero-size boxes", () => {
    expect(sizeSimilarity(fingerprint(), fingerprint())).toBe(1);
    expect(
      sizeSimilarity(fingerprint({ width: 0, height: 0 }), fingerprint({ width: 0, height: 0 })),
    ).toBe(1);
  });

  it("averages the width and height ratios", () => {
    const half = fingerprint({ width: 150 });
    expect(sizeSimilarity(fingerprint(), half)).toBeCloseTo((0.5 + 1) / 2, 10);
    const both = fingerprint({ width: 150, height: 60 });
    expect(sizeSimilarity(fingerprint(), both)).toBeCloseTo(0.5, 10);
  });

  it("is symmetric and handles a single zero dimension", () => {
    const flat = fingerprint({ height: 0 });
    expect(sizeSimilarity(fingerprint(), flat)).toBeCloseTo(0.5, 10);
    expect(sizeSimilarity(flat, fingerprint())).toBeCloseTo(0.5, 10);
  });
});

describe("fingerprintSimilarity", () => {
  it("is zero when the tags differ", () => {
    expect(fingerprintSimilarity(fingerprint(), fingerprint({ tag: "section" }))).toBe(0);
  });

  it("is one for identical fingerprints", () => {
    expect(fingerprintSimilarity(fingerprint(), fingerprint())).toBe(1);
  });

  it("is one for two empty elements with the same box", () => {
    const empty = fingerprint({ text: "", classes: [] });
    expect(fingerprintSimilarity(empty, empty)).toBe(1);
  });

  it("applies the text weight", () => {
    const other = fingerprint({ text: "Zzzz qqqq" });
    expect(fingerprintSimilarity(fingerprint(), other)).toBeCloseTo(
      1 - FINGERPRINT_WEIGHTS.text,
      10,
    );
  });

  it("applies the class weight", () => {
    const other = fingerprint({ classes: ["other"] });
    expect(fingerprintSimilarity(fingerprint(), other)).toBeCloseTo(
      1 - FINGERPRINT_WEIGHTS.classes,
      10,
    );
  });

  it("applies the size weight", () => {
    const other = fingerprint({ width: 0, height: 0 });
    expect(fingerprintSimilarity(fingerprint(), other)).toBeCloseTo(
      1 - FINGERPRINT_WEIGHTS.size,
      10,
    );
  });

  it("combines all components", () => {
    const other = fingerprint({ text: "Zzzz qqqq", classes: ["other"], width: 150, height: 60 });
    const expected = FINGERPRINT_WEIGHTS.size * 0.5;
    expect(fingerprintSimilarity(fingerprint(), other)).toBeCloseTo(expected, 10);
  });

  it("stays within zero and one", () => {
    const samples = [
      fingerprint(),
      fingerprint({ text: "", classes: [], width: 0, height: 0 }),
      fingerprint({ text: "x".repeat(120), classes: ["a", "b", "c"], width: 5000, height: 1 }),
      fingerprint({ text: "Instant", classes: ["card", "wide"], width: 299, height: 121 }),
    ];
    for (const first of samples) {
      for (const second of samples) {
        const score = fingerprintSimilarity(first, second);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is symmetric", () => {
    const a = fingerprint({ text: "Replies and mentions", width: 320 });
    const b = fingerprint({ text: "Replies, mentions and status", classes: [], width: 280 });
    expect(fingerprintSimilarity(a, b)).toBeCloseTo(fingerprintSimilarity(b, a), 10);
  });
});
