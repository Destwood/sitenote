import { describe, expect, it } from "vitest";

import type { RecordingStep } from "../context";
import { stepsToPlaywright } from ".";

const START = "https://example.test/pricing?plan=pro";
const HEADER = [
  'import { test } from "@playwright/test";',
  'test("reproduce", async ({ page }) => {',
  `  await page.goto(${JSON.stringify(START)});`,
];

function statements(script: string): string[] {
  return script.split("\n").slice(HEADER.length, -2);
}

describe("stepsToPlaywright", () => {
  it("writes a test that only opens the start page when there are no steps", () => {
    expect(stepsToPlaywright(START, [])).toBe(`${[...HEADER, "});"].join("\n")}\n`);
  });

  it("writes one statement per step kind", () => {
    const steps: RecordingStep[] = [
      { t: 1, kind: "click", selector: "#buy", label: "Buy" },
      { t: 2, kind: "input", selector: "input[name=email]", label: "Email" },
      { t: 3, kind: "submit", selector: "form.checkout", label: "Checkout" },
      { t: 4, kind: "navigate", selector: "body", label: "", url: "/cart" },
    ];

    expect(stepsToPlaywright(START, steps).split("\n")).toEqual([
      ...HEADER,
      "  // Buy",
      '  await page.locator("#buy").click();',
      "  // Email",
      "  // TODO: enter a value",
      '  await page.locator("input[name=email]").fill("");',
      "  // Checkout",
      '  await page.locator("form.checkout").press("Enter");',
      '  await page.waitForURL("**/cart");',
      "});",
      "",
    ]);
  });

  it("waits for the url of a navigation step with the pattern of any origin", () => {
    expect(
      statements(
        stepsToPlaywright(START, [{ t: 1, kind: "navigate", selector: "a", label: "", url: "/x" }]),
      ),
    ).toEqual(['  await page.waitForURL("**/x");']);
    expect(
      statements(stepsToPlaywright(START, [{ t: 1, kind: "navigate", selector: "a", label: "" }])),
    ).toEqual(['  await page.waitForURL("**");']);
  });

  it("escapes quotes, backticks and template markers in selectors and urls", () => {
    const selector = 'a"b`c${d}\\e';
    const url = '/q?x="`${y}"';
    const script = stepsToPlaywright(START, [
      { t: 1, kind: "click", selector, label: "" },
      { t: 2, kind: "navigate", selector: "a", label: "", url },
    ]);

    expect(statements(script)).toEqual([
      `  await page.locator(${JSON.stringify(selector)}).click();`,
      `  await page.waitForURL(${JSON.stringify(`**${url}`)});`,
    ]);
  });

  it("keeps a selector that tries to break out of the string inside the string", () => {
    const selector = '"); alert(1); ("';
    expect(
      statements(stepsToPlaywright(START, [{ t: 1, kind: "click", selector, label: "" }])),
    ).toEqual([`  await page.locator(${JSON.stringify(selector)}).click();`]);
  });

  it("writes the label as a one-line comment with line breaks and separators removed", () => {
    const script = stepsToPlaywright(START, [
      { t: 1, kind: "click", selector: "a", label: "Save\nthen\r\u2028evil" },
    ]);

    expect(statements(script)).toEqual([
      "  // Save then  evil",
      '  await page.locator("a").click();',
    ]);
  });

  it("keeps a comment terminator inside a label as plain comment text", () => {
    const script = stepsToPlaywright(START, [
      { t: 1, kind: "click", selector: "a", label: "end */ ' \" `" },
    ]);

    expect(statements(script)[0]).toBe("  // end */ ' \" `");
  });

  it("indents every statement by two spaces", () => {
    const script = stepsToPlaywright(START, [
      { t: 1, kind: "click", selector: "a", label: "x" },
      { t: 2, kind: "input", selector: "b", label: "" },
    ]);

    for (const line of statements(script)) {
      expect(line.startsWith("  ")).toBe(true);
    }
  });

  it("escapes the start url", () => {
    const url = 'https://example.test/"quoted"`tick`';
    expect(stepsToPlaywright(url, []).split("\n")[2]).toBe(
      `  await page.goto(${JSON.stringify(url)});`,
    );
  });
});
